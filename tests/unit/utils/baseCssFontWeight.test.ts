/**
 * 全局基础样式回归：不得重置 font-weight。
 *
 * 历史 bug：base.css 的 `*, *::before, *::after { font-weight: normal }`
 * 会以作者样式覆盖浏览器默认的 <strong>/<b> 加粗，导致 Markdown 预览里的
 * `**加粗**` 与普通文字完全没区别。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BASE_CSS_PATH = resolve(process.cwd(), 'frontend/src/assets/base.css');

describe('base.css 不得重置加粗', () => {
  it('通用选择器规则块不包含 font-weight: normal', () => {
    const css = readFileSync(BASE_CSS_PATH, 'utf-8');
    const universalBlock = css.match(/\*,\s*\*::before,\s*\*::after\s*\{[^}]*\}/);
    expect(universalBlock).toBeTruthy();
    expect(universalBlock![0]).not.toMatch(/font-weight\s*:\s*normal/);
  });

  it('没有针对 strong/b 的全局 normal 覆盖', () => {
    const css = readFileSync(BASE_CSS_PATH, 'utf-8');
    expect(css).not.toMatch(/(^|\})\s*(strong|b)\s*\{[^}]*font-weight\s*:\s*normal/);
  });
});
