<template>
  <div
    ref="previewScrollRef"
    class="markdown-preview"
    :class="`markdown-preview--${settingsStore.markdownPreviewTheme}`"
    data-testid="markdown-preview"
    @contextmenu.prevent="handleContextMenu"
    @click="handlePreviewClick"
    @dblclick="handlePreviewDoubleClick"
    @mouseup="updateSelectionToolbar"
    @keyup="updateSelectionToolbar"
  >
    <div ref="previewRef" class="markdown-preview-content" v-html="html"></div>
    <div
      v-if="selectionToolbar.visible"
      class="markdown-selection-toolbar"
      role="toolbar"
      aria-label="Markdown 格式工具栏"
      data-testid="markdown-selection-toolbar"
      :style="{ top: selectionToolbar.y + 'px', left: selectionToolbar.x + 'px' }"
      @pointerdown.stop.prevent="setSelectionToolbarPointerDown(true)"
      @pointerup.stop="setSelectionToolbarPointerDown(false)"
      @mousedown.stop.prevent
    >
      <button v-for="action in selectionActions" :key="action.id" type="button"
        :title="action.label" :aria-label="action.label" :data-testid="'selection-' + action.id"
        @click="applySelectionAction(action.id)">{{ action.label }}</button>
    </div>
  </div>
  <teleport to="body">
    <div
      v-if="tableDeleteConfirmation.visible"
      class="markdown-table-delete-confirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="markdown-table-delete-confirm-title"
      data-testid="markdown-table-delete-confirm"
      @click.self="cancelTableDelete"
    >
      <div class="markdown-table-delete-confirm__panel">
        <h2 id="markdown-table-delete-confirm-title">删除整张表格？</h2>
        <p>删除后可使用 Ctrl/Cmd + Z 撤销。</p>
        <div class="markdown-table-delete-confirm__actions">
          <button type="button" data-testid="markdown-table-delete-cancel" @click="cancelTableDelete">取消</button>
          <button type="button" class="markdown-table-delete-confirm__danger" data-testid="markdown-table-delete-confirm-button" @click="confirmTableDelete">删除</button>
        </div>
      </div>
    </div>
    <div
      v-if="contextMenu.visible"
      ref="menuRef"
      class="preview-context-menu"
      :class="`markdown-preview--${settingsStore.markdownPreviewTheme}`"
      data-testid="markdown-preview-context-menu"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      @click.stop
      @contextmenu.prevent.stop
    >
      <template v-for="item in contextMenu.items" :key="item.id">
        <div v-if="item.dividerBefore" class="preview-context-menu-divider"></div>
        <button
          type="button"
          class="preview-context-menu-item"
          :class="{ disabled: item.disabled }"
          :disabled="item.disabled"
          :data-testid="`preview-menu-${item.id}`"
          @click="runMenuItem(item)"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
/**
 * 渲染重依赖（marked / DOMPurify / mermaid）按需加载：
 * 只有真正打开 Markdown 预览时才会拉取这个 chunk。
 */
let markdownRenderModule: typeof import('@/services/markdownRenderService') | null = null;
const loadMarkdownRenderer = async () => {
  if (!markdownRenderModule) {
    markdownRenderModule = await import('@/services/markdownRenderService');
  }
  return markdownRenderModule;
};
import { useSettingsStore } from '@/stores/settings';
import { getMarkdownPreviewI18n } from '@/i18n/ui';
import { appCommands, isTauriApp } from '@/lib/tauri';
import { useNotificationStore } from '@/stores/notification';
import { getMarkdownCodeFences } from '@/services/markdownService';
import { findMarkdownTableBlocks, updateMarkdownTableAtIndex, updateMarkdownTableCellAtIndex } from '@/utils/markdownTable';

interface MarkdownPreviewProps {
  content: string;
  theme: 'dark' | 'light';
  sourceFilePath?: string | null;
  editorScrollState?: { top: number; height: number; scrollHeight: number } | null;
  previewMode?: 'edit' | 'split' | 'preview';
  previewFontSize?: number;
}

type MarkdownPreviewContextTarget =
  | { kind: 'blank'; sourceFilePath?: string | null }
  | { kind: 'selection'; text: string; sourceFilePath?: string | null }
  | { kind: 'link'; href: string; resolvedHref: string | null; text?: string; sourceFilePath?: string | null }
  | { kind: 'image'; src: string; resolvedSrc: string | null; alt?: string; sourceFilePath?: string | null }
  | { kind: 'code-block'; language?: string; code?: string; sourceFilePath?: string | null };

interface PreviewMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  dividerBefore?: boolean;
  visible?: boolean;
  run: () => void | Promise<void>;
}

type PreviewThemeOption = {
  value: 'docs-clean' | 'paper-soft' | 'editorial-warm' | 'graphite-night' | 'mint-grove' | 'lavender-letter' | 'deep-ocean';
  label: string;
};

const MENU_MARGIN = 8;
const MENU_ESTIMATED_WIDTH = 220;
const MENU_ITEM_HEIGHT = 36;
const CODE_LANGUAGE_OPTIONS = [
  { value: 'plaintext', label: 'Plain Text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'toml', label: 'TOML' },
  { value: 'sql', label: 'SQL' },
  { value: 'shell', label: 'Shell' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'xml', label: 'XML' },
  { value: 'powershell', label: 'PowerShell' },
];
const CODE_LANGUAGE_ALIASES: Record<string, string> = {
  csharp: 'csharp',
  'c#': 'csharp',
  cs: 'csharp',
  cpp: 'cpp',
  'c++': 'cpp',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  md: 'markdown',
  text: 'plaintext',
  txt: 'plaintext',
};

const props = withDefaults(defineProps<MarkdownPreviewProps>(), {
  sourceFilePath: null,
  editorScrollState: null,
  previewMode: 'split',
  previewFontSize: 16,
});
const emit = defineEmits<{
  'request-preview-mode-change': [mode: 'edit' | 'split' | 'preview'];
  'preview-font-size-change': [fontSize: number];
  'open-image': [payload: { src: string; alt?: string; resolvedSrc: string }];
  'open-file': [payload: { path: string; href: string }];
  'code-language-change': [payload: {
    fenceIndex: number;
    originalLanguage: string;
    code: string;
    language: string;
  }];
  'markdown-change': [content: string];
  'request-undo': [];
  'request-redo': [];
}>();

const previewRef = ref<HTMLElement | null>(null);
const previewScrollRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
let codeLanguageMenuSequence = 0;
const settingsStore = useSettingsStore();
const notificationStore = useNotificationStore();
const copy = computed(() => getMarkdownPreviewI18n(settingsStore.uiLanguage));
const html = ref('');
let renderTimer: ReturnType<typeof setTimeout> | null = null;
let pendingLocalTableEdit: {
  content: string;
  tableIndex: number;
  previewScrollTop: number;
  tableScrollLeft: number;
  remove?: boolean;
} | null = null;
const pendingTableRestoreFrames = new Set<number>();
let localTableScrollLock: { top: number; editorTop: number | null; until: number } | null = null;
let isPreviewReady = false;
let isRenderingMermaid = false;
let renderVersion = 0;
let activeRenderTasks = 0;
let completedRenderVersion: number | null = null;
const latestEditorScrollState = ref<{ top: number; height: number; scrollHeight: number } | null>(null);
const pendingPreviewScrollTop = ref(0);
const selectionToolbar = ref({ visible: false, x: 0, y: 0 });
type PreviewSelection = {
  selection: Selection | null;
  text: string;
  start: number;
  end: number;
};
// 浏览器点击浮动工具栏时可能先清空原生选区；保留最近一次选区，确保点击按钮仍能完成编辑。
const selectionSnapshot = ref<PreviewSelection | null>(null);
let selectionToolbarPointerDown: boolean = false;
const setSelectionToolbarPointerDown = (value: boolean) => {
  selectionToolbarPointerDown = value;
};
const selectionActions = [
  { id: 'bold', label: 'B' }, { id: 'italic', label: 'I' }, { id: 'strike', label: 'S' },
  { id: 'heading-1', label: 'H1' }, { id: 'heading-2', label: 'H2' }, { id: 'heading-3', label: 'H3' },
  { id: 'quote', label: '❞' }, { id: 'ordered-list', label: '1.' }, { id: 'bullet-list', label: '•' },
  { id: 'link', label: '↗' }, { id: 'delete', label: '⌫' },
] as const;
const PREVIEW_FONT_SIZE_DEFAULT = 16;
const PREVIEW_FONT_SIZE_MIN = 10;
const PREVIEW_FONT_SIZE_MAX = 32;
const PREVIEW_FONT_SIZE_STEP = 1;
const normalizePreviewFontSize = (value: number) => {
  if (!Number.isFinite(value)) {
    return PREVIEW_FONT_SIZE_DEFAULT;
  }
  return Math.min(PREVIEW_FONT_SIZE_MAX, Math.max(PREVIEW_FONT_SIZE_MIN, Math.round(value)));
};
const previewFontSize = ref(normalizePreviewFontSize(props.previewFontSize));
watch(() => props.previewFontSize, (value) => {
  previewFontSize.value = normalizePreviewFontSize(value);
});

const emitMarkdownChange = (content: string, tableIndex?: number, tableWrapper?: HTMLElement, removeTable = false) => {
  if (content === props.content) return;
  if (tableIndex !== undefined) {
    // 先于父组件同步 Monaco 内容建立滚动锁，避免编辑器滚动事件抢先把预览映射回顶部。
    localTableScrollLock = {
      top: previewScrollRef.value?.scrollTop ?? 0,
      editorTop: latestEditorScrollState.value?.top ?? null,
      until: Date.now() + 1000,
    };
    pendingLocalTableEdit = {
      content,
      tableIndex,
      previewScrollTop: previewScrollRef.value?.scrollTop ?? 0,
      tableScrollLeft: tableWrapper?.scrollLeft ?? 0,
      remove: removeTable,
    };
  }
  emit('markdown-change', content);
};

const insertMarkdownBlock = (kind: 'heading' | 'paragraph' | 'table') => {
  const block = kind === 'heading'
    ? '## 标题'
    : kind === 'paragraph'
      ? '正文内容'
      : '| 标题 1 | 标题 2 |\n| --- | --- |\n| 内容 | 内容 |';
  const base = props.content.trimEnd();
  emitMarkdownChange(base + (base ? '\n\n' : '') + block + '\n');
};

const serializeEditableInlineContent = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof HTMLElement)) return '';
  const content = Array.from(node.childNodes).map(serializeEditableInlineContent).join('');
  switch (node.tagName.toLowerCase()) {
    case 'strong':
    case 'b':
      return '**' + content + '**';
    case 'em':
    case 'i':
      return '*' + content + '*';
    case 'del':
    case 's':
      return '~~' + content + '~~';
    case 'code':
      return String.fromCharCode(96) + content + String.fromCharCode(96);
    case 'a':
      return '[' + content + '](' + (node.getAttribute('href') ?? '') + ')';
    case 'br':
      return '\n';
    default:
      return content;
  }
};

const normalizeMarkdownInlineText = (value: string) => value
  .replace(/^\s{0,3}#{1,6}\s+/, '')
  .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, '')
  .replace(/^\s*>\s?/, '')
  .replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/(\`+|\*\*|__|\*|_|~~)(.*?)\1/g, '$2')
  .replace(/<[^>]+>/g, '')
  .trim();

const updateEditableBlock = (element: HTMLElement) => {
  const nextText = element.dataset.editKind === 'code'
    ? (element.textContent ?? '').trim()
    : ['link', 'summary'].includes(element.dataset.editKind ?? '')
      ? (element.textContent ?? '').trim()
    : serializeEditableInlineContent(element).trim();
  const lines = props.content.split('\n');
  const originalText = (element.dataset.originalText ?? '').trim();
  if (element.dataset.editKind === 'code') {
    const fenceIndex = Number(element.dataset.fenceIndex);
    const fences = getMarkdownCodeFences(props.content);
    const fence = Number.isInteger(fenceIndex) ? fences[fenceIndex] : null;
    if (fence && nextText) {
      const currentCode = fence.code;
      const codeOffset = props.content.indexOf(currentCode, fence.languageEnd);
      if (codeOffset >= 0) {
        const nextContent = `${props.content.slice(0, codeOffset)}${nextText}${props.content.slice(codeOffset + currentCode.length)}`;
        element.removeAttribute('contenteditable');
        element.removeAttribute('data-original-text');
        element.removeAttribute('data-edit-kind');
        element.removeAttribute('data-fence-index');
        emitMarkdownChange(nextContent);
      }
    } else if (nextText) {
      const codeLine = lines.findIndex((line) => line.trim() === originalText);
      if (codeLine >= 0) lines[codeLine] = nextText;
    }
    if (fence || nextText) {
      element.removeAttribute('contenteditable');
      element.removeAttribute('data-original-text');
      element.removeAttribute('data-edit-kind');
      if (!fence) emitMarkdownChange(lines.join('\n'));
    }
    return;
  }
  const sourceLine = Number(element.dataset.sourceLine);
  let lineIndex = Number.isFinite(sourceLine) && sourceLine > 0 ? sourceLine - 1 : -1;
  if (lineIndex < 0 || lineIndex >= lines.length || !lines[lineIndex]?.trim()) {
    lineIndex = lines.findIndex((line) => line.trim() === originalText);
  }
  if (lineIndex < 0) {
    lineIndex = lines.findIndex((line) => normalizeMarkdownInlineText(line) === originalText);
  }
  if (lineIndex < 0 && element.dataset.editKind === 'link') {
    lineIndex = lines.findIndex((line) => line.includes('[' + originalText + ']'));
  }
  if (lineIndex < 0 && element.dataset.editKind === 'summary') {
    lineIndex = lines.findIndex((line) => line.toLowerCase().includes('<summary>'));
  }
  if (lineIndex < 0 || !nextText) return;
  if (/^h[1-6]$/i.test(element.tagName)) {
    const headingLevel = Math.max(1, Math.min(6, Number(element.dataset.headingLevel || element.tagName.slice(1)) || 1));
    const indentation = lines[lineIndex]?.match(/^\s*/)?.[0] ?? '';
    const headingText = nextText.replace(/^#{1,6}\s+/, '');
    lines[lineIndex] = `${indentation}${'#'.repeat(headingLevel)} ${headingText}`;
  } else if (element.dataset.editKind === 'blockquote') {
    const prefix = lines[lineIndex]?.match(/^\s*>\s?/)?.[0] ?? '> ';
    lines[lineIndex] = prefix + nextText;
  } else if (element.dataset.editKind === 'list-item') {
    const prefix = lines[lineIndex]?.match(/^\s*(?:[-+*]|\d+[.)])\s+/)?.[0] ?? '- ';
    lines[lineIndex] = prefix + nextText;
  } else if (element.dataset.editKind === 'link') {
    const current = lines[lineIndex] ?? '';
    lines[lineIndex] = current.replace('[' + (element.dataset.originalText ?? '') + ']', '[' + nextText + ']');
  } else if (element.dataset.editKind === 'summary') {
    const current = lines[lineIndex] ?? '';
    lines[lineIndex] = current.replace(/(<summary>)[\s\S]*?(<\/summary>)/i, '$1' + nextText + '$2');
  } else {
    lines[lineIndex] = nextText;
  }
  element.removeAttribute('contenteditable');
  element.removeAttribute('data-original-text');
  element.removeAttribute('data-edit-kind');
  emitMarkdownChange(lines.join('\n'));
};

const beginInlineEdit = (element: HTMLElement, editKind = 'text', event?: MouseEvent) => {
  if (element.isContentEditable) return;
  element.dataset.originalText = element.textContent ?? '';
  element.dataset.editKind = editKind;
  if (editKind === 'code') {
    const fenceIndex = element.closest<HTMLElement>('pre')?.dataset.markdownFenceIndex;
    if (fenceIndex !== undefined) element.dataset.fenceIndex = fenceIndex;
  }
  if (/^h[1-6]$/i.test(element.tagName)) element.dataset.headingLevel = element.tagName.slice(1);
  element.contentEditable = 'true';
  element.setAttribute('contenteditable', 'true');
  element.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  const documentWithCaret = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const pointRange = event && documentWithCaret.caretRangeFromPoint?.(event.clientX, event.clientY);
  if (pointRange && element.contains(pointRange.startContainer)) {
    range.setStart(pointRange.startContainer, pointRange.startOffset);
  } else {
    const point = event && documentWithCaret.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (point && element.contains(point.offsetNode)) {
      range.setStart(point.offsetNode, point.offset);
    } else {
      range.selectNodeContents(element);
      range.collapse(false);
    }
  }
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  element.addEventListener('focusout', () => updateEditableBlock(element), { once: true });
};

const getPreviewEditableTarget = () => {
  const active = document.activeElement;
  return active instanceof HTMLElement
    && active.isContentEditable
    && previewRef.value?.contains(active)
    ? active
    : null;
};

type SelectionAction = typeof selectionActions[number]['id'];

const getPreviewSelection = (): PreviewSelection | null => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return null;
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (!anchor || !focus || !previewRef.value?.contains(anchor) || !previewRef.value.contains(focus)) return null;
  const selectedText = selection.toString();
  let start = props.content.indexOf(selectedText);
  if (start < 0) {
    const normalized = selectedText.replace(/\s+/g, ' ').trim();
    if (!normalized) return null;
    start = props.content.indexOf(normalized);
  }
  if (start < 0) return null;
  const end = start + selectedText.length;
  return { selection, text: selectedText, start, end };
};

const updateSelectionToolbar = async () => {
  const selected = getPreviewSelection();
  const nativeSelection = selected?.selection;
  if (!selected || !nativeSelection) {
    // 点击工具栏时浏览器可能先触发 selectionchange；保留快照直到该次操作完成。
    if (selectionToolbarPointerDown) return;
    selectionToolbar.value.visible = false;
    selectionSnapshot.value = null;
    return;
  }
  selectionSnapshot.value = selected;
  const bounds = nativeSelection.getRangeAt(0).getBoundingClientRect();
  const container = previewScrollRef.value?.getBoundingClientRect();
  if (!container) return;
  const center = bounds.left + bounds.width / 2 - container.left;
  selectionToolbar.value = {
    visible: true,
    x: Math.max(8, center - 180),
    y: Math.max(8, bounds.top - container.top - 44 + (previewScrollRef.value?.scrollTop ?? 0)),
  };
  await nextTick();
  const toolbar = previewScrollRef.value?.querySelector<HTMLElement>('.markdown-selection-toolbar');
  if (!toolbar || !selectionToolbar.value.visible || selectionSnapshot.value !== selected) return;
  const maxLeft = container.width - toolbar.offsetWidth - 8;
  selectionToolbar.value.x = maxLeft < 8 ? 8 : Math.max(8, Math.min(center - toolbar.offsetWidth / 2, maxLeft));
};

const applySelectionAction = (action: SelectionAction) => {
  const selected = getPreviewSelection() ?? selectionSnapshot.value;
  if (!selected) return;
  let start = selected.start;
  let end = selected.end;
  let replacement = selected.text;
  const toggleInline = (before: string, after = before) => {
    const hasSourceMarkers = props.content.slice(Math.max(0, start - before.length), start) === before
      && props.content.slice(end, end + after.length) === after;
    if (hasSourceMarkers) {
      start -= before.length;
      end += after.length;
      replacement = selected.text;
      return;
    }
    replacement = before + selected.text + after;
  };
  if (action === 'bold') toggleInline('**');
  else if (action === 'italic') toggleInline('*');
  else if (action === 'strike') toggleInline('~~');
  else if (action === 'link') {
    const linkStart = props.content.slice(Math.max(0, start - 1), start) === '[';
    const linkEnd = props.content.slice(end, end + 2) === '](';
    if (linkStart && linkEnd) {
      const close = props.content.indexOf(')', end);
      if (close >= 0) {
        start -= 1;
        end = close + 1;
        replacement = selected.text;
      } else {
        replacement = '[' + selected.text + '](https://)';
      }
    } else {
      replacement = '[' + selected.text + '](https://)';
    }
  }
  else if (action === 'delete') replacement = '';
  else {
    const lineStart = props.content.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextLineBreak = props.content.indexOf('\n', end);
    const lineEnd = nextLineBreak < 0 ? props.content.length : nextLineBreak;
    start = lineStart;
    end = lineEnd;
    const lines = props.content.slice(lineStart, lineEnd).split('\n');
    const prefix = action.startsWith('heading-') ? '#'.repeat(Number(action.slice(-1))) + ' '
      : action === 'quote' ? '> '
        : action === 'ordered-list' ? '1. '
          : '- ';
    const requestedPrefix = prefix;
    const allAlreadyFormatted = lines.every((line) => line.trimStart().startsWith(requestedPrefix));
    replacement = lines.map((line) => {
      if (allAlreadyFormatted) return line.replace(new RegExp(`^\s*${requestedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');
      const clean = line.replace(/^\s*(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/, '');
      return requestedPrefix + clean;
    }).join('\n');
  }
  emitMarkdownChange(props.content.slice(0, start) + replacement + props.content.slice(end));
  selectionToolbar.value.visible = false;
  selectionSnapshot.value = null;
  selectionToolbarPointerDown = false;
};

const applySelectionShortcut = (event: KeyboardEvent) => {
  const selected = getPreviewSelection();
  if (!selected || (props.previewMode !== 'preview' && props.previewMode !== 'split')) return false;
  const modifier = event.ctrlKey || event.metaKey;
  let action: SelectionAction | null = null;
  if (event.key === 'Backspace' || event.key === 'Delete') action = 'delete';
  else if (modifier && !event.altKey && event.key.toLowerCase() === 'b') action = 'bold';
  else if (modifier && !event.altKey && event.key.toLowerCase() === 'i') action = 'italic';
  else if (modifier && event.shiftKey && event.key.toLowerCase() === 's') action = 'strike';
  else if (modifier && ['1', '2', '3'].includes(event.key)) action = ('heading-' + event.key) as SelectionAction;
  else if (modifier && event.shiftKey && event.key.toLowerCase() === 'q') action = 'quote';
  else if (modifier && event.shiftKey && event.key === '[') action = 'ordered-list';
  else if (modifier && event.shiftKey && event.key === ']') action = 'bullet-list';
  else if (modifier && event.key.toLowerCase() === 'k') action = 'link';
  if (!action) return false;
  event.preventDefault();
  event.stopPropagation();
  applySelectionAction(action);
  return true;
};

const applyPreviewShortcut = (event: KeyboardEvent) => {
  if (applySelectionShortcut(event)) return true;
  const modifier = event.ctrlKey || event.metaKey;
  const strikeShortcut = event.altKey && event.shiftKey && event.key === '5';
  if ((!modifier || event.altKey) && !strikeShortcut) return false;
  const target = getPreviewEditableTarget();
  const key = event.key.toLowerCase();
  const selected = window.getSelection()?.toString() || target?.textContent || '';
  const wrap = (before: string, after: string, fallback: string) => {
    const value = selected || fallback;
    target!.textContent = `${before}${value}${after}`;
  };
  if (target) {
    if (key === 'b') wrap('**', '**', '粗体');
    else if (key === 'i') wrap('*', '*', '斜体');
    else if ((event.shiftKey && key === 's') || (event.altKey && event.shiftKey && key === '5')) wrap('~~', '~~', '删除线');
    else if (event.shiftKey && key === 'q') target.textContent = `> ${target.textContent || '引用'}`;
    else if (event.shiftKey && key === '[') target.textContent = `1. ${target.textContent || '列表项'}`;
    else if (event.shiftKey && key === ']') target.textContent = `- ${target.textContent || '列表项'}`;
    else if (event.shiftKey && key === '`') wrap('`', '`', '代码');
    else if (event.shiftKey && key === 'k') wrap('```\n', '\n```', '代码');
    else if (key === 'k') wrap('[', '](https://)', '链接文本');
    else if (event.shiftKey && key === 'i') wrap('![', '](image-url)', '图片描述');
    else if (key === 't') { target.textContent = '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |'; }
    else if (event.shiftKey && key === '-') target.textContent = `${target.textContent || ''}\n---`;
    else if (['1', '2', '3'].includes(key)) { target.dataset.headingLevel = key; target.textContent = target.textContent || '标题'; }
    else if (key === '=' || key === '-') {
      const match = (target.textContent || '').match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        const level = Math.max(0, Math.min(6, match[1]!.length + (key === '=' ? 1 : -1)));
        target.dataset.headingLevel = String(level || 1);
        target.textContent = match[2]!;
      }
    } else return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  if (props.previewMode !== 'preview') return false;
  if (key === 't') insertMarkdownBlock('table');
  else if (key === '1' || key === '2' || key === '3') insertMarkdownBlock('heading');
  else if (event.shiftKey && key === '-') emitMarkdownChange(`${props.content.trimEnd()}\n\n---\n`);
  else return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
};
const imageZoomHint = computed(() => settingsStore.uiLanguage === 'en-US'
  ? 'Double-click to enlarge image'
  : '双击放大查看图片');
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  target: { kind: 'blank', sourceFilePath: props.sourceFilePath } as MarkdownPreviewContextTarget,
  items: [] as PreviewMenuItem[],
});
const tableDeleteConfirmation = ref<{
  visible: boolean;
  content: string;
  tableIndex: number;
  tableWrapper: HTMLElement | null;
}>({ visible: false, content: '', tableIndex: -1, tableWrapper: null });

const cancelTableDelete = () => {
  tableDeleteConfirmation.value = { visible: false, content: '', tableIndex: -1, tableWrapper: null };
};

const requestTableDelete = (content: string, tableIndex: number, tableWrapper: HTMLElement) => {
  tableDeleteConfirmation.value = { visible: true, content, tableIndex, tableWrapper };
};

const confirmTableDelete = () => {
  const pending = tableDeleteConfirmation.value;
  cancelTableDelete();
  const nextContent = updateMarkdownTableAtIndex(pending.content, pending.tableIndex, 'table-remove');
  if (nextContent === pending.content || !pending.tableWrapper) return;
  emitMarkdownChange(nextContent, pending.tableIndex, pending.tableWrapper, true);
};

const closeContextMenu = () => {
  contextMenu.value.visible = false;
  contextMenu.value.items = [];
};

const closeCodeLanguageMenu = (button: HTMLButtonElement) => {
  button.setAttribute('aria-expanded', 'false');
  const menuId = button.getAttribute('aria-controls');
  if (menuId) document.getElementById(menuId)?.remove();
};

const closeOpenCodeLanguageMenus = () => {
  previewRef.value?.querySelectorAll<HTMLButtonElement>('.markdown-code-language-select[aria-expanded="true"]')
    .forEach(closeCodeLanguageMenu);
};

const copyToClipboard = async (text: string) => {
  if (!text) {
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
};

const getMermaidSvgExportData = (svg: SVGSVGElement) => {
  const bounds = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const width = Math.max(1, Math.ceil(bounds.width || viewBox.width || 800));
  const height = Math.max(1, Math.ceil(bounds.height || viewBox.height || 600));
  const scale = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;

  return {
    serialized: new XMLSerializer().serializeToString(clone),
    width,
    height,
    scale,
  };
};

const createMermaidPngBlob = (svg: SVGSVGElement, exportData = getMermaidSvgExportData(svg)) => {
  const { serialized, width, height, scale } = exportData;
  const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const sourceUrl = URL.createObjectURL(svgBlob);
  const png = new Promise<Blob>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('无法创建图片画布'));
        return;
      }
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('无法生成流程图图片'));
      }, 'image/png');
    };
    image.onerror = () => reject(new Error('无法读取流程图图片'));
    image.src = sourceUrl;
  });
  return png.finally(() => URL.revokeObjectURL(sourceUrl));
};

const downloadMermaidBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const downloadMermaidSvg = (svg: SVGSVGElement) => {
  const { serialized } = getMermaidSvgExportData(svg);
  downloadMermaidBlob(
    new Blob([serialized], { type: 'image/svg+xml' }),
    'mermaid-diagram.svg',
  );
};

const downloadMermaidPng = async (svg: SVGSVGElement) => {
  downloadMermaidBlob(await createMermaidPngBlob(svg), 'mermaid-diagram.png');
};

const copySvgToImageClipboard = async (svg: SVGSVGElement): Promise<'png' | 'text'> => {
  const exportData = getMermaidSvgExportData(svg);
  const { serialized } = exportData;
  const png = createMermaidPngBlob(svg, exportData);

  if (isTauriApp()) {
    const pngBlob = await png;
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
    await appCommands.writeImage(pngBytes);
    return 'png';
  }

  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(serialized);
      return 'text';
    }
    throw new Error('当前环境不支持图片剪贴板');
  }

  // Pass the pending Blob promise immediately. Waiting for PNG generation
  // before calling write() loses the click gesture permission in WebView.
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return 'png';
  } catch (pngError) {
    if (navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(serialized);
      return 'text';
    }
    throw pngError;
  }
};

const isAbsoluteAddress = (value: string) => /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) || value.startsWith('//');
const isWindowsDrivePath = (value: string) => /^[a-zA-Z]:[\\/]/.test(value);

const buildSourceBaseUrl = (sourceFilePath?: string | null) => {
  if (!sourceFilePath) {
    return null;
  }

  const normalized = sourceFilePath.trim().replace(/\\/g, '/');
  if (!normalized) {
    return null;
  }

  if (isWindowsDrivePath(normalized)) {
    const directory = normalized.slice(0, Math.max(0, normalized.lastIndexOf('/') + 1));
    return directory ? `file:///${directory}` : null;
  }

  if (isAbsoluteAddress(normalized)) {
    try {
      const url = new URL(normalized);
      url.hash = '';
      url.search = '';
      url.pathname = url.pathname.replace(/[^/]*$/, '');
      return url.toString();
    } catch {
      return null;
    }
  }

  if (!normalized.startsWith('/')) {
    return null;
  }

  const directory = normalized.slice(0, Math.max(0, normalized.lastIndexOf('/') + 1));
  return directory ? `file://${directory}` : null;
};

const resolveAddress = (rawAddress: string, sourceFilePath?: string | null) => {
  const address = rawAddress.trim();
  if (!address) {
    return null;
  }

  if (address.startsWith('#')) {
    try {
      return new URL(address, window.location.href).toString();
    } catch {
      return null;
    }
  }

  // Windows drive paths (`C:\\docs\\readme.md`) match the generic URI scheme
  // pattern (`c:`), but are local files rather than external protocols.
  if (isWindowsDrivePath(address)) {
    const normalizedPath = address.replace(/\\/g, '/');
    return `file:///${normalizedPath}`;
  }

  if (isAbsoluteAddress(address)) {
    try {
      if (address.startsWith('//')) {
        return `${window.location.protocol}${address}`;
      }
      return new URL(address).toString();
    } catch {
      return null;
    }
  }

  const baseUrl = buildSourceBaseUrl(sourceFilePath);
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(address, baseUrl).toString();
  } catch {
    return null;
  }
};

const fileUrlToPath = (address: string): string | null => {
  try {
    const url = new URL(address);
    if (url.protocol !== 'file:') {
      return null;
    }

    let pathname = decodeURIComponent(url.pathname);
    if (url.hostname && url.hostname !== 'localhost') {
      pathname = `//${url.hostname}${pathname}`;
    }
    if (/^\/[a-zA-Z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }
    return pathname || null;
  } catch {
    return null;
  }
};

/**
 * 将 Markdown 中相对图片路径转换为 Tauri asset URL，避免 WebView 把它解析到应用资源目录。
 * @author Albert_Luo
 * @date 2026-10-01
 */
const resolveLocalImageSources = async () => {
  if (!isTauriApp() || !previewRef.value || !props.sourceFilePath) {
    return;
  }

  const { convertFileSrc } = await import('@tauri-apps/api/core');
  const images = Array.from(previewRef.value.querySelectorAll<HTMLImageElement>('img[src]'));
  for (const image of images) {
    const rawSrc = image.getAttribute('src')?.trim() ?? '';
    if (rawSrc) {
      image.dataset.markdownSrc = rawSrc;
    }
    if (
      !rawSrc
      || isAbsoluteAddress(rawSrc)
      || rawSrc.startsWith('#')
      || rawSrc.startsWith('data:')
      || rawSrc.startsWith('blob:')
    ) {
      continue;
    }

    const resolved = resolveAddress(rawSrc, props.sourceFilePath);
    const filePath = resolved ? fileUrlToPath(resolved) : null;
    if (filePath) {
      const tauriSrc = convertFileSrc(filePath);
      image.src = tauriSrc;
      image.dataset.markdownResolvedSrc = tauriSrc;
    } else if (resolved) {
      image.dataset.markdownResolvedSrc = resolved;
    }
  }
};

const getImageSourceParts = (image: HTMLImageElement) => {
  const rawSrc = image.dataset.markdownSrc?.trim()
    || image.getAttribute('src')?.trim()
    || '';
  const resolvedSrc = image.dataset.markdownResolvedSrc?.trim()
    || resolveAddress(rawSrc, props.sourceFilePath)
    || null;

  return { rawSrc, resolvedSrc };
};

const getImageInteractionPayload = (image: HTMLImageElement) => {
  const { rawSrc, resolvedSrc } = getImageSourceParts(image);

  return {
    src: rawSrc,
    alt: image.getAttribute('alt')?.trim() || undefined,
    resolvedSrc: resolvedSrc || rawSrc,
  };
};

const decorateMarkdownImages = () => {
  previewRef.value?.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    image.classList.add('markdown-preview-image');
    image.setAttribute('title', imageZoomHint.value);
  });
};

const highlightCodeBlock = async (pre: HTMLElement, codeEl: HTMLElement, language: string) => {
  const highlightVersion = String((Number(codeEl.dataset.highlightVersion) || 0) + 1);
  codeEl.dataset.highlightVersion = highlightVersion;
  if (language === 'plaintext') return;

  try {
    const monaco = await import('@/lib/monaco/editor');
    const highlightedHtml = await monaco.editor.colorize(
      codeEl.textContent ?? '',
      language,
      { tabSize: 4 },
    );
    if (!previewRef.value?.contains(codeEl) || codeEl.dataset.highlightVersion !== highlightVersion) return;
    codeEl.innerHTML = highlightedHtml;
    pre.classList.add('monaco-editor', settingsStore.monacoTheme);
  } catch {
    notificationStore.error(copy.value.codeHighlightFailed);
  }
};

const decorateCodeBlocks = () => {
  const preview = previewRef.value;
  if (!preview) return;

  const sourceFences = getMarkdownCodeFences(props.content);
  const matchedFenceIndexes = new Set<number>();
  preview.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
    if (pre.dataset.codeToolbarAttached) return;
    const codeEl = pre.querySelector('code');
    if (!codeEl || /(?:^|\s)language-mermaid(?:\s|$)/i.test(codeEl.className)) return;

    const originalLanguage = codeEl.className.match(/(?:^|\s)language-([^\s]+)/)?.[1]?.toLowerCase() ?? 'plaintext';
    const selectedLanguage = CODE_LANGUAGE_ALIASES[originalLanguage] ?? originalLanguage;
    void highlightCodeBlock(pre, codeEl, selectedLanguage);
    const fenceIndex = sourceFences.findIndex((fence, index) =>
      !matchedFenceIndexes.has(index)
      && ((CODE_LANGUAGE_ALIASES[fence.language] ?? fence.language) || 'plaintext') === selectedLanguage
      && fence.code === (codeEl.textContent ?? '').replace(/\r\n/g, '\n').replace(/\n$/, ''),
    );
    if (fenceIndex >= 0) {
      matchedFenceIndexes.add(fenceIndex);
      pre.dataset.markdownFenceIndex = String(fenceIndex);
    }

    pre.dataset.codeToolbarAttached = '1';
    pre.style.position = pre.style.position || 'relative';

    const codeText = codeEl?.textContent ?? pre.textContent ?? '';
    pre.dataset.codeLanguage = selectedLanguage;
    let codeToolbar: HTMLDivElement | null = null;
    if (fenceIndex >= 0) {
      codeToolbar = document.createElement('div');
      codeToolbar.className = 'markdown-code-toolbar';
      codeToolbar.setAttribute('role', 'toolbar');

      const languageMenu = document.createElement('div');
      languageMenu.className = 'markdown-code-language-menu';
      const languageButton = document.createElement('button');
      languageButton.type = 'button';
      languageButton.className = 'markdown-code-language-select';
      languageButton.setAttribute('aria-label', copy.value.codeLanguage);
      languageButton.setAttribute('aria-haspopup', 'listbox');
      languageButton.setAttribute('aria-expanded', 'false');
      languageButton.setAttribute('data-testid', 'markdown-code-language-select');
      const languageListId = `markdown-code-language-list-${++codeLanguageMenuSequence}`;
      languageButton.setAttribute('aria-controls', languageListId);
      languageButton.innerHTML = '<span class="markdown-code-language-label"></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
      const languageLabel = languageButton.querySelector<HTMLElement>('.markdown-code-language-label')!;
      const languageOptions = [...CODE_LANGUAGE_OPTIONS];
      if (!languageOptions.some((option) => option.value === selectedLanguage)) {
        languageOptions.push({ value: selectedLanguage, label: selectedLanguage });
      }
      const selectedOption = languageOptions.find((option) => option.value === selectedLanguage);
      languageLabel.textContent = selectedLanguage === 'plaintext'
        ? copy.value.codeLanguagePlainText
        : selectedOption?.label ?? selectedLanguage;

      const languageList = document.createElement('div');
      languageList.className = 'markdown-code-language-list';
      languageList.id = languageListId;
      languageList.setAttribute('role', 'listbox');
      languageList.setAttribute('aria-label', copy.value.codeLanguage);
      const closeLanguageMenu = () => {
        closeCodeLanguageMenu(languageButton);
      };
      languageButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = languageButton.getAttribute('aria-expanded') === 'true';
        if (isOpen) {
          closeLanguageMenu();
          return;
        }

        const preview = previewScrollRef.value;
        const previewStyles = preview ? window.getComputedStyle(preview) : null;
        [
          '--preview-link',
          '--preview-menu-bg',
          '--preview-menu-border',
          '--preview-menu-shadow',
          '--preview-menu-text',
          '--preview-menu-hover-bg',
          '--preview-menu-hover-text',
          '--font-ui',
        ].forEach((name) => {
          const value = previewStyles?.getPropertyValue(name).trim();
          if (value) languageList.style.setProperty(name, value);
        });
        document.body.appendChild(languageList);
        languageButton.setAttribute('aria-expanded', 'true');
        const bounds = languageButton.getBoundingClientRect();
        languageList.style.minWidth = `${bounds.width}px`;
        const availableBelow = window.innerHeight - bounds.bottom - 14;
        const availableAbove = bounds.top - 14;
        const estimatedHeight = Math.min(languageList.scrollHeight || 280, 280);
        languageList.style.right = `${Math.max(8, window.innerWidth - bounds.right)}px`;
        if (availableBelow >= estimatedHeight || availableBelow >= availableAbove) {
          languageList.style.top = `${bounds.bottom + 6}px`;
          languageList.style.bottom = 'auto';
        } else {
          languageList.style.top = 'auto';
          languageList.style.bottom = `${window.innerHeight - bounds.top + 6}px`;
        }
      });
      languageButton.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          closeLanguageMenu();
        }
      });
      languageOptions.forEach(({ value, label }) => {
        const optionButton = document.createElement('button');
        optionButton.type = 'button';
        optionButton.className = 'markdown-code-language-option';
        optionButton.dataset.language = value;
        optionButton.setAttribute('role', 'option');
        optionButton.setAttribute('aria-selected', String(value === selectedLanguage));
        optionButton.textContent = value === 'plaintext' ? copy.value.codeLanguagePlainText : label;
        optionButton.addEventListener('click', (event) => {
          event.stopPropagation();
          closeLanguageMenu();
          const sourceFenceIndex = Number(pre.dataset.markdownFenceIndex);
          const sourceFence = sourceFences[sourceFenceIndex];
          if (!Number.isInteger(sourceFenceIndex) || !sourceFence) {
            notificationStore.error(copy.value.codeLanguageUpdateFailed);
            return;
          }
          if (value !== ((CODE_LANGUAGE_ALIASES[sourceFence.language] ?? sourceFence.language) || 'plaintext')) {
            emit('code-language-change', {
              fenceIndex: sourceFenceIndex,
              originalLanguage: sourceFence.language,
              code: sourceFence.code,
              language: value,
            });
          }
        });
        languageList.appendChild(optionButton);
      });
      languageMenu.append(languageButton, languageList);
      codeToolbar.appendChild(languageMenu);
    }

    const btn = document.createElement('button');
    btn.setAttribute('type', 'button');
    btn.className = 'markdown-code-copy-button';
    btn.setAttribute('aria-label', copy.value.copyCode);
    btn.title = copy.value.copyCode;
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></svg>';

    let busy = false;
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (busy) return;
      busy = true;
      try {
        await copyToClipboard(codeText || '');
        notificationStore.success(copy.value.copyCodeDone);
      } catch {
        notificationStore.error(copy.value.copyCodeFailed);
      } finally {
        busy = false;
      }
    });

    if (codeToolbar) {
      codeToolbar.appendChild(btn);
      pre.appendChild(codeToolbar);
    } else {
      btn.classList.add('markdown-code-copy-button--standalone');
      pre.appendChild(btn);
    }
  });
};

const updateMermaidViewerControls = () => {
  const preview = previewRef.value;
  if (!preview) return;

  preview.querySelectorAll<HTMLElement>('.markdown-mermaid-viewer').forEach((viewer) => {
    const toolbar = viewer.querySelector<HTMLElement>('.markdown-mermaid-toolbar');
    if (!toolbar) return;

    const labels: Record<string, string> = {
      diagram: copy.value.diagramView,
      code: copy.value.diagramCodeView,
      'zoom-out': copy.value.diagramZoomOut,
      'zoom-in': copy.value.diagramZoomIn,
      'export-menu': copy.value.diagramExportMenu,
      'download-png': copy.value.diagramDownloadPng,
      'download-svg': copy.value.diagramDownloadSvg,
      'copy-image': copy.value.diagramCopyImage,
    };
    toolbar.querySelectorAll<HTMLButtonElement>('[data-mermaid-action]').forEach((button) => {
      const action = button.dataset.mermaidAction;
      if (action && labels[action]) {
        button.setAttribute('aria-label', labels[action]);
        button.title = labels[action];
        if (action === 'diagram' || action === 'code') button.textContent = labels[action];
      }
    });
    toolbar.querySelectorAll<HTMLElement>('.markdown-mermaid-export-option-label').forEach((label) => {
      const action = label.closest<HTMLButtonElement>('[data-mermaid-action]')?.dataset.mermaidAction;
      if (action && labels[action]) label.textContent = labels[action];
    });

    const zoomLabel = toolbar.querySelector<HTMLElement>('.markdown-mermaid-zoom-level');
    const zoom = Number(viewer.dataset.zoom) || 100;
    if (zoomLabel) zoomLabel.textContent = copy.value.diagramZoomLevel(zoom);

    const fullscreenButton = toolbar.querySelector<HTMLButtonElement>('.markdown-mermaid-fullscreen-button');
    if (fullscreenButton) {
      const isFullscreen = document.fullscreenElement === viewer;
      const label = isFullscreen ? copy.value.diagramExitFullscreen : copy.value.diagramFullscreen;
      fullscreenButton.setAttribute('aria-label', label);
      fullscreenButton.title = label;
      const fullscreenLabel = fullscreenButton.querySelector<HTMLElement>('.markdown-mermaid-fullscreen-label');
      if (fullscreenLabel) fullscreenLabel.textContent = label;
    }
  });
};

const decorateMermaidViewers = () => {
  const preview = previewRef.value;
  if (!preview) return;

  preview.querySelectorAll<HTMLElement>('.markdown-mermaid-viewer').forEach((viewer) => {
    if (viewer.dataset.toolbarAttached) return;
    const diagram = viewer.querySelector<HTMLElement>('[data-mermaid-view="diagram"]');
    const source = viewer.querySelector<HTMLElement>('[data-mermaid-view="code"]');
    if (!diagram || !source) return;
    const svg = diagram.querySelector<SVGSVGElement>('svg');
    if (!svg) return;
    const diagramContent = document.createElement('div');
    diagramContent.className = 'markdown-mermaid-canvas-content';
    svg.replaceWith(diagramContent);
    diagramContent.appendChild(svg);

    viewer.dataset.toolbarAttached = '1';
    viewer.dataset.zoom = '100';
    const toolbar = document.createElement('div');
    toolbar.className = 'markdown-mermaid-toolbar';
    toolbar.setAttribute('data-testid', 'markdown-mermaid-toolbar');
    toolbar.setAttribute('role', 'toolbar');

    const viewToggle = document.createElement('div');
    viewToggle.className = 'markdown-mermaid-view-toggle';
    viewToggle.setAttribute('role', 'group');
    [copy.value.diagramView, copy.value.diagramCodeView].forEach((label, index) => {
      const button = document.createElement('button');
      const view = index === 0 ? 'diagram' : 'code';
      button.type = 'button';
      button.dataset.mermaidAction = view;
      button.setAttribute('aria-pressed', String(index === 0));
      button.textContent = label;
      button.addEventListener('click', () => {
        const showDiagram = view === 'diagram';
        diagram.hidden = !showDiagram;
        source.hidden = showDiagram;
        viewToggle.querySelectorAll<HTMLButtonElement>('[data-mermaid-action]').forEach((tab) => {
          tab.setAttribute('aria-pressed', String(tab === button));
        });
      });
      viewToggle.appendChild(button);
    });
    toolbar.appendChild(viewToggle);

    const spacer = document.createElement('span');
    spacer.className = 'markdown-mermaid-toolbar-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    toolbar.appendChild(spacer);

    const zoomOut = document.createElement('button');
    zoomOut.type = 'button';
    zoomOut.dataset.mermaidAction = 'zoom-out';
    zoomOut.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5M7.8 10.8h6"/></svg>';
    const zoomLevel = document.createElement('span');
    zoomLevel.className = 'markdown-mermaid-zoom-level';
    zoomLevel.setAttribute('aria-live', 'polite');
    const zoomIn = document.createElement('button');
    zoomIn.type = 'button';
    zoomIn.dataset.mermaidAction = 'zoom-in';
    zoomIn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5M7.8 10.8h6m-3-3v6"/></svg>';
    const ensureBaseMetrics = () => {
      if (diagram.dataset.baseSvgWidth && diagram.dataset.baseSvgHeight) return;
      const diagramBounds = diagram.getBoundingClientRect();
      const svgBounds = svg.getBoundingClientRect();
      const viewBoxParts = (svg.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
      const viewBoxWidth = Number.isFinite(viewBoxParts[2]) ? viewBoxParts[2] : 0;
      const viewBoxHeight = Number.isFinite(viewBoxParts[3]) ? viewBoxParts[3] : 0;
      const fallbackWidth = Number(svg.getAttribute('width')) || viewBoxWidth
        || Math.max(0, diagramBounds.width - 40) || Math.max(0, diagram.clientWidth - 40) || 640;
      const fallbackHeight = Number(svg.getAttribute('height')) || viewBoxHeight
        || Math.max(0, diagramBounds.height - 40) || Math.max(0, diagram.clientHeight - 40) || 360;
      diagram.dataset.baseHeight = String(diagramBounds.height || diagram.clientHeight || fallbackHeight + 40);
      diagram.dataset.baseWidth = String(diagramBounds.width || diagram.clientWidth || fallbackWidth + 40);
      diagram.dataset.baseSvgWidth = String(svgBounds.width > 0 ? svgBounds.width : fallbackWidth);
      diagram.dataset.baseSvgHeight = String(svgBounds.height > 0 ? svgBounds.height : fallbackHeight);
    };
    const applyZoom = (nextZoom: number) => {
      const zoom = Math.min(300, Math.max(25, nextZoom));
      viewer.dataset.zoom = String(zoom);
      if (svg) {
        ensureBaseMetrics();
        svg.style.maxWidth = 'none';
        const isZoomed = zoom !== 100;
        // CSS transform enlarges the painted area; force a two-axis scroll
        // container while zoomed so both bars remain available to the user.
        diagram.style.overflow = isZoomed ? 'scroll' : 'hidden';
        diagram.style.boxSizing = 'border-box';
        if (isZoomed) {
          const factor = zoom / 100;
          const baseSvgWidth = Number(diagram.dataset.baseSvgWidth) || diagram.clientWidth;
          const baseSvgHeight = Number(diagram.dataset.baseSvgHeight) || diagram.clientHeight;
          diagramContent.style.width = `${baseSvgWidth * factor}px`;
          diagramContent.style.height = `${baseSvgHeight * factor}px`;
          diagramContent.style.minWidth = '0';
          diagramContent.style.minHeight = '0';
          svg.style.width = `${baseSvgWidth * factor}px`;
          svg.style.height = `${baseSvgHeight * factor}px`;
          const baseHeight = Number(diagram.dataset.baseHeight) || baseSvgHeight + 40;
          diagram.style.height = zoom > 100
            ? `${baseHeight}px`
            : `${Math.max(80, baseSvgHeight * factor + 40)}px`;
        } else {
          diagram.style.height = '';
          diagramContent.style.width = '';
          diagramContent.style.height = '';
          diagramContent.style.minWidth = '100%';
          diagramContent.style.minHeight = '100%';
          svg.style.width = '100%';
          svg.style.height = '';
        }
        svg.style.transform = '';
      }
      zoomOut.disabled = zoom <= 25;
      zoomIn.disabled = zoom >= 300;
      zoomLevel.textContent = copy.value.diagramZoomLevel(zoom);
    };
    zoomOut.addEventListener('click', () => applyZoom((Number(viewer.dataset.zoom) || 100) - 25));
    zoomIn.addEventListener('click', () => applyZoom((Number(viewer.dataset.zoom) || 100) + 25));
    toolbar.append(zoomOut, zoomLevel, zoomIn);
    applyZoom(100);

    const exportMenu = document.createElement('div');
    exportMenu.className = 'markdown-mermaid-export-menu';
    const exportToggle = document.createElement('button');
    exportToggle.type = 'button';
    exportToggle.dataset.mermaidAction = 'export-menu';
    exportToggle.setAttribute('aria-haspopup', 'menu');
    exportToggle.setAttribute('aria-expanded', 'false');
    exportToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 4.5-4.5 3.5 3.5 2.5-2.5L20 17"/></svg>';
    const exportOptions = document.createElement('div');
    exportOptions.className = 'markdown-mermaid-export-options';
    exportOptions.setAttribute('role', 'menu');
    exportOptions.hidden = true;
    exportToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      exportOptions.hidden = !exportOptions.hidden;
      exportToggle.setAttribute('aria-expanded', String(!exportOptions.hidden));
    });
    exportMenu.append(exportToggle, exportOptions);

    const createDownloadButton = (
      action: 'download-png' | 'download-svg',
      icon: string,
      handler: () => void | Promise<void>,
    ) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.mermaidAction = action;
      button.className = 'markdown-mermaid-export-option';
      button.innerHTML = `${icon}<span class="markdown-mermaid-export-option-label"></span>`;
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        button.disabled = true;
        try {
          await handler();
          notificationStore.success(
            action === 'download-png'
              ? copy.value.diagramDownloadPngDone
              : copy.value.diagramDownloadSvgDone,
          );
        } catch {
          notificationStore.error(copy.value.diagramDownloadFailed);
        } finally {
          button.disabled = false;
          exportOptions.hidden = true;
          exportToggle.setAttribute('aria-expanded', 'false');
        }
      });
      button.setAttribute('role', 'menuitem');
      return button;
    };

    const downloadIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14"/></svg>';
    exportOptions.append(
      createDownloadButton('download-png', downloadIcon, () => downloadMermaidPng(svg)),
      createDownloadButton('download-svg', downloadIcon, () => downloadMermaidSvg(svg)),
    );

    const copyImageButton = document.createElement('button');
    copyImageButton.type = 'button';
    copyImageButton.dataset.mermaidAction = 'copy-image';
    copyImageButton.className = 'markdown-mermaid-export-option';
    copyImageButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 4.5-4.5 3.5 3.5 2.5-2.5L20 17"/></svg><span class="markdown-mermaid-export-option-label"></span>';
    copyImageButton.addEventListener('click', async () => {
      if (copyImageButton.disabled) return;
      copyImageButton.disabled = true;
      try {
        const copiedAs = await copySvgToImageClipboard(svg);
        notificationStore.success(
          copiedAs === 'png'
            ? copy.value.diagramCopyImageDone
            : copy.value.diagramCopySvgTextDone,
        );
      } catch {
        notificationStore.error(copy.value.diagramCopyImageFailed);
      } finally {
        copyImageButton.disabled = false;
        exportOptions.hidden = true;
        exportToggle.setAttribute('aria-expanded', 'false');
      }
    });
    copyImageButton.setAttribute('role', 'menuitem');
    exportOptions.appendChild(copyImageButton);
    toolbar.appendChild(exportMenu);

    const fullscreenButton = document.createElement('button');
    fullscreenButton.type = 'button';
    fullscreenButton.className = 'markdown-mermaid-fullscreen-button';
    fullscreenButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8 3 3m13 5 5-5M8 16l-5 5m13-5 5 5"/></svg><span class="markdown-mermaid-fullscreen-label"></span>';
    fullscreenButton.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement === viewer) {
          await document.exitFullscreen();
          return;
        }
        if (typeof viewer.requestFullscreen !== 'function') {
          notificationStore.error(copy.value.diagramFullscreenUnavailable);
          return;
        }
        await viewer.requestFullscreen();
      } catch {
        notificationStore.error(copy.value.diagramFullscreenFailed);
      }
    });
    toolbar.appendChild(fullscreenButton);
    viewer.insertBefore(toolbar, viewer.firstChild);
    applyZoom(100);
  });

  updateMermaidViewerControls();
};

const updateCodeBlockControlLabels = () => {
  const preview = previewRef.value;
  if (!preview) return;

  preview.querySelectorAll<HTMLButtonElement>('.markdown-code-language-select').forEach((button) => {
    button.setAttribute('aria-label', copy.value.codeLanguage);
    const language = button.closest<HTMLElement>('[data-code-language]')?.dataset.codeLanguage;
    const label = button.querySelector<HTMLElement>('.markdown-code-language-label');
    if (label && language === 'plaintext') label.textContent = copy.value.codeLanguagePlainText;
    const menuId = button.getAttribute('aria-controls');
    const list = menuId ? document.getElementById(menuId) : null;
    list?.setAttribute('aria-label', copy.value.codeLanguage);
    const plainTextOption = list?.querySelector<HTMLElement>('.markdown-code-language-option[data-language="plaintext"]');
    if (plainTextOption) plainTextOption.textContent = copy.value.codeLanguagePlainText;
  });
  preview.querySelectorAll<HTMLButtonElement>('.markdown-code-copy-button').forEach((button) => {
    button.setAttribute('aria-label', copy.value.copyCode);
    button.title = copy.value.copyCode;
  });
  updateMermaidViewerControls();
};

const handlePreviewDoubleClick = (event: MouseEvent) => {
  const imageTarget = event.target instanceof Element ? event.target.closest('img[src]') : null;
  if (imageTarget instanceof HTMLImageElement && previewRef.value?.contains(imageTarget)) {
    emit('open-image', getImageInteractionPayload(imageTarget));
    return;
  }
  const textTarget = event.target instanceof Element
    ? event.target.closest('h1, h2, h3, h4, h5, h6, p, blockquote, li, a, summary') as HTMLElement | null
    : null;
  if (textTarget && previewRef.value?.contains(textTarget)) {
    const blockquoteTarget = textTarget.closest('blockquote');
    const listTarget = textTarget.closest('li');
    const editElement = blockquoteTarget && textTarget.tagName.toLowerCase() === 'p'
      ? textTarget
      : listTarget && textTarget.tagName.toLowerCase() === 'li'
        ? textTarget
        : textTarget;
    const editKind = blockquoteTarget
      ? 'blockquote'
      : listTarget
        ? 'list-item'
        : textTarget.matches('blockquote')
      ? 'blockquote'
      : textTarget.matches('li')
        ? 'list-item'
        : textTarget.matches('a')
          ? 'link'
          : textTarget.matches('summary')
            ? 'summary'
            : 'text';
    beginInlineEdit(editElement, editKind, event);
    return;
  }
  const codeTarget = event.target instanceof Element ? event.target.closest('code') : null;
  if (codeTarget instanceof HTMLElement && previewRef.value?.contains(codeTarget)) {
    beginInlineEdit(codeTarget, 'code', event);
    return;
  }
};

const resolveContextTarget = (eventTarget: EventTarget | null): MarkdownPreviewContextTarget => {
  const sourceFilePath = props.sourceFilePath;
  const target = eventTarget instanceof Element ? eventTarget : null;
  const preview = previewRef.value;

  if (target && preview?.contains(target)) {
    const imageEl = target.closest('img[src]');
    if (imageEl instanceof HTMLImageElement) {
      const { rawSrc, resolvedSrc } = getImageSourceParts(imageEl);
      return {
        kind: 'image',
        src: rawSrc,
        resolvedSrc,
        alt: imageEl.getAttribute('alt') ?? undefined,
        sourceFilePath,
      };
    }

    const linkEl = target.closest('a[href]');
    if (linkEl instanceof HTMLAnchorElement) {
      const rawHref = linkEl.getAttribute('href') ?? '';
      return {
        kind: 'link',
        href: rawHref,
        resolvedHref: resolveAddress(rawHref, sourceFilePath),
        text: linkEl.textContent?.trim() || undefined,
        sourceFilePath,
      };
    }
  }

  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? '';
  if (selection && selectedText) {
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    const isAnchorInside = !!(anchorNode && preview?.contains(anchorNode));
    const isFocusInside = !!(focusNode && preview?.contains(focusNode));
    if (isAnchorInside || isFocusInside) {
      return {
        kind: 'selection',
        text: selectedText,
        sourceFilePath,
      };
    }
  }

  if (target && preview?.contains(target)) {
    const codeRoot = target.closest('pre');
    if (codeRoot) {
      const codeElement = codeRoot.querySelector('code');
      const className = codeElement?.className ?? '';
      const language = className.startsWith('language-') ? className.replace(/^language-/, '') : undefined;
      return {
        kind: 'code-block',
        language,
        code: codeElement?.textContent ?? codeRoot.textContent ?? undefined,
        sourceFilePath,
      };
    }
  }

  return {
    kind: 'blank',
    sourceFilePath,
  };
};

const isBrowserUrl = (address: string) => /^https?:\/\//i.test(address.trim());
const resolveLocalFilePath = (address: string) => fileUrlToPath(address);

/**
 * 所有 Markdown 网页链接统一交给系统默认浏览器，避免在 Tauri WebView 内导航。
 * @author Albert_Luo
 * @date 2026-10-07
 */
const openAddress = async (address: string) => {
  const normalized = address.trim();
  const localFilePath = resolveLocalFilePath(normalized);
  if (localFilePath) {
    emit('open-file', { path: localFilePath, href: normalized });
    return;
  }

  if (!isBrowserUrl(normalized)) {
    return;
  }

  await appCommands.openExternalLink(normalized);
};

const handlePreviewClick = (event: MouseEvent) => {
  const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(target instanceof HTMLAnchorElement) || !previewRef.value?.contains(target)) {
    return;
  }
  if (event.detail > 1) {
    event.preventDefault();
    event.stopPropagation();
    beginInlineEdit(target, 'link', event);
    return;
  }

  const rawHref = target.getAttribute('href')?.trim() ?? '';
  if (!rawHref || rawHref.startsWith('#')) {
    return;
  }

  // 禁止 WebView 处理 Markdown 链接；仅 http/https 地址交给系统浏览器。
  event.preventDefault();
  event.stopPropagation();
  const resolvedHref = resolveAddress(rawHref, props.sourceFilePath);
  if (resolvedHref) {
    void openAddress(resolvedHref);
  }
};

const requestPreviewModeChange = (mode: 'edit' | 'split' | 'preview') => {
  emit('request-preview-mode-change', mode);
};

const getPreviewThemeOptions = (): PreviewThemeOption[] => [
  {
    value: 'docs-clean',
    label: copy.value.previewThemeDocsClean,
  },
  {
    value: 'paper-soft',
    label: copy.value.previewThemePaperSoft,
  },
  {
    value: 'editorial-warm',
    label: copy.value.previewThemeEditorialWarm,
  },
  {
    value: 'graphite-night',
    label: copy.value.previewThemeGraphiteNight,
  },
  {
    value: 'mint-grove',
    label: copy.value.previewThemeMintGrove,
  },
  {
    value: 'lavender-letter',
    label: copy.value.previewThemeLavenderLetter,
  },
  {
    value: 'deep-ocean',
    label: copy.value.previewThemeDeepOcean,
  },
];

const buildMenuItems = (target: MarkdownPreviewContextTarget): PreviewMenuItem[] => {
  const items: PreviewMenuItem[] = [];

  if (target.kind === 'selection' && target.text) {
    items.push({
      id: 'copy-selection',
      label: copy.value.copySelection,
      run: () => copyToClipboard(target.text),
    });
  }

  items.push(
    {
      id: 'insert-heading',
      label: '新增标题',
      dividerBefore: true,
      run: () => insertMarkdownBlock('heading'),
    },
    {
      id: 'insert-paragraph',
      label: '新增正文',
      run: () => insertMarkdownBlock('paragraph'),
    },
    {
      id: 'insert-table',
      label: '插入表格',
      run: () => insertMarkdownBlock('table'),
    },
    {
      id: 'copy-markdown',
      label: copy.value.copyMarkdown,
      dividerBefore: items.length > 0,
      run: () => copyToClipboard(props.content || ''),
    },
    {
      id: 'refresh-preview',
      label: copy.value.refreshPreview,
      run: () => scheduleRender(),
    },
    ...getPreviewThemeOptions().map((themeOption, index) => ({
      id: `theme-${themeOption.value}`,
      label: themeOption.label,
      dividerBefore: index === 0,
      disabled: themeOption.value === settingsStore.markdownPreviewTheme,
      run: () => settingsStore.updateSettings({ markdownPreviewTheme: themeOption.value }),
    })),
    {
      id: 'set-preview-mode-edit',
      label: copy.value.setPreviewModeEdit,
      dividerBefore: true,
      run: () => requestPreviewModeChange('edit'),
    },
    {
      id: 'set-preview-mode-split',
      label: copy.value.setPreviewModeSplit,
      run: () => requestPreviewModeChange('split'),
    },
    {
      id: 'set-preview-mode-preview',
      label: copy.value.setPreviewModePreview,
      run: () => requestPreviewModeChange('preview'),
    },
  );

  if (target.kind === 'link' && target.resolvedHref) {
    items.push(
      {
        id: 'open-link',
        label: copy.value.openLink,
        dividerBefore: true,
        run: () => openAddress(target.resolvedHref!),
      },
      {
        id: 'open-link-new-tab',
        label: copy.value.openLinkNewWindow,
        run: () => openAddress(target.resolvedHref!),
      },
      {
        id: 'copy-link',
        label: copy.value.copyLink,
        run: () => copyToClipboard(target.resolvedHref!),
      },
    );
  }

  if (target.kind === 'image' && target.resolvedSrc) {
    items.push(
      {
        id: 'open-image',
        label: copy.value.openImage,
        dividerBefore: true,
        run: () => openAddress(target.resolvedSrc!),
      },
      {
        id: 'open-image-new-tab',
        label: copy.value.openImageNewWindow,
        run: () => openAddress(target.resolvedSrc!),
      },
      {
        id: 'copy-image-src',
        label: copy.value.copyImageSource,
        run: () => copyToClipboard(target.resolvedSrc!),
      },
    );
  }

  return items.filter((item) => item.visible !== false);
};

const clampMenuPosition = (x: number, y: number, width: number, height: number) => {
  const maxX = Math.max(MENU_MARGIN, window.innerWidth - width - MENU_MARGIN);
  const maxY = Math.max(MENU_MARGIN, window.innerHeight - height - MENU_MARGIN);
  return {
    x: Math.max(MENU_MARGIN, Math.min(x, maxX)),
    y: Math.max(MENU_MARGIN, Math.min(y, maxY)),
  };
};

const openContextMenu = async (x: number, y: number, target: MarkdownPreviewContextTarget) => {
  const items = buildMenuItems(target);
  const estimatedHeight = items.length * MENU_ITEM_HEIGHT + 12;
  const estimated = clampMenuPosition(x, y, MENU_ESTIMATED_WIDTH, estimatedHeight);

  contextMenu.value = {
    visible: true,
    x: estimated.x,
    y: estimated.y,
    target,
    items,
  };

  await nextTick();

  if (!contextMenu.value.visible || !menuRef.value) {
    return;
  }

  const rect = menuRef.value.getBoundingClientRect();
  const adjusted = clampMenuPosition(x, y, rect.width, rect.height);
  contextMenu.value.x = adjusted.x;
  contextMenu.value.y = adjusted.y;
};

const handleContextMenu = (event: MouseEvent) => {
  const target = resolveContextTarget(event.target);
  void openContextMenu(event.clientX, event.clientY, target);
};

const closeMermaidExportMenus = (exceptTarget?: Node | null) => {
  previewRef.value?.querySelectorAll<HTMLElement>('.markdown-mermaid-export-menu').forEach((menu) => {
    if (exceptTarget && menu.contains(exceptTarget)) return;
    const toggle = menu.querySelector<HTMLButtonElement>('[data-mermaid-action="export-menu"]');
    const options = menu.querySelector<HTMLElement>('.markdown-mermaid-export-options');
    if (!toggle || !options) return;
    options.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  });
};

const handleGlobalPointerDown = (event: MouseEvent) => {
  const eventTarget = event.target as Node | null;
  closeMermaidExportMenus(eventTarget);
  previewRef.value?.querySelectorAll<HTMLButtonElement>('.markdown-code-language-select[aria-expanded="true"]').forEach((button) => {
    const menuId = button.getAttribute('aria-controls');
    const list = menuId ? document.getElementById(menuId) : null;
    if (eventTarget && (button.contains(eventTarget) || list?.contains(eventTarget))) return;
    closeCodeLanguageMenu(button);
  });

  if (eventTarget && previewScrollRef.value?.querySelector('.markdown-selection-toolbar')?.contains(eventTarget)) {
    return;
  }
  selectionToolbar.value.visible = false;
  selectionSnapshot.value = null;
  selectionToolbarPointerDown = false;

  if (!contextMenu.value.visible) {
    return;
  }
  if (eventTarget && menuRef.value?.contains(eventTarget)) {
    return;
  }

  closeContextMenu();
  if (!(eventTarget && previewScrollRef.value?.contains(eventTarget))) selectionToolbar.value.visible = false;
};

const handleGlobalKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeContextMenu();
    closeOpenCodeLanguageMenus();
    closeMermaidExportMenus();
  }

  if (applyPreviewShortcut(event)) {
    return;
  }

  const eventTarget = event.target as Node | null;
  const isPreviewFocused = Boolean(eventTarget && previewScrollRef.value?.contains(eventTarget));
  if (isPreviewFocused && (event.ctrlKey || event.metaKey) && !event.altKey
    && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')
    && props.previewMode !== 'edit') {
    event.preventDefault();
    event.stopPropagation();
    if (event.key.toLowerCase() === 'z' && event.shiftKey) emit('request-redo');
    else if (event.key.toLowerCase() === 'z') emit('request-undo');
    else emit('request-redo');
    return;
  }

  if (props.previewMode !== 'preview' || (!event.ctrlKey && !event.metaKey) || event.altKey) {
    return;
  }

  const normalizedKey = event.key === '=' ? '+' : event.key;
  if (!['+', '-', '0'].includes(normalizedKey)) {
    return;
  }

  const nextSize = normalizedKey === '0'
    ? PREVIEW_FONT_SIZE_DEFAULT
    : previewFontSize.value + (normalizedKey === '+' ? PREVIEW_FONT_SIZE_STEP : -PREVIEW_FONT_SIZE_STEP);
  const clampedSize = Math.min(PREVIEW_FONT_SIZE_MAX, Math.max(PREVIEW_FONT_SIZE_MIN, nextSize));
  event.preventDefault();
  previewFontSize.value = clampedSize;
  emit('preview-font-size-change', clampedSize);
};

const handleFullscreenChange = () => updateMermaidViewerControls();

const runMenuItem = async (item: PreviewMenuItem) => {
  if (item.disabled) {
    return;
  }

  closeContextMenu();

  try {
    await item.run();
  } catch {
    // 当前阶段仅保证失败不伪装成功，不额外弹提示
  }
};

const syncPreviewScroll = (state: { top: number; height: number; scrollHeight: number }) => {
  const previewContainer = previewScrollRef.value;
  if (!previewContainer) {
    return;
  }
  if (localTableScrollLock) {
    if (Date.now() < localTableScrollLock.until || localTableScrollLock.editorTop === null || state.top === localTableScrollLock.editorTop) {
      previewContainer.scrollTop = localTableScrollLock.top;
      return;
    }
    localTableScrollLock = null;
  }

  const editorScrollable = Math.max(0, state.scrollHeight - state.height);
  const previewScrollable = Math.max(0, previewContainer.scrollHeight - previewContainer.clientHeight);

  if (previewScrollable <= 0 || editorScrollable <= 0) {
    previewContainer.scrollTop = 0;
    return;
  }

  const ratio = Math.min(1, Math.max(0, state.top / editorScrollable));
  previewContainer.scrollTop = previewScrollable * ratio;
};

/**
 * 将超宽表格隔离到自己的横向滚动容器，避免撑破预览区域的布局边界。
 * @author Albert_Luo
 * @date 2026-10-03
 */
const wrapMarkdownTables = () => {
  const preview = previewRef.value;
  if (!preview) {
    return;
  }

  preview.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    const parent = table.parentElement;
    if (parent?.classList.contains('markdown-table-scroll')) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-table-scroll';
    const shell = document.createElement('div');
    shell.className = 'markdown-table-shell';
    table.replaceWith(shell);
    shell.appendChild(wrapper);
    wrapper.appendChild(table);
  });
};

const refreshLocalTable = async (edit: {
  content: string;
  tableIndex: number;
  previewScrollTop: number;
  tableScrollLeft: number;
  remove?: boolean;
}) => {
  const preview = previewRef.value;
  const previewScroll = previewScrollRef.value;
  const wrapper = preview?.querySelectorAll<HTMLElement>('.markdown-table-scroll')[edit.tableIndex];
  if (!preview || !wrapper) return false;

  const scrollTop = edit.previewScrollTop;
  const scrollLeft = edit.tableScrollLeft;
  const restorePreviewScroll = () => {
    if (previewScroll) previewScroll.scrollTop = scrollTop;
    localTableScrollLock = {
      top: scrollTop,
      editorTop: latestEditorScrollState.value?.top ?? null,
      until: Date.now() + 1000,
    };
  };
  if (edit.remove) {
    const shell = wrapper.parentElement?.classList.contains('markdown-table-shell')
      ? wrapper.parentElement
      : wrapper;
    shell.remove();
    if (previewScroll) {
      previewScroll.style.overflowAnchor = 'none';
      restorePreviewScroll();
    }
    const restoreFrame = () => {
      restorePreviewScroll();
      const followUpFrame = requestAnimationFrame(() => {
        pendingTableRestoreFrames.delete(followUpFrame);
        restorePreviewScroll();
        if (previewScroll) previewScroll.style.overflowAnchor = '';
      });
      pendingTableRestoreFrames.add(followUpFrame);
    };
    if (typeof requestAnimationFrame === 'function') {
      const frame = requestAnimationFrame(() => {
        pendingTableRestoreFrames.delete(frame);
        restoreFrame();
      });
      pendingTableRestoreFrames.add(frame);
    } else {
      setTimeout(() => {
        restorePreviewScroll();
        if (previewScroll) previewScroll.style.overflowAnchor = '';
      }, 0);
    }
    return true;
  }

  const blocks = findMarkdownTableBlocks(edit.content);
  const block = blocks[edit.tableIndex];
  if (!block) return false;
  const renderer = await loadMarkdownRenderer();
  const source = edit.content.split('\n').slice(block.startLine, block.endLine + 1).join('\n');
  const scratch = document.createElement('div');
  scratch.innerHTML = renderer.renderMarkdown(source);
  const nextTable = scratch.querySelector('table');
  const currentTable = wrapper.querySelector('table');
  if (!nextTable || !currentTable) return false;

  const restoreScroll = () => {
    if (previewScroll) previewScroll.scrollTop = scrollTop;
    wrapper.scrollLeft = scrollLeft;
  };
  currentTable.replaceWith(nextTable);
  restoreScroll();
  const shell = wrapper.parentElement?.classList.contains('markdown-table-shell')
    ? wrapper.parentElement
    : wrapper;
  shell.style.overflowAnchor = 'none';
  shell.removeAttribute('data-table-controls-attached');
  shell.querySelectorAll('.markdown-table-control-group').forEach((group) => group.remove());
  decorateMarkdownTables();
  await nextTick();
  restoreScroll();
  if (typeof requestAnimationFrame === 'function') {
    const frame = requestAnimationFrame(() => {
      pendingTableRestoreFrames.delete(frame);
      restoreScroll();
      const followUpFrame = requestAnimationFrame(() => {
        pendingTableRestoreFrames.delete(followUpFrame);
        restoreScroll();
      });
      pendingTableRestoreFrames.add(followUpFrame);
    });
    pendingTableRestoreFrames.add(frame);
  }
  return true;
};

const decorateMarkdownTables = () => {
  const preview = previewRef.value;
  if (!preview || props.previewMode === 'edit') return;
  preview.querySelectorAll<HTMLElement>('.markdown-table-scroll').forEach((wrapper, tableIndex) => {
    const shell = wrapper.parentElement?.classList.contains('markdown-table-shell')
      ? wrapper.parentElement
      : wrapper;
    if (shell.dataset.tableControlsAttached === '1') return;
    shell.dataset.tableControlsAttached = '1';
    shell.style.position = 'relative';
    wrapper.querySelectorAll<HTMLElement>('th, td').forEach((cell) => {
      if (cell.dataset.inlineEditAttached === '1') return;
      cell.dataset.inlineEditAttached = '1';
      cell.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const row = cell.parentElement?.parentElement?.tagName.toLowerCase() === 'thead'
          ? 0
          : Array.from(cell.closest('table')?.querySelectorAll('tbody tr') ?? []).indexOf(cell.parentElement as HTMLTableRowElement) + 2;
        const column = Array.from(cell.parentElement?.children ?? []).indexOf(cell);
        const original = cell.textContent ?? '';
        cell.contentEditable = 'true';
        cell.setAttribute('contenteditable', 'true');
        cell.focus();
        cell.addEventListener('focusout', () => {
          cell.removeAttribute('contenteditable');
          const next = updateMarkdownTableCellAtIndex(props.content, tableIndex, row, column, cell.textContent ?? original);
          emitMarkdownChange(next, tableIndex, wrapper);
        }, { once: true });
      });
    });

    const addButton = (testId: string, label: string, operation: 'row' | 'row-remove' | 'column-left' | 'column-right' | 'column-left-remove' | 'column-right-remove' | 'table-remove', symbol: string) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'markdown-table-control markdown-table-add markdown-table-control--' + operation;
      button.dataset.testid = testId;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.textContent = symbol;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (operation === 'table-remove') {
          requestTableDelete(props.content, tableIndex, wrapper);
          return;
        }
        const nextContent = updateMarkdownTableAtIndex(props.content, tableIndex, operation);
        if (nextContent === props.content) return;
        if (tableIndex === findTableIndexFromWrapper(wrapper)) {
          emitMarkdownChange(nextContent, tableIndex, wrapper);
        }
      });
      shell.appendChild(button);
    };

    const leftGroup = document.createElement('div');
    leftGroup.className = 'markdown-table-control-group markdown-table-control-group--left';
    shell.appendChild(leftGroup);
    const rightGroup = document.createElement('div');
    rightGroup.className = 'markdown-table-control-group markdown-table-control-group--right';
    shell.appendChild(rightGroup);
    const bottomGroup = document.createElement('div');
    bottomGroup.className = 'markdown-table-control-group markdown-table-control-group--bottom';
    shell.appendChild(bottomGroup);
    const mount = (group: HTMLElement, testId: string, label: string, operation: 'row' | 'row-remove' | 'column-left' | 'column-right' | 'column-left-remove' | 'column-right-remove' | 'table-remove', symbol: string) => {
      addButton(testId, label, operation, symbol);
      const button = shell.lastElementChild;
      if (button) group.appendChild(button);
    };
    mount(leftGroup, 'markdown-table-add-column-left', '左侧新增一列', 'column-left', '+');
    mount(leftGroup, 'markdown-table-remove-column-left', '删除最左侧一列', 'column-left-remove', '-');
    mount(rightGroup, 'markdown-table-add-column-right', '右侧新增一列', 'column-right', '+');
    mount(rightGroup, 'markdown-table-remove-column-right', '删除最右侧一列', 'column-right-remove', '-');
    mount(bottomGroup, 'markdown-table-add-row', '下方新增一行', 'row', '+');
    mount(bottomGroup, 'markdown-table-remove-row', '删除最后一行', 'row-remove', '-');
    mount(bottomGroup, 'markdown-table-remove', '删除整张表格', 'table-remove', '×');
  });
};

const findTableIndexFromWrapper = (wrapper: HTMLElement) => {
  const wrappers = Array.from(previewRef.value?.querySelectorAll<HTMLElement>('.markdown-table-scroll') ?? []);
  return wrappers.indexOf(wrapper);
};

const scheduleRender = () => {
  pendingPreviewScrollTop.value = previewScrollRef.value?.scrollTop ?? pendingPreviewScrollTop.value;
  closeOpenCodeLanguageMenus();
  if (renderTimer) {
    clearTimeout(renderTimer);
  }

  const currentRenderVersion = ++renderVersion;
  isPreviewReady = false;
  completedRenderVersion = null;

  renderTimer = setTimeout(async () => {
    activeRenderTasks += 1;
    isRenderingMermaid = true;
    try {
      const renderer = await loadMarkdownRenderer();
      html.value = renderer.renderMarkdown(props.content || '');
      await nextTick();
      wrapMarkdownTables();
      decorateMarkdownTables();
      decorateMarkdownImages();
      decorateCodeBlocks();
      await resolveLocalImageSources();
      if (previewRef.value) {
        await renderer.renderMermaidDiagrams(
          previewRef.value,
          props.theme,
          settingsStore.markdownMermaidTheme,
          settingsStore.markdownMermaidNodeColor,
          settingsStore.markdownPreviewTheme,
        );
        decorateMermaidViewers();
      }
      if (currentRenderVersion === renderVersion && latestEditorScrollState.value) {
        syncPreviewScroll(latestEditorScrollState.value);
      }
      if (currentRenderVersion === renderVersion && previewScrollRef.value) {
        previewScrollRef.value.scrollTop = pendingPreviewScrollTop.value;
      }
    } finally {
      if (currentRenderVersion !== renderVersion) {
        activeRenderTasks -= 1;
        isRenderingMermaid = activeRenderTasks > 0;
        isPreviewReady = activeRenderTasks === 0 && completedRenderVersion === renderVersion;
        return;
      }
      completedRenderVersion = currentRenderVersion;
      activeRenderTasks -= 1;
      isRenderingMermaid = activeRenderTasks > 0;
      isPreviewReady = activeRenderTasks === 0 && completedRenderVersion === renderVersion;
    }
  }, 150);
};

defineExpose({
  scrollToSourceLine: (line: number) => {
    if (!isPreviewReady || isRenderingMermaid || !previewRef.value) {
      return;
    }

    const sourceLine = Number.isFinite(line) ? Math.max(1, Math.floor(line)) : 1;
    const target = previewRef.value.querySelector<HTMLElement>(`[data-source-line="${sourceLine}"]`);
    target?.scrollIntoView({ block: 'center' });
  },
});

watch(
  () => [
    props.content,
    props.theme,
    settingsStore.markdownMermaidTheme,
    settingsStore.markdownMermaidNodeColor,
    settingsStore.markdownPreviewTheme,
  ],
  async () => {
    closeContextMenu();
    if (pendingLocalTableEdit) {
      const localEdit = pendingLocalTableEdit;
      pendingLocalTableEdit = null;
      if (localEdit.content === props.content && await refreshLocalTable(localEdit)) return;
    }
    scheduleRender();
  },
  { immediate: true },
);

watch(
  () => props.editorScrollState,
  (state) => {
    if (!state) {
      return;
    }
    latestEditorScrollState.value = state;
    syncPreviewScroll(state);
  },
  { deep: true },
);

watch(() => settingsStore.uiLanguage, updateCodeBlockControlLabels);
watch(() => settingsStore.markdownPreviewTheme, closeOpenCodeLanguageMenus);

onMounted(() => {
  document.addEventListener('mousedown', handleGlobalPointerDown);
  document.addEventListener('selectionchange', updateSelectionToolbar);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  window.addEventListener('keydown', handleGlobalKeydown);
});

onBeforeUnmount(() => {
  pendingTableRestoreFrames.forEach((frame) => cancelAnimationFrame(frame));
  pendingTableRestoreFrames.clear();
  renderVersion += 1;
  completedRenderVersion = null;
  isPreviewReady = false;
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }
  document.removeEventListener('mousedown', handleGlobalPointerDown);
  document.removeEventListener('selectionchange', updateSelectionToolbar);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  window.removeEventListener('keydown', handleGlobalKeydown);
  closeContextMenu();
  closeOpenCodeLanguageMenus();
});
</script>

<style scoped>
.markdown-preview-content :deep(.markdown-code-toolbar) {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font: 500 11px/1.2 var(--font-ui, system-ui, sans-serif);
  user-select: none;
}

.markdown-preview-content :deep(.markdown-code-language-menu) {
  position: relative;
}

.markdown-preview-content :deep(.markdown-code-language-select),
.markdown-preview-content :deep(.markdown-code-copy-button) {
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 1px solid var(--preview-code-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--preview-code-bg) 88%, var(--preview-surface));
  color: var(--preview-code-text);
  font: 500 11px/1.2 var(--font-ui, system-ui, sans-serif);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--preview-text) 8%, transparent);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, opacity 120ms ease;
}

.markdown-preview-content :deep(.markdown-code-language-select) {
  max-width: min(160px, calc(100vw - 88px));
  gap: 6px;
  padding: 0 7px 0 8px;
  white-space: nowrap;
}

.markdown-preview-content :deep(.markdown-code-language-label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.markdown-preview-content :deep(.markdown-code-language-select svg) {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.72;
}

.markdown-preview-content :deep(.markdown-code-copy-button) {
  width: 28px;
  flex: 0 0 auto;
  padding: 0;
  opacity: 0.82;
}

.markdown-preview-content :deep(.markdown-code-copy-button svg) {
  display: block;
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.markdown-preview-content :deep(.markdown-code-language-select:hover),
.markdown-preview-content :deep(.markdown-code-copy-button:hover) {
  border-color: var(--preview-link);
  background: color-mix(in srgb, var(--preview-code-bg) 68%, var(--preview-link) 8%);
  color: var(--preview-heading);
  opacity: 1;
}

.markdown-preview-content :deep(.markdown-code-language-select:focus-visible),
.markdown-preview-content :deep(.markdown-code-copy-button:focus-visible),
.markdown-preview-content :deep(.markdown-code-language-option:focus-visible) {
  outline: 2px solid var(--preview-link);
  outline-offset: 2px;
}

:global(.markdown-code-language-list) {
  position: fixed;
  z-index: 10;
  width: max-content;
  min-width: 0;
  max-width: min(240px, calc(100vw - 32px));
  max-height: min(280px, 60vh);
  overflow: auto;
  box-sizing: border-box;
  padding: 5px;
  border: 1px solid var(--preview-menu-border);
  border-radius: 9px;
  background: var(--preview-menu-bg);
  color: var(--preview-menu-text);
  box-shadow: var(--preview-menu-shadow);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--preview-menu-text) 28%, transparent) transparent;
  overscroll-behavior: contain;
}

:global(.markdown-code-language-list[hidden]) {
  display: none;
}

:global(.markdown-code-language-option) {
  width: 100%;
  min-height: 27px;
  display: flex;
  align-items: center;
  gap: 7px;
  box-sizing: border-box;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: 500 11px/1.3 var(--font-ui, system-ui, sans-serif);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 100ms ease, color 100ms ease;
  -webkit-tap-highlight-color: transparent;
}

:global(.markdown-code-language-option::before) {
  width: 13px;
  flex: 0 0 13px;
  content: '';
  color: var(--preview-link);
  text-align: center;
}

:global(.markdown-code-language-option[aria-selected="true"]) {
  background: var(--preview-menu-hover-bg);
  color: var(--preview-menu-hover-text);
  font-weight: 600;
}

:global(.markdown-code-language-option[aria-selected="true"]::before) {
  content: '✓';
  font-weight: 700;
}

:global(.markdown-code-language-option:hover) {
  background: var(--preview-menu-hover-bg);
  color: var(--preview-menu-hover-text);
}

.markdown-preview-content :deep(.markdown-code-copy-button--standalone) {
  position: absolute;
  top: 8px;
  right: 8px;
}

.markdown-preview-content :deep(.markdown-code-copy-button:active),
.markdown-preview-content :deep(.markdown-code-language-select:active) {
  transform: translateY(1px);
  box-shadow: none;
}

:global(.markdown-code-language-option:focus-visible) {
  outline: 2px solid var(--preview-link);
  outline-offset: 2px;
}

.markdown-preview-content :deep(pre) {
  position: relative;
  padding-top: 42px;
  padding-right: 12px;
}

.markdown-preview {
  --preview-bg: #f6f8fc;
  --preview-surface: #ffffff;
  --preview-text: #243245;
  --preview-heading: #0f172a;
  --preview-heading-accent: rgba(59, 130, 246, 0.18);
  --preview-muted: #526176;
  --preview-border: rgba(148, 163, 184, 0.3);
  --preview-quote-border: #93c5fd;
  --preview-quote-bg: rgba(219, 234, 254, 0.55);
  --preview-inline-code-bg: rgba(37, 99, 235, 0.08);
  --preview-inline-code-text: #1d4ed8;
  --preview-code-bg: #f8fafc;
  --preview-code-text: #1e293b;
  --preview-code-border: rgba(148, 163, 184, 0.35);
  --preview-link: #2563eb;
  --preview-link-hover: #1d4ed8;
  --preview-table-header-bg: rgba(226, 232, 240, 0.7);
  --preview-table-row-alt: rgba(248, 250, 252, 0.95);
  --preview-mermaid-error-bg: rgba(254, 226, 226, 0.9);
  --preview-mermaid-error-border: rgba(248, 113, 113, 0.45);
  --preview-mermaid-error-text: #991b1b;
  --preview-menu-bg: rgba(255, 255, 255, 0.96);
  --preview-menu-border: rgba(148, 163, 184, 0.25);
  --preview-menu-shadow: 0 18px 36px rgba(15, 23, 42, 0.16);
  --preview-menu-text: #334155;
  --preview-menu-hover-bg: rgba(37, 99, 235, 0.08);
  --preview-menu-hover-text: #0f172a;
  --preview-menu-disabled-text: #94a3b8;
  position: relative;
  width: 100%;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  overflow: auto;
  background: var(--preview-bg);
  color: var(--preview-text);
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.markdown-preview--docs-clean {
  --preview-bg: #f5f8fc;
  --preview-surface: #ffffff;
  --preview-text: #243245;
  --preview-heading: #0f172a;
  --preview-heading-accent: rgba(96, 165, 250, 0.18);
  --preview-muted: #526176;
  --preview-border: rgba(148, 163, 184, 0.28);
  --preview-quote-border: #60a5fa;
  --preview-quote-bg: rgba(219, 234, 254, 0.62);
  --preview-inline-code-bg: rgba(59, 130, 246, 0.08);
  --preview-inline-code-text: #1d4ed8;
  --preview-code-bg: #eff6ff;
  --preview-code-text: #1e293b;
  --preview-code-border: rgba(148, 163, 184, 0.32);
  --preview-link: #2563eb;
  --preview-link-hover: #1d4ed8;
  --preview-table-header-bg: rgba(226, 232, 240, 0.9);
  --preview-table-row-alt: rgba(248, 250, 252, 0.92);
  --preview-mermaid-error-bg: rgba(254, 242, 242, 0.95);
  --preview-mermaid-error-border: rgba(248, 113, 113, 0.45);
  --preview-mermaid-error-text: #991b1b;
  --preview-menu-bg: rgba(255, 255, 255, 0.98);
  --preview-menu-border: rgba(203, 213, 225, 0.85);
  --preview-menu-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
  --preview-menu-text: #334155;
  --preview-menu-hover-bg: rgba(37, 99, 235, 0.08);
  --preview-menu-hover-text: #0f172a;
  --preview-menu-disabled-text: #94a3b8;
}

.markdown-preview--paper-soft {
  --preview-bg: #f4ecd8;
  --preview-surface: rgba(255, 251, 240, 0.96);
  --preview-text: #4d4438;
  --preview-heading: #342a21;
  --preview-heading-accent: rgba(191, 145, 91, 0.18);
  --preview-muted: #76695a;
  --preview-border: rgba(145, 123, 97, 0.28);
  --preview-quote-border: #bf915b;
  --preview-quote-bg: rgba(245, 228, 194, 0.68);
  --preview-inline-code-bg: rgba(166, 124, 82, 0.12);
  --preview-inline-code-text: #8c4b1f;
  --preview-code-bg: #f8efe1;
  --preview-code-text: #4b3b2d;
  --preview-code-border: rgba(145, 123, 97, 0.3);
  --preview-link: #9d5f26;
  --preview-link-hover: #7a4218;
  --preview-table-header-bg: rgba(233, 216, 189, 0.82);
  --preview-table-row-alt: rgba(255, 250, 242, 0.82);
  --preview-mermaid-error-bg: rgba(255, 239, 234, 0.9);
  --preview-mermaid-error-border: rgba(234, 88, 12, 0.35);
  --preview-mermaid-error-text: #9a3412;
  --preview-menu-bg: rgba(255, 251, 243, 0.97);
  --preview-menu-border: rgba(145, 123, 97, 0.32);
  --preview-menu-shadow: 0 18px 38px rgba(75, 59, 45, 0.18);
  --preview-menu-text: #5c4b3e;
  --preview-menu-hover-bg: rgba(191, 145, 91, 0.14);
  --preview-menu-hover-text: #342a21;
  --preview-menu-disabled-text: #a79885;
}

.markdown-preview--editorial-warm {
  --preview-bg: #fcf4ee;
  --preview-surface: rgba(255, 250, 246, 0.98);
  --preview-text: #45332d;
  --preview-heading: #2c1814;
  --preview-heading-accent: rgba(190, 92, 64, 0.18);
  --preview-muted: #735851;
  --preview-border: rgba(166, 120, 110, 0.3);
  --preview-quote-border: #c26b4f;
  --preview-quote-bg: rgba(249, 221, 212, 0.62);
  --preview-inline-code-bg: rgba(194, 107, 79, 0.12);
  --preview-inline-code-text: #9a3412;
  --preview-code-bg: #fff1eb;
  --preview-code-text: #4a2d25;
  --preview-code-border: rgba(166, 120, 110, 0.28);
  --preview-link: #b45309;
  --preview-link-hover: #92400e;
  --preview-table-header-bg: rgba(248, 221, 212, 0.85);
  --preview-table-row-alt: rgba(255, 247, 243, 0.9);
  --preview-mermaid-error-bg: rgba(254, 226, 226, 0.92);
  --preview-mermaid-error-border: rgba(220, 38, 38, 0.34);
  --preview-mermaid-error-text: #991b1b;
  --preview-menu-bg: rgba(255, 248, 244, 0.98);
  --preview-menu-border: rgba(166, 120, 110, 0.32);
  --preview-menu-shadow: 0 18px 42px rgba(78, 45, 37, 0.16);
  --preview-menu-text: #5b433c;
  --preview-menu-hover-bg: rgba(194, 107, 79, 0.12);
  --preview-menu-hover-text: #2c1814;
  --preview-menu-disabled-text: #b09a93;
}

.markdown-preview--graphite-night {
  --preview-bg: #13181f;
  --preview-surface: rgba(21, 28, 38, 0.96);
  --preview-text: #d6dde8;
  --preview-heading: #f8fafc;
  --preview-heading-accent: rgba(94, 234, 212, 0.18);
  --preview-muted: #9aa7bb;
  --preview-border: rgba(100, 116, 139, 0.34);
  --preview-quote-border: #5eead4;
  --preview-quote-bg: rgba(45, 212, 191, 0.08);
  --preview-inline-code-bg: rgba(45, 212, 191, 0.12);
  --preview-inline-code-text: #99f6e4;
  --preview-code-bg: #0f172a;
  --preview-code-text: #e2e8f0;
  --preview-code-border: rgba(71, 85, 105, 0.48);
  --preview-link: #7dd3fc;
  --preview-link-hover: #bae6fd;
  --preview-table-header-bg: rgba(30, 41, 59, 0.92);
  --preview-table-row-alt: rgba(15, 23, 42, 0.8);
  --preview-mermaid-error-bg: rgba(127, 29, 29, 0.32);
  --preview-mermaid-error-border: rgba(248, 113, 113, 0.4);
  --preview-mermaid-error-text: #fecaca;
  --preview-menu-bg: rgba(18, 24, 34, 0.98);
  --preview-menu-border: rgba(71, 85, 105, 0.54);
  --preview-menu-shadow: 0 20px 45px rgba(2, 6, 23, 0.45);
  --preview-menu-text: #d6dde8;
  --preview-menu-hover-bg: rgba(45, 212, 191, 0.12);
  --preview-menu-hover-text: #f8fafc;
  --preview-menu-disabled-text: #64748b;
}

.markdown-preview--mint-grove {
  --preview-bg: #eaf2e9;
  --preview-surface: #f8fcf6;
  --preview-text: #30483a;
  --preview-heading: #193b2b;
  --preview-heading-accent: rgba(57, 132, 91, 0.26);
  --preview-muted: #587363;
  --preview-border: rgba(80, 125, 91, 0.28);
  --preview-quote-border: #4c9a69;
  --preview-quote-bg: rgba(220, 239, 222, 0.74);
  --preview-inline-code-bg: rgba(57, 132, 91, 0.12);
  --preview-inline-code-text: #276440;
  --preview-code-bg: #edf6ed;
  --preview-code-text: #263f31;
  --preview-code-border: rgba(80, 125, 91, 0.32);
  --preview-link: #287347;
  --preview-link-hover: #1b5934;
  --preview-table-header-bg: rgba(204, 229, 207, 0.86);
  --preview-table-row-alt: rgba(231, 243, 231, 0.82);
  --preview-mermaid-error-bg: #fff0ed;
  --preview-mermaid-error-border: rgba(220, 90, 75, 0.35);
  --preview-mermaid-error-text: #923c32;
  --preview-menu-bg: #f8fcf6;
  --preview-menu-border: rgba(80, 125, 91, 0.38);
  --preview-menu-shadow: 0 18px 40px rgba(35, 73, 46, 0.18);
  --preview-menu-text: #30483a;
  --preview-menu-hover-bg: #e2f0e3;
  --preview-menu-hover-text: #193b2b;
  --preview-menu-disabled-text: #758d7d;
}

.markdown-preview--mint-grove .markdown-preview-content :deep(h1),
.markdown-preview--mint-grove .markdown-preview-content :deep(h2) {
  padding-left: 0.65em;
  border-left: 3px solid var(--preview-quote-border);
}

.markdown-preview--lavender-letter {
  --preview-bg: #f0edf7;
  --preview-surface: #fbf9ff;
  --preview-text: #453d55;
  --preview-heading: #302544;
  --preview-heading-accent: rgba(123, 96, 171, 0.24);
  --preview-muted: #716783;
  --preview-border: rgba(117, 99, 149, 0.28);
  --preview-quote-border: #8a70b8;
  --preview-quote-bg: rgba(235, 228, 247, 0.78);
  --preview-inline-code-bg: rgba(123, 96, 171, 0.12);
  --preview-inline-code-text: #5e438e;
  --preview-code-bg: #f3effa;
  --preview-code-text: #413650;
  --preview-code-border: rgba(117, 99, 149, 0.3);
  --preview-link: #7048a3;
  --preview-link-hover: #523278;
  --preview-table-header-bg: rgba(223, 214, 240, 0.86);
  --preview-table-row-alt: rgba(244, 240, 250, 0.92);
  --preview-mermaid-error-bg: #fff0f2;
  --preview-mermaid-error-border: rgba(210, 90, 112, 0.34);
  --preview-mermaid-error-text: #8f3348;
  --preview-menu-bg: #fbf9ff;
  --preview-menu-border: rgba(117, 99, 149, 0.38);
  --preview-menu-shadow: 0 18px 40px rgba(58, 42, 83, 0.18);
  --preview-menu-text: #453d55;
  --preview-menu-hover-bg: #eee8f8;
  --preview-menu-hover-text: #302544;
  --preview-menu-disabled-text: #817892;
}

.markdown-preview--lavender-letter .markdown-preview-content :deep(h1),
.markdown-preview--lavender-letter .markdown-preview-content :deep(h2),
.markdown-preview--lavender-letter .markdown-preview-content :deep(h3) {
  font-family: Georgia, 'Noto Serif', 'Songti SC', serif;
  letter-spacing: 0.015em;
}

.markdown-preview--deep-ocean {
  --preview-bg: #0d1b2a;
  --preview-surface: #122337;
  --preview-text: #dce8f3;
  --preview-heading: #f1f7fc;
  --preview-heading-accent: rgba(74, 180, 218, 0.28);
  --preview-muted: #9bb1c4;
  --preview-border: rgba(105, 151, 180, 0.32);
  --preview-quote-border: #4bb8d8;
  --preview-quote-bg: rgba(31, 91, 119, 0.24);
  --preview-inline-code-bg: rgba(75, 184, 216, 0.16);
  --preview-inline-code-text: #8fe4f5;
  --preview-code-bg: #0a1725;
  --preview-code-text: #dce8f3;
  --preview-code-border: rgba(105, 151, 180, 0.38);
  --preview-link: #79d7ed;
  --preview-link-hover: #b2eff8;
  --preview-table-header-bg: rgba(30, 69, 94, 0.94);
  --preview-table-row-alt: rgba(18, 47, 68, 0.8);
  --preview-mermaid-error-bg: rgba(127, 29, 29, 0.38);
  --preview-mermaid-error-border: rgba(248, 113, 113, 0.45);
  --preview-mermaid-error-text: #fecaca;
  --preview-menu-bg: #122337;
  --preview-menu-border: rgba(105, 151, 180, 0.5);
  --preview-menu-shadow: 0 20px 48px rgba(2, 10, 20, 0.55);
  --preview-menu-text: #dce8f3;
  --preview-menu-hover-bg: rgba(75, 184, 216, 0.18);
  --preview-menu-hover-text: #f1f7fc;
  --preview-menu-disabled-text: #8ba2b5;
  overflow-anchor: none;
}

.markdown-preview--deep-ocean .markdown-preview-content :deep(h1),
.markdown-preview--deep-ocean .markdown-preview-content :deep(h2) {
  text-shadow: 0 0 22px rgba(75, 184, 216, 0.12);
}

.markdown-preview-content {
  width: 100%;
  max-width: none;
  min-width: 0;
  margin: 0;
  padding: 24px;
  box-sizing: border-box;
  color: var(--preview-text);
  font-size: v-bind('`${previewFontSize}px`');
  line-height: 1.65;
  background: var(--preview-surface);
  min-height: 100%;
  overflow-wrap: anywhere;
}

.markdown-selection-toolbar {
  position: absolute;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 3px;
  max-width: calc(100% - 16px);
  padding: 4px;
  border: 1px solid var(--preview-border);
  border-radius: 8px;
  background: var(--preview-surface);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--preview-text) 18%, transparent);
  left: 0;
  transform: none;
}

.markdown-table-delete-confirm {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, #0f172a 28%, transparent);
}

.markdown-table-delete-confirm__panel {
  width: min(360px, calc(100vw - 32px));
  padding: 20px;
  border: 1px solid var(--preview-border);
  border-radius: 10px;
  background: var(--preview-surface);
  color: var(--preview-text);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.22);
}

.markdown-table-delete-confirm__panel h2 {
  margin: 0 0 8px;
  color: var(--preview-heading);
  font-size: 16px;
}

.markdown-table-delete-confirm__panel p {
  margin: 0;
  color: var(--preview-muted);
  font-size: 13px;
}

.markdown-table-delete-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.markdown-table-delete-confirm__actions button {
  min-width: 64px;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--preview-border);
  border-radius: 6px;
  background: var(--preview-surface);
  color: var(--preview-text);
  cursor: pointer;
}

.markdown-table-delete-confirm__actions button:hover,
.markdown-table-delete-confirm__actions button:focus-visible {
  border-color: var(--preview-link);
  outline: none;
}

.markdown-table-delete-confirm__actions .markdown-table-delete-confirm__danger {
  border-color: #c2413b;
  background: #c2413b;
  color: #fff;
}

.markdown-selection-toolbar button {
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--preview-text);
  font: 600 12px/1 var(--font-ui, system-ui, sans-serif);
  cursor: pointer;
}

.markdown-selection-toolbar button:hover,
.markdown-selection-toolbar button:focus-visible {
  background: var(--preview-menu-hover-bg);
  color: var(--preview-link);
  outline: none;
}

.markdown-preview-content :deep(.markdown-table-control) {
  min-width: 28px;
  min-height: 28px;
  border: 1px solid var(--preview-border);
  border-radius: 6px;
  background: var(--preview-surface);
  color: var(--preview-heading);
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.markdown-preview-content :deep(.markdown-table-control:hover),
.markdown-preview-content :deep(.markdown-table-control:focus-visible) {
  border-color: var(--preview-link);
  color: var(--preview-link);
}

.markdown-preview-content :deep(.markdown-table-control-group) {
  position: absolute;
  z-index: 2;
  display: flex;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease, background-color 120ms ease;
}

.markdown-preview-content :deep(.markdown-table-shell:hover .markdown-table-control-group),
.markdown-preview-content :deep(.markdown-table-control:focus-visible) {
  opacity: 1;
  pointer-events: auto;
}

.markdown-preview-content :deep(.markdown-table-control-group--left) {
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
  flex-direction: column;
}

.markdown-preview-content :deep(.markdown-table-control-group--right) {
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  flex-direction: column;
}

.markdown-preview-content :deep(.markdown-table-control-group--bottom) {
  left: 50%;
  bottom: 4px;
  transform: translateX(-50%);
  flex-direction: row;
}

.markdown-preview-content :deep([contenteditable="true"]) {
  outline: none;
  cursor: text;
}

.markdown-preview-content :deep(h1),
.markdown-preview-content :deep(h2),
.markdown-preview-content :deep(h3) {
  line-height: 1.3;
  margin-top: 1.3em;
  margin-bottom: 0.45em;
  color: var(--preview-heading);
}

.markdown-preview-content :deep(h1),
.markdown-preview-content :deep(h2) {
  padding-bottom: 0.18em;
  border-bottom: 1px solid var(--preview-heading-accent);
}

.markdown-preview-content :deep(p),
.markdown-preview-content :deep(li),
.markdown-preview-content :deep(td),
.markdown-preview-content :deep(th) {
  color: var(--preview-text);
}

.markdown-preview-content :deep(strong) {
  color: var(--preview-heading);
}

.markdown-preview-content :deep(code) {
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  background: var(--preview-inline-code-bg);
  color: var(--preview-inline-code-text);
}

.markdown-preview-content :deep(pre) {
  overflow: auto;
  overflow-wrap: normal;
  word-break: normal;
  padding: 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--preview-code-border);
  background: var(--preview-code-bg);
  color: var(--preview-code-text);
}

.markdown-preview-content :deep(pre code) {
  padding: 0;
  overflow-wrap: normal;
  word-break: normal;
  background: transparent;
  color: inherit;
}

.markdown-preview-content :deep(pre.monaco-editor) {
  width: auto;
  height: auto;
  contain: none;
}

.markdown-preview-content :deep(blockquote) {
  margin: 1.1rem 0;
  padding: 0.85rem 1rem;
  border-left: 4px solid var(--preview-quote-border);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  background: var(--preview-quote-bg);
  color: var(--preview-muted);
}

.markdown-preview-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--preview-border);
  margin: 1.75rem 0;
}

.markdown-preview-content :deep(a) {
  color: var(--preview-link);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--preview-link) 35%, transparent);
  text-underline-offset: 0.15em;
}

.markdown-preview-content :deep(a:hover) {
  color: var(--preview-link-hover);
}

.markdown-preview-content :deep(img),
.markdown-preview-content :deep(svg),
.markdown-preview-content :deep(video),
.markdown-preview-content :deep(canvas) {
  display: block;
  max-width: 100%;
  height: auto;
  box-sizing: border-box;
}

.markdown-preview-content :deep(img) {
  object-fit: contain;
}

.markdown-preview-content :deep(.markdown-preview-image) {
  cursor: zoom-in;
}

.markdown-preview-content :deep(.markdown-table-scroll) {
  width: 100%;
  max-width: 100%;
  margin: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-inline: contain;
  -webkit-overflow-scrolling: touch;
}

.markdown-preview-content :deep(.markdown-table-shell) {
  position: relative;
  width: 100%;
  max-width: 100%;
  margin: 1rem 0;
  overflow-anchor: none;
}

.markdown-preview-content :deep(table) {
  width: max-content;
  min-width: 100%;
  white-space: nowrap;
  border-collapse: collapse;
  border: 1px solid var(--preview-border);
  border-radius: var(--radius-md);
  box-sizing: border-box;
}

.markdown-preview-content :deep(th),
.markdown-preview-content :deep(td) {
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--preview-border);
  overflow-wrap: anywhere;
}

.markdown-preview-content :deep(th) {
  background: var(--preview-table-header-bg);
  color: var(--preview-heading);
}

.markdown-preview-content :deep(tr:nth-child(even) td) {
  background: var(--preview-table-row-alt);
}

.markdown-preview-content :deep(.markdown-mermaid-error) {
  margin: 12px 0;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--preview-mermaid-error-border);
  background: var(--preview-mermaid-error-bg);
  color: var(--preview-mermaid-error-text);
}

.markdown-preview-content :deep(.markdown-mermaid-diagram) {
  margin: 12px 0;
  overflow: auto;
}

.markdown-preview-content :deep(.markdown-mermaid-viewer) {
  margin: 12px 0;
  overflow: hidden;
  border: 1px solid var(--preview-border);
  border-radius: var(--radius-md);
  background: var(--preview-bg);
}

.markdown-preview-content :deep(.markdown-mermaid-toolbar) {
  min-height: 40px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--preview-border);
  background: var(--preview-surface);
}

.markdown-preview-content :deep(.markdown-mermaid-toolbar button) {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--preview-text);
  font: 500 11px/1.2 var(--font-ui, system-ui, sans-serif);
  cursor: pointer;
}

.markdown-preview-content :deep(.markdown-mermaid-toolbar button:hover:not(:disabled)) {
  border-color: var(--preview-border);
  background: var(--preview-bg);
}

.markdown-preview-content :deep(.markdown-mermaid-toolbar button:disabled) {
  opacity: 0.45;
  cursor: not-allowed;
}

.markdown-preview-content :deep(.markdown-mermaid-toolbar button:focus-visible) {
  outline: 2px solid var(--preview-link);
  outline-offset: 2px;
}

.markdown-preview-content :deep(.markdown-mermaid-toolbar button svg) {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.markdown-preview-content :deep(.markdown-mermaid-view-toggle) {
  display: inline-flex;
  padding: 2px;
  border-radius: var(--radius-sm);
  background: var(--preview-bg);
}

.markdown-preview-content :deep(.markdown-mermaid-view-toggle button[aria-pressed="true"]) {
  background: var(--preview-surface);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.14);
}

.markdown-preview-content :deep(.markdown-mermaid-toolbar-spacer) {
  flex: 1;
}

.markdown-preview-content :deep(.markdown-mermaid-export-menu) {
  position: relative;
}

.markdown-preview-content :deep(.markdown-mermaid-export-options) {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 4;
  display: grid;
  min-width: 150px;
  padding: 4px;
  border: 1px solid var(--preview-border);
  border-radius: var(--radius-sm);
  background: var(--preview-surface);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
}

.markdown-preview-content :deep(.markdown-mermaid-export-options[hidden]) {
  display: none;
}

.markdown-preview-content :deep(.markdown-mermaid-export-options button) {
  justify-content: flex-start;
  width: 100%;
}

.markdown-preview-content :deep(.markdown-mermaid-zoom-level) {
  min-width: 36px;
  color: var(--preview-muted);
  font-size: 11px;
  text-align: center;
}

.markdown-preview-content :deep(.markdown-mermaid-canvas) {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  box-sizing: border-box;
  overscroll-behavior: contain;
  padding: 20px;
}

.markdown-preview-content :deep(.markdown-mermaid-canvas-content) {
  position: relative;
  min-width: 100%;
  min-height: 100%;
}

.markdown-preview-content :deep(.markdown-mermaid-canvas svg) {
  display: block;
  height: auto;
}

.markdown-preview-content :deep(.markdown-mermaid-source[hidden]),
.markdown-preview-content :deep(.markdown-mermaid-canvas[hidden]) {
  display: none !important;
}

.markdown-preview-content :deep(.markdown-mermaid-source) {
  margin: 0;
  border: 0;
  border-radius: 0;
  padding: 16px;
}

.markdown-preview-content :deep(.markdown-mermaid-viewer:fullscreen) {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: var(--preview-bg);
}

.markdown-preview-content :deep(.markdown-mermaid-viewer:fullscreen .markdown-mermaid-canvas) {
  flex: 1;
  min-height: 0;
  height: auto !important;
}

@media (prefers-reduced-motion: reduce) {
  :global(.markdown-code-language-list:not([hidden])),
  .markdown-preview-content :deep(.markdown-mermaid-canvas svg) {
    animation: none;
  }
}

@keyframes markdown-code-language-enter {
  from {
    opacity: 0;
    transform: translateY(-3px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

:global(.markdown-code-language-list:not([hidden])) {
  animation: markdown-code-language-enter 120ms ease-out;
}

.preview-context-menu {
  position: fixed;
  z-index: 60;
  min-width: 220px;
  padding: 6px;
  border-radius: var(--radius-md);
  border: 1px solid var(--preview-menu-border);
  background: var(--preview-menu-bg);
  box-shadow: var(--preview-menu-shadow);
  backdrop-filter: blur(14px);
}

.preview-context-menu.markdown-preview--docs-clean {
  --preview-menu-bg: #ffffff;
  --preview-menu-border: #cbd5e1;
  --preview-menu-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
  --preview-menu-text: #334155;
  --preview-menu-hover-bg: #eaf1ff;
  --preview-menu-hover-text: #0f172a;
  --preview-menu-disabled-text: #64748b;
  --preview-border: rgba(148, 163, 184, 0.45);
}

.preview-context-menu.markdown-preview--paper-soft {
  --preview-menu-bg: #fffbf3;
  --preview-menu-border: #c7b49b;
  --preview-menu-shadow: 0 18px 38px rgba(75, 59, 45, 0.2);
  --preview-menu-text: #5c4b3e;
  --preview-menu-hover-bg: #f3e6cf;
  --preview-menu-hover-text: #342a21;
  --preview-menu-disabled-text: #817360;
  --preview-border: rgba(145, 123, 97, 0.42);
}

.preview-context-menu.markdown-preview--editorial-warm {
  --preview-menu-bg: #fff8f4;
  --preview-menu-border: #c9a69d;
  --preview-menu-shadow: 0 18px 42px rgba(78, 45, 37, 0.2);
  --preview-menu-text: #5b433c;
  --preview-menu-hover-bg: #f8e7df;
  --preview-menu-hover-text: #2c1814;
  --preview-menu-disabled-text: #88736d;
  --preview-border: rgba(166, 120, 110, 0.42);
}

.preview-context-menu.markdown-preview--graphite-night {
  --preview-menu-bg: #121822;
  --preview-menu-border: #475569;
  --preview-menu-shadow: 0 20px 45px rgba(2, 6, 23, 0.45);
  --preview-menu-text: #d6dde8;
  --preview-menu-hover-bg: rgba(45, 212, 191, 0.16);
  --preview-menu-hover-text: #f8fafc;
  --preview-menu-disabled-text: #94a3b8;
  --preview-border: rgba(100, 116, 139, 0.48);
}

.preview-context-menu.markdown-preview--mint-grove {
  --preview-menu-bg: #f8fcf6;
  --preview-menu-border: rgba(80, 125, 91, 0.38);
  --preview-menu-shadow: 0 18px 40px rgba(35, 73, 46, 0.18);
  --preview-menu-text: #30483a;
  --preview-menu-hover-bg: #e2f0e3;
  --preview-menu-hover-text: #193b2b;
  --preview-menu-disabled-text: #758d7d;
  --preview-border: rgba(80, 125, 91, 0.42);
}

.preview-context-menu.markdown-preview--lavender-letter {
  --preview-menu-bg: #fbf9ff;
  --preview-menu-border: rgba(117, 99, 149, 0.38);
  --preview-menu-shadow: 0 18px 40px rgba(58, 42, 83, 0.18);
  --preview-menu-text: #453d55;
  --preview-menu-hover-bg: #eee8f8;
  --preview-menu-hover-text: #302544;
  --preview-menu-disabled-text: #817892;
  --preview-border: rgba(117, 99, 149, 0.42);
}

.preview-context-menu.markdown-preview--deep-ocean {
  --preview-menu-bg: #122337;
  --preview-menu-border: rgba(105, 151, 180, 0.5);
  --preview-menu-shadow: 0 20px 48px rgba(2, 10, 20, 0.55);
  --preview-menu-text: #dce8f3;
  --preview-menu-hover-bg: rgba(75, 184, 216, 0.18);
  --preview-menu-hover-text: #f1f7fc;
  --preview-menu-disabled-text: #8ba2b5;
  --preview-border: rgba(105, 151, 180, 0.48);
}

.preview-context-menu-divider {
  height: 1px;
  margin: 6px 4px;
  background: var(--preview-border);
}

.preview-context-menu-item {
  display: block;
  width: 100%;
  margin: 0;
  padding: 9px 10px;
  border: none;
  border-radius: var(--radius-sm);
  text-align: left;
  color: var(--preview-menu-text);
  background: transparent;
  font-size: var(--font-size-ui-md, 13px);
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.preview-context-menu-item:hover {
  background: var(--preview-menu-hover-bg);
  color: var(--preview-menu-hover-text);
}

.preview-context-menu-item.disabled {
  color: var(--preview-menu-disabled-text);
  opacity: 0.9;
  cursor: not-allowed;
}
</style>
