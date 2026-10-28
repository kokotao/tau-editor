/**
 * @description 文件夹整目录上传服务（R3）：跳过规则、递归收集（截断/深度/不可读目录）、
 * 分类三分支（新建 / 复用同名 / 退化为自由文本）、串行上传的汇总与 quota·unauthorized 中止。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28 15:45
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn(),
  syncDocumentByPath: vi.fn(),
  resolveCloudDocPathForFile: vi.fn(),
  uploadBinaryDocument: vi.fn(),
  createCategory: vi.fn(),
  fetchManagedCategories: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    fileCommands: { ...actual.fileCommands, listFiles: mocks.listFiles },
  };
});

vi.mock('@/services/cloudSyncService', () => ({
  CLOUD_SYNC_MAX_BYTES: 12 * 1024 * 1024,
  syncDocumentByPath: mocks.syncDocumentByPath,
  resolveCloudDocPathForFile: mocks.resolveCloudDocPathForFile,
}));

vi.mock('@/services/cloudBinaryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudBinaryService')>();
  return { ...actual, uploadBinaryDocument: mocks.uploadBinaryDocument };
});

vi.mock('@/services/cloudCategoryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudCategoryService')>();
  return {
    ...actual,
    createCategory: mocks.createCategory,
    fetchManagedCategories: mocks.fetchManagedCategories,
  };
});

import {
  FOLDER_UPLOAD_MAX_DEPTH,
  FOLDER_UPLOAD_MAX_FILES,
  SKIP_DIR_NAMES,
  classifyFolderFile,
  collectFolderFiles,
  emptyFolderAssetsSummary,
  ensureCategoryForFolder,
  folderAssetsOk,
  isHiddenName,
  runFolderUpload,
  shouldShowFolderAssets,
  shouldSkipEntry,
  type FolderFileEntry,
} from '@/services/cloudFolderUploadService';
import type { CloudAssetSyncSummary } from '@/services/cloudAssetService';
import type { FileEntry } from '@/lib/tauri';

const MB = 1024 * 1024;

/** 便捷构造 list_files 返回条目 */
const file = (dir: string, name: string, size = 128): FileEntry => ({
  name,
  path: `${dir}/${name}`,
  type: 'file',
  size,
});
const folder = (dir: string, name: string): FileEntry => ({
  name,
  path: `${dir}/${name}`,
  type: 'folder',
});

const syncOk = (message = '已创建云端文档') => ({ status: 'synced' as const, message, fileId: 1, version: 1 });

beforeEach(() => {
  mocks.listFiles.mockReset();
  mocks.syncDocumentByPath.mockReset();
  mocks.resolveCloudDocPathForFile.mockReset();
  mocks.uploadBinaryDocument.mockReset();
  mocks.createCategory.mockReset();
  mocks.fetchManagedCategories.mockReset();

  mocks.resolveCloudDocPathForFile.mockImplementation(
    (localPath: string) => `tau/ws/${localPath.replace(/^\/ws\//, '')}`,
  );
  mocks.syncDocumentByPath.mockResolvedValue(syncOk());
  mocks.uploadBinaryDocument.mockResolvedValue({ ok: true, data: { fileId: 9, version: 2 } });
  mocks.createCategory.mockResolvedValue({ ok: true, data: { id: '1001', name: 'docs', parentId: null, children: [] } });
  mocks.fetchManagedCategories.mockResolvedValue({ ok: true, data: [] });
});

describe('跳过规则', () => {
  it('隐藏项与构建/依赖目录被跳过，普通项放行', () => {
    expect(isHiddenName('.git')).toBe(true);
    expect(isHiddenName('.env')).toBe(true);
    expect(isHiddenName('git')).toBe(false);

    for (const dirName of SKIP_DIR_NAMES) {
      expect(shouldSkipEntry(dirName, true)).toBe(true);
    }
    // 目录名命中黑名单（大小写不敏感）
    expect(shouldSkipEntry('Node_Modules', true)).toBe(true);
    // 同名文件不受目录黑名单影响
    expect(shouldSkipEntry('build', false)).toBe(false);
    // 隐藏文件无论类型都跳过
    expect(shouldSkipEntry('.env', false)).toBe(true);
    // 空名视为跳过
    expect(shouldSkipEntry('   ', false)).toBe(true);
    expect(shouldSkipEntry('src', true)).toBe(false);
    expect(shouldSkipEntry('notes.md', false)).toBe(false);
  });
});

describe('单文件归类', () => {
  it('文本与二进制各走各的通道', () => {
    expect(classifyFolderFile('/ws/notes.md', 1024)).toEqual({ kind: 'text', skipReason: null });
    expect(classifyFolderFile('/ws/report.pdf', 1024).kind).toBe('binary');
    expect(classifyFolderFile('/ws/sheet.xlsx', 1024).kind).toBe('binary');
  });

  it('文本白名单与后端对齐：无扩展名与非白名单扩展名都跳过（不落到「失败」）', () => {
    // 后端 CloudDocPathValidator.TEXT_EXTENSIONS 不含无扩展名文件，传上去只会 400
    const makefile = classifyFolderFile('/ws/Makefile', 512);
    expect(makefile.kind).toBeNull();
    expect(makefile.skipReason).toContain('无扩展名');

    for (const name of ['/ws/App.svelte', '/ws/init.lua', '/ws/main.swift', '/ws/build.mk']) {
      const decision = classifyFolderFile(name, 512);
      expect(decision.kind).toBeNull();
      expect(decision.skipReason).toBeTruthy();
    }

    // 后端白名单内的仍然放行
    expect(classifyFolderFile('/ws/main.ts', 512).kind).toBe('text');
    expect(classifyFolderFile('/ws/index.html', 512).kind).toBe('text');
  });

  it('超限与不支持的类型给出可读原因', () => {
    const macro = classifyFolderFile('/ws/report.docm', 1024);
    expect(macro.kind).toBeNull();
    expect(macro.skipReason).toContain('宏');

    const image = classifyFolderFile('/ws/pic.png', 1024);
    expect(image.kind).toBeNull();
    expect(image.skipReason).toContain('图片');

    const zip = classifyFolderFile('/ws/pkg.zip', 1024);
    expect(zip.kind).toBeNull();
    expect(zip.skipReason).toContain('.zip');

    const bigText = classifyFolderFile('/ws/huge.md', 13 * MB);
    expect(bigText.kind).toBeNull();
    expect(bigText.skipReason).toContain('12 MB');

    const bigBinary = classifyFolderFile('/ws/huge.pdf', 60 * MB);
    expect(bigBinary.kind).toBeNull();
    expect(bigBinary.skipReason).toContain('50 MB');

    // 体积未知时只按扩展名归类（真实大小由 Rust 侧再拦一次）
    expect(classifyFolderFile('/ws/notes.md', null).kind).toBe('text');
  });
});

describe('递归收集', () => {
  it('跳过黑名单目录与隐藏项，收集可上传文件并记录跳过原因', async () => {
    mocks.listFiles.mockImplementation(async (dir: string) => {
      if (dir === '/ws/docs') {
        return [
          folder('/ws/docs', 'node_modules'),
          folder('/ws/docs', '.git'),
          folder('/ws/docs', 'src'),
          file('/ws/docs', 'readme.md', 2048),
          file('/ws/docs', 'pic.png', 1024),
        ];
      }
      if (dir === '/ws/docs/src') {
        return [file('/ws/docs/src', 'main.ts', 4096), file('/ws/docs/src', 'report.docx', 300 * 1024)];
      }
      return [];
    });

    const result = await collectFolderFiles('/ws/docs');

    expect(result.files.map((item) => item.relativePath)).toEqual([
      'readme.md',
      'src/main.ts',
      'src/report.docx',
    ]);
    expect(result.files.map((item) => item.kind)).toEqual(['text', 'text', 'binary']);
    expect(result.truncated).toBe(false);
    expect(result.truncatedReason).toBeNull();

    const skippedNames = result.skipped.map((item) => item.name);
    expect(skippedNames).toContain('node_modules');
    expect(skippedNames).toContain('.git');
    expect(skippedNames).toContain('pic.png');
    expect(result.skipped.find((item) => item.name === 'node_modules')?.reason).toContain('构建或依赖目录');
    expect(result.skipped.find((item) => item.name === '.git')?.reason).toBe('隐藏项');
    expect(result.skipped.find((item) => item.name === 'pic.png')?.reason).toContain('图片');
  });

  it('文件数超上限时截断并给出截断原因', async () => {
    mocks.listFiles.mockResolvedValue([
      file('/ws/many', 'a.md'),
      file('/ws/many', 'b.md'),
      file('/ws/many', 'c.md'),
    ]);

    const result = await collectFolderFiles('/ws/many', { maxFiles: 2 });

    expect(result.files).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(result.truncatedReason).toContain('2');
    expect(result.files.map((item) => item.name)).toEqual(['a.md', 'b.md']);
  });

  it('默认上限与文档一致（深度 8 / 文件 500）', () => {
    expect(FOLDER_UPLOAD_MAX_DEPTH).toBe(8);
    expect(FOLDER_UPLOAD_MAX_FILES).toBe(500);
  });

  it('目录层级超上限时跳过该目录并标记截断', async () => {
    mocks.listFiles.mockImplementation(async (dir: string) => {
      if (dir === '/ws/root') return [folder('/ws/root', 'level1')];
      if (dir === '/ws/root/level1') return [folder('/ws/root/level1', 'level2')];
      if (dir === '/ws/root/level1/level2') return [file('/ws/root/level1/level2', 'deep.md')];
      return [];
    });

    const result = await collectFolderFiles('/ws/root', { maxDepth: 1 });

    expect(result.files).toHaveLength(0);
    expect(result.truncated).toBe(true);
    expect(result.truncatedReason).toContain('1 层');
    expect(result.skipped.some((item) => item.name === 'level1')).toBe(true);
  });

  it('某个目录读取失败只记跳过，不影响其余文件', async () => {
    mocks.listFiles.mockImplementation(async (dir: string) => {
      if (dir === '/ws/root') return [folder('/ws/root', 'locked'), file('/ws/root', 'a.md')];
      throw new Error('permission denied');
    });

    const result = await collectFolderFiles('/ws/root');

    expect(result.files.map((item) => item.name)).toEqual(['a.md']);
    expect(result.skipped.find((item) => item.name === 'locked')?.reason).toBe('无法读取目录');
  });
});

describe('文件夹 → 云端分类', () => {
  it('createCategory 成功即用新建的分类 id', async () => {
    mocks.createCategory.mockResolvedValue({
      ok: true,
      data: { id: '2002', name: 'docs', parentId: null, children: [] },
    });

    const target = await ensureCategoryForFolder('docs');

    expect(target).toEqual({ category: 'docs', categoryId: '2002', created: true, note: null });
    expect(mocks.fetchManagedCategories).not.toHaveBeenCalled();
  });

  it('新建失败（同名 409）时复用已有同名分类', async () => {
    mocks.createCategory.mockResolvedValue({ ok: false, kind: 'conflict', message: '分类名已存在' });
    mocks.fetchManagedCategories.mockResolvedValue({
      ok: true,
      data: [
        {
          id: '1',
          name: '其它',
          parentId: null,
          children: [{ id: '3003', name: 'docs', parentId: '1', children: [] }],
        },
      ],
    });

    const target = await ensureCategoryForFolder('docs');

    expect(target.category).toBe('docs');
    expect(target.categoryId).toBe('3003');
    expect(target.created).toBe(false);
    expect(target.note).toContain('复用');
  });

  it('新建与查询都失败时退化为自由文本分类', async () => {
    mocks.createCategory.mockResolvedValue({ ok: false, kind: 'network', message: '网络异常' });
    mocks.fetchManagedCategories.mockResolvedValue({ ok: false, kind: 'network', message: '网络异常' });

    const target = await ensureCategoryForFolder('docs');

    expect(target).toEqual({
      category: 'docs',
      categoryId: null,
      created: false,
      note: '网络异常',
    });
  });
});

describe('串行上传队列', () => {
  const textFile = (name: string): FolderFileEntry => ({
    path: `/ws/docs/${name}`,
    relativePath: name,
    name,
    size: 1024,
    kind: 'text',
  });
  const binaryFile = (name: string): FolderFileEntry => ({
    path: `/ws/docs/${name}`,
    relativePath: name,
    name,
    size: 2048,
    kind: 'binary',
  });

  const run = (
    files: FolderFileEntry[],
    options: { signal?: AbortSignal } = {},
  ) => runFolderUpload(
    { rootPath: '/ws/docs', folderName: 'docs', files },
    {},
    { workspaceName: 'ws', workspacePath: '/ws', ...options },
  );

  it('成功后汇总成功数，并把分类透传给文本与二进制两条通道', async () => {
    const summary = await run([textFile('a.md'), binaryFile('b.pdf')]);

    expect(summary.total).toBe(2);
    expect(summary.uploaded).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.aborted).toBe(false);
    expect(summary.category.categoryId).toBe('1001');

    // categoryId 只在有真实分类时透传，避免误触发「只改分类」的覆盖更新
    expect(mocks.syncDocumentByPath).toHaveBeenCalledWith({
      filePath: '/ws/docs/a.md',
      category: 'docs',
      categoryId: '1001',
    });
    expect(mocks.resolveCloudDocPathForFile).toHaveBeenCalledWith('/ws/docs/b.pdf', 'ws', '/ws');
    expect(mocks.uploadBinaryDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudPath: 'tau/ws/docs/b.pdf',
        localPath: '/ws/docs/b.pdf',
        title: 'b.pdf',
        category: 'docs',
      }),
      { fileSize: 2048 },
    );
  });

  it('冲突记为「已存在未覆盖」，跳过与失败各自归类', async () => {
    mocks.syncDocumentByPath
      .mockResolvedValueOnce({ status: 'conflict', message: '云端已有该文档且内容不同' })
      .mockResolvedValueOnce({ status: 'skipped', message: '已是同步状态（内容与云端一致）' })
      .mockResolvedValueOnce({ status: 'failed', kind: 'network', message: '网络异常' });

    const summary = await run([textFile('a.md'), textFile('b.md'), textFile('c.md')]);

    expect(summary.conflict).toBe(1);
    expect(summary.unchanged).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.uploaded).toBe(0);
    expect(summary.aborted).toBe(false);

    expect(summary.items[0]).toMatchObject({ name: 'a.md', status: 'conflict' });
    expect(summary.items[0]?.message).toContain('未覆盖');
    expect(summary.items[1]).toMatchObject({ name: 'b.md', status: 'unchanged' });
    expect(summary.items[2]).toMatchObject({ name: 'c.md', status: 'failed' });
  });

  it('quota 立即中止队列，剩余文件不再上传', async () => {
    mocks.syncDocumentByPath.mockResolvedValueOnce({
      status: 'failed',
      kind: 'quota',
      message: '云端空间不足',
    });

    const summary = await run([textFile('a.md'), textFile('b.md'), textFile('c.md')]);

    expect(summary.aborted).toBe(true);
    expect(summary.abortKind).toBe('quota');
    expect(summary.abortMessage).toContain('空间不足');
    expect(summary.items).toHaveLength(1);
    expect(mocks.syncDocumentByPath).toHaveBeenCalledTimes(1);
  });

  it('unauthorized 同样中止队列', async () => {
    mocks.uploadBinaryDocument.mockResolvedValueOnce({
      ok: false,
      kind: 'unauthorized',
      message: '登录状态已失效，请重新登录 lizi 账号',
    });

    const summary = await run([binaryFile('a.pdf'), textFile('b.md')]);

    expect(summary.aborted).toBe(true);
    expect(summary.abortKind).toBe('unauthorized');
    expect(summary.failed).toBe(1);
    expect(mocks.syncDocumentByPath).not.toHaveBeenCalled();
  });

  it('二进制 unsupported 记为跳过而不是失败', async () => {
    mocks.uploadBinaryDocument.mockResolvedValueOnce({
      ok: false,
      kind: 'unsupported',
      message: '文件未通过云端安全检查',
    });

    const summary = await run([binaryFile('a.pdf')]);

    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.aborted).toBe(false);
    expect(summary.items[0]).toMatchObject({ status: 'skipped' });
  });

  it('进度回调按完成数递增，取消信号在下一个文件前生效', async () => {
    const progress = vi.fn();
    const controller = new AbortController();
    mocks.syncDocumentByPath.mockImplementation(async () => {
      controller.abort();
      return syncOk();
    });

    const summary = await runFolderUpload(
      { rootPath: '/ws/docs', folderName: 'docs', files: [textFile('a.md'), textFile('b.md')] },
      { onProgress: progress },
      { workspaceName: 'ws', workspacePath: '/ws', signal: controller.signal },
    );

    expect(progress).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith(1, 2, expect.objectContaining({ name: 'a.md' }));
    expect(summary.aborted).toBe(true);
    expect(summary.abortMessage).toContain('取消');
    expect(summary.items).toHaveLength(1);
  });

  it('单条抛异常不打断队列', async () => {
    mocks.syncDocumentByPath
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(syncOk());

    const summary = await run([textFile('a.md'), textFile('b.md')]);

    expect(summary.failed).toBe(1);
    expect(summary.uploaded).toBe(1);
    expect(summary.items[1]).toMatchObject({ name: 'b.md', status: 'uploaded' });
  });

  it('空文件列表直接返回空汇总（不建分类、不发请求）', async () => {
    const summary = await run([]);

    expect(summary.total).toBe(0);
    expect(summary.items).toHaveLength(0);
    expect(summary.assets).toEqual(emptyFolderAssetsSummary());
    expect(mocks.createCategory).not.toHaveBeenCalled();
    expect(mocks.syncDocumentByPath).not.toHaveBeenCalled();
  });
});

describe('图片附件汇总（Markdown 相对图片）', () => {
  const textFile = (name: string): FolderFileEntry => ({
    path: `/ws/docs/${name}`,
    relativePath: name,
    name,
    size: 1024,
    kind: 'text',
  });
  const binaryFile = (name: string): FolderFileEntry => ({
    path: `/ws/docs/${name}`,
    relativePath: name,
    name,
    size: 2048,
    kind: 'binary',
  });

  /** 构造一份 CloudAssetSyncSummary */
  const assetSummary = (over: Partial<CloudAssetSyncSummary> = {}): CloudAssetSyncSummary => ({
    total: 0,
    eligible: 0,
    uploaded: 0,
    unchanged: 0,
    failed: 0,
    skipped: 0,
    unsupported: 0,
    failures: [],
    ...over,
  });

  const run = (files: FolderFileEntry[]) => runFolderUpload(
    { rootPath: '/ws/docs', folderName: 'docs', files },
    {},
    { workspaceName: 'ws', workspacePath: '/ws' },
  );

  it('文本项的 assets 挂到 item 上，并累加进整目录汇总', async () => {
    mocks.syncDocumentByPath
      .mockResolvedValueOnce({
        ...syncOk(),
        assets: assetSummary({
          total: 3,
          eligible: 2,
          uploaded: 1,
          unchanged: 1,
          skipped: 0,
          unsupported: 1,
        }),
      })
      .mockResolvedValueOnce({
        ...syncOk(),
        assets: assetSummary({ total: 2, eligible: 1, uploaded: 0, unchanged: 0, failed: 1, skipped: 1 }),
      });

    const summary = await run([textFile('a.md'), textFile('b.md')]);

    expect(summary.assets).toEqual({
      total: 5,
      uploaded: 1,
      unchanged: 1,
      failed: 1,
      skipped: 1,
      unsupported: 1,
      disabled: false,
    });
    // 逐条结果上带着各自的图片汇总（弹窗可悬停排查）
    expect(summary.items[0]?.assets?.unsupported).toBe(1);
    expect(summary.items[1]?.assets?.failed).toBe(1);

    // 展示口径：ok = uploaded + unchanged
    expect(folderAssetsOk(summary.assets)).toBe(2);
    expect(shouldShowFolderAssets(summary.assets)).toBe(true);
  });

  it('设置里关闭图片同步时 disabled 透传，计数保持 0 且不展示汇总行', async () => {
    mocks.syncDocumentByPath.mockResolvedValue({
      ...syncOk(),
      assets: assetSummary({ disabled: true }),
    });

    const summary = await run([textFile('a.md')]);

    expect(summary.assets.disabled).toBe(true);
    expect(summary.assets.total).toBe(0);
    expect(shouldShowFolderAssets(summary.assets)).toBe(false);
  });

  it('二进制项不产生图片汇总；没有 md 的目录汇总是空的', async () => {
    const summary = await run([binaryFile('a.pdf')]);

    expect(summary.assets).toEqual(emptyFolderAssetsSummary());
    expect(folderAssetsOk(summary.assets)).toBe(0);
    expect(shouldShowFolderAssets(summary.assets)).toBe(false);
  });

  it('展示口径：有计数才展示汇总行，unsupported 单独一行「值得展示」由调用方判断', async () => {
    expect(shouldShowFolderAssets(assetSummary({ total: 1 }))).toBe(true);
    expect(shouldShowFolderAssets(assetSummary({ failed: 1 }))).toBe(true);
    expect(shouldShowFolderAssets(assetSummary({ skipped: 1 }))).toBe(true);
    // 只有不可同步引用时 total 仍是 0：不展示「已同步 0 张」，但 unsupported 会单独提示
    expect(shouldShowFolderAssets(assetSummary({ unsupported: 2 }))).toBe(false);
    expect(shouldShowFolderAssets(emptyFolderAssetsSummary())).toBe(false);
    expect(shouldShowFolderAssets(null)).toBe(false);
  });

  it('图片跳过原因说明「随引用的 Markdown 作为附件上传」', () => {
    const decision = classifyFolderFile('/ws/pic.png', 1024);

    expect(decision.kind).toBeNull();
    expect(decision.skipReason).toContain('Markdown');
    expect(decision.skipReason).toContain('附件');
  });
});
