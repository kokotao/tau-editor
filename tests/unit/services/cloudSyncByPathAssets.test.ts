/**
 * @description 按路径同步 Markdown 图片附件后，验证云端与本地正文都回写为可访问直链。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-11-22 17:35
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const mocks = vi.hoisted(() => ({
  isTauri: { value: true },
  readSyncSource: vi.fn(),
  findCloudDocByPath: vi.fn(),
  saveCloudDoc: vi.fn(),
  syncMarkdownAssets: vi.fn(),
}));

vi.mock("@/lib/tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tauri")>();
  return {
    ...actual,
    isTauriApp: () => mocks.isTauri.value,
    cloudCommands: {
      ...actual.cloudCommands,
      readSyncSource: mocks.readSyncSource,
    },
  };
});

vi.mock("@/services/cloudDocService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/cloudDocService")>();
  return {
    ...actual,
    findCloudDocByPath: mocks.findCloudDocByPath,
    saveCloudDoc: mocks.saveCloudDoc,
  };
});

vi.mock("@/services/cloudAssetService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/cloudAssetService")>();
  return { ...actual, syncMarkdownAssets: mocks.syncMarkdownAssets };
});

vi.mock("@/services/workspaceService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/workspaceService")>();
  return {
    ...actual,
    createWorkspaceService: () => ({
      captureFileRevision: vi.fn(async () => "revision-2"),
    }),
  };
});

import { syncDocumentByPath } from "@/services/cloudSyncService";
import { useFileSystemStore } from "@/stores/fileSystem";
import { useWorkspaceStore } from "@/stores/workspace";

describe("syncDocumentByPath Markdown 图片引用回写", () => {
  let diskContent: string;

  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.isTauri.value = true;
    diskContent = "![图](assets/a.png)";
    mocks.readSyncSource.mockImplementation(async () => ({
      content: diskContent,
      contentHash: diskContent.includes("https://cloud.example")
        ? "sha256:rewritten"
        : "sha256:source",
      size: diskContent.length,
      modifiedMs: 1,
    }));
    mocks.findCloudDocByPath.mockResolvedValue({ ok: true, data: null });
    mocks.saveCloudDoc
      .mockResolvedValueOnce({
        ok: true,
        data: {
          fileId: 42,
          version: 1,
          contentHash: "sha256:source",
          updatedAt: null,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          fileId: 42,
          version: 2,
          contentHash: "sha256:rewritten",
          updatedAt: null,
        },
      });
    mocks.syncMarkdownAssets.mockResolvedValue({
      total: 1,
      eligible: 1,
      uploaded: 1,
      unchanged: 0,
      failed: 0,
      skipped: 0,
      unsupported: 0,
      failures: [],
      rewrittenContent: "![图](<https://cloud.example/a.png?sig=1>)",
    });

    const workspace = useWorkspaceStore();
    workspace.currentWorkspaceName = "ws";
    workspace.currentWorkspacePath = "/ws";
    const fileSystem = useFileSystemStore();
    vi.spyOn(fileSystem, "readFileContent").mockImplementation(
      async () => diskContent,
    );
    vi.spyOn(fileSystem, "writeFileContent").mockImplementation(
      async (_path, content) => {
        diskContent = content;
      },
    );
  });

  it("图片附件上传后，用第二次云端保存同步回写后的 Markdown 和 hash", async () => {
    const result = await syncDocumentByPath({ filePath: "/ws/notes.md" });

    expect(result).toMatchObject({ status: "synced", fileId: 42, version: 2 });
    expect(diskContent).toBe("![图](<https://cloud.example/a.png?sig=1>)");
    expect(mocks.saveCloudDoc).toHaveBeenCalledTimes(2);
    expect(mocks.saveCloudDoc.mock.calls[1]?.[0]).toMatchObject({
      path: "tau/ws/notes.md",
      content: diskContent,
      contentHash: "sha256:rewritten",
      baseVersion: 1,
    });
  });
});
