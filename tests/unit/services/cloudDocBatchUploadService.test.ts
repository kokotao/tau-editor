/**
 * @description 云文档批量上传（R2）：文本/二进制/跳过三类归档规则、大小探测、串行队列与中止条件
 * （quota / unauthorized / 用户中止）、conflict 记「已存在未覆盖」。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFileInfo: vi.fn(),
  syncByPath: vi.fn(),
  uploadBinary: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    fileCommands: { ...actual.fileCommands, getFileInfo: mocks.getFileInfo },
  };
});

vi.mock('@/services/cloudSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudSyncService')>();
  return { ...actual, syncDocumentByPath: mocks.syncByPath };
});

vi.mock('@/services/cloudBinaryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudBinaryService')>();
  return { ...actual, uploadBinaryDocument: mocks.uploadBinary };
});

import {
  BATCH_UPLOAD_MAX_FILES,
  classifyUploadFile,
  collectBatchUploadPlan,
  planBatchUpload,
  runBatchUpload,
  type BatchUploadTarget,
  type UploadPlanItem,
} from '@/services/cloudDocBatchUploadService';

const TARGET: BatchUploadTarget = {
  categoryId: '1001',
  categoryName: '笔记',
  workspaceName: 'ws',
  workspacePath: '/ws',
};

const TEXT_ITEM: UploadPlanItem = { localPath: '/ws/a.md', fileName: 'a.md', kind: 'text', size: 128 };
const BINARY_ITEM: UploadPlanItem = { localPath: '/ws/docs/b.pdf', fileName: 'b.pdf', kind: 'binary', size: 2048 };
const SKIPPED_ITEM: UploadPlanItem = {
  localPath: '/ws/c.png',
  fileName: 'c.png',
  kind: 'skipped',
  reason: 'unsupported',
  detail: '二进制或图片预览文件暂不支持云同步',
  size: 64,
};

beforeEach(() => {
  mocks.getFileInfo.mockResolvedValue({ name: 'a.md', path: '/ws/a.md', size: 128 });
  mocks.syncByPath.mockResolvedValue({ status: 'synced', fileId: 1, version: 1 });
  mocks.uploadBinary.mockResolvedValue({ ok: true, data: { fileId: 2, version: 1 } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('classifyUploadFile 类型归档', () => {
  it('文本类走云同步通道：md/txt/json/代码', () => {
    for (const path of ['/ws/a.md', '/ws/a.txt', '/ws/a.json', '/ws/a.ts', '/ws/a.yaml']) {
      const item = classifyUploadFile({ path, size: 1024 });
      expect(item.kind).toBe('text');
      expect(item.fileName).toBe(path.split('/').pop());
    }
  });

  it('pdf/office 走二进制通道', () => {
    for (const ext of ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']) {
      expect(classifyUploadFile({ path: `/ws/a.${ext}`, size: 1024 }).kind).toBe('binary');
    }
  });

  it('图片与其他不支持类型跳过，并给出原因码', () => {
    for (const path of ['/ws/a.png', '/ws/a.jpg', '/ws/a.zip', '/ws/a.exe', '/ws/a.svg']) {
      const item = classifyUploadFile({ path, size: 1024 });
      expect(item.kind).toBe('skipped');
      expect(item.reason).toBe('unsupported');
    }
  });

  it('宏格式（docm/xlsm/pptm）跳过', () => {
    for (const ext of ['docm', 'xlsm', 'pptm']) {
      const item = classifyUploadFile({ path: `/ws/a.${ext}`, size: 1024 });
      expect(item.kind).toBe('skipped');
      expect(item.reason).toBe('unsupported');
      expect(item.detail).toContain('宏');
    }
  });

  it('文本白名单与后端对齐：非白名单扩展名与无扩展名一律「跳过」而不是「失败」', () => {
    // 后端 CloudDocPathValidator.TEXT_EXTENSIONS 只认 51 项，这些传上去会 400
    for (const path of ['/ws/App.svelte', '/ws/init.lua', '/ws/main.swift', '/ws/Makefile']) {
      const item = classifyUploadFile({ path, size: 1024 });
      expect(item.kind).toBe('skipped');
      expect(item.reason).toBe('unsupported');
      expect(item.detail).toContain('不支持的文件类型');
    }
    expect(classifyUploadFile({ path: '/ws/Makefile', size: 1024 }).detail).toContain('无扩展名');
    // 白名单内仍然走文本通道
    expect(classifyUploadFile({ path: '/ws/main.ts', size: 1024 }).kind).toBe('text');
    expect(classifyUploadFile({ path: '/ws/index.html', size: 1024 }).kind).toBe('text');
  });

  it('大小上限：二进制 50MB、文本 12MB，超过即跳过（too-large）', () => {
    expect(classifyUploadFile({ path: '/ws/a.pdf', size: 50 * 1024 * 1024 }).kind).toBe('binary');
    expect(classifyUploadFile({ path: '/ws/a.pdf', size: 50 * 1024 * 1024 + 1 })).toMatchObject({
      kind: 'skipped',
      reason: 'too-large',
    });
    expect(classifyUploadFile({ path: '/ws/a.md', size: 12 * 1024 * 1024 }).kind).toBe('text');
    expect(classifyUploadFile({ path: '/ws/a.md', size: 12 * 1024 * 1024 + 1 })).toMatchObject({
      kind: 'skipped',
      reason: 'too-large',
    });
  });

  it('大小未知时只按扩展名归类', () => {
    expect(classifyUploadFile({ path: '/ws/a.md' }).kind).toBe('text');
    expect(classifyUploadFile({ path: '/ws/a.pdf' }).kind).toBe('binary');
  });

  it('空路径跳过', () => {
    expect(classifyUploadFile({ path: '' }).kind).toBe('skipped');
  });
});

describe('planBatchUpload / collectBatchUploadPlan 计划生成', () => {
  it('纯函数：按入参大小批量归类，保持顺序', () => {
    const plan = planBatchUpload([
      { path: '/ws/a.md', size: 10 },
      { path: '/ws/b.pdf', size: 20 },
      { path: '/ws/c.png', size: 30 },
    ]);
    expect(plan.map((item) => item.kind)).toEqual(['text', 'binary', 'skipped']);
    expect(plan.map((item) => item.fileName)).toEqual(['a.md', 'b.pdf', 'c.png']);
  });

  it('用 fileCommands.getFileInfo 补大小后再归类', async () => {
    mocks.getFileInfo
      .mockResolvedValueOnce({ name: 'big.pdf', path: '/ws/big.pdf', size: 51 * 1024 * 1024 })
      .mockResolvedValueOnce({ name: 'a.md', path: '/ws/a.md', size: 128 });

    const plan = await collectBatchUploadPlan(['/ws/big.pdf', '/ws/a.md']);

    expect(mocks.getFileInfo.mock.calls).toEqual([['/ws/big.pdf'], ['/ws/a.md']]);
    expect(plan.map((item) => item.kind)).toEqual(['skipped', 'text']);
    expect(plan[0]?.reason).toBe('too-large');
  });

  it('大小探测失败不阻断计划：按扩展名归类', async () => {
    mocks.getFileInfo.mockRejectedValue(new Error('文件不存在'));

    const plan = await collectBatchUploadPlan(['/ws/a.md']);

    expect(plan[0]).toMatchObject({ kind: 'text', size: null });
  });

  it('超过上限的文件数被截断到 BATCH_UPLOAD_MAX_FILES', async () => {
    const paths = Array.from({ length: BATCH_UPLOAD_MAX_FILES + 5 }, (_, index) => `/ws/f${index}.md`);

    const plan = await collectBatchUploadPlan(paths);

    expect(plan).toHaveLength(BATCH_UPLOAD_MAX_FILES);
    expect(mocks.getFileInfo).toHaveBeenCalledTimes(BATCH_UPLOAD_MAX_FILES);
  });
});

describe('runBatchUpload 串行队列', () => {
  it('文本 / 二进制 / 跳过逐条推进，汇总 成功 2 跳过 1', async () => {
    const done: Array<{ index: number; status: string }> = [];
    const started: number[] = [];

    const summary = await runBatchUpload([TEXT_ITEM, BINARY_ITEM, SKIPPED_ITEM], TARGET, {
      onItemStart: (index) => started.push(index),
      onItem: (index, result) => done.push({ index, status: result.status }),
    });

    expect(summary).toEqual({ total: 3, ok: 2, skipped: 1, failed: 0, aborted: false });
    expect(started).toEqual([0, 1]); // 计划阶段就跳过的项不进上传通道
    expect(done.map((row) => row.status)).toEqual(['done', 'done', 'skipped']);
  });

  it('文本类带上目标分类与云端路径 tau/<workspace>/<rel>', async () => {
    await runBatchUpload([TEXT_ITEM], TARGET);

    expect(mocks.syncByPath).toHaveBeenCalledWith({
      filePath: '/ws/a.md',
      cloudPath: 'tau/ws/a.md',
      category: '笔记',
      categoryId: '1001',
    });
  });

  it('二进制类按 resolveCloudDocPathForFile 生成路径并带 fileSize', async () => {
    await runBatchUpload([BINARY_ITEM], TARGET);

    expect(mocks.uploadBinary).toHaveBeenCalledWith(
      {
        cloudPath: 'tau/ws/docs/b.pdf',
        localPath: '/ws/docs/b.pdf',
        title: 'b.pdf',
        category: '笔记',
      },
      { fileSize: 2048 },
    );
  });

  it('未分类目标：category/categoryId 传 null，不造假分类', async () => {
    await runBatchUpload([TEXT_ITEM], {
      categoryId: null,
      categoryName: null,
      workspaceName: 'ws',
      workspacePath: '/ws',
    });

    expect(mocks.syncByPath).toHaveBeenCalledWith({
      filePath: '/ws/a.md',
      cloudPath: 'tau/ws/a.md',
      category: null,
      categoryId: null,
    });
  });

  it('conflict 记为「已存在未覆盖」（skipped），不算失败', async () => {
    mocks.syncByPath.mockResolvedValue({ status: 'conflict', message: '云端已有该文档且内容不同' });

    const summary = await runBatchUpload([TEXT_ITEM], TARGET);

    expect(summary).toEqual({ total: 1, ok: 0, skipped: 1, failed: 0, aborted: false });
  });

  it('二进制 conflict 同样记 skipped', async () => {
    mocks.uploadBinary.mockResolvedValue({ ok: false, kind: 'conflict', message: '该路径已有云端文件' });

    const summary = await runBatchUpload([BINARY_ITEM], TARGET);

    expect(summary).toEqual({ total: 1, ok: 0, skipped: 1, failed: 0, aborted: false });
  });

  it('quota 失败立即中止队列，剩余文件不再发请求', async () => {
    mocks.syncByPath.mockResolvedValue({ status: 'failed', kind: 'quota', message: '云端空间不足' });
    const plan: UploadPlanItem[] = [
      { ...TEXT_ITEM, localPath: '/ws/1.md', fileName: '1.md' },
      { ...TEXT_ITEM, localPath: '/ws/2.md', fileName: '2.md' },
      { ...TEXT_ITEM, localPath: '/ws/3.md', fileName: '3.md' },
    ];

    const summary = await runBatchUpload(plan, TARGET);

    expect(summary).toEqual({ total: 3, ok: 0, skipped: 0, failed: 1, aborted: true });
    expect(mocks.syncByPath).toHaveBeenCalledTimes(1);
  });

  it('unauthorized 失败立即中止队列', async () => {
    mocks.syncByPath.mockResolvedValue({ status: 'failed', kind: 'unauthorized', message: '登录已过期' });
    const plan: UploadPlanItem[] = [
      { ...TEXT_ITEM, localPath: '/ws/1.md', fileName: '1.md' },
      { ...TEXT_ITEM, localPath: '/ws/2.md', fileName: '2.md' },
    ];

    const summary = await runBatchUpload(plan, TARGET);

    expect(summary.aborted).toBe(true);
    expect(mocks.syncByPath).toHaveBeenCalledTimes(1);
  });

  it('普通失败不中止队列，逐条汇总', async () => {
    mocks.syncByPath
      .mockResolvedValueOnce({ status: 'failed', kind: 'network', message: '网络异常' })
      .mockResolvedValueOnce({ status: 'synced', fileId: 1 });

    const plan: UploadPlanItem[] = [
      { ...TEXT_ITEM, localPath: '/ws/1.md', fileName: '1.md' },
      { ...TEXT_ITEM, localPath: '/ws/2.md', fileName: '2.md' },
    ];
    const summary = await runBatchUpload(plan, TARGET);

    expect(summary).toEqual({ total: 2, ok: 1, skipped: 0, failed: 1, aborted: false });
    expect(mocks.syncByPath).toHaveBeenCalledTimes(2);
  });

  it('用户中止：每项开始前检查，已开始的项仍会传完', async () => {
    let cancelled = false;
    mocks.syncByPath.mockImplementation(async () => {
      cancelled = true;
      return { status: 'synced', fileId: 1 };
    });
    const plan: UploadPlanItem[] = [
      { ...TEXT_ITEM, localPath: '/ws/1.md', fileName: '1.md' },
      { ...TEXT_ITEM, localPath: '/ws/2.md', fileName: '2.md' },
    ];

    const summary = await runBatchUpload(plan, TARGET, { isCancelled: () => cancelled });

    expect(summary).toEqual({ total: 2, ok: 1, skipped: 0, failed: 0, aborted: true });
    expect(mocks.syncByPath).toHaveBeenCalledTimes(1);
  });

  it('空的计划直接返回全零汇总', async () => {
    const summary = await runBatchUpload([], TARGET);
    expect(summary).toEqual({ total: 0, ok: 0, skipped: 0, failed: 0, aborted: false });
  });
});
