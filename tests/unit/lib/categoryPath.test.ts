/**
 * @description 分类路径纯函数：斜杠路径解析（空段/多余斜杠/超层级）、层级规划与已存在前缀解析。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-28 01:00
 */
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_MAX_DEPTH,
  isCategoryPath,
  parseCategoryPath,
  planCategoryPath,
  resolveCategoryPathIds,
} from '@/lib/categoryPath';
import type { CloudCategoryNode } from '@/lib/tauri';

const node = (
  id: string,
  name: string,
  parentId: string | null,
  children: CloudCategoryNode[] = [],
): CloudCategoryNode => ({ id, name, parentId, children });

const TREE: CloudCategoryNode[] = [
  node('1', '后端', null, [
    node('2', 'Java', '1', [node('3', 'Spring', '2')]),
  ]),
  node('9', '前端', null),
];

describe('parseCategoryPath', () => {
  it('A/B/C 解析成三级', () => {
    const result = parseCategoryPath('后端/Java/Spring');
    expect(result.ok).toBe(true);
    expect(result.segments).toEqual(['后端', 'Java', 'Spring']);
    expect(result.depth).toBe(3);
  });

  it('忽略多余斜杠与空段', () => {
    expect(parseCategoryPath('A//B/').segments).toEqual(['A', 'B']);
    expect(parseCategoryPath('/A/B//').segments).toEqual(['A', 'B']);
    expect(parseCategoryPath('  A / B  ').segments).toEqual(['A', 'B']);
    expect(parseCategoryPath('A／B').segments).toEqual(['A', 'B']);
  });

  it('空输入报 empty', () => {
    for (const input of ['', '   ', '/', '//']) {
      const result = parseCategoryPath(input);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('empty');
    }
  });

  it('超过三级显式报错而不是截断', () => {
    const result = parseCategoryPath('A/B/C/D');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('too-deep');
    expect(result.depth).toBe(4);
    // 片段仍完整返回，便于提示用户具体层级
    expect(result.segments).toHaveLength(4);
  });

  it('单段过长报错', () => {
    const result = parseCategoryPath('A'.repeat(65));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('segment-too-long');
  });

  it('常量与后端一致为 3 级', () => {
    expect(CATEGORY_MAX_DEPTH).toBe(3);
  });
});

describe('isCategoryPath', () => {
  it('只有包含斜杠才走多级创建', () => {
    expect(isCategoryPath('后端/Java')).toBe(true);
    expect(isCategoryPath('后端／Java')).toBe(true);
    expect(isCategoryPath('后端')).toBe(false);
    expect(isCategoryPath('')).toBe(false);
    expect(isCategoryPath(null)).toBe(false);
  });
});

describe('resolveCategoryPathIds', () => {
  it('返回已存在前缀的 id 链', () => {
    expect(resolveCategoryPathIds(TREE, ['后端', 'Java', 'Spring'])).toEqual(['1', '2', '3']);
    expect(resolveCategoryPathIds(TREE, ['后端', 'Java', 'Spring', 'Boot'])).toEqual(['1', '2', '3']);
  });

  it('首段不存在时返回空链', () => {
    expect(resolveCategoryPathIds(TREE, ['运维'])).toEqual([]);
  });

  it('名称比较忽略大小写与空白', () => {
    expect(resolveCategoryPathIds(TREE, [' 后端 ', 'java'])).toEqual(['1', '2']);
  });
});

describe('planCategoryPath', () => {
  it('全部已存在时 existingId 为末级、无待建步骤', () => {
    const plan = planCategoryPath(TREE, ['后端', 'Java']);
    expect(plan.existingId).toBe('2');
    expect(plan.steps).toEqual([]);
  });

  it('部分已存在时从缺失层级开始建，父节点为已存在末级', () => {
    const plan = planCategoryPath(TREE, ['后端', 'Java', 'Spring Boot']);
    expect(plan.existingId).toBeNull();
    expect(plan.parentId).toBe('2');
    // 第一步的父节点是已存在的末级（'2'），后续步骤的父节点要创建后才能知道
    expect(plan.steps).toEqual([{ name: 'Spring Boot', parentId: '2' }]);
  });

  it('全新路径时 parentId 为 null，按顺序回填', () => {
    const plan = planCategoryPath(TREE, ['运维', 'K8s', 'Ingress']);
    expect(plan.existingId).toBeNull();
    expect(plan.parentId).toBeNull();
    expect(plan.steps.map((step) => step.name)).toEqual(['运维', 'K8s', 'Ingress']);
  });

  it('同级同名（大小写不同）视为已存在，不重复建', () => {
    const plan = planCategoryPath(TREE, ['后端', 'JAVA']);
    expect(plan.existingId).toBe('2');
  });
});
