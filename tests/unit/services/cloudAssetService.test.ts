/**
 * @description md 相对图片同步纯逻辑与编排：引用解析、路径规范化、20MB/格式过滤、只传变更、
 * 失败汇总不阻断、拉取写盘/跳过、开关关闭。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 18:05
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTauri: { value: true },
  assetsList: vi.fn(),
  inspectAssetSources: vi.fn(),
  assetUploadFile: vi.fn(),
  assetDownload: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => mocks.isTauri.value,
    cloudCommands: {
      ...actual.cloudCommands,
      assetsList: mocks.assetsList,
      inspectAssetSources: mocks.inspectAssetSources,
      assetUploadFile: mocks.assetUploadFile,
      assetDownload: mocks.assetDownload,
    },
  };
});

import type { CloudAssetInfo, CloudAssetSourceInfo } from '@/lib/tauri';
import {
  CLOUD_ASSET_MAX_BYTES,
  classifyImageRef,
  isRelativeImagePath,
  isSupportedImageName,
  normalizeRelativeAssetPath,
  parseMarkdownImageRefs,
  parseMarkdownImageRefsDetailed,
  planAssetUploads,
  pullMarkdownAssets,
  runWithConcurrency,
  syncMarkdownAssets,
} from '@/services/cloudAssetService';

function sourceInfo(overrides: Partial<CloudAssetSourceInfo> = {}): CloudAssetSourceInfo {
  return {
    path: '/ws/notes/images/a.png',
    exists: true,
    size: 1024,
    contentHash: 'sha256:aaa',
    supported: true,
    reason: null,
    ...overrides,
  };
}

function remoteAsset(overrides: Partial<CloudAssetInfo> = {}): CloudAssetInfo {
  return {
    assetId: 1,
    relPath: 'images/a.png',
    fileName: 'a.png',
    mime: 'image/png',
    size: 1024,
    contentHash: 'sha256:aaa',
    ...overrides,
  };
}

describe('parseMarkdownImageRefs 引用解析', () => {
  const filePath = '/ws/notes/读书.md';

  it('相对路径解析为文档同目录下的绝对路径', () => {
    const refs = parseMarkdownImageRefs('![图](images/a.png)', filePath);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      relPath: 'images/a.png',
      localPath: '/ws/notes/images/a.png',
    });
  });

  it('跳过 http(s)/data:/绝对路径/锚点', () => {
    const md = [
      '![a](https://x.com/a.png)',
      '![b](data:image/png;base64,AAA)',
      '![c](/assets/a.png)',
      '![d](#anchor)',
      '<img src="//cdn/a.png">',
    ].join('\n');
    expect(parseMarkdownImageRefs(md, filePath)).toHaveLength(0);
  });

  it('处理空格、尖括号、URL 编码、反斜杠与嵌套目录', () => {
    const md = [
      '![a](images/my pic.png)',
      '![b](<images/my pic2.png>)',
      '![c](images/my%20pic3.png)',
      '![d](.\\images\\sub\\pic4.jpg)',
      '![e](./images/pic5.gif)',
    ].join('\n');
    const refs = parseMarkdownImageRefs(md, filePath);
    expect(refs.map((ref) => ref.relPath)).toEqual([
      'images/my pic.png',
      'images/my pic2.png',
      'images/my pic3.png',
      'images/sub/pic4.jpg',
      'images/pic5.gif',
    ]);
  });

  it('越界的 .. 引用被丢弃，重复引用只保留一次', () => {
    const md = ['![a](../outside.png)', '![b](images/a.png)', '![c](images/a.png)'].join('\n');
    const refs = parseMarkdownImageRefs(md, filePath);
    expect(refs.map((ref) => ref.relPath)).toEqual(['images/a.png']);
  });

  it('图片描述里带链接、注释里的图片不影响解析', () => {
    const md = ['<!-- ![x](images/hidden.png) -->', '[![alt](images/cover.png)](https://a.com)'].join('\n');
    expect(parseMarkdownImageRefs(md, filePath).map((ref) => ref.relPath)).toEqual(['images/cover.png']);
  });
});

describe('parseMarkdownImageRefsDetailed 未同步原因', () => {
  const filePath = '/ws/notes/读书.md';

  it('外链 / 绝对路径 / ../ 跨目录 / 格式不支持 各自给出 reason，正常相对路径进 refs', () => {
    const md = [
      '![ok](images/a.png)',
      '![ext](https://x.com/a.png)',
      '![proto](//cdn/a.png)',
      '![abs](/assets/a.png)',
      '![win](C:\\pics\\a.png)',
      '![up](../outside.png)',
      '![svg](images/logo.svg)',
      '<img src="data:image/png;base64,AAA">',
    ].join('\n');

    const parsed = parseMarkdownImageRefsDetailed(md, filePath);

    // 只有同目录/子目录的相对位图能同步
    expect(parsed.refs.map((ref) => ref.relPath)).toEqual(['images/a.png']);
    expect(parsed.unsupported).toEqual([
      { raw: 'https://x.com/a.png', reason: 'external' },
      { raw: '//cdn/a.png', reason: 'external' },
      { raw: '/assets/a.png', reason: 'absolute' },
      { raw: 'C:\\pics\\a.png', reason: 'absolute' },
      { raw: '../outside.png', reason: 'cross-directory' },
      { raw: 'images/logo.svg', reason: 'unsupported-extension' },
      { raw: 'data:image/png;base64,AAA', reason: 'external' },
    ]);
    // 兼容：原有 parseMarkdownImageRefs 行为不变（只返回可同步引用）
    expect(parseMarkdownImageRefs(md, filePath).map((ref) => ref.relPath)).toEqual(['images/a.png']);
  });

  it('同一处未同步引用只计一次，空引用与注释里的图片不算', () => {
    const md = [
      '![a](https://x.com/a.png)',
      '![b](https://x.com/a.png)',
      '![c](   )',
      '<!-- ![d](../hidden.png) -->',
    ].join('\n');

    const parsed = parseMarkdownImageRefsDetailed(md, filePath);

    expect(parsed.refs).toHaveLength(0);
    expect(parsed.unsupported).toEqual([{ raw: 'https://x.com/a.png', reason: 'external' }]);
  });

  it('classifyImageRef 对可同步路径返回 null', () => {
    expect(classifyImageRef('images/a.png')).toBeNull();
    expect(classifyImageRef('./images/sub/a.JPG')).toBeNull();
    expect(classifyImageRef('images\\sub\\a.webp')).toBeNull();
    // 单个反斜杠开头仍按相对路径处理（与 normalizeRelativeAssetPath 一致）
    expect(classifyImageRef('\\images\\a.png')).toBeNull();

    expect(classifyImageRef('http://a/b.png')).toBe('external');
    expect(classifyImageRef('#anchor')).toBe('external');
    expect(classifyImageRef('/abs/a.png')).toBe('absolute');
    expect(classifyImageRef('\\\\server\\share\\a.png')).toBe('absolute');
    expect(classifyImageRef('images/../../a.png')).toBe('cross-directory');
    expect(classifyImageRef('images/a.bmp')).toBe('unsupported-extension');
  });
});

describe('图片路径与格式判定', () => {  it('相对路径判定', () => {
    expect(isRelativeImagePath('images/a.png')).toBe(true);
    expect(isRelativeImagePath('http://a/b.png')).toBe(false);
    expect(isRelativeImagePath('/abs.png')).toBe(false);
    expect(isRelativeImagePath('data:image/png,x')).toBe(false);
    expect(isRelativeImagePath('')).toBe(false);
  });

  it('路径规范化拒绝越界', () => {
    expect(normalizeRelativeAssetPath('./images/a.png')).toBe('images/a.png');
    expect(normalizeRelativeAssetPath('images\\sub\\a.png')).toBe('images/sub/a.png');
    expect(normalizeRelativeAssetPath('../a.png')).toBeNull();
    expect(normalizeRelativeAssetPath('images/../../a.png')).toBeNull();
    expect(normalizeRelativeAssetPath('   ')).toBeNull();
  });

  it('只接受 png/jpg/jpeg/gif/webp', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'PNG']) {
      expect(isSupportedImageName(`a.${ext}`)).toBe(true);
    }
    for (const ext of ['svg', 'pdf', 'bmp', 'avif', 'txt']) {
      expect(isSupportedImageName(`a.${ext}`)).toBe(false);
    }
  });
});

describe('planAssetUploads 只传变更与边界', () => {
  const refs = parseMarkdownImageRefs(
    ['![a](images/a.png)', '![b](images/b.png)', '![c](images/none.png)'].join('\n'),
    '/ws/notes/a.md',
  );

  it('仅上传新增/变更，同 hash 跳过，缺失与不合规进 skipped', () => {
    const localInfo = [
      sourceInfo({ path: '/ws/notes/images/a.png', contentHash: 'sha256:aaa' }),
      sourceInfo({ path: '/ws/notes/images/b.png', contentHash: 'sha256:new' }),
      sourceInfo({ path: '/ws/notes/images/none.png', exists: false, supported: false, reason: '本地文件不存在' }),
    ];
    const remote = [remoteAsset({ relPath: 'images/a.png', contentHash: 'sha256:aaa' })];

    const plan = planAssetUploads(refs, localInfo, remote);
    expect(plan.uploads.map((ref) => ref.relPath)).toEqual(['images/b.png']);
    expect(plan.unchanged.map((ref) => ref.relPath)).toEqual(['images/a.png']);
    expect(plan.skipped.map((item) => item.ref.relPath)).toEqual(['images/none.png']);
  });

  it('超过 20MB 的图片被跳过（边界值放行）', () => {
    const over = planAssetUploads(
      refs.slice(0, 1),
      [sourceInfo({ size: CLOUD_ASSET_MAX_BYTES + 1 })],
      [],
    );
    expect(over.uploads).toHaveLength(0);
    expect(over.skipped[0]?.reason).toContain('20 MB');

    const exact = planAssetUploads(refs.slice(0, 1), [sourceInfo({ size: CLOUD_ASSET_MAX_BYTES })], []);
    expect(exact.uploads).toHaveLength(1);
  });

  it('服务端 hash 缺 sha256: 前缀时仍按「无变化」跳过', () => {
    const plan = planAssetUploads(
      refs.slice(0, 1),
      [sourceInfo({ path: '/ws/notes/images/a.png', contentHash: 'sha256:aaa' })],
      [remoteAsset({ relPath: 'images/a.png', contentHash: 'aaa' })],
    );
    expect(plan.uploads).toHaveLength(0);
    expect(plan.unchanged.map((ref) => ref.relPath)).toEqual(['images/a.png']);
  });
});

describe('syncMarkdownAssets 编排', () => {
  beforeEach(() => {
    mocks.isTauri.value = true;
    mocks.assetsList.mockResolvedValue([]);
    mocks.inspectAssetSources.mockResolvedValue([]);
    mocks.assetUploadFile.mockResolvedValue({ assetId: 1 });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('设置关闭时完全不请求', async () => {
    const summary = await syncMarkdownAssets({
      filePath: '/ws/a.md',
      fileId: 42,
      content: '![a](images/a.png)',
      enabled: false,
    });

    expect(summary.disabled).toBe(true);
    expect(summary.total).toBe(0);
    expect(mocks.assetsList).not.toHaveBeenCalled();
    expect(mocks.assetUploadFile).not.toHaveBeenCalled();
  });

  it('只上传变更的图片，并汇报进度', async () => {
    const content = ['![a](images/a.png)', '![b](images/b.png)'].join('\n');
    mocks.inspectAssetSources.mockResolvedValue([
      sourceInfo({ path: '/ws/images/a.png', contentHash: 'sha256:aaa' }),
      sourceInfo({ path: '/ws/images/b.png', contentHash: 'sha256:bbb' }),
    ]);
    mocks.assetsList.mockResolvedValue([
      remoteAsset({ relPath: 'images/a.png', contentHash: 'sha256:aaa' }),
    ]);
    const progress: Array<[number, number, number]> = [];

    const summary = await syncMarkdownAssets({
      filePath: '/ws/a.md',
      fileId: 42,
      content,
      enabled: true,
      onProgress: (done, total, failed) => progress.push([done, total, failed]),
    });

    expect(summary.total).toBe(2);
    expect(summary.uploaded).toBe(1);
    expect(summary.unchanged).toBe(1);
    expect(summary.failed).toBe(0);
    expect(mocks.assetUploadFile).toHaveBeenCalledTimes(1);
    expect(mocks.assetUploadFile).toHaveBeenCalledWith(42, 'images/b.png', '/ws/images/b.png');
    expect(progress.at(-1)).toEqual([1, 1, 0]);
  });

  it('单张失败不阻断其它图片，并汇总可读原因', async () => {
    const content = ['![a](images/a.png)', '![b](images/b.png)'].join('\n');
    mocks.inspectAssetSources.mockResolvedValue([
      sourceInfo({ path: '/ws/images/a.png', contentHash: 'sha256:a' }),
      sourceInfo({ path: '/ws/images/b.png', contentHash: 'sha256:b' }),
    ]);
    mocks.assetUploadFile.mockImplementation(async (_id: number, relPath: string) => {
      if (relPath === 'images/b.png') {
        throw Object.assign(new Error('云端空间不足'), { code: 'QUOTA_EXCEEDED' });
      }
      return { assetId: 1 };
    });

    const summary = await syncMarkdownAssets({
      filePath: '/ws/a.md',
      fileId: 42,
      content,
      enabled: true,
    });

    expect(summary.uploaded).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.failures[0]).toMatchObject({ relPath: 'images/b.png' });
    expect(summary.failures[0]?.reason).toContain('云端空间不足');
  });

  it('汇总里统计不可同步的引用处数（外链 / ../ / svg）', async () => {
    const content = [
      '![a](images/a.png)',
      '![b](https://x.com/b.png)',
      '![c](../c.png)',
      '![d](images/d.svg)',
    ].join('\n');
    mocks.inspectAssetSources.mockResolvedValue([
      sourceInfo({ path: '/ws/images/a.png', contentHash: 'sha256:aaa' }),
    ]);

    const summary = await syncMarkdownAssets({
      filePath: '/ws/a.md',
      fileId: 42,
      content,
      enabled: true,
    });

    // total 只算可同步引用；不可同步的单独计数，供 UI 解释「图片为什么没上传」
    expect(summary.total).toBe(1);
    expect(summary.unsupported).toBe(3);
    expect(summary.uploaded).toBe(1);
    // 只有不可同步引用时不会去探测/上传
    expect(mocks.inspectAssetSources).toHaveBeenCalledTimes(1);
  });

  it('全部引用都不可同步时不发起任何请求，只汇报 unsupported', async () => {
    const summary = await syncMarkdownAssets({
      filePath: '/ws/a.md',
      fileId: 42,
      content: ['![a](../a.png)', '![b](https://x.com/b.png)'].join('\n'),
      enabled: true,
    });

    expect(summary.total).toBe(0);
    expect(summary.unsupported).toBe(2);
    expect(mocks.assetsList).not.toHaveBeenCalled();
    expect(mocks.inspectAssetSources).not.toHaveBeenCalled();
  });

  it('设置关闭时 unsupported 也保持 0（未做扫描）', async () => {
    const summary = await syncMarkdownAssets({
      filePath: '/ws/a.md',
      fileId: 42,
      content: '![a](https://x.com/a.png)',
      enabled: false,
    });

    expect(summary.disabled).toBe(true);
    expect(summary.unsupported).toBe(0);
  });

  it('并发不超过 3', async () => {
    const refsCount = 7;
    const content = Array.from({ length: refsCount }, (_, index) => `![x](images/${index}.png)`).join('\n');
    mocks.inspectAssetSources.mockResolvedValue(
      Array.from({ length: refsCount }, (_, index) =>
        sourceInfo({ path: `/ws/images/${index}.png`, contentHash: `sha256:${index}` })),
    );
    let active = 0;
    let peak = 0;
    mocks.assetUploadFile.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { assetId: 1 };
    });

    const summary = await syncMarkdownAssets({
      filePath: '/ws/a.md',
      fileId: 42,
      content,
      enabled: true,
    });

    expect(summary.uploaded).toBe(refsCount);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('pullMarkdownAssets 拉取补图', () => {
  beforeEach(() => {
    mocks.isTauri.value = true;
    mocks.assetDownload.mockResolvedValue({
      status: 'written',
      localPath: '/ws/images/a.png',
      size: 10,
      reason: null,
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('按 assets 列表下载，区分写入/相同跳过/冲突跳过', async () => {
    mocks.assetsList.mockResolvedValue([
      remoteAsset({ assetId: 1, relPath: 'images/a.png' }),
      remoteAsset({ assetId: 2, relPath: 'images/b.png' }),
      remoteAsset({ assetId: 3, relPath: 'images/c.png' }),
    ]);
    mocks.assetDownload.mockImplementation(async (input: { assetId: number }) => {
      if (input.assetId === 2) {
        return { status: 'skippedSame', localPath: '/ws/images/b.png', size: 10, reason: null };
      }
      if (input.assetId === 3) {
        return {
          status: 'skippedConflict',
          localPath: '/ws/images/c.png',
          size: 10,
          reason: '本地已有同名图片但内容不同，未覆盖',
        };
      }
      return { status: 'written', localPath: '/ws/images/a.png', size: 10, reason: null };
    });

    const summary = await pullMarkdownAssets({
      filePath: '/ws/a.md',
      fileId: 42,
      workspaceRoot: '/ws',
    });

    expect(summary.total).toBe(3);
    expect(summary.written).toBe(1);
    expect(summary.skippedSame).toBe(1);
    expect(summary.skippedConflict).toBe(1);
    expect(summary.failed).toBe(0);
  });

  it('单张下载失败不阻断其它图片', async () => {
    mocks.assetsList.mockResolvedValue([
      remoteAsset({ assetId: 1 }),
      remoteAsset({ assetId: 2, relPath: 'images/b.png' }),
    ]);
    mocks.assetDownload.mockImplementation(async (input: { assetId: number }) => {
      if (input.assetId === 2) {
        throw Object.assign(new Error('服务器错误'), { code: 'SERVER_ERROR' });
      }
      return { status: 'written', localPath: '/ws/images/a.png', size: 10, reason: null };
    });

    const summary = await pullMarkdownAssets({
      filePath: '/ws/a.md',
      fileId: 42,
      workspaceRoot: '/ws',
    });

    expect(summary.written).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.failures[0]?.relPath).toBe('images/b.png');
  });

  it('没有 workspace 或非桌面端时直接返回空汇总', async () => {
    const noWorkspace = await pullMarkdownAssets({ filePath: '/ws/a.md', fileId: 42, workspaceRoot: '' });
    expect(noWorkspace.total).toBe(0);

    mocks.isTauri.value = false;
    const notDesktop = await pullMarkdownAssets({ filePath: '/ws/a.md', fileId: 42, workspaceRoot: '/ws' });
    expect(notDesktop.total).toBe(0);
    expect(mocks.assetsList).not.toHaveBeenCalled();
  });
});

describe('runWithConcurrency', () => {
  it('保持顺序并限制并发', async () => {
    const results = await runWithConcurrency([1, 2, 3, 4], 2, async (value) => value * 2);
    expect(results).toEqual([2, 4, 6, 8]);
  });
});
