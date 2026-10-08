<template>
  <div class="editor-core-shell" @contextmenu.prevent @paste.capture="handleClipboardPaste">
    <div ref="editorContainer" class="editor-core" data-testid="editor-container"></div>

    <div
      v-if="markdownSelectionToolbar.visible"
      class="markdown-selection-toolbar"
      :style="{ top: `${markdownSelectionToolbar.y}px`, left: `${markdownSelectionToolbar.x}px` }"
      data-testid="markdown-selection-toolbar"
      @mousedown.prevent.stop
    >
      <button
        v-for="action in markdownQuickActions"
        :key="action.value"
        type="button"
        class="markdown-selection-action"
        :data-testid="`markdown-selection-action-${action.value}`"
        :title="action.label"
        :aria-label="action.label"
        @click="applyMarkdownAction(action.value)"
      >{{ action.glyph }}</button>
    </div>

    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        ref="contextMenuRef"
        class="editor-context-menu"
        :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
        @click.stop
      >
      <template v-for="entry in contextMenuEntries" :key="entry.key">
        <div v-if="entry.type === 'divider'" class="editor-context-divider"></div>
        <div
          v-else-if="entry.type === 'submenu'"
          class="editor-context-submenu"
          :data-testid="`editor-context-submenu-${entry.key}`"
          @mouseenter="handleContextSubmenuEnter(entry.key, $event)"
          @mouseleave="scheduleContextSubmenuClose(entry.key)"
        >
          <button
            type="button"
            class="editor-context-item editor-context-submenu-trigger"
            :disabled="!entry.enabled"
            @mouseenter="handleContextSubmenuEnter(entry.key, $event)"
            @mouseover="handleContextSubmenuEnter(entry.key, $event)"
            @focus="handleContextSubmenuEnter(entry.key, $event)"
            @click.stop="handleContextSubmenuEnter(entry.key, $event)"
          >
            <span>{{ entry.label }}</span><span class="editor-context-chevron">›</span>
          </button>
        </div>
        <button
          v-else
          type="button"
          class="editor-context-item"
          :data-testid="`editor-context-item-${entry.key}`"
          :disabled="!entry.enabled"
          @click="handleContextMenuEntryClick(entry)"
        >
          {{ entry.label }}
        </button>
      </template>
      </div>

      <!--
        二级菜单必须脱离主菜单的滚动容器渲染。主菜单为了适配窄窗口会动态
        设置 overflow-y:auto，若面板作为其后代，即使使用 position:fixed 也
        可能被 overflow/backdrop-filter 建立的 containing block 截断或只能在
        主菜单内部滚动。将面板直接 Teleport 到 body 后，定位始终使用视口坐标。
      -->
      <template v-for="entry in contextMenuEntries" :key="`panel-${entry.key}`">
        <div
          v-if="contextMenu.visible && entry.type === 'submenu' && activeContextSubmenu === entry.key"
          class="editor-context-submenu-panel"
          :data-testid="`editor-context-submenu-panel-${entry.key}`"
          :style="{
            top: `${contextSubmenuPositions[entry.key]?.top ?? 8}px`,
            left: `${contextSubmenuPositions[entry.key]?.left ?? 8}px`,
          }"
          @mousedown.stop
          @mouseenter="cancelContextSubmenuClose"
          @mouseleave="scheduleContextSubmenuClose(entry.key)"
        >
          <button
            v-for="child in entry.items"
            :key="child.key"
            type="button"
            class="editor-context-item"
            :data-testid="`editor-context-item-${child.key}`"
            :disabled="!child.enabled"
            @click="handleContextMenuEntryClick(child)"
          >{{ child.label }}</button>
        </div>
      </template>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as monaco from '@/lib/monaco/editor';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { useNotificationStore } from '@/stores/notification';
import { getEditorCoreI18n } from '@/i18n/ui';
import { appCommands } from '@/lib/tauri';
import { ensureMonacoSetup } from '@/lib/monaco/setupMonaco';
import { getMonacoLspBridge, type MonacoHierarchyItem } from '@/services/lsp/monacoLspBridge';
import {
  registerMonacoLspModel,
  saveMonacoLspModel,
  syncMonacoLspModel,
  unregisterMonacoLspModel,
} from '@/lib/monaco/lspModel';
import { pathToUri, untitledUri } from '@/services/lsp/pathUri';

interface EditorCoreProps {
  modelId: string;
  filePath?: string | null;
  openedModelIds?: string[];
  value?: string;
  language?: string;
  isLargeFile?: boolean;
  readOnly?: boolean;
  theme?: string;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
}

const props = withDefaults(defineProps<EditorCoreProps>(), {
  filePath: null,
  openedModelIds: () => [],
  value: '',
  language: 'plaintext',
  isLargeFile: false,
  readOnly: false,
  theme: 'vs-dark',
  options: () => ({}),
});

const SUPPORTED_LANGUAGES = [
  { id: 'plaintext', label: 'Plain Text' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'rust', label: 'Rust' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'json', label: 'JSON' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'scss', label: 'SCSS' },
  { id: 'xml', label: 'XML' },
  { id: 'yaml', label: 'YAML' },
  { id: 'sql', label: 'SQL' },
  { id: 'shell', label: 'Shell' },
  { id: 'go', label: 'Go' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
];

const emit = defineEmits<{
  'content-change': [content: string, modelId: string];
  'cursor-change': [position: { line: number; column: number }];
  'scroll-change': [state: { top: number; height: number; scrollHeight: number }];
  'model-save': [];
  'markdown-image-request': [];
  'markdown-image-paste': [payload: { fileName: string; bytes: Uint8Array }];
  'find-references': [];
  'error': [error: Error];
}>();

const editorContainer = ref<HTMLElement | null>(null);
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);
const disposables = ref<monaco.IDisposable[]>([]);

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const notificationStore = useNotificationStore();
const i18n = computed(() => getEditorCoreI18n(settingsStore.uiLanguage));

const modelCache = new Map<string, monaco.editor.ITextModel>();
const viewStateCache = new Map<string, monaco.editor.ICodeEditorViewState | null>();
const activeModelId = ref(props.modelId);
const modelIdsByModel = new WeakMap<monaco.editor.ITextModel, string>();
let pendingContentModel: monaco.editor.ITextModel | null = null;
let pendingContentModelId: string | null = null;
let suppressContentEmit = false;
let referencesCancellation: monaco.CancellationTokenSource | null = null;
let hierarchyCancellation: monaco.CancellationTokenSource | null = null;

let contentUpdateTimer: ReturnType<typeof setTimeout> | null = null;
let lineCountSyncTimer: ReturnType<typeof setTimeout> | null = null;
const CONTENT_UPDATE_DELAY = 50;
const MODEL_STRICT_COMPARE_MAX_CHARS = 300_000;

const contextMenuRef = ref<HTMLElement | null>(null);
const activeContextSubmenu = ref<string | null>(null);
const contextSubmenuPositions = ref<Record<string, { top: number; left: number }>>({});
let contextSubmenuCloseTimer: ReturnType<typeof setTimeout> | null = null;
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
});
const markdownSelectionToolbar = ref({ visible: false, x: 0, y: 0 });
const CONTEXT_MENU_MARGIN = 8;

type ContextMenuDivider = {
  type: 'divider';
  key: string;
};

type ContextMenuItem = {
  type: 'item';
  key: string;
  label: string;
  enabled: boolean;
  action: () => Promise<void> | void;
};

type ContextMenuSubmenu = {
  type: 'submenu';
  key: string;
  label: string;
  enabled: boolean;
  items: ContextMenuItem[];
};

type ContextMenuEntry = ContextMenuDivider | ContextMenuItem | ContextMenuSubmenu;

type MarkdownAction = 'heading' | 'bold' | 'italic' | 'bold-italic' | 'strike' | 'quote' | 'bullet-list' | 'ordered-list' | 'task-list' | 'code' | 'link' | 'timestamp' | 'table' | 'horizontal-rule' | 'details' | 'mermaid' | 'toc' | 'image';
const markdownQuickActions: Array<{ value: MarkdownAction; label: string; glyph: string }> = [
  { value: 'bold', label: '粗体', glyph: 'B' },
  { value: 'italic', label: '斜体', glyph: 'I' },
  { value: 'strike', label: '删除线', glyph: 'S' },
  { value: 'link', label: '链接', glyph: '↗' },
  { value: 'code', label: '代码', glyph: '</>' },
  { value: 'quote', label: '引用', glyph: '❝' },
  { value: 'bullet-list', label: '无序列表', glyph: '•' },
];

const emitScrollState = () => {
  if (!editor.value) {
    return;
  }

  emit('scroll-change', {
    top: editor.value.getScrollTop(),
    height: editor.value.getLayoutInfo().height,
    scrollHeight: editor.value.getScrollHeight(),
  });
};

const syncLineCountToStore = () => {
  if (!editor.value) {
    return;
  }
  const model = editor.value.getModel();
  if (!model) {
    return;
  }
  editorStore.setLineCount(model.getLineCount());
};

const scheduleLineCountSync = () => {
  if (lineCountSyncTimer) {
    clearTimeout(lineCountSyncTimer);
  }
  lineCountSyncTimer = setTimeout(() => {
    lineCountSyncTimer = null;
    syncLineCountToStore();
  }, 0);
};

const applyLargeFilePerformanceOptions = () => {
  if (!editor.value) {
    return;
  }

  if (props.isLargeFile) {
    editor.value.updateOptions({
      minimap: { enabled: false },
      occurrencesHighlight: 'off',
      selectionHighlight: false,
      codeLens: false,
      folding: false,
      renderValidationDecorations: 'off',
    });
    return;
  }

  editor.value.updateOptions({
    minimap: { enabled: settingsStore.minimap },
    occurrencesHighlight: 'singleFile',
    selectionHighlight: true,
    codeLens: true,
    folding: true,
    renderValidationDecorations: 'on',
  });
};

const normalizeModelUri = (modelId: string, filePath?: string | null) =>
  monaco.Uri.parse(filePath ? pathToUri(filePath) : untitledUri(modelId));

const updateModelContent = (
  model: monaco.editor.ITextModel,
  nextValue: string,
  options?: { strictEqualityCheck?: boolean },
) => {
  const strictEqualityCheck = options?.strictEqualityCheck ?? false;
  if (model.getValueLength() === nextValue.length) {
    if (!strictEqualityCheck) {
      return;
    }
    if (model.getValue() === nextValue) {
      return;
    }
  }

  suppressContentEmit = true;
  model.setValue(nextValue);
  suppressContentEmit = false;
};

const getOrCreateModel = (modelId: string, content: string, language: string, filePath?: string | null) => {
  const cachedModel = modelCache.get(modelId);
  if (cachedModel && !cachedModel.isDisposed()) {
    modelIdsByModel.set(cachedModel, modelId);
    if (cachedModel.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(cachedModel, language);
    }
    registerMonacoLspModel(cachedModel, { filePath: filePath ?? null, languageId: language });
    return cachedModel;
  }

  const uri = normalizeModelUri(modelId, filePath);
  const existingModel = monaco.editor.getModel(uri);
  const model = existingModel ?? monaco.editor.createModel(content, language, uri);
  if (model.getLanguageId() !== language) {
    monaco.editor.setModelLanguage(model, language);
  }

  modelCache.set(modelId, model);
  modelIdsByModel.set(model, modelId);
  registerMonacoLspModel(model, {
    filePath: modelId === props.modelId ? props.filePath : null,
    languageId: language,
  });
  return model;
};

/**
 * 打开代码文件后后台预热语言服务，让首次悬浮、定义跳转和引用查询不承担下载延迟。
 * 该调用不会阻塞编辑器；Markdown/纯文本等没有 LSP 的语言会快速 no-op。
 */
const warmUpLspModel = (model: monaco.editor.ITextModel, filePath?: string | null) => {
  syncMonacoLspModel(model, {
    filePath: filePath ?? null,
    languageId: model.getLanguageId(),
  });
};

const cleanupOrphanModels = (openedModelIds: string[]) => {
  const keepIds = new Set(openedModelIds);
  keepIds.add(props.modelId);

  for (const [modelId, model] of modelCache.entries()) {
    if (keepIds.has(modelId)) {
      continue;
    }

    viewStateCache.delete(modelId);
    modelCache.delete(modelId);
    if (!model.isDisposed()) {
      model.dispose();
    }
  }
};

const flushPendingContent = () => {
  if (contentUpdateTimer) {
    clearTimeout(contentUpdateTimer);
    contentUpdateTimer = null;
  }

  const model = pendingContentModel;
  const modelId = pendingContentModelId;
  pendingContentModel = null;
  pendingContentModelId = null;

  if (!model || !modelId || model.isDisposed()) {
    return;
  }

  const content = model.getValue();
  emit('content-change', content, modelId);
  syncMonacoLspModel(model, {
    filePath: modelId === props.modelId ? props.filePath : null,
    languageId: model.getLanguageId(),
  });
  if (editor.value?.getModel() === model) {
    editorStore.setContent(content);
  }
  scheduleLineCountSync();
};

const activateModel = (nextModelId: string) => {
  if (!editor.value) {
    return;
  }

  // 切换标签前先提交当前模型的待处理内容，避免快速切换丢失输入。
  flushPendingContent();

  const currentModel = editor.value.getModel();
  if (currentModel && activeModelId.value) {
    viewStateCache.set(activeModelId.value, editor.value.saveViewState());
  }

  const targetModel = getOrCreateModel(nextModelId, props.value, props.language, nextModelId === props.modelId ? props.filePath : null);
  if (editor.value.getModel() !== targetModel) {
    editor.value.setModel(targetModel);
  }

  if (targetModel.getLanguageId() !== props.language) {
    monaco.editor.setModelLanguage(targetModel, props.language);
  }
  updateModelContent(targetModel, props.value, {
    strictEqualityCheck: props.value.length <= MODEL_STRICT_COMPARE_MAX_CHARS,
  });

  const cachedViewState = viewStateCache.get(nextModelId);
  if (cachedViewState) {
    editor.value.restoreViewState(cachedViewState);
  }

  activeModelId.value = nextModelId;
  applyLargeFilePerformanceOptions();
  syncUndoRedoState();
  warmUpLspModel(targetModel, nextModelId === props.modelId ? props.filePath : null);
  scheduleLineCountSync();
  emitScrollState();
};

const triggerEditorAction = async (actionId: string) => {
  if (!editor.value) {
    return;
  }

  editor.value.focus();
  const action = editor.value.getAction(actionId);
  if (action) {
    await action.run();
    return;
  }

  editor.value.trigger('tau-editor-context-menu', actionId, null);
};

const triggerEditorCommand = (commandId: string) => {
  if (!editor.value) {
    return;
  }
  editor.value.focus();
  editor.value.trigger('tau-editor-context-menu', commandId, null);
};

const isMarkdownEditor = computed(() => props.language.toLowerCase() === 'markdown');

const updateMarkdownSelectionToolbar = () => {
  const instance = editor.value;
  const container = editorContainer.value;
  const selection = instance?.getSelection();
  if (!instance || !container || !isMarkdownEditor.value || props.readOnly || !selection || selection.isEmpty()) {
    markdownSelectionToolbar.value.visible = false;
    return;
  }
  const position = instance.getScrolledVisiblePosition(selection.getStartPosition());
  if (!position) {
    markdownSelectionToolbar.value.visible = false;
    return;
  }
  const width = 248;
  markdownSelectionToolbar.value = {
    visible: true,
    x: Math.max(8, Math.min(position.left, container.clientWidth - width - 8)),
    y: Math.max(8, position.top - 42),
  };
};

const setSelectionByOffsets = (model: monaco.editor.ITextModel, start: number, end: number) => {
  if (!editor.value) return;
  const a = model.getPositionAt(Math.max(0, start));
  const b = model.getPositionAt(Math.max(0, end));
  editor.value.setSelection({ startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column });
};

const applyMarkdownAction = (action: MarkdownAction) => {
  const instance = editor.value;
  const model = instance?.getModel();
  const selection = instance?.getSelection();
  if (!instance || !model || !selection || !isMarkdownEditor.value || props.readOnly) return;
  const selected = model.getValueInRange(selection);
  const start = model.getOffsetAt(selection.getStartPosition());
  const end = model.getOffsetAt(selection.getEndPosition());
  let range: monaco.IRange = selection;
  let text = selected;
  let nextStart = start;
  let nextEnd = end;
  const wrap = (before: string, after: string, placeholder: string) => {
    text = selected ? `${before}${selected}${after}` : `${before}${placeholder}${after}`;
    nextStart = selected ? start : start + before.length;
    nextEnd = selected ? end + before.length + after.length : nextStart + placeholder.length;
  };
  const prefix = (prefixText: string, placeholder: string) => {
    const startLine = selection.startLineNumber;
    const endLine = selection.endLineNumber;
    range = new monaco.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine));
    const lines = model.getValueInRange(range) || placeholder;
    text = lines.split('\n').map((line) => `${prefixText}${line}`).join('\n');
    nextStart = model.getOffsetAt({ lineNumber: startLine, column: 1 });
    nextEnd = nextStart + text.length;
  };
  switch (action) {
    case 'bold': wrap('**', '**', '粗体'); break;
    case 'italic': wrap('*', '*', '斜体'); break;
    case 'bold-italic': wrap('***', '***', '粗斜体'); break;
    case 'strike': wrap('~~', '~~', '删除线'); break;
    case 'link': wrap('[', '](https://)', '链接文本'); break;
    case 'code': selected.includes('\n') ? wrap('```\n', '\n```', '代码') : wrap('`', '`', '代码'); break;
    case 'quote': prefix('> ', '引用'); break;
    case 'bullet-list': prefix('- ', '列表项'); break;
    case 'ordered-list': prefix('1. ', '列表项'); break;
    case 'task-list': prefix('- [ ] ', '任务项'); break;
    case 'timestamp': {
      text = new Date().toLocaleString('zh-CN', { hour12: false });
      nextStart = start;
      nextEnd = start + text.length;
      break;
    }
    case 'table': text = '| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |'; nextEnd = start + text.length; break;
    case 'horizontal-rule': text = '\n---\n'; nextEnd = start + text.length; break;
    case 'details': text = '<details>\n<summary>折叠标题</summary>\n\n内容\n\n</details>'; nextEnd = start + text.length; break;
    case 'mermaid': text = '```mermaid\ngraph TD\n  A[开始] --> B[下一步]\n```'; nextEnd = start + text.length; break;
    case 'toc': text = '[TOC]'; nextEnd = start + text.length; break;
    case 'image': wrap('![', '](image-url){width=60%}', '图片描述'); break;
  }
  instance.executeEdits('tau-markdown-format', [{ range, text, forceMoveMarkers: true }]);
  setSelectionByOffsets(model, nextStart, nextEnd);
  instance.focus();
  markdownSelectionToolbar.value.visible = false;
};

const applyMarkdownCode = (language: string) => {
  const instance = editor.value;
  const model = instance?.getModel();
  const selection = instance?.getSelection();
  if (!instance || !model || !selection || !isMarkdownEditor.value || props.readOnly) return;

  const selected = model.getValueInRange(selection);
  const start = model.getOffsetAt(selection.getStartPosition());
  const end = model.getOffsetAt(selection.getEndPosition());
  if (language === '__inline__') {
    const text = selected ? `\`${selected}\`` : '`代码`';
    instance.executeEdits('tau-markdown-inline-code', [{ range: selection, text, forceMoveMarkers: true }]);
    setSelectionByOffsets(model, selected ? start : start + 1, selected ? end + 2 : start + 3);
  } else {
    const safeLanguage = (language.trim().split(/\s+/)[0] || 'plaintext').replace(/[^a-zA-Z0-9_+#.-]/g, '');
    const normalizedLanguage = safeLanguage || 'plaintext';
    const text = selected
      ? `\`\`\`${normalizedLanguage}\n${selected}\n\`\`\``
      : `\`\`\`${normalizedLanguage}\n代码\n\`\`\``;
    instance.executeEdits('tau-markdown-code-block', [{ range: selection, text, forceMoveMarkers: true }]);
    setSelectionByOffsets(model, selected ? start : start + normalizedLanguage.length + 4, selected ? end + normalizedLanguage.length + 8 : start + normalizedLanguage.length + 6);
  }
  instance.focus();
  markdownSelectionToolbar.value.visible = false;
};

const handleClipboardPaste = async (event: ClipboardEvent) => {
  if (!isMarkdownEditor.value || props.readOnly) return;
  const items = Array.from(event.clipboardData?.items ?? []);
  const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
  const file = imageItem?.getAsFile();
  if (!file) return;

  event.preventDefault();
  event.stopPropagation();
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const fileName = file.name || `pasted-image-${Date.now()}.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  emit('markdown-image-paste', { fileName, bytes });
};

const applyMarkdownHeading = (level: number) => {
  const safeLevel = Math.min(6, Math.max(1, Math.floor(level)));
  const instance = editor.value;
  const model = instance?.getModel();
  const selection = instance?.getSelection();
  if (!instance || !model || !selection || !isMarkdownEditor.value || props.readOnly) return;
  const range = new monaco.Range(selection.startLineNumber, 1, selection.endLineNumber, model.getLineMaxColumn(selection.endLineNumber));
  const source = model.getValueInRange(range);
  const prefix = `${'#'.repeat(safeLevel)} `;
  const text = source.split('\n').map((line) => `${prefix}${line.replace(/^#{1,6}\s+/, '')}`).join('\n');
  const start = model.getOffsetAt({ lineNumber: selection.startLineNumber, column: 1 });
  instance.executeEdits('tau-markdown-heading', [{ range, text, forceMoveMarkers: true }]);
  setSelectionByOffsets(model, start, start + text.length);
  instance.focus();
  markdownSelectionToolbar.value.visible = false;
};

const syncUndoRedoState = () => {
  const model = editor.value?.getModel();
  if (!model) {
    editorStore.updateUndoRedoState(false, false);
    return;
  }

  const undoModel = model as monaco.editor.ITextModel & {
    canUndo?: () => boolean;
    canRedo?: () => boolean;
  };
  editorStore.updateUndoRedoState(
    undoModel.canUndo?.() ?? false,
    undoModel.canRedo?.() ?? false,
  );
};

const handlePasteCommand = async () => {
  if (!editor.value || props.readOnly) {
    return;
  }

  editor.value.focus();

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      if (text.length > 0) {
        const selections = editor.value.getSelections() ?? [];
        if (selections.length > 0) {
          editor.value.executeEdits(
            'tau-editor-context-menu',
            selections.map((selection) => ({
              range: selection,
              text,
              forceMoveMarkers: true,
            })),
          );
          return;
        }
      }
    }
  } catch {
    // ignore and fallback to monaco default paste command
  }

  triggerEditorCommand('editor.action.clipboardPasteAction');
};

const closeContextMenu = () => {
  cancelContextSubmenuClose();
  contextMenu.value.visible = false;
  activeContextSubmenu.value = null;
};

const cancelContextSubmenuClose = () => {
  if (contextSubmenuCloseTimer) {
    clearTimeout(contextSubmenuCloseTimer);
    contextSubmenuCloseTimer = null;
  }
};

const handleContextSubmenuEnter = async (key: string, event: Event) => {
  cancelContextSubmenuClose();
  activeContextSubmenu.value = key;
  const trigger = event.currentTarget as HTMLElement | null;
  if (!trigger) return;
  // Teleport 面板只有在状态更新后的下一帧才会挂载，等待挂载后才能读取真实尺寸。
  await nextTick();
  positionContextSubmenu(key, trigger);
};

const scheduleContextSubmenuClose = (key: string) => {
  cancelContextSubmenuClose();
  contextSubmenuCloseTimer = setTimeout(() => {
    if (activeContextSubmenu.value === key) {
      activeContextSubmenu.value = null;
    }
    contextSubmenuCloseTimer = null;
  }, 320);
};

const positionContextSubmenu = (key: string, trigger: HTMLElement | null) => {
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const panel = document.querySelector<HTMLElement>(`[data-testid="editor-context-submenu-panel-${key}"]`);
  const width = Math.max(panel?.getBoundingClientRect().width || panel?.offsetWidth || 0, 190);
  const height = Math.max(panel?.getBoundingClientRect().height || panel?.offsetHeight || 0, 48);
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  // 让触发项与二级面板无明显断层，鼠标可以直接横向移入面板。
  const preferredLeft = rect.right + width <= viewportWidth - CONTEXT_MENU_MARGIN
    ? rect.right
    : rect.left - width;
  const preferredTop = rect.bottom + height <= viewportHeight - CONTEXT_MENU_MARGIN
    ? rect.top
    : rect.bottom - height;
  const left = Math.max(
    CONTEXT_MENU_MARGIN,
    Math.min(preferredLeft, Math.max(CONTEXT_MENU_MARGIN, viewportWidth - width - CONTEXT_MENU_MARGIN)),
  );
  const top = Math.max(
    CONTEXT_MENU_MARGIN,
    Math.min(preferredTop, Math.max(CONTEXT_MENU_MARGIN, viewportHeight - height - CONTEXT_MENU_MARGIN)),
  );
  contextSubmenuPositions.value[key] = { top, left };
};

const openContextMenu = (x: number, y: number) => {
  activeContextSubmenu.value = null;
  contextMenu.value = {
    visible: true,
    x: Math.max(CONTEXT_MENU_MARGIN, x),
    y: Math.max(CONTEXT_MENU_MARGIN, y),
  };

  void nextTick(() => {
    const menu = contextMenuRef.value;
    if (!menu) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const visibleHeight = Math.max(160, viewportHeight - CONTEXT_MENU_MARGIN * 2);
    menu.style.maxHeight = `${visibleHeight}px`;
    menu.style.overflowY = 'auto';
    const x = contextMenu.value.x + menuWidth > viewportWidth - CONTEXT_MENU_MARGIN
      ? contextMenu.value.x - menuWidth
      : contextMenu.value.x;
    const y = contextMenu.value.y + menuHeight > viewportHeight - CONTEXT_MENU_MARGIN
      ? contextMenu.value.y - menuHeight
      : contextMenu.value.y;
    contextMenu.value.x = Math.max(CONTEXT_MENU_MARGIN, Math.min(x, viewportWidth - menuWidth - CONTEXT_MENU_MARGIN));
    contextMenu.value.y = Math.max(CONTEXT_MENU_MARGIN, Math.min(y, viewportHeight - menuHeight - CONTEXT_MENU_MARGIN));
  });
};

const handleCopyFilePath = async () => {
  const filePath = props.filePath?.trim();
  if (!filePath) {
    notificationStore.info(i18n.value.contextNoFilePath);
    return;
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(filePath);
    } else {
      throw new Error(i18n.value.contextCopyPathFailed);
    }
    notificationStore.success(i18n.value.contextCopyPathDone, filePath);
  } catch (error: any) {
    notificationStore.error(i18n.value.contextCopyPathFailed, error?.message || i18n.value.contextCopyPathFailed);
  }
};

const handleRevealInFolder = async () => {
  const filePath = props.filePath?.trim();
  if (!filePath) {
    notificationStore.info(i18n.value.contextNoFilePath);
    return;
  }

  try {
    await appCommands.revealInFileManager(filePath);
  } catch (error: any) {
    notificationStore.error(i18n.value.contextRevealFailed, error?.message || i18n.value.contextRevealFailed);
  }
};

const hasFilePath = computed(() => Boolean(props.filePath && props.filePath.trim().length > 0));

const contextMenuEntries = computed<ContextMenuEntry[]>(() => [
  {
    type: 'item',
    key: 'undo',
    label: i18n.value.contextUndo,
    enabled: true,
    action: () => triggerEditorCommand('undo'),
  },
  {
    type: 'item',
    key: 'redo',
    label: i18n.value.contextRedo,
    enabled: true,
    action: () => triggerEditorCommand('redo'),
  },
  { type: 'divider', key: 'divider-edit-1' },
  {
    type: 'item',
    key: 'cut',
    label: i18n.value.contextCut,
    enabled: !props.readOnly,
    action: () => triggerEditorCommand('editor.action.clipboardCutAction'),
  },
  {
    type: 'item',
    key: 'copy',
    label: i18n.value.contextCopy,
    enabled: true,
    action: () => triggerEditorCommand('editor.action.clipboardCopyAction'),
  },
  {
    type: 'item',
    key: 'paste',
    label: i18n.value.contextPaste,
    enabled: !props.readOnly,
    action: handlePasteCommand,
  },
  {
    type: 'item',
    key: 'select-all',
    label: i18n.value.contextSelectAll,
    enabled: true,
    action: () => triggerEditorCommand('editor.action.selectAll'),
  },
  { type: 'divider', key: 'divider-edit-2' },
  {
    type: 'item',
    key: 'go-to-definition',
    label: '跳转到定义',
    enabled: true,
    action: () => triggerEditorAction('editor.action.revealDefinition'),
  },
  {
    type: 'item',
    key: 'go-to-declaration',
    label: '跳转到声明',
    enabled: true,
    action: () => triggerEditorAction('editor.action.revealDeclaration'),
  },
  {
    type: 'item',
    key: 'go-to-type-definition',
    label: '跳转到类型定义',
    enabled: true,
    action: () => triggerEditorAction('editor.action.goToTypeDefinition'),
  },
  {
    type: 'item',
    key: 'go-to-implementation',
    label: '跳转到实现',
    enabled: true,
    action: () => triggerEditorAction('editor.action.goToImplementation'),
  },
  {
    type: 'item',
    key: 'peek-definition',
    label: '查看定义',
    enabled: true,
    action: () => triggerEditorAction('editor.action.peekDefinition'),
  },
  {
    type: 'item',
    key: 'find-references',
    label: '查找所有引用',
    enabled: true,
    action: () => emit('find-references'),
  },
  {
    type: 'item',
    key: 'peek-references',
    label: '查看引用',
    enabled: true,
    action: () => triggerEditorAction('editor.action.referenceSearch.trigger'),
  },
  {
    type: 'item',
    key: 'rename-symbol',
    label: '重命名符号',
    enabled: !props.readOnly,
    action: () => triggerEditorAction('editor.action.rename'),
  },
  { type: 'divider', key: 'divider-navigation' },
  {
    type: 'item',
    key: 'find',
    label: i18n.value.contextFind,
    enabled: true,
    action: () => triggerEditorAction('actions.find'),
  },
  {
    type: 'item',
    key: 'replace',
    label: i18n.value.contextReplace,
    enabled: true,
    action: () => triggerEditorAction('editor.action.startFindReplaceAction'),
  },
  ...(isMarkdownEditor.value ? [
    { type: 'divider' as const, key: 'divider-markdown' },
    {
      type: 'submenu' as const,
      key: 'markdown-format',
      label: 'Markdown 格式',
      enabled: !props.readOnly,
      items: ([
        ['bold', '粗体'], ['italic', '斜体'], ['strike', '删除线'], ['quote', '引用'],
        ['bullet-list', '无序列表'], ['ordered-list', '有序列表'], ['task-list', '任务列表'],
      ] as Array<[MarkdownAction, string]>).map(([action, label]) => ({
        type: 'item' as const, key: `markdown-${action}`, label: `插入${label}`, enabled: !props.readOnly, action: () => applyMarkdownAction(action),
      })),
    },
    {
      type: 'submenu' as const,
      key: 'markdown-insert',
      label: 'Markdown 插入',
      enabled: !props.readOnly,
      items: ([
        ['link', '链接'], ['code', '代码块'], ['image', '图片'], ['table', '表格'],
        ['horizontal-rule', '分割线'], ['details', '折叠块'], ['mermaid', 'Mermaid 图'],
      ] as Array<[MarkdownAction, string]>).map(([action, label]) => ({
        type: 'item' as const,
        key: `markdown-${action}`,
        label: `插入${label}`,
        enabled: !props.readOnly,
        action: action === 'image' ? () => emit('markdown-image-request') : () => applyMarkdownAction(action),
      })),
    },
    {
      type: 'submenu' as const,
      key: 'markdown-tools',
      label: 'Markdown 工具',
      enabled: !props.readOnly,
      items: ([
        ['toc', '目录'], ['timestamp', '时间戳'],
      ] as Array<[MarkdownAction, string]>).map(([action, label]) => ({
        type: 'item' as const, key: `markdown-${action}`, label: `插入${label}`, enabled: !props.readOnly, action: () => applyMarkdownAction(action),
      })),
    },
  ] : []),
  { type: 'divider', key: 'divider-path' },
  {
    type: 'item',
    key: 'copy-file-path',
    label: i18n.value.contextCopyFilePath,
    enabled: hasFilePath.value,
    action: handleCopyFilePath,
  },
  {
    type: 'item',
    key: 'reveal-in-folder',
    label: i18n.value.contextRevealInFolder,
    enabled: hasFilePath.value,
    action: handleRevealInFolder,
  },
]);

const handleContextMenuEntryClick = (entry: ContextMenuEntry) => {
  if (entry.type !== 'item' || !entry.enabled) {
    return;
  }

  closeContextMenu();
  void entry.action();
};

/**
 * 注册当前生效的主题包到 Monaco，并返回应使用的主题 id。
 * 注册失败时回退到内置主题，避免自定义主题导致编辑器无法渲染。
 */
const registerActiveMonacoTheme = (): string => {
  const definition = settingsStore.activeMonacoThemeDefinition;
  const fallback = settingsStore.monacoTheme || props.theme || 'vs-dark';
  if (!definition) {
    return fallback;
  }

  try {
    monaco.editor.defineTheme(settingsStore.activeMonacoThemeId, definition);
    return settingsStore.activeMonacoThemeId;
  } catch (error) {
    console.warn('[EditorCore] 自定义 Monaco 主题注册失败，已回退内置主题。', error);
    return fallback;
  }
};

const initEditor = () => {
  if (!editorContainer.value) return;

  try {
    ensureMonacoSetup();
    const monacoTheme = registerActiveMonacoTheme() || props.theme;
    const initialModel = getOrCreateModel(props.modelId, props.value, props.language, props.filePath);

    const largeFileOptimizations = {
      maxTokenizationLineLength: 10000,
      folding: true,
      largeFileOptimizations: true,
    };

    editor.value = monaco.editor.create(editorContainer.value, {
      model: initialModel,
      theme: monacoTheme,
      readOnly: props.readOnly,
      contextmenu: false,
      automaticLayout: true,
      minimap: { enabled: props.isLargeFile ? false : settingsStore.minimap },
      fontSize: settingsStore.fontSize,
      fontFamily: settingsStore.fontFamily,
      lineHeight: Math.round(settingsStore.lineHeight * 10),
      wordWrap: settingsStore.wordWrap ? ('on' as const) : ('off' as const),
      tabSize: settingsStore.tabSize,
      insertSpaces: settingsStore.insertSpaces,
      trimAutoWhitespace: settingsStore.trimTrailingWhitespace,
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: 'currentDocument',
      snippetSuggestions: 'inline',
      acceptSuggestionOnEnter: 'smart',
      tabCompletion: 'on',
      parameterHints: { enabled: true },
      ...largeFileOptimizations,
      ...props.options,
    });

    registerMonacoLspModel(initialModel, {
      filePath: props.filePath,
      languageId: props.language,
    });
    warmUpLspModel(initialModel, props.filePath);

    disposables.value.forEach((disposable) => disposable.dispose());
    disposables.value = [];

    const contentDisposable = editor.value.onDidChangeModelContent(() => {
      if (!editor.value || suppressContentEmit) return;
      const model = editor.value.getModel();
      if (!model) return;

      pendingContentModel = model;
      pendingContentModelId = modelIdsByModel.get(model) ?? activeModelId.value;

      if (contentUpdateTimer) {
        clearTimeout(contentUpdateTimer);
      }
      contentUpdateTimer = setTimeout(() => {
        contentUpdateTimer = null;
        flushPendingContent();
      }, CONTENT_UPDATE_DELAY);
    });
    disposables.value.push(contentDisposable);

    const cursorDisposable = editor.value.onDidChangeCursorPosition((event) => {
      emit('cursor-change', {
        line: event.position.lineNumber,
        column: event.position.column,
      });
      editorStore.updateCursorPosition(event.position.lineNumber, event.position.column);
    });
    disposables.value.push(cursorDisposable);

    const scrollDisposable = editor.value.onDidScrollChange(() => {
      emitScrollState();
      updateMarkdownSelectionToolbar();
    });
    disposables.value.push(scrollDisposable);

    const selectionDisposable = editor.value.onDidChangeCursorSelection(() => {
      if (!editor.value) return;
      const selection = editor.value.getSelection();
      if (!selection) return;

      const model = editor.value.getModel();
      if (!model) return;

      const start = model.getOffsetAt(selection.getStartPosition());
      const end = model.getOffsetAt(selection.getEndPosition());
      editorStore.updateSelection(start, end);
      updateMarkdownSelectionToolbar();
    });
    disposables.value.push(selectionDisposable);

    const undoRedoDisposable = editor.value.onDidChangeModelContent(() => {
      syncUndoRedoState();
    });
    disposables.value.push(undoRedoDisposable);
    syncUndoRedoState();

    const contextMenuDisposable = editor.value.onContextMenu((event) => {
      if (!editorContainer.value) {
        return;
      }

      event.event.preventDefault();
      event.event.stopPropagation();

      const bounds = editorContainer.value.getBoundingClientRect();
      const eventX = (event.event as any).posx ?? (event.event.browserEvent?.clientX ?? bounds.left);
      const eventY = (event.event as any).posy ?? (event.event.browserEvent?.clientY ?? bounds.top);

      // 菜单通过 Teleport 挂载到 body 且使用 fixed 定位，必须传入视口坐标。
      openContextMenu(eventX, eventY);
      markdownSelectionToolbar.value.visible = false;
    });
    disposables.value.push(contextMenuDisposable);

    editor.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit('model-save'));
    const lspNavigationShortcuts: Array<[number, string]> = [
      [monaco.KeyCode.F12, 'editor.action.revealDefinition'],
      [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU, 'editor.action.revealDeclaration'],
      [(monaco.KeyMod.Shift || 0) | monaco.KeyCode.F12, 'editor.action.referenceSearch.trigger'],
      [monaco.KeyCode.F2, 'editor.action.rename'],
      [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F12, 'editor.action.goToTypeDefinition'],
      [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.F12, 'editor.action.goToImplementation'],
      [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.F7, 'editor.action.referenceSearch.trigger'],
    ];
    for (const [keybinding, actionId] of lspNavigationShortcuts) {
      if (keybinding) {
        editor.value.addCommand(keybinding, () => {
          if (actionId === 'editor.action.referenceSearch.trigger') {
            emit('find-references');
            return;
          }
          void triggerEditorAction(actionId);
        });
      }
    }
    const markdownShortcuts: Array<[number, () => void]> = [
      [monaco.KeyCode.Digit1, () => applyMarkdownHeading(1)],
      [monaco.KeyCode.Digit2, () => applyMarkdownHeading(2)],
      [monaco.KeyCode.Digit3, () => applyMarkdownHeading(3)],
      [monaco.KeyCode.Digit4, () => applyMarkdownHeading(4)],
      [monaco.KeyCode.KeyB, () => applyMarkdownAction('bold')],
      [monaco.KeyCode.KeyI, () => applyMarkdownAction('italic')],
      [monaco.KeyCode.KeyQ, () => applyMarkdownAction('quote')],
      [monaco.KeyCode.KeyK, () => applyMarkdownAction('code')],
      [monaco.KeyCode.KeyO, () => applyMarkdownAction('ordered-list')],
      [monaco.KeyCode.KeyU, () => applyMarkdownAction('bullet-list')],
      [monaco.KeyCode.KeyG, () => emit('markdown-image-request')],
      [monaco.KeyCode.KeyL, () => applyMarkdownAction('link')],
      [monaco.KeyCode.KeyT, () => applyMarkdownAction('timestamp')],
    ];
    for (const [keyCode, handler] of markdownShortcuts) {
      editor.value.addCommand(monaco.KeyMod.CtrlCmd | keyCode, () => {
        if (isMarkdownEditor.value && !props.readOnly) handler();
      });
    }

    const ctrlB = monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB;
    const ctrlI = monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI;
    const applyBoldItalicShortcut = () => {
      if (isMarkdownEditor.value && !props.readOnly) {
        applyMarkdownAction('bold-italic');
      }
    };
    editor.value.addCommand(monaco.KeyMod.chord(ctrlB, ctrlI), applyBoldItalicShortcut);
    editor.value.addCommand(monaco.KeyMod.chord(ctrlI, ctrlB), applyBoldItalicShortcut);

    activeModelId.value = props.modelId;
    applyLargeFilePerformanceOptions();
    scheduleLineCountSync();
    cleanupOrphanModels(props.openedModelIds);
    emitScrollState();
  } catch (error) {
    emit('error', error as Error);
  }
};

defineExpose({
  getContent: () => editor.value?.getValue() || '',
  getPosition: () => {
    const position = editor.value?.getPosition();
    return position ? { line: position.lineNumber, column: position.column } : null;
  },
  setContent: (content: string) => {
    if (!editor.value) {
      return;
    }

    const model = editor.value.getModel();
    if (model) {
      updateModelContent(model, content, { strictEqualityCheck: true });
    }
  },
  focus: () => editor.value?.focus(),
  insertText: (text: string) => {
    const instance = editor.value;
    if (!instance) {
      return;
    }

    const selection = instance.getSelection();
    if (!selection) {
      return;
    }

    instance.executeEdits('tau-insert-text', [
      { range: selection, text, forceMoveMarkers: true },
    ]);
    instance.focus();
  },
  focusAtStart: () => {
    if (!editor.value) {
      return;
    }

    const startPosition = { lineNumber: 1, column: 1 };
    editor.value.focus();
    editor.value.setPosition(startPosition);
    editor.value.revealPositionInCenterIfOutsideViewport(startPosition);
  },
  revealLine: (line: number, column = 1) => {
    if (!editor.value) {
      return;
    }

    const model = editor.value.getModel();
    if (!model) {
      return;
    }

    const lineCount = model.getLineCount();
    if (lineCount < 1) {
      return;
    }

    const requestedLine = Number.isFinite(line) ? Math.floor(line) : 1;
    const requestedColumn = Number.isFinite(column) ? Math.floor(column) : 1;
    const lineNumber = Math.min(lineCount, Math.max(1, requestedLine));
    const maxColumn = model.getLineMaxColumn(lineNumber);
    const position = {
      lineNumber,
      column: Math.min(maxColumn, Math.max(1, requestedColumn)),
    };

    editor.value.setPosition(position);
    editor.value.revealPositionInCenterIfOutsideViewport(position);
    editor.value.focus();
  },
  layout: () => editor.value?.layout(),
  getSelectedText: () => {
    if (!editor.value) return '';
    const selection = editor.value.getSelection();
    if (!selection) return '';
    const model = editor.value.getModel();
    if (!model) return '';
    return model.getValueInRange(selection);
  },
  setLanguage: (language: string) => {
    if (!editor.value) {
      return;
    }

    const model = editor.value.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, language);
    }
  },
  setTheme: (theme: string) => {
    if (editor.value) {
      monaco.editor.setTheme(theme);
    }
  },
  triggerFindWidget: () => {
    void triggerEditorAction('actions.find');
  },
  triggerGoToLine: () => {
    void triggerEditorAction('editor.action.gotoLine');
  },
  goToDefinition: () => {
    void triggerEditorAction('editor.action.revealDefinition');
  },
  goToDeclaration: () => {
    void triggerEditorAction('editor.action.revealDeclaration');
  },
  goToTypeDefinition: () => {
    void triggerEditorAction('editor.action.goToTypeDefinition');
  },
  goToImplementation: () => {
    void triggerEditorAction('editor.action.goToImplementation');
  },
  peekDefinition: () => {
    void triggerEditorAction('editor.action.peekDefinition');
  },
  peekReferences: () => {
    void triggerEditorAction('editor.action.referenceSearch.trigger');
  },
  findReferences: () => {
    emit('find-references');
  },
  triggerNativeReferences: () => {
    void triggerEditorAction('editor.action.referenceSearch.trigger');
  },
  requestReferences: async () => {
    const model = editor.value?.getModel();
    const position = editor.value?.getPosition();
    const bridge = getMonacoLspBridge();
    if (!model || !position || !bridge) return null;
    referencesCancellation?.cancel();
    referencesCancellation?.dispose();
    referencesCancellation = new monaco.CancellationTokenSource();
    try {
      if (!await bridge.hasClient(model)) return null;
      const locations = await bridge.provideReferences(
        model,
        position,
        { includeDeclaration: true },
        referencesCancellation.token,
      );
      return locations ?? [];
    } finally {
      referencesCancellation?.dispose();
      referencesCancellation = null;
    }
  },
  cancelReferences: () => {
    referencesCancellation?.cancel();
  },
  requestCallHierarchy: async () => {
    const model = editor.value?.getModel();
    const position = editor.value?.getPosition();
    const bridge = getMonacoLspBridge();
    if (!model || !position || !bridge || !await bridge.hasClient(model)) return null;
    hierarchyCancellation?.cancel();
    hierarchyCancellation?.dispose();
    hierarchyCancellation = new monaco.CancellationTokenSource();
    try {
      const roots = await bridge.prepareCallHierarchy(model, position, hierarchyCancellation.token);
      const root = roots?.[0];
      if (!root) return { root: null, rows: [] };
      const [incoming, outgoing] = await Promise.all([
        bridge.provideIncomingCalls(model, root, hierarchyCancellation.token),
        bridge.provideOutgoingCalls(model, root, hierarchyCancellation.token),
      ]);
      return {
        root,
        rows: [
          ...(incoming || []).map((entry) => ({ direction: 'incoming' as const, item: entry.from })),
          ...(outgoing || []).map((entry) => ({ direction: 'outgoing' as const, item: entry.to })),
        ],
      };
    } finally {
      hierarchyCancellation?.dispose();
      hierarchyCancellation = null;
    }
  },
  requestTypeHierarchy: async () => {
    const model = editor.value?.getModel();
    const position = editor.value?.getPosition();
    const bridge = getMonacoLspBridge();
    if (!model || !position || !bridge || !await bridge.hasClient(model)) return null;
    hierarchyCancellation?.cancel();
    hierarchyCancellation?.dispose();
    hierarchyCancellation = new monaco.CancellationTokenSource();
    try {
      const roots = await bridge.prepareTypeHierarchy(model, position, hierarchyCancellation.token);
      const root = roots?.[0];
      if (!root) return { root: null, rows: [] };
      const [supertypes, subtypes] = await Promise.all([
        bridge.provideTypeHierarchySupertypes(model, root, hierarchyCancellation.token),
        bridge.provideTypeHierarchySubtypes(model, root, hierarchyCancellation.token),
      ]);
      return {
        root,
        rows: [
          ...(supertypes || []).map((entry) => ({ direction: 'supertype' as const, item: entry.item })),
          ...(subtypes || []).map((entry) => ({ direction: 'subtype' as const, item: entry.item })),
        ],
      };
    } finally {
      hierarchyCancellation?.dispose();
      hierarchyCancellation = null;
    }
  },
  cancelHierarchy: () => {
    hierarchyCancellation?.cancel();
  },
  renameSymbol: () => {
    void triggerEditorAction('editor.action.rename');
  },
  undo: () => {
    void triggerEditorAction('undo');
  },
  redo: () => {
    void triggerEditorAction('redo');
  },
  saveLspDocument: () => {
    const model = editor.value?.getModel();
    if (model) saveMonacoLspModel(model);
  },
  applyMarkdownAction,
  applyMarkdownHeading,
  applyMarkdownCode,
});

watch(
  () => settingsStore.monacoOptions,
  (newOptions) => {
    if (editor.value) {
      editor.value.updateOptions(newOptions);
      applyLargeFilePerformanceOptions();
    }
  },
  { deep: true },
);

watch(
  () => settingsStore.fontFamily,
  (newFontFamily) => {
    if (!editor.value) {
      return;
    }

    editor.value.updateOptions({ fontFamily: newFontFamily });
    monaco.editor.remeasureFonts();
    editor.value.layout();
  },
);

watch(
  () => props.theme,
  (newTheme) => {
    if (editor.value) {
      monaco.editor.setTheme(newTheme);
    }
  },
);

watch(
  () => settingsStore.monacoTheme,
  (newTheme) => {
    if (editor.value) {
      monaco.editor.setTheme(newTheme);
    }
  },
);

watch(
  () => [settingsStore.activeMonacoThemeId, settingsStore.activeMonacoThemeDefinition] as const,
  () => {
    const themeId = registerActiveMonacoTheme();
    if (editor.value && themeId) {
      monaco.editor.setTheme(themeId);
    }
  },
  { deep: true },
);

watch(
  () => props.modelId,
  (nextModelId) => {
    activateModel(nextModelId);
    cleanupOrphanModels(props.openedModelIds);
  },
);

watch(
  () => props.openedModelIds,
  (modelIds) => {
    cleanupOrphanModels(modelIds);
  },
  { deep: true },
);

watch(
  () => props.language,
  (nextLanguage) => {
    if (!editor.value) {
      return;
    }

    const model = editor.value.getModel();
    if (model && model.getLanguageId() !== nextLanguage) {
      monaco.editor.setModelLanguage(model, nextLanguage);
    }
  },
);

watch(
  () => props.filePath,
  (filePath) => {
    const model = editor.value?.getModel();
    if (!model) return;
    registerMonacoLspModel(model, {
      filePath: filePath ?? null,
      languageId: model.getLanguageId(),
    });
  },
);

watch(
  () => props.readOnly,
  (readOnly) => {
    if (editor.value) {
      editor.value.updateOptions({ readOnly });
    }
  },
);

watch(
  () => props.isLargeFile,
  () => {
    applyLargeFilePerformanceOptions();
  },
);

watch(
  () => props.value,
  (nextValue) => {
    if (!editor.value) {
      return;
    }

    const model = editor.value.getModel();
    if (model) {
      updateModelContent(model, nextValue, {
        strictEqualityCheck: nextValue.length <= MODEL_STRICT_COMPARE_MAX_CHARS,
      });
      scheduleLineCountSync();
    }
  },
);

const handleWindowPointerDown = (event: MouseEvent) => {
  if (!contextMenu.value.visible) {
    return;
  }

  const target = event.target as Node | null;
  if (target && contextMenuRef.value?.contains(target)) {
    return;
  }

  closeContextMenu();
};

const handleWindowResize = () => {
  closeContextMenu();
};

onMounted(() => {
  initEditor();
  window.addEventListener('mousedown', handleWindowPointerDown);
  window.addEventListener('resize', handleWindowResize);
});

onBeforeUnmount(() => {
  referencesCancellation?.cancel();
  referencesCancellation?.dispose();
  referencesCancellation = null;
  cancelContextSubmenuClose();
  if (contentUpdateTimer) {
    clearTimeout(contentUpdateTimer);
    contentUpdateTimer = null;
  }
  pendingContentModel = null;
  pendingContentModelId = null;
  if (lineCountSyncTimer) {
    clearTimeout(lineCountSyncTimer);
    lineCountSyncTimer = null;
  }

  window.removeEventListener('mousedown', handleWindowPointerDown);
  window.removeEventListener('resize', handleWindowResize);

  disposables.value.forEach((disposable) => disposable.dispose());
  disposables.value = [];

  if (editor.value) {
    const model = editor.value.getModel();
    if (model && activeModelId.value) {
      viewStateCache.set(activeModelId.value, editor.value.saveViewState());
    }
    editor.value.dispose();
    editor.value = null;
  }

  for (const model of modelCache.values()) {
    unregisterMonacoLspModel(model);
    if (!model.isDisposed()) {
      model.dispose();
    }
  }
  modelCache.clear();
  viewStateCache.clear();
});
</script>

<style scoped>
.editor-core-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
  overflow: hidden;
}

.editor-core {
  width: 100%;
  height: 100%;
  min-height: 400px;
  overflow: hidden;
  display: block;
}

.markdown-selection-toolbar {
  position: absolute;
  z-index: 5001;
  display: flex;
  gap: 3px;
  padding: 4px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.24));
  border-radius: var(--radius-sm, 6px);
  background: var(--surface-raised, #1b2436);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.3);
  animation: markdown-toolbar-in 0.16s ease-out;
}

.markdown-selection-action {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs, 4px);
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
  font: 700 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.markdown-selection-action:hover,
.markdown-selection-action:focus-visible {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #f8fafc);
  outline: none;
}

@keyframes markdown-toolbar-in {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.editor-context-menu {
  position: fixed;
  z-index: 30000;
  min-width: 200px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--color-border-default, #2a3a57) 85%, transparent);
  background: color-mix(in srgb, var(--color-panel-base, #111b2f) 95%, #05080f 5%);
  box-shadow: 0 14px 28px rgba(5, 12, 26, 0.28);
  backdrop-filter: blur(8px);
  pointer-events: auto;
  max-height: calc(100vh - 16px);
  overflow: visible;
}

.editor-context-submenu {
  position: relative;
}

.editor-context-submenu-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.editor-context-chevron {
  color: var(--color-text-secondary, #94a3b8);
  font-size: 18px;
  line-height: 1;
}

.editor-context-submenu-panel {
  position: fixed;
  top: auto;
  left: auto;
  min-width: 190px;
  max-height: 360px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--color-border-default, #2a3a57) 85%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-panel-base, #111b2f) 98%, #05080f 2%);
  box-shadow: 0 14px 28px rgba(5, 12, 26, 0.32);
  z-index: 30001;
}

.editor-context-item {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text-primary, #eef2ff);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  text-align: left;
  font-size: var(--font-size-ui-sm, 12px);
  line-height: 1.2;
  cursor: pointer;
}

.editor-context-item:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent-brand, #4c8dff) 18%, transparent);
}

.editor-context-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.editor-context-divider {
  height: 1px;
  margin: 4px 2px;
  background: color-mix(in srgb, var(--color-border-default, #2a3a57) 85%, transparent);
}
</style>
