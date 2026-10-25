/**
 * @description 云端文档树「分类 → 文件」分组：categoryId 挂载、名称唯一匹配、自定义分类聚合、未分类兜底、空分类隐藏。
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

    expect(names(tree)).toEqual(['后端', '前端']);
    expect(names(tree[0]!.children)).toEqual(['Java']);
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

    expect(names(tree)).toEqual(['后端']);
    expect(names(tree[0]!.children)).toEqual(['Rust']);
  });

  it('分类名在树里匹配不到时聚合到「自定义分类」，无分类归到「未分类」', () => {
    const tree = buildCloudDocTreeByCategory(
      [
        doc({ fileId: 1, path: 'tau/ws/x.md', category: '手写分类' }),
        doc({ fileId: 2, path: 'tau/ws/y.md', category: '手写分类' }),
        doc({ fileId: 3, path: 'tau/ws/z.md' }),
      ],
      CATEGORIES,
      LABELS,
    );

    expect(names(tree)).toEqual(['自定义分类', '未分类']);
    expect(names(tree[0]!.children)).toEqual(['手写分类']);
    expect(tree[0]!.children[0]!.children).toHaveLength(2);
    expect(tree[1]!.children.map((node) => node.name)).toEqual(['z.md']);
  });

  it('空分类不显示', () => {
    const tree = buildCloudDocTreeByCategory([doc({ categoryId: 1002, category: 'Java' })], CATEGORIES, LABELS);
    const flat = JSON.stringify(tree);
    expect(flat).not.toContain('空分类');
    expect(flat).not.toContain('前端');
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
