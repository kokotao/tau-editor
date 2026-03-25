<template>
  <div ref="editorContainer" class="editor-core" data-testid="editor-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue';
import * as monaco from 'monaco-editor';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';

// Props
interface EditorCoreProps {
  modelId: string;           // 编辑器模型 ID
  value?: string;            // 编辑器内容
  language?: string;         // 语言模式
  readOnly?: boolean;        // 只读模式
  theme?: string;            // Monaco 主题 (vs/vs-dark/hc-black)
  options?: monaco.editor.IStandaloneEditorConstructionOptions;   // Monaco 配置选项
}

const props = withDefaults(defineProps<EditorCoreProps>(), {
  value: '',
  language: 'plaintext',
  readOnly: false,
  theme: 'vs-dark',
  options: () => ({}),
});

// 支持的语言列表
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

// Emits
const emit = defineEmits<{
  'content-change': [content: string];
  'cursor-change': [position: { line: number; column: number }];
  'scroll-change': [state: { top: number; height: number; scrollHeight: number }];
  'model-save': [];
  'error': [error: Error];
}>();

// Refs
const editorContainer = ref<HTMLElement | null>(null);
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);

// 事件监听器引用 - 用于清理，避免内存泄漏
const disposables = ref<monaco.IDisposable[]>([]);

// Stores
const editorStore = useEditorStore();
const settingsStore = useSettingsStore();

// 内容变化节流 (避免频繁更新 store)
let contentUpdateTimer: ReturnType<typeof setTimeout> | null = null;
const CONTENT_UPDATE_DELAY = 50; // ms

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

const triggerEditorAction = async (actionId: string) => {
  if (!editor.value) {
    return;
  }

  editor.value.focus();
  await editor.value.getAction(actionId)?.run();
};

// 初始化编辑器
const initEditor = () => {
  if (!editorContainer.value) return;

  try {
    // 优先使用 settingsStore 中的主题，其次使用 props.theme
    const monacoTheme = settingsStore.monacoTheme || props.theme;
    
    // 大文件优化选项
    const largeFileOptimizations = {
      // 禁用大文件的语法高亮 (超过 10000 行)
      maxTokenizationLineLength: 10000,
      // 限制折叠范围计算
      folding: true,
      // 优化大文件性能
      largeFileOptimizations: true,
    };
    
    editor.value = monaco.editor.create(editorContainer.value, {
      value: props.value,
      language: props.language,
      theme: monacoTheme,
      readOnly: props.readOnly,
      automaticLayout: true,
      minimap: { enabled: settingsStore.minimap },
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

    // 清空之前的监听器
    disposables.value.forEach(d => d.dispose());
    disposables.value = [];

    // 监听内容变化 (带节流)
    const contentDisposable = editor.value.onDidChangeModelContent(() => {
      if (!editor.value) return;
      
      // 清除之前的定时器
      if (contentUpdateTimer) {
        clearTimeout(contentUpdateTimer);
      }
      
      // 节流更新
      contentUpdateTimer = setTimeout(() => {
        const content = editor.value!.getValue();
        emit('content-change', content);
        editorStore.setContent(content);
      }, CONTENT_UPDATE_DELAY);
    });
    disposables.value.push(contentDisposable);

    // 监听光标变化
    const cursorDisposable = editor.value.onDidChangeCursorPosition((e) => {
      emit('cursor-change', {
        line: e.position.lineNumber,
        column: e.position.column,
      });
      editorStore.updateCursorPosition(e.position.lineNumber, e.position.column);
    });
    disposables.value.push(cursorDisposable);

    const scrollDisposable = editor.value.onDidScrollChange(() => {
      emitScrollState();
    });
    disposables.value.push(scrollDisposable);

    // 监听选择变化
    const selectionDisposable = editor.value.onDidChangeCursorSelection((e) => {
      if (!editor.value) return;
      const selection = editor.value.getSelection();
      if (selection) {
        const model = editor.value.getModel();
        if (model) {
          const start = model.getOffsetAt(selection.getStartPosition());
          const end = model.getOffsetAt(selection.getEndPosition());
          editorStore.updateSelection(start, end);
        }
      }
    });
    disposables.value.push(selectionDisposable);

    // 监听撤销/重做状态变化
    const undoRedoDisposable = editor.value.onDidChangeModelContent(() => {
      if (!editor.value) return;
      // Monaco 没有直接的 hasUndoStack API，通过命令状态判断
      const undoState = editor.value.getAction('undo')?.isSupported() ?? false;
      const redoState = editor.value.getAction('redo')?.isSupported() ?? false;
      editorStore.updateUndoRedoState(undoState, redoState);
    });
    disposables.value.push(undoRedoDisposable);

    // 快捷键保存
    editor.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      emit('model-save');
    });

    emitScrollState();

  } catch (error) {
    emit('error', error as Error);
  }
};

// 暴露的方法
defineExpose({
  getContent: () => editor.value?.getValue() || '',
  setContent: (content: string) => {
    if (editor.value) {
      editor.value.setValue(content);
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
    if (editor.value) {
      const model = editor.value.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, language);
      }
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

// 支持的语言列表已在组件外部定义，可直接从文件导入使用

// 监听设置变化
watch(() => settingsStore.monacoOptions, (newOptions) => {
  if (editor.value) {
    editor.value.updateOptions(newOptions);
  }
}, { deep: true });

watch(() => settingsStore.fontFamily, (newFontFamily) => {
  if (!editor.value) {
    return;
  }

  editor.value.updateOptions({ fontFamily: newFontFamily });
  monaco.editor.remeasureFonts();
  editor.value.layout();
});

// 监听主题变化 (props)
watch(() => props.theme, (newTheme) => {
  if (editor.value) {
    monaco.editor.setTheme(newTheme);
  }
});

// 监听 settingsStore 中的 Monaco 主题变化
watch(() => settingsStore.monacoTheme, (newTheme) => {
  if (editor.value) {
    monaco.editor.setTheme(newTheme);
  }
});

// 监听语言变化 - 动态切换语言模式
watch(() => props.language, (newLanguage) => {
  if (editor.value) {
    const model = editor.value.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, newLanguage);
    }
  }
});

watch(() => props.readOnly, (readOnly) => {
  if (editor.value) {
    editor.value.updateOptions({ readOnly });
  }
});

watch(() => props.value, (newValue) => {
  if (!editor.value) return;

  const currentValue = editor.value.getValue();
  if (currentValue === newValue) return;

  editor.value.setValue(newValue);
});

// 生命周期
onMounted(() => {
  initEditor();
});

onBeforeUnmount(() => {
  // 清除内容更新定时器
  if (contentUpdateTimer) {
    clearTimeout(contentUpdateTimer);
    contentUpdateTimer = null;
  }
  
  // 清理所有事件监听器
  disposables.value.forEach(d => d.dispose());
  disposables.value = [];
  
  // 销毁编辑器实例
  if (editor.value) {
    editor.value.dispose();
    editor.value = null;
  }
});
</script>

<style scoped>
.editor-core {
  width: 100%;
  height: 100%;
  min-height: 400px;
  overflow: hidden;
  display: block;
}
</style>
