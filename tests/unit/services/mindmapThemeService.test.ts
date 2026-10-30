/**
 * 阶段 4C：思维导图主题模板服务单测
 *
 * 覆盖：内置主题清单、字段完整性、未知回退、只读拷贝、CSS 变量换算、
 * 默认主题与画布既有关联变量的一致性。
 *
 * @author Albert_Luo
 * @date 2026-10-30
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARKER_BADGE_FILL,
  DEFAULT_MARKER_BADGE_TEXT,
  DEFAULT_MINDMAP_THEME_ID,
  MINDMAP_THEME_IDS,
  MINDMAP_THEMES,
  isMindmapThemeId,
  listMindmapThemes,
  mindmapThemeCssVariables,
  resolveMindmapTheme,
} from '@/services/mindmapThemeService';

const REQUIRED_COLOR_KEYS = [
  'nodeFill',
  'nodeStroke',
  'rootFill',
  'rootStroke',
  'edge',
  'text',
  'accent',
] as const;

describe('mindmapThemeService', () => {
  it('内置主题为 default / ocean / forest / sunset，顺序稳定', () => {
    expect(MINDMAP_THEME_IDS).toEqual(['default', 'ocean', 'forest', 'sunset']);
    expect(DEFAULT_MINDMAP_THEME_ID).toBe('default');
    expect(listMindmapThemes().map((theme) => theme.id)).toEqual([
      'default',
      'ocean',
      'forest',
      'sunset',
    ]);
  });

  it('每个主题都提供完整配色与展示名', () => {
    for (const theme of listMindmapThemes()) {
      expect(theme.name.length).toBeGreaterThan(0);
      for (const key of REQUIRED_COLOR_KEYS) {
        expect(typeof theme[key]).toBe('string');
        expect(theme[key].length).toBeGreaterThan(0);
      }
      // 标记徽章配色可缺省，但内置主题都应显式给出
      expect(theme.markerBadgeFill).toBeTruthy();
      expect(theme.markerBadgeText).toBeTruthy();
    }
  });

  it('listMindmapThemes 返回拷贝，改动不影响内置常量', () => {
    const themes = listMindmapThemes();
    (themes[0] as { nodeFill: string }).nodeFill = '#000000';
    expect(MINDMAP_THEMES[0]?.nodeFill).toBe('#ffffff');
    expect(listMindmapThemes()[0]?.nodeFill).toBe('#ffffff');
  });

  it('resolveMindmapTheme 解析已知主题并回退 default', () => {
    expect(resolveMindmapTheme('ocean').id).toBe('ocean');
    expect(resolveMindmapTheme('forest').id).toBe('forest');
    expect(resolveMindmapTheme('sunset').id).toBe('sunset');
    // 未知 / 缺失 / null 一律回退 default，保证脏数据不白屏
    expect(resolveMindmapTheme('nebula').id).toBe('default');
    expect(resolveMindmapTheme(undefined).id).toBe('default');
    expect(resolveMindmapTheme(null).id).toBe('default');
  });

  it('resolveMindmapTheme 返回拷贝，改动不污染内置常量', () => {
    const ocean = resolveMindmapTheme('ocean');
    ocean.edge = '#000000';
    expect(resolveMindmapTheme('ocean').edge).not.toBe('#000000');
  });

  it('isMindmapThemeId 只接受内置 id', () => {
    for (const id of MINDMAP_THEME_IDS) expect(isMindmapThemeId(id)).toBe(true);
    expect(isMindmapThemeId('nebula')).toBe(false);
    expect(isMindmapThemeId('')).toBe(false);
    expect(isMindmapThemeId(undefined)).toBe(false);
    expect(isMindmapThemeId(42)).toBe(false);
  });

  it('default 主题取色与画布既有 CSS 回退值一致（未选主题不可改变观感）', () => {
    const theme = resolveMindmapTheme('default');
    expect(theme.nodeFill).toBe('#ffffff');
    expect(theme.nodeStroke).toBe('#c7d2e2');
    expect(theme.rootFill).toBe('#eaf2ff');
    expect(theme.rootStroke).toBe('#7aa7e8');
    expect(theme.edge).toBe('#b7c4d8');
    expect(theme.text).toBe('#1f2329');
    expect(theme.accent).toBe('#4a90e2');
  });

  it('mindmapThemeCssVariables 输出画布既有变量名', () => {
    const variables = mindmapThemeCssVariables(resolveMindmapTheme('ocean'));
    expect(Object.keys(variables).sort()).toEqual([
      '--mindmap-accent',
      '--mindmap-edge',
      '--mindmap-marker-bg',
      '--mindmap-marker-text',
      '--mindmap-node-bg',
      '--mindmap-node-border',
      '--mindmap-node-text',
      '--mindmap-root-bg',
      '--mindmap-root-border',
    ].sort());
    const theme = resolveMindmapTheme('ocean');
    expect(variables['--mindmap-node-bg']).toBe(theme.nodeFill);
    expect(variables['--mindmap-node-border']).toBe(theme.nodeStroke);
    expect(variables['--mindmap-root-bg']).toBe(theme.rootFill);
    expect(variables['--mindmap-root-border']).toBe(theme.rootStroke);
    expect(variables['--mindmap-edge']).toBe(theme.edge);
    expect(variables['--mindmap-node-text']).toBe(theme.text);
    expect(variables['--mindmap-accent']).toBe(theme.accent);
  });

  it('主题缺少标记配色时回退到内置兜底色', () => {
    const bare = {
      id: 'bare',
      name: '裸主题',
      nodeFill: '#fff',
      nodeStroke: '#ccc',
      rootFill: '#fff',
      rootStroke: '#ccc',
      edge: '#999',
      text: '#000',
      accent: '#123456',
    };
    const variables = mindmapThemeCssVariables(bare);
    expect(variables['--mindmap-marker-bg']).toBe(DEFAULT_MARKER_BADGE_FILL);
    expect(variables['--mindmap-marker-text']).toBe(DEFAULT_MARKER_BADGE_TEXT);
  });
});
