<template>
  <section class="diff-view" data-testid="diff-view">
    <header class="diff-header">
      <div class="diff-titles">
        <span class="diff-side-label" data-testid="diff-left-label">{{ session.left.label }}</span>
        <span class="diff-arrow" aria-hidden="true">↔</span>
        <span class="diff-side-label" data-testid="diff-right-label">{{ session.right.label }}</span>
      </div>
      <div class="diff-actions">
        <button
          type="button"
          class="diff-action-btn"
          data-testid="diff-toggle-layout"
          :title="copy.toggleLayout"
          @click="toggleLayout"
        >
          {{ session.layout === 'side-by-side' ? copy.inline : copy.sideBySide }}
        </button>
        <button
          type="button"
          class="diff-action-btn"
          data-testid="diff-close"
          :title="copy.close"
          @click="emit('close')"
        >
          {{ copy.close }}
        </button>
      </div>
    </header>
    <div ref="containerRef" class="diff-editor" data-testid="diff-editor"></div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as monaco from '@/lib/monaco/editor';
import { ensureMonacoSetup } from '@/lib/monaco/setupMonaco';
import { useSettingsStore } from '@/stores/settings';
import type { DiffLayout, DiffSession } from '@/services/diffService';

const props = defineProps<{ session: DiffSession }>();

const emit = defineEmits<{
  close: [];
  'update:layout': [layout: DiffLayout];
}>();

const settingsStore = useSettingsStore();
const containerRef = ref<HTMLElement | null>(null);

const copy = computed(() =>
  settingsStore.uiLanguage === 'en-US'
    ? { sideBySide: 'Side by Side', inline: 'Inline', close: 'Close', toggleLayout: 'Toggle layout' }
    : { sideBySide: '并排', inline: '内联', close: '关闭', toggleLayout: '切换布局' },
);

let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
let originalModel: monaco.editor.ITextModel | null = null;
let modifiedModel: monaco.editor.ITextModel | null = null;

/** 自定义主题包可能尚未在 Monaco 中注册，这里补齐一次，失败则回退内置主题。 */
const resolveThemeId = () => {
  const definition = settingsStore.activeMonacoThemeDefinition;
  if (!definition) {
    return settingsStore.monacoTheme;
  }
  try {
    monaco.editor.defineTheme(settingsStore.activeMonacoThemeId, definition);
    return settingsStore.activeMonacoThemeId;
  } catch {
    return settingsStore.monacoTheme;
  }
};

const disposeModels = () => {
  diffEditor?.dispose();
  diffEditor = null;
  originalModel?.dispose();
  originalModel = null;
  modifiedModel?.dispose();
  modifiedModel = null;
};

const createDiffEditor = () => {
  if (!containerRef.value) {
    return;
  }

  ensureMonacoSetup();
  disposeModels();

  originalModel = monaco.editor.createModel(props.session.left.content, props.session.language);
  modifiedModel = monaco.editor.createModel(props.session.right.content, props.session.language);

  diffEditor = monaco.editor.createDiffEditor(containerRef.value, {
    readOnly: true,
    originalEditable: false,
    renderSideBySide: props.session.layout === 'side-by-side',
    automaticLayout: true,
    minimap: { enabled: false },
    renderOverviewRuler: false,
    scrollBeyondLastLine: false,
    fontSize: settingsStore.fontSize,
    fontFamily: settingsStore.fontFamily,
    theme: resolveThemeId(),
  });

  diffEditor.setModel({ original: originalModel, modified: modifiedModel });
};

const toggleLayout = () => {
  emit('update:layout', props.session.layout === 'side-by-side' ? 'inline' : 'side-by-side');
};

onMounted(createDiffEditor);
onBeforeUnmount(disposeModels);

watch(
  () => props.session.id,
  () => {
    createDiffEditor();
  },
);

watch(
  () => props.session.layout,
  (layout) => {
    diffEditor?.updateOptions({ renderSideBySide: layout === 'side-by-side' });
  },
);
</script>

<style scoped>
.diff-view {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--panel, #0f172a);
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  background: var(--panel-strong, rgba(15, 23, 42, 0.6));
}

.diff-titles {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary, #cbd5e1);
}

.diff-side-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-arrow {
  color: var(--text-muted, #94a3b8);
}

.diff-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.diff-action-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.4);
  color: var(--text-secondary, #cbd5e1);
  font-size: 12px;
  cursor: pointer;
}

.diff-action-btn:hover {
  border-color: var(--accent-brand, #38bdf8);
  color: var(--text-primary, #f8fafc);
}

.diff-editor {
  min-height: 0;
  flex: 1;
}
</style>
