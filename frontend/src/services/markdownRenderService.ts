/**
 * Markdown 渲染服务（v0.4.0）
 *
 * 这个模块承载 marked / DOMPurify / mermaid 三个重依赖，只允许被动态 import：
 * - MarkdownPreview 组件挂载后才加载；
 * - 导出独立 HTML 时才加载。
 *
 * 这样入口 chunk 不再包含渲染库，首屏只承担编辑器与工作区逻辑。
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import { getHeadingSourceLines } from '@/services/markdownService';
import type { MarkdownMermaidTheme, MarkdownPreviewTheme } from '@/stores/settings';
import { normalizeHexColor } from '@/utils/themePackage';

let configuredMermaidTheme: string | null = null;

// DOMPurify deliberately excludes `file:` by default. Markdown previews use
// it for local-document links, while the remaining protocol/path branches
// retain DOMPurify's default URI policy.
const MARKDOWN_ALLOWED_URI_REGEXP = /^(?:(?:(?:f|ht)tps?|file|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

export interface MermaidThemeConfig {
  theme: 'base' | 'default' | 'dark' | 'forest' | 'neutral';
  themeVariables?: Record<string, string>;
}

type MermaidThemePreset = Exclude<MarkdownMermaidTheme, 'auto'>;
type MermaidBuiltinTheme = MermaidThemeConfig['theme'];

const baseDiagramVariables = {
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  lineColor: '#64748b',
  textColor: '#1e293b',
  edgeLabelBackground: '#ffffff',
  clusterBkg: '#f8fafc',
  clusterBorder: '#cbd5e1',
};

/**
 * 预览主题与 Mermaid 节点/连线配色的一一映射。
 *
 * 使用 Mermaid `base` 主题承接应用预览主题的完整色板，避免 Mermaid
 * 内置主题在背景、边框和文字对比度上的默认值覆盖 Markdown 预览视觉。
 */
export const MERMAID_PREVIEW_THEME_CONFIGS: Readonly<Record<MarkdownPreviewTheme, MermaidThemeConfig>> = {
  'docs-clean': {
    theme: 'base',
    themeVariables: {
      ...baseDiagramVariables,
      primaryColor: '#e8f1ff',
      primaryBorderColor: '#60a5fa',
      primaryTextColor: '#0f172a',
      secondaryColor: '#eef4ff',
      tertiaryColor: '#f8fafc',
      lineColor: '#64748b',
      edgeLabelBackground: '#ffffff',
      clusterBkg: '#f5f8fc',
      clusterBorder: '#bfdbfe',
    },
  },
  'paper-soft': {
    theme: 'base',
    themeVariables: {
      ...baseDiagramVariables,
      primaryColor: '#f8e6c9',
      primaryBorderColor: '#bf915b',
      primaryTextColor: '#342a21',
      secondaryColor: '#f5e4c2',
      tertiaryColor: '#fffaf2',
      lineColor: '#8a6b4b',
      textColor: '#4d4438',
      edgeLabelBackground: '#fffaf0',
      clusterBkg: '#f8efe1',
      clusterBorder: '#d6b789',
    },
  },
  'editorial-warm': {
    theme: 'base',
    themeVariables: {
      ...baseDiagramVariables,
      primaryColor: '#f9ddd4',
      primaryBorderColor: '#c26b4f',
      primaryTextColor: '#2c1814',
      secondaryColor: '#f6cfc3',
      tertiaryColor: '#fff7f3',
      lineColor: '#946052',
      textColor: '#45332d',
      edgeLabelBackground: '#fffaf6',
      clusterBkg: '#fff1eb',
      clusterBorder: '#ddb0a2',
    },
  },
  'graphite-night': {
    theme: 'base',
    themeVariables: {
      ...baseDiagramVariables,
      primaryColor: '#1e2a3a',
      primaryBorderColor: '#5eead4',
      primaryTextColor: '#f8fafc',
      secondaryColor: '#223044',
      tertiaryColor: '#111827',
      lineColor: '#94a3b8',
      textColor: '#d6dde8',
      edgeLabelBackground: '#13181f',
      clusterBkg: '#182231',
      clusterBorder: '#475569',
    },
  },
  'mint-grove': {
    theme: 'base',
    themeVariables: {
      ...baseDiagramVariables,
      primaryColor: '#dcefde',
      primaryBorderColor: '#4c9a69',
      primaryTextColor: '#193b2b',
      secondaryColor: '#e7f3e7',
      tertiaryColor: '#f8fcf6',
      lineColor: '#527660',
      textColor: '#30483a',
      edgeLabelBackground: '#f8fcf6',
      clusterBkg: '#edf6ed',
      clusterBorder: '#a5c9aa',
    },
  },
  'lavender-letter': {
    theme: 'base',
    themeVariables: {
      ...baseDiagramVariables,
      primaryColor: '#ebe4f7',
      primaryBorderColor: '#8a70b8',
      primaryTextColor: '#302544',
      secondaryColor: '#f0eafa',
      tertiaryColor: '#fbf9ff',
      lineColor: '#766b87',
      textColor: '#453d55',
      edgeLabelBackground: '#fbf9ff',
      clusterBkg: '#f3effa',
      clusterBorder: '#c7b9de',
    },
  },
  'deep-ocean': {
    theme: 'base',
    themeVariables: {
      ...baseDiagramVariables,
      primaryColor: '#1f5b77',
      primaryBorderColor: '#4bb8d8',
      primaryTextColor: '#f1f7fc',
      secondaryColor: '#18445f',
      tertiaryColor: '#10283c',
      lineColor: '#9bb1c4',
      textColor: '#dce8f3',
      edgeLabelBackground: '#0d1b2a',
      clusterBkg: '#122337',
      clusterBorder: '#467c98',
    },
  },
};

export const MERMAID_THEME_PRESETS: Readonly<Record<MermaidThemePreset, MermaidThemeConfig>> = {
  default: { theme: 'default' },
  dark: { theme: 'dark' },
  forest: { theme: 'forest' },
  neutral: { theme: 'neutral' },
  aurora: {
    theme: 'base',
    themeVariables: {
      ...baseDiagramVariables,
      primaryColor: '#d9f7f0',
      primaryBorderColor: '#0f9d8a',
      primaryTextColor: '#073b4c',
      secondaryColor: '#e5ecff',
      tertiaryColor: '#f9f7ff',
      lineColor: '#52738a',
      edgeLabelBackground: '#ffffff',
      clusterBkg: '#eefcf8',
      clusterBorder: '#8bd5c7',
    },
  },
  sunset: {
    theme: 'base',
    themeVariables: {
      ...baseDiagramVariables,
      primaryColor: '#ffe0c7',
      primaryBorderColor: '#e76f51',
      primaryTextColor: '#4a2118',
      secondaryColor: '#ffe9a8',
      tertiaryColor: '#fff8ef',
      lineColor: '#9a6650',
      edgeLabelBackground: '#fffaf3',
      clusterBkg: '#fff1e4',
      clusterBorder: '#efb38f',
    },
  },
  lavender: {
    theme: 'base',
    themeVariables: {
      ...baseDiagramVariables,
      primaryColor: '#eadcff',
      primaryBorderColor: '#8e6ac8',
      primaryTextColor: '#31204f',
      secondaryColor: '#f5edff',
      tertiaryColor: '#fcfaff',
      lineColor: '#76649b',
      edgeLabelBackground: '#ffffff',
      clusterBkg: '#f5efff',
      clusterBorder: '#c4afe7',
    },
  },
  mono: {
    theme: 'base',
    themeVariables: {
      ...baseDiagramVariables,
      primaryColor: '#e5e7eb',
      primaryBorderColor: '#6b7280',
      primaryTextColor: '#111827',
      secondaryColor: '#f3f4f6',
      tertiaryColor: '#ffffff',
      lineColor: '#6b7280',
      edgeLabelBackground: '#ffffff',
      clusterBkg: '#f9fafb',
      clusterBorder: '#d1d5db',
    },
  },
};

/**
 * Mermaid 支持的常见 fenced code language 标识。
 *
 * Markdown 编辑器通常把围栏信息直接编码为 `language-${info}` class，
 * 因此这里使用白名单而不是模糊匹配，避免把 `language-mermaid-js` 等普通
 * 代码块误交给 Mermaid。
 */
export const MERMAID_FENCE_LANGUAGES = new Set([
  'mermaid',
  'graph',
  'flowchart',
  'flowchart-v2',
  'flowchart-elk',
  'sequence',
  'sequenceDiagram',
  'class',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'state',
  'er',
  'erDiagram',
  'gantt',
  'pie',
  'journey',
  'gitGraph',
  'mindmap',
  'timeline',
  'quadrantChart',
  'xychart',
  'xychart-beta',
  'block-beta',
  'block',
  'sankey-beta',
  'sankey',
  'packet-beta',
  'packet',
  'kanban',
  'architecture-beta',
  'architecture',
  'requirementDiagram',
  'requirement',
  'C4Context',
  'c4',
  'zenuml',
  'radar',
  'radar-beta',
  'ishikawa',
  'treemap',
  'venn',
  'venn-beta',
]);

const MERMAID_FENCE_LANGUAGES_NORMALIZED = new Set(
  Array.from(MERMAID_FENCE_LANGUAGES, (language) => language.toLowerCase()),
);

const isMermaidCodeBlock = (code: Element): boolean => {
  for (const className of Array.from(code.classList)) {
    if (!className.startsWith('language-')) {
      continue;
    }

    const language = className.slice('language-'.length);
    if (MERMAID_FENCE_LANGUAGES_NORMALIZED.has(language.toLowerCase())) {
      return true;
    }
  }
  return false;
};

export function resolveMermaidTheme(
  theme: 'dark' | 'light',
  selectedTheme: MarkdownMermaidTheme,
): MermaidBuiltinTheme {
  if (selectedTheme === 'auto') {
    return theme === 'dark' ? 'dark' : 'default';
  }

  if (selectedTheme === 'default' || selectedTheme === 'dark' || selectedTheme === 'forest' || selectedTheme === 'neutral') {
    return selectedTheme;
  }

  return 'default';
}

/**
 * 解析最终 Mermaid 配置。`auto` 优先跟随 Markdown 预览主题；未提供预览主题
 * 时保留旧的 dark/light 兼容行为，避免独立导出或第三方调用发生视觉回退。
 */
export function resolveMermaidThemeConfig(
  theme: 'dark' | 'light',
  selectedTheme: MarkdownMermaidTheme,
  previewTheme?: MarkdownPreviewTheme,
): MermaidThemeConfig {
  if (selectedTheme === 'auto' && previewTheme) {
    return MERMAID_PREVIEW_THEME_CONFIGS[previewTheme];
  }

  if (selectedTheme === 'auto') {
    return { theme: resolveMermaidTheme(theme, selectedTheme) };
  }

  return MERMAID_THEME_PRESETS[selectedTheme];
}

function ensureMermaid(config: MermaidThemeConfig) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: config.theme,
    themeVariables: config.themeVariables,
  });
  configuredMermaidTheme = JSON.stringify(config);
}

export function applyMermaidNodeBackground(container: ParentNode, nodeBackgroundColor: string): void {
  const normalizedNodeColor = normalizeHexColor(nodeBackgroundColor);
  if (!normalizedNodeColor) return;

  container.querySelectorAll<SVGGraphicsElement>(
    'g.node > rect, g.node > polygon, g.node > circle, g.node > ellipse, g.node > path',
  ).forEach((shape) => {
    shape.style.setProperty('fill', normalizedNodeColor, 'important');
  });
}

export function restoreMermaidSourceBlocks(container: ParentNode): void {
  container.querySelectorAll<HTMLElement>('.markdown-mermaid-viewer').forEach((viewer) => {
    const sourceView = viewer.querySelector<HTMLPreElement>('.markdown-mermaid-source');
    if (!sourceView) return;

    const canvas = viewer.querySelector<HTMLElement>('.markdown-mermaid-canvas');
    if (canvas) {
      const measuredHeight = canvas.getBoundingClientRect().height;
      const inlineHeight = Number.parseFloat(canvas.style.height);
      const height = measuredHeight || inlineHeight;
      if (Number.isFinite(height) && height > 0) {
        sourceView.dataset.mermaidCanvasHeight = String(height);
      }
    }
    sourceView.hidden = false;
    sourceView.classList.remove('markdown-mermaid-source');
    sourceView.removeAttribute('data-mermaid-view');
    viewer.replaceWith(sourceView);
  });
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

const IMAGE_ATTRIBUTE_PATTERN = /\{\s*((?:width|height)\s*=\s*[^\s}]+)\s*((?:width|height)\s*=\s*[^\s}]+)?\s*\}$/i;

const sanitizeImageDimension = (value: string): string | null =>
  /^\d+(?:\.\d+)?(?:px|%|em|rem|vw|vh)?$/i.test(value) ? value : null;

const enhanceImageDimensions = (html: string): string => html.replace(
  /<img\b([^>]*?)>/gi,
  (full, attributes: string) => {
    const altMatch = attributes.match(/\salt="([^"]*)"/i);
    const alt = altMatch?.[1] ?? '';
    const marker = alt.match(IMAGE_ATTRIBUTE_PATTERN);
    if (!marker) return full;

    const dimensions = [marker[1], marker[2]].filter((part): part is string => Boolean(part)).map((part) => {
      const [key, value] = part.split('=').map((item) => item.trim());
      return [(key ?? '').toLowerCase(), value ?? ''] as const;
    });
    const width = sanitizeImageDimension(dimensions.find(([key]) => key === 'width')?.[1] ?? '');
    const height = sanitizeImageDimension(dimensions.find(([key]) => key === 'height')?.[1] ?? '');
    const cleanAlt = alt.replace(IMAGE_ATTRIBUTE_PATTERN, '').trim().replace(/"/g, '&quot;');
    let nextAttributes = altMatch ? attributes.replace(altMatch[0], ` alt="${cleanAlt}"`) : attributes;
    const styles = [width ? `width:${width}` : '', height ? `height:${height}` : ''].filter(Boolean);
    if (styles.length > 0) {
      nextAttributes += ` style="max-width:100%;${styles.join(';')};"`;
    }
    return `<img${nextAttributes}>`;
  },
);

export function renderMarkdown(raw: string): string {
  const headingSourceLines = getHeadingSourceLines(raw);
  let headingIndex = 0;
  const renderer = new marked.Renderer();
  const renderHeading = renderer.heading.bind(renderer);

  renderer.heading = ((...args: Parameters<typeof renderer.heading>) => {
    const sourceLine = headingSourceLines[headingIndex];
    headingIndex += 1;
    const rendered = renderHeading(...args);
    return sourceLine === undefined
      ? rendered
      : rendered.replace(/^<h([1-6])/, `<h$1 data-source-line="${sourceLine}"`);
  }) as typeof renderer.heading;

  const parsed = marked.parse(raw, { renderer }) as string;
  return enhanceImageDimensions(DOMPurify.sanitize(parsed, {
    ALLOWED_URI_REGEXP: MARKDOWN_ALLOWED_URI_REGEXP,
  }));
}

const escapeHtmlText = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function createStandaloneHtml(markdown: string, title: string): string {
  const safeTitle = escapeHtmlText(title || 'Tau Editor Export');
  const body = renderMarkdown(markdown);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>body{max-width:860px;margin:48px auto;padding:0 24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.7;color:#1f2937}pre{overflow:auto;padding:16px;background:#f3f4f6;border-radius:8px}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}img{max-width:100%;height:auto}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export async function renderMermaidDiagrams(
  container: HTMLElement,
  theme: 'dark' | 'light',
  selectedTheme: MarkdownMermaidTheme = 'auto',
  nodeBackgroundColor = '',
  previewTheme?: MarkdownPreviewTheme,
): Promise<void> {
  restoreMermaidSourceBlocks(container);
  const codeBlocks = Array.from(
    container.querySelectorAll('pre code'),
  ).filter(isMermaidCodeBlock);
  if (codeBlocks.length === 0) {
    return;
  }

  const mermaidConfig = resolveMermaidThemeConfig(theme, selectedTheme, previewTheme);
  if (configuredMermaidTheme !== JSON.stringify(mermaidConfig)) {
    ensureMermaid(mermaidConfig);
  }
  container.dataset.mermaidTheme = mermaidConfig.theme;

  for (const [i, block] of codeBlocks.entries()) {
    const source = block.textContent ?? '';
    const wrapper = block.closest('pre');
    if (!wrapper) continue;

    try {
      const id = `mermaid-${Date.now()}-${i}`;
      const rendered = await mermaid.render(id, source);
      const output = document.createElement('div');
      output.className = 'markdown-mermaid-viewer';

      const diagram = document.createElement('div');
      diagram.className = 'markdown-mermaid-canvas';
      diagram.dataset.mermaidView = 'diagram';
      diagram.style.width = '100%';
      const preservedHeight = Number.parseFloat(wrapper.dataset.mermaidCanvasHeight ?? '');
      if (Number.isFinite(preservedHeight) && preservedHeight > 0) {
        diagram.style.boxSizing = 'border-box';
        diagram.style.height = `${preservedHeight}px`;
        diagram.dataset.baseHeight = String(preservedHeight);
      }
      diagram.innerHTML = rendered.svg;
      applyMermaidNodeBackground(diagram, nodeBackgroundColor);

      const sourceView = document.createElement('pre');
      sourceView.className = 'markdown-mermaid-source';
      sourceView.dataset.mermaidView = 'code';
      sourceView.hidden = true;
      const sourceCode = document.createElement('code');
      sourceCode.className = 'language-mermaid';
      sourceCode.textContent = source;
      sourceView.appendChild(sourceCode);

      output.append(diagram, sourceView);
      wrapper.replaceWith(output);
    } catch (error: any) {
      const failure = document.createElement('div');
      failure.className = 'markdown-mermaid-error';
      failure.textContent = `Mermaid 渲染失败: ${error?.message ?? '未知错误'}`;
      wrapper.replaceWith(failure);
    }
  }
}
