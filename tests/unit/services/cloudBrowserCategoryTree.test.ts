/**
 * @description 云端文档树「分类 → 文件」分组：categoryId 挂载、名称唯一匹配、自定义分类聚合、未分类兜底、空分类保留（新建分类可见）。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 17:35
 */
import { describe, expect, it } from 'vitest';
import type { CloudCategoryNode, CloudDocItem } from '@/lib/tauri';
import {
  buildCloudDocTreeByCategory,
  countCloudDocFiles,
  filterCloudDocTree,
} from '@/services/cloudBrowserService';
import { hasRelativeMarkdownImages } from '@/services/cloudShareService';

const LABELS = { uncategorized: '未分类', customGroup: '自定义分类' };

const CATEGORIES: CloudCategoryNode[] = [
  {
    id: '1001',
    name: '后端',
    parentId: null,
    children: [
      { id: '1002', name: 'Java', parentId: '1001', children: [] },
      { id: '1003', name: 'Rust', parentId: '1001', children: [] },
    ],
  },
  {
    id: '2001',
    name: '前端',
    parentId: null,
    children: [{ id: '2002', name: 'Vue', parentId: '2001', children: [] }],
  },
  { id: '3001', name: '空分类', parentId: null, children: [] },
];

function doc(overrides: Partial<CloudDocItem> = {}): CloudDocItem {
  return {
    fileId: 1,
    path: 'tau/ws/a.md',
    title: 'a.md',
    contentHash: 'sha256:a',
    size: 10,
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

const names = (nodes: ReturnType<typeof buildCloudDocTreeByCategory>) => nodes.map((node) => node.name);

describe('buildCloudDocTreeByCategory 分类分组', () => {
  it('优先按 categoryId 挂到对应分类（含多级）', () => {
    const tree = buildCloudDocTreeByCategory(
      [
        doc({ fileId: 1, path: 'tau/ws/java.md', categoryId: 1002, category: 'Java' }),
        doc({ fileId: 2, path: 'tau/ws/vue.md', categoryId: 2002, category: 'Vue' }),
      ],
      CATEGORIES,
      LABELS,
    );

    // 受管分类即使为空也保留：空分类 / Rust 子分类都会出现在树里
    expect(names(tree)).toEqual(['后端', '空分类', '前端']);
    expect(names(tree[0]!.children)).toEqual(['Java', 'Rust']);
    expect(tree[0]!.children[0]!.children[0]!.name).toBe('java.md');
    // 节点 path 仍是完整云端路径（打开/同步依赖它）
    expect(tree[0]!.children[0]!.children[0]!.path).toBe('tau/ws/java.md');
    expect(countCloudDocFiles(tree)).toBe(2);
  });

  it('categoryId 缺失时按分类名唯一匹配', () => {
    const tree = buildCloudDocTreeByCategory(
      [doc({ path: 'tau/ws/rust.md', category: 'Rust' })],
      CATEGORIES,
      LABELS,
    );

    expect(names(tree)).toEqual(['后端', '空分类', '前端']);
    expect(names(tree[0]!.children)).toEqual(['Java', 'Rust']);
  });

  it('分类名匹配不到时直接作为顶层目录（不再包「自定义分类」父节点）', () => {
    const tree = buildCloudDocTreeByCategory(
      [
        doc({ fileId: 1, path: 'tau/ws/x.md', category: '手写分类' }),
        doc({ fileId: 2, path: 'tau/ws/y.md', category: '手写分类' }),
        doc({ fileId: 3, path: 'tau/ws/z.md' }),
      ],
      CATEGORIES,
      LABELS,
    );

    // 需求（0.6.26）：游离分组直接是顶层目录，没有任何包裹层
    expect(names(tree)).toEqual(['后端', '空分类', '前端', '手写分类', '未分类']);
    expect(tree.some((node) => node.key === 'group:custom')).toBe(false);
    const custom = tree.find((node) => node.name === '手写分类');
    expect(names(custom!.children)).toEqual(['x.md', 'y.md']);
    const uncategorized = tree.find((node) => node.name === '未分类');
    expect(names(uncategorized!.children)).toEqual(['z.md']);
  });

  it('空分类保留显示（新建分类必须立即可见）', () => {
    const tree = buildCloudDocTreeByCategory([doc({ categoryId: 1002, category: 'Java' })], CATEGORIES, LABELS);
    expect(names(tree)).toEqual(['后端', '空分类', '前端']);
    // 空分类节点仍可被展开（children 为空数组而非缺失）
    const empty = tree.find((node) => node.name === '空分类');
    expect(empty?.kind).toBe('dir');
    expect(empty?.children).toEqual([]);
    expect(countCloudDocFiles(tree)).toBe(1);
  });

  it('新建的空子分类也会显示（含父分类）', () => {
    const categories: CloudCategoryNode[] = [
      {
        id: '9001',
        name: '面试题笔记',
        parentId: null,
        children: [{ id: '9002', name: '新建子分类', parentId: '9001', children: [] }],
      },
    ];
    const tree = buildCloudDocTreeByCategory([], categories, LABELS);
    expect(names(tree)).toEqual(['面试题笔记']);
    expect(names(tree[0]!.children)).toEqual(['新建子分类']);
    expect(countCloudDocFiles(tree)).toBe(0);
  });

  it('分类树加载失败（空分类树）时全部落到未分类', () => {
    const tree = buildCloudDocTreeByCategory([doc({ path: 'tau/ws/a.md' })], [], LABELS);
    expect(names(tree)).toEqual(['未分类']);
    expect(countCloudDocFiles(tree)).toBe(1);
  });

  it('搜索过滤保留匹配文件的祖先分类', () => {
    const tree = buildCloudDocTreeByCategory(
      [
        doc({ fileId: 1, path: 'tau/ws/java.md', categoryId: 1002, category: 'Java' }),
        doc({ fileId: 2, path: 'tau/ws/vue.md', categoryId: 2002, category: 'Vue' }),
      ],
      CATEGORIES,
      LABELS,
    );

    const filtered = filterCloudDocTree(tree, 'java');
    expect(names(filtered)).toEqual(['后端']);
    expect(names(filtered[0]!.children)).toEqual(['Java']);
    expect(countCloudDocFiles(filtered)).toBe(1);
  });
});

describe('hasRelativeMarkdownImages 相对图片检测', () => {
  it('识别相对路径图片', () => {
    expect(hasRelativeMarkdownImages('![x](./img/a.png)')).toBe(true);
    expect(hasRelativeMarkdownImages('![x](img/a.png "标题")')).toBe(true);
    expect(hasRelativeMarkdownImages('<img src="assets/a.webp" />')).toBe(true);
  });

  it('忽略绝对/协议/锚点/data 图片', () => {
    expect(hasRelativeMarkdownImages('![x](https://a.com/x.png)')).toBe(false);
    expect(hasRelativeMarkdownImages('![x](/assets/x.png)')).toBe(false);
    expect(hasRelativeMarkdownImages('![x](data:image/png;base64,AAAA)')).toBe(false);
    expect(hasRelativeMarkdownImages('<!-- ![x](./a.png) -->')).toBe(false);
    expect(hasRelativeMarkdownImages('纯文本没有图片')).toBe(false);
    expect(hasRelativeMarkdownImages('')).toBe(false);
  });
});
