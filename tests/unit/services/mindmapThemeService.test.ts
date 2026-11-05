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
  RAINBOW_BRANCH_PALETTE,
  isMindmapThemeId,
  isRainbowTheme,
  listMindmapThemes,
  mindmapThemeCanvasVariables,
  mindmapThemeCssVariables,
  rainbowBranchColor,
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
  it('保留原有主题顺序并新增十组主题', () => {
    expect(MINDMAP_THEME_IDS.slice(0, 5)).toEqual(['default', 'ocean', 'forest', 'sunset', 'rainbow']);
    expect(DEFAULT_MINDMAP_THEME_ID).toBe('default');
    expect(listMindmapThemes()).toHaveLength(15);
    expect(new Set(MINDMAP_THEME_IDS).size).toBe(15);
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

describe('mindmapThemeService 彩虹主题', () => {
  it('rainbow 主题启用按分支上色并携带 8 色分支调色板', () => {
    const rainbow = resolveMindmapTheme('rainbow');
    expect(rainbow.mode).toBe('rainbow');
    expect(isRainbowTheme(rainbow)).toBe(true);
    expect(rainbow.branchPalette).toEqual(RAINBOW_BRANCH_PALETTE);
    expect(RAINBOW_BRANCH_PALETTE).toHaveLength(8);
  });

  it('其余四套纯色主题不启用彩虹模式', () => {
    for (const id of ['default', 'ocean', 'forest', 'sunset']) {
      expect(isRainbowTheme(resolveMindmapTheme(id))).toBe(false);
      expect(rainbowBranchColor(resolveMindmapTheme(id), 0)).toBeNull();
    }
  });

  it('rainbowBranchColor 按序号取色并安全取模', () => {
    const rainbow = resolveMindmapTheme('rainbow');
    expect(rainbowBranchColor(rainbow, 0)).toBe('#FF6B6B');
    expect(rainbowBranchColor(rainbow, 7)).toBe('#FF7BC5');
    // 超过调色板长度：循环复用
    expect(rainbowBranchColor(rainbow, 8)).toBe('#FF6B6B');
    expect(rainbowBranchColor(rainbow, 9)).toBe('#FF9F43');
    // 负数序号也不越界
    expect(rainbowBranchColor(rainbow, -1)).toBe('#FF7BC5');
  });

  it('rainbowBranchColor 对空主题返回 null', () => {
    expect(rainbowBranchColor(null, 0)).toBeNull();
    expect(rainbowBranchColor(undefined, 0)).toBeNull();
  });

  it('画布变量：彩虹主题只注入强调/标记色，不写死节点填充与连线', () => {
    const variables = mindmapThemeCanvasVariables(resolveMindmapTheme('rainbow'));
    expect(variables['--mindmap-accent']).toBe('#7cc7ff');
    expect(variables['--mindmap-marker-bg']).toBeTruthy();
    // 关键：不注入 --mindmap-node-bg / --mindmap-edge，节点底色继续跟随 Tau 面板色
    expect(variables['--mindmap-node-bg']).toBeUndefined();
    expect(variables['--mindmap-edge']).toBeUndefined();
    expect(variables['--mindmap-node-border']).toBeUndefined();
  });

  it('画布变量：纯色主题仍输出完整变量集（旧行为不变）', () => {
    const variables = mindmapThemeCanvasVariables(resolveMindmapTheme('ocean'));
    expect(variables['--mindmap-node-bg']).toBe('#f4faff');
    expect(variables['--mindmap-edge']).toBe('#7fb3d5');
    expect(variables['--mindmap-accent']).toBe('#1f7ac0');
  });
});
