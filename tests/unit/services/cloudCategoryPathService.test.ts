/**
 * @description 多级分类创建：逐级复用/新建、409 并发去重、超层级与空输入的可读错误。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28 01:05
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudCategoryNode } from '@/lib/tauri';

const mocks = vi.hoisted(() => ({
  fetchCategories: vi.fn(),
  createCategory: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return { ...actual, isTauriApp: () => true };
});

vi.mock('@/services/cloudCategoryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudCategoryService')>();
  return {
    ...actual,
    fetchManagedCategories: mocks.fetchCategories,
    createCategory: mocks.createCategory,
  };
});

import { ensureCategoryPath } from '@/services/cloudCategoryPathService';

const node = (
  id: string,
  name: string,
  parentId: string | null,
  children: CloudCategoryNode[] = [],
): CloudCategoryNode => ({ id, name, parentId, children });

const EMPTY: CloudCategoryNode[] = [];
const WITH_BACKEND: CloudCategoryNode[] = [node('1', '后端', null)];
const FULL: CloudCategoryNode[] = [
  node('1', '后端', null, [node('2', 'Java', '1', [node('3', 'Spring', '2')])]),
];

const okFetch = (tree: CloudCategoryNode[]) => ({ ok: true, data: tree });

describe('ensureCategoryPath', () => {
  beforeEach(() => {
    mocks.fetchCategories.mockResolvedValue(okFetch(EMPTY));
    mocks.createCategory.mockImplementation(async (name: string, parentId?: string | null) => ({
      ok: true,
      data: { id: `${name}-id`, name, parentId: parentId ?? null, children: [] },
    }));
  });
  afterEach(() => vi.clearAllMocks());

  it('全不存在时逐级创建，并把父 id 串起来', async () => {
    const outcome = await ensureCategoryPath({ path: '后端/Java/Spring' });

    expect(outcome.ok).toBe(true);
    expect(mocks.createCategory.mock.calls).toEqual([
      ['后端', null],
      ['Java', '后端-id'],
      ['Spring', 'Java-id'],
    ]);
    if (outcome.ok) {
      expect(outcome.data).toMatchObject({ id: 'Spring-id', name: 'Spring', created: ['后端', 'Java', 'Spring'], reused: false });
      expect(outcome.data.chain).toEqual(['后端-id', 'Java-id', 'Spring-id']);
    }
  });

  it('全部已存在时一次请求都不发', async () => {
    mocks.fetchCategories.mockResolvedValue(okFetch(FULL));

    const outcome = await ensureCategoryPath({ path: '后端/Java/Spring' });

    expect(mocks.createCategory).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data).toMatchObject({ id: '3', name: 'Spring', reused: true, created: [] });
      expect(outcome.data.chain).toEqual(['1', '2', '3']);
    }
  });

  it('部分已存在时从缺失层开始建', async () => {
    mocks.fetchCategories.mockResolvedValue(okFetch(WITH_BACKEND));

    const outcome = await ensureCategoryPath({ path: '后端/Java/Spring' });

    expect(mocks.createCategory.mock.calls).toEqual([
      ['Java', '1'],
      ['Spring', 'Java-id'],
    ]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.created).toEqual(['Java', 'Spring']);
      expect(outcome.data.chain).toEqual(['1', 'Java-id', 'Spring-id']);
    }
  });

  it('同名同级（大小写不同）复用，不重复创建', async () => {
    mocks.fetchCategories.mockResolvedValue(okFetch(FULL));

    const outcome = await ensureCategoryPath({ path: '后端/java' });

    expect(mocks.createCategory).not.toHaveBeenCalled();
    expect(outcome.ok && outcome.data.id).toBe('2');
  });

  it('并发 409：刷新树后按名称复用而不是报错', async () => {
    mocks.fetchCategories
      .mockResolvedValueOnce(okFetch(EMPTY))
      // 创建失败后重新拉树，此时同名分类已被别人建好
      .mockResolvedValueOnce(okFetch([node('8', '运维', null, [node('9', 'K8s', '8', [node('10', 'Ingress', '9')])])]));
    mocks.createCategory.mockResolvedValueOnce({
      ok: false,
      kind: 'conflict',
      message: '同级分类名称已存在',
    });

    const outcome = await ensureCategoryPath({ path: '运维/K8s/Ingress' });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.id).toBe('10');
      expect(outcome.data.reused).toBe(true);
    }
  });

  it('409 且刷新后仍找不到时透出原始冲突文案', async () => {
    mocks.fetchCategories.mockResolvedValue(okFetch(EMPTY));
    mocks.createCategory.mockResolvedValue({ ok: false, kind: 'conflict', message: '同级分类名称已存在' });

    const outcome = await ensureCategoryPath({ path: '运维/K8s' });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('conflict');
      expect(outcome.message).toContain('已存在');
    }
  });

  it('超过三级给出可读错误且不发创建请求', async () => {
    const outcome = await ensureCategoryPath({ path: 'A/B/C/D' });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain('最多 3 级');
      expect(outcome.message).toContain('4 级');
    }
    expect(mocks.createCategory).not.toHaveBeenCalled();
  });

  it('空输入给出可读错误', async () => {
    const outcome = await ensureCategoryPath({ path: '   ' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain('请输入分类名称');
    }
  });

  it('读取分类树失败时提示可重试', async () => {
    mocks.fetchCategories.mockResolvedValue({ ok: false, kind: 'network', message: '连不上' });

    const outcome = await ensureCategoryPath({ path: '后端/Java' });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain('读取分类树失败');
    }
  });
});
