import { describe, expect, it } from 'vitest';
import { buildCompletionEntries } from '@/services/editorCompletionService';

describe('editorCompletionService', () => {
  it('应返回匹配当前前缀的文档词汇补全', () => {
    const entries = buildCompletionEntries({
      language: 'plaintext',
      currentWord: 'cust',
      content: 'customerName customerNote helper customerName',
    });

    expect(entries.map((entry) => entry.label)).toEqual(['customerName', 'customerNote']);
  });

  it('应为 TypeScript 提供常用代码片段补全', () => {
    const entries = buildCompletionEntries({
      language: 'typescript',
      currentWord: 'fun',
      content: '',
    });

    expect(entries.some((entry) => entry.label === 'function')).toBe(true);
  });

  it('应限制返回数量并忽略过短前缀的纯文档词汇提示', () => {
    const entries = buildCompletionEntries({
      language: 'plaintext',
      currentWord: 'a',
      content: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu',
      maxItems: 5,
    });

    expect(entries).toEqual([]);
  });
});
