import { describe, expect, it } from "vitest";
import { createEmptyMindMapDocument } from "@/services/mindmapService";
import {
  addMindmapImageNode,
  canUseMindmapImageNodes,
  getMindmapImageNodes,
  normalizeMindmapImageSource,
  removeMindmapImageNode,
} from "@/services/mindmapImageNodeService";

function docWithTopic() {
  const document = createEmptyMindMapDocument("Root");
  document.topics.child = {
    id: "child",
    parentId: document.rootTopicId,
    childIds: [],
    text: "Child",
  };
  document.topics[document.rootTopicId]!.childIds = ["child"];
  return document;
}

describe("mindmapImageNodeService", () => {
  it("only enables image nodes for paid membership tiers", () => {
    expect(canUseMindmapImageNodes("FREE")).toBe(false);
    expect(canUseMindmapImageNodes("PLUS")).toBe(true);
    expect(canUseMindmapImageNodes("PRO")).toBe(true);
  });

  it("normalizes safe remote, data and relative image references", () => {
    expect(
      normalizeMindmapImageSource(" https://cdn.example.test/a.png "),
    ).toBe("https://cdn.example.test/a.png");
    expect(normalizeMindmapImageSource("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc",
    );
    expect(normalizeMindmapImageSource("assets/a.png")).toBe("assets/a.png");
    expect(normalizeMindmapImageSource("javascript:alert(1)")).toBeNull();
    expect(normalizeMindmapImageSource("/absolute/a.png")).toBeNull();
    expect(normalizeMindmapImageSource("../outside.png")).toBeNull();
  });

  it("rejects FREE users before changing the document", () => {
    const document = docWithTopic();
    const result = addMindmapImageNode(
      document,
      "child",
      { src: "assets/a.png" },
      "FREE",
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "MEMBERSHIP_REQUIRED",
        message: "图片节点仅对 PLUS / PRO 会员开放",
      },
    });
    expect(getMindmapImageNodes(document)).toEqual([]);
  });

  it("adds a normalized image node under opaqueExtensions without mutating input", () => {
    const document = docWithTopic();
    document.opaqueExtensions = { "future.extension": { keep: true } };
    const result = addMindmapImageNode(
      document,
      "child",
      {
        src: "https://cdn.example.test/a.png",
        alt: "Preview",
        width: 9999,
        height: 10,
        objectFit: "cover",
      },
      "PLUS",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.imageNode?.width).toBe(640);
    expect(result.imageNode?.height).toBe(32);
    expect(result.imageNode?.objectFit).toBe("cover");
    expect(getMindmapImageNodes(result.document)).toHaveLength(1);
    expect(result.document.opaqueExtensions?.["future.extension"]).toEqual({
      keep: true,
    });
    expect(getMindmapImageNodes(document)).toEqual([]);
  });

  it("removes an image node only for paid users", () => {
    const added = addMindmapImageNode(
      docWithTopic(),
      "child",
      { src: "assets/a.png" },
      "PRO",
    );
    expect(added.ok).toBe(true);
    if (!added.ok || !added.imageNode) return;
    const denied = removeMindmapImageNode(
      added.document,
      added.imageNode.id,
      "FREE",
    );
    expect(denied.ok).toBe(false);
    const removed = removeMindmapImageNode(
      added.document,
      added.imageNode.id,
      "PLUS",
    );
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(getMindmapImageNodes(removed.document)).toEqual([]);
  });
});
