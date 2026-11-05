/**
 * @description 云端文档浏览器数据层：分页拉全量、构树（分层/排序/去重）、关键字过滤、截断判定。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 14:40
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cloudMocks = vi.hoisted(() => ({
  isTauri: { value: true },
  list: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => cloudMocks.isTauri.value,
    cloudCommands: { ...actual.cloudCommands, list: cloudMocks.list },
  };
});

import type { CloudDocItem } from '@/lib/tauri';
import {
  CLOUD_BROWSER_MAX_PAGES,
  CLOUD_BROWSER_MAX_RECORDS,
  CLOUD_BROWSER_PAGE_SIZE,
  buildCloudDocTree,
  countCloudDocFiles,
  fetchAllCloudDocs,
  filterCloudDocTree,
  formatCloudDocSize,
} from '@/services/cloudBrowserService';

function makeDoc(overrides: Partial<CloudDocItem> = {}): CloudDocItem {
  return {
    fileId: 1,
    path: 'tau/ws/a.md',
    title: 'a.md',
    contentHash: 'sha256:a',
    size: 12,
    version: 1,
    category: null,
    categoryId: null,
    tags: null,
    visibility: 'PRIVATE',
    publishedArticleId: null,
    updatedAt: '2026-10-25T09:00:00Z',
    ...overrides,
  };
}

/** 造一页记录 */
function makePage(count: number, offset = 0) {
  return {
    records: Array.from({ length: count }, (_, index) =>
      makeDoc({ fileId: offset + index + 1, path: `tau/ws/f${offset + index + 1}.md` })),
    total: count,
    page: 1,
    size: CLOUD_BROWSER_PAGE_SIZE,
  };
}

describe('buildCloudDocTree 树构建', () => {
  it('按 path 的 / 分段补齐目录层级', () => {
    const tree = buildCloudDocTree([
      makeDoc({ fileId: 1, path: 'tau/ws/notes/a.md' }),
      makeDoc({ fileId: 2, path: 'tau/ws/notes/deep/b.md' }),
      makeDoc({ fileId: 3, path: 'tau/ws/top.md' }),
    ]);

    // 完整路径构树：tau → ws → notes → (deep → b.md | a.md)
    expect(tree.map((node) => node.name)).toEqual(['tau']);
    const ws = tree[0]?.children[0];
    expect(ws?.name).toBe('ws');
    expect(ws?.children.map((node) => node.name)).toEqual(['notes', 'top.md']);
    expect(ws?.children[0]?.children.map((node) => node.name)).toEqual(['deep', 'a.md']);
    expect(ws?.children[0]?.children[0]?.children[0]?.name).toBe('b.md');
    expect(countCloudDocFiles(tree)).toBe(3);
  });

  it('stripPrefix 只影响分层，节点 path 仍是完整云端路径', () => {
    const tree = buildCloudDocTree(
      [makeDoc({ fileId: 1, path: 'tau/ws/notes/deep/b.md' })],
      { stripPrefix: 'tau/ws' },
    );

    expect(tree.map((node) => node.name)).toEqual(['notes']);
    const file = tree[0]?.children[0]?.children[0];
    expect(file?.name).toBe('b.md');
    expect(file?.path).toBe('tau/ws/notes/deep/b.md');
  });

  it('目录在前、同级按名称排序', () => {
    const tree = buildCloudDocTree([
      makeDoc({ fileId: 1, path: 'tau/ws/zeta.md' }),
      makeDoc({ fileId: 2, path: 'tau/ws/alpha.md' }),
      makeDoc({ fileId: 3, path: 'tau/ws/beta/c.md' }),
      makeDoc({ fileId: 4, path: 'tau/ws/aaa/d.md' }),
    ], { stripPrefix: 'tau/ws' });

    expect(tree.map((node) => `${node.kind}:${node.name}`)).toEqual([
      'dir:aaa',
      'dir:beta',
      'file:alpha.md',
      'file:zeta.md',
    ]);
  });

  it('同一路径重复出现只保留一个文件节点', () => {
    const tree = buildCloudDocTree(
      [makeDoc({ fileId: 1, path: 'tau/ws/a.md' }), makeDoc({ fileId: 2, path: 'tau/ws/a.md' })],
      { stripPrefix: 'tau/ws' },
    );

    expect(countCloudDocFiles(tree)).toBe(1);
    expect(tree).toHaveLength(1);
  });

  it('空记录返回空树', () => {
    expect(buildCloudDocTree([])).toEqual([]);
    expect(countCloudDocFiles([])).toBe(0);
  });

  it('反斜杠路径与多余分隔符按目录对待', () => {
    const tree = buildCloudDocTree([makeDoc({ path: 'tau\\ws\\notes\\\\a.md' })]);
    expect(tree[0]?.name).toBe('tau');
    expect(tree[0]?.children[0]?.name).toBe('ws');
  });
});

describe('filterCloudDocTree 搜索过滤', () => {
  const tree = buildCloudDocTree([
    makeDoc({ fileId: 1, path: 'tau/ws/notes/读书.md' }),
    makeDoc({ fileId: 2, path: 'tau/ws/notes/todo.md' }),
    makeDoc({ fileId: 3, path: 'tau/ws/other/x.md' }),
  ], { stripPrefix: 'tau/ws' });

  it('空关键字原样返回', () => {
    expect(filterCloudDocTree(tree, '   ')).toBe(tree);
  });

  it('命中文件名时保留其祖先目录', () => {
    const filtered = filterCloudDocTree(tree, '读书');
    expect(countCloudDocFiles(filtered)).toBe(1);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.name).toBe('notes');
    expect(filtered[0]?.children.map((node) => node.name)).toEqual(['读书.md']);
  });

  it('目录名命中也会带出其中的文件', () => {
    const filtered = filterCloudDocTree(tree, 'other');
    expect(countCloudDocFiles(filtered)).toBe(1);
    expect(filtered[0]?.name).toBe('other');
  });

  it('无命中返回空数组', () => {
    expect(filterCloudDocTree(tree, '不存在的关键字')).toEqual([]);
  });
});

describe('formatCloudDocSize', () => {
  it('按量级展示', () => {
    expect(formatCloudDocSize(0)).toBe('0 B');
    expect(formatCloudDocSize(999)).toBe('999 B');
    expect(formatCloudDocSize(2048)).toBe('2.0 KB');
    expect(formatCloudDocSize(12 * 1024 * 1024)).toBe('12.0 MB');
    expect(formatCloudDocSize(Number.NaN)).toBe('0 B');
  });
});

describe('fetchAllCloudDocs 分页拉全量', () => {
  beforeEach(() => {
    cloudMocks.isTauri.value = true;
    cloudMocks.list.mockReset();
  });

  it('按页拉取直到短页，合并去重', async () => {
    cloudMocks.list
      .mockResolvedValueOnce({ ...makePage(100, 0), total: 205 })
      .mockResolvedValueOnce({ ...makePage(100, 100), total: 205 })
      .mockResolvedValueOnce({ ...makePage(5, 200), total: 205 });

    const outcome = await fetchAllCloudDocs();

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.records).toHaveLength(205);
    expect(outcome.data.pages).toBe(3);
    expect(outcome.data.truncated).toBe(false);
    expect(cloudMocks.list).toHaveBeenCalledTimes(3);
    expect(cloudMocks.list).toHaveBeenNthCalledWith(1, {
      keyword: null,
      page: 1,
      size: CLOUD_BROWSER_PAGE_SIZE,
    });
    expect(cloudMocks.list).toHaveBeenNthCalledWith(3, {
      keyword: null,
      page: 3,
      size: CLOUD_BROWSER_PAGE_SIZE,
    });
  });

  it('触发页数上限时截断并标记 truncated', async () => {
    cloudMocks.list.mockImplementation(async ({ page }: { page: number }) => ({
      ...makePage(100, (page - 1) * 100),
      total: 99_999,
    }));

    const outcome = await fetchAllCloudDocs();

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(cloudMocks.list).toHaveBeenCalledTimes(CLOUD_BROWSER_MAX_PAGES);
    expect(outcome.data.records).toHaveLength(CLOUD_BROWSER_MAX_RECORDS);
    expect(outcome.data.truncated).toBe(true);
  });

  it('服务端总数大于实取条数时也按截断提示', async () => {
    cloudMocks.list.mockResolvedValue({ ...makePage(2, 0), total: 10 });

    const outcome = await fetchAllCloudDocs();

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.records).toHaveLength(2);
    expect(outcome.data.truncated).toBe(true);
  });

  it('关键字透传到 list', async () => {
    cloudMocks.list.mockResolvedValue({ ...makePage(1, 0), total: 1 });

    await fetchAllCloudDocs({ keyword: '  读书  ' });

    expect(cloudMocks.list).toHaveBeenCalledWith({
      keyword: '读书',
      page: 1,
      size: CLOUD_BROWSER_PAGE_SIZE,
    });
  });

  it('Web 构建下返回 unsupported', async () => {
    cloudMocks.isTauri.value = false;

    const outcome = await fetchAllCloudDocs();

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.kind).toBe('unsupported');
    expect(cloudMocks.list).not.toHaveBeenCalled();
  });

  it('网络错误归一化为 network', async () => {
    cloudMocks.list.mockRejectedValue(Object.assign(new Error('连不上服务器'), {
      code: 'NETWORK_ERROR',
    }));

    const outcome = await fetchAllCloudDocs();

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.kind).toBe('network');
    expect(outcome.message).toContain('连不上服务器');
  });
});
