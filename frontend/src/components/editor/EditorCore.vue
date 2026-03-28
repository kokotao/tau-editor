<template>
  <div class="editor-core-shell" @contextmenu.prevent>
    <div ref="editorContainer" class="editor-core" data-testid="editor-container"></div>

    <div
      v-if="contextMenu.visible"
      ref="contextMenuRef"
      class="editor-context-menu"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      @click.stop
    >
      <template v-for="entry in contextMenuEntries" :key="entry.key">
        <div v-if="entry.type === 'divider'" class="editor-context-divider"></div>
        <button
          v-else
          type="button"
          class="editor-context-item"
          :disabled="!entry.enabled"
          @click="handleContextMenuEntryClick(entry)"
        >
          {{ entry.label }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as monaco from 'monaco-editor';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { useNotificationStore } from '@/stores/notification';
import { getEditorCoreI18n } from '@/i18n/ui';
import { appCommands } from '@/lib/tauri';

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
  'content-change': [content: string];
  'cursor-change': [position: { line: number; column: number }];
  'scroll-change': [state: { top: number; height: number; scrollHeight: number }];
  'model-save': [];
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
let suppressContentEmit = false;

let contentUpdateTimer: ReturnType<typeof setTimeout> | null = null;
let lineCountSyncTimer: ReturnType<typeof setTimeout> | null = null;
const CONTENT_UPDATE_DELAY = 50;
const MODEL_STRICT_COMPARE_MAX_CHARS = 300_000;

const contextMenuRef = ref<HTMLElement | null>(null);
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
});
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

type ContextMenuEntry = ContextMenuDivider | ContextMenuItem;

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

const normalizeModelUri = (modelId: string) =>
  monaco.Uri.parse(`inmemory://tau-editor/${encodeURIComponent(modelId)}`);

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

const getOrCreateModel = (modelId: string, content: string, language: string) => {
  const cachedModel = modelCache.get(modelId);
  if (cachedModel && !cachedModel.isDisposed()) {
    if (cachedModel.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(cachedModel, language);
    }
    return cachedModel;
  }

  const uri = normalizeModelUri(modelId);
  const existingModel = monaco.editor.getModel(uri);
  const model = existingModel ?? monaco.editor.createModel(content, language, uri);
  if (model.getLanguageId() !== language) {
    monaco.editor.setModelLanguage(model, language);
  }

  modelCache.set(modelId, model);
  return model;
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

const activateModel = (nextModelId: string) => {
  if (!editor.value) {
    return;
  }

  const currentModel = editor.value.getModel();
  if (currentModel && activeModelId.value) {
    viewStateCache.set(activeModelId.value, editor.value.saveViewState());
  }

  const targetModel = getOrCreateModel(nextModelId, props.value, props.language);
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
  contextMenu.value.visible = false;
};

const openContextMenu = (x: number, y: number) => {
  contextMenu.value = {
    visible: true,
    x,
    y,
  };

  void nextTick(() => {
    const menu = contextMenuRef.value;
    const container = editorContainer.value;
    if (!menu || !container) {
      return;
    }

    const maxX = Math.max(CONTEXT_MENU_MARGIN, container.clientWidth - menu.offsetWidth - CONTEXT_MENU_MARGIN);
    const maxY = Math.max(CONTEXT_MENU_MARGIN, container.clientHeight - menu.offsetHeight - CONTEXT_MENU_MARGIN);

    contextMenu.value.x = Math.max(CONTEXT_MENU_MARGIN, Math.min(contextMenu.value.x, maxX));
    contextMenu.value.y = Math.max(CONTEXT_MENU_MARGIN, Math.min(contextMenu.value.y, maxY));
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

const initEditor = () => {
  if (!editorContainer.value) return;

  try {
    const monacoTheme = settingsStore.monacoTheme || props.theme;
    const initialModel = getOrCreateModel(props.modelId, props.value, props.language);

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
      ...largeFileOptimizations,
      ...props.options,
    });

    disposables.value.forEach((disposable) => disposable.dispose());
    disposables.value = [];

    const contentDisposable = editor.value.onDidChangeModelContent(() => {
      if (!editor.value || suppressContentEmit) return;

      if (contentUpdateTimer) {
        clearTimeout(contentUpdateTimer);
      }

      contentUpdateTimer = setTimeout(() => {
        const content = editor.value!.getValue();
        emit('content-change', content);
        editorStore.setContent(content);
        scheduleLineCountSync();
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
    });
    disposables.value.push(selectionDisposable);

    const undoRedoDisposable = editor.value.onDidChangeModelContent(() => {
      if (!editor.value) return;
      const undoState = editor.value.getAction('undo')?.isSupported() ?? false;
      const redoState = editor.value.getAction('redo')?.isSupported() ?? false;
      editorStore.updateUndoRedoState(undoState, redoState);
    });
    disposables.value.push(undoRedoDisposable);

    const contextMenuDisposable = editor.value.onContextMenu((event) => {
      if (!editorContainer.value) {
        return;
      }

      event.event.preventDefault();
      event.event.stopPropagation();

      const bounds = editorContainer.value.getBoundingClientRect();
      const eventX = (event.event as any).posx ?? (event.event.browserEvent?.clientX ?? bounds.left);
      const eventY = (event.event as any).posy ?? (event.event.browserEvent?.clientY ?? bounds.top);
      const relativeX = eventX - bounds.left;
      const relativeY = eventY - bounds.top;

      openContextMenu(relativeX, relativeY);
    });
    disposables.value.push(contextMenuDisposable);

    editor.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      emit('model-save');
    });

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
  focusAtStart: () => {
    if (!editor.value) {
      return;
    }

    const startPosition = { lineNumber: 1, column: 1 };
    editor.value.focus();
    editor.value.setPosition(startPosition);
    editor.value.revealPositionInCenterIfOutsideViewport(startPosition);
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
  if (contentUpdateTimer) {
    clearTimeout(contentUpdateTimer);
    contentUpdateTimer = null;
  }
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

.editor-context-menu {
  position: absolute;
  z-index: 5000;
  min-width: 200px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border-default, #2a3a57) 85%, transparent);
  background: color-mix(in srgb, var(--color-panel-base, #111b2f) 95%, #05080f 5%);
  box-shadow: 0 14px 28px rgba(5, 12, 26, 0.28);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}

.editor-context-item {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text-primary, #eef2ff);
  border-radius: 8px;
  padding: 8px 10px;
  text-align: left;
  font-size: 12px;
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
