/**
 * @description 分类管理服务：新建走 POST、重命名走 PUT、删除走 DELETE；409/403/404 原样透出。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 20:20
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudCategoryNode } from '@/lib/tauri';

const mocks = vi.hoisted(() => ({
  isTauri: { value: true },
  categoryCreate: vi.fn(),
  categoryUpdate: vi.fn(),
  categoryDelete: vi.fn(),
}));

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauriApp: () => mocks.isTauri.value,
    cloudCommands: {
      ...actual.cloudCommands,
      categoryCreate: mocks.categoryCreate,
      categoryUpdate: mocks.categoryUpdate,
      categoryDelete: mocks.categoryDelete,
    },
  };
});

import {
  CLOUD_CATEGORY_MAX_DEPTH,
  canAddChildCategory,
  createCategory,
  deleteCategory,
  flattenCategoryTree,
  renameCategory,
} from '@/services/cloudCategoryService';

const TREE: CloudCategoryNode[] = [
  {
    id: '1',
    name: '一级',
    parentId: null,
    children: [
      { id: '2', name: '二级', parentId: '1', children: [{ id: '3', name: '三级', parentId: '2', children: [] }] },
    ],
  },
];

describe('分类树工具', () => {
  it('拍平保留层级', () => {
    const rows = flattenCategoryTree(TREE);
    expect(rows.map((row) => `${row.depth}:${row.name}`)).toEqual(['1:一级', '2:二级', '3:三级']);
  });

  it('最多三级：三级下不能再建子分类', () => {
    expect(canAddChildCategory(TREE, '1')).toBe(true);
    expect(canAddChildCategory(TREE, '2')).toBe(true);
    expect(canAddChildCategory(TREE, '3')).toBe(false);
    expect(CLOUD_CATEGORY_MAX_DEPTH).toBe(3);
  });
});

describe('分类写操作', () => {
  beforeEach(() => {
    mocks.isTauri.value = true;
    mocks.categoryCreate.mockResolvedValue({ id: '9', name: '新分类', parentId: '1', children: [] });
    mocks.categoryUpdate.mockResolvedValue({ id: '1', name: '改名', parentId: null, children: [] });
    mocks.categoryDelete.mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it('新建走 POST（categoryCreate）', async () => {
    const outcome = await createCategory('  新分类 ', '1');
    expect(outcome.ok).toBe(true);
    expect(mocks.categoryCreate).toHaveBeenCalledWith('新分类', '1');
  });

  it('重命名走 PUT（categoryUpdate，不是新建）', async () => {
    const outcome = await renameCategory('1', ' 改名 ');
    expect(outcome.ok).toBe(true);
    expect(mocks.categoryUpdate).toHaveBeenCalledWith('1', '改名');
    expect(mocks.categoryCreate).not.toHaveBeenCalled();
  });

  it('删除走 DELETE（categoryDelete）', async () => {
    const outcome = await deleteCategory('1');
    expect(outcome.ok).toBe(true);
    expect(mocks.categoryDelete).toHaveBeenCalledWith('1');
  });

  it('同级重名 409 原样透出原因', async () => {
    mocks.categoryUpdate.mockRejectedValue(
      Object.assign(new Error('同级下已存在同名分类'), { code: 'CONFLICT' }),
    );
    const outcome = await renameCategory('1', '重名');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('conflict');
      expect(outcome.message).toContain('同名分类');
    }
  });

  it('删除被拒（有子分类/有文档引用）保留服务端文案', async () => {
    mocks.categoryDelete.mockRejectedValue(
      Object.assign(new Error('该分类下还有 2 篇文档'), { code: 'CONFLICT' }),
    );
    const outcome = await deleteCategory('2');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain('还有 2 篇文档');
    }
  });

  it('无权限 403 归类为 unauthorized', async () => {
    mocks.categoryDelete.mockRejectedValue(
      Object.assign(new Error('没有权限'), { code: 'FORBIDDEN' }),
    );
    const outcome = await deleteCategory('3');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('unauthorized');
    }
  });

  it('空名称/空 id 不发请求', async () => {
    expect((await createCategory('   ')).ok).toBe(false);
    expect((await renameCategory('', 'x')).ok).toBe(false);
    expect((await deleteCategory(' ')).ok).toBe(false);
    expect(mocks.categoryCreate).not.toHaveBeenCalled();
    expect(mocks.categoryUpdate).not.toHaveBeenCalled();
    expect(mocks.categoryDelete).not.toHaveBeenCalled();
  });
});
