<template>
  <div class="toolbar" data-testid="toolbar">
    <div class="toolbar-group">
      <button
        class="toolbar-btn"
        data-testid="btn-new-file"
        @click="emit('new-file')"
        title="新建文件 (Ctrl+N)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        data-testid="btn-open-file"
        @click="emit('open-file')"
        title="打开文件 (Ctrl+O)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        data-testid="btn-save"
        @click="emit('save')"
        :disabled="!isDirty"
        :class="{ disabled: !isDirty }"
        title="保存 (Ctrl+S)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17,21 17,13 7,13 7,21" />
          <polyline points="7,3 7,8 15,8" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        data-testid="btn-save-as"
        @click="emit('save-as')"
        title="另存为"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17,21 17,13 7,13 7,21" />
          <polyline points="7,3 7,8 15,8" />
          <line x1="12" y1="10" x2="12" y2="16" />
          <line x1="9" y1="13" x2="15" y2="13" />
        </svg>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button
        class="toolbar-btn"
        data-testid="btn-undo"
        @click="emit('undo')"
        :disabled="!canUndo"
        :class="{ disabled: !canUndo }"
        title="撤销 (Ctrl+Z)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="1,4 1,10 7,10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        data-testid="btn-redo"
        @click="emit('redo')"
        :disabled="!canRedo"
        :class="{ disabled: !canRedo }"
        title="重做 (Ctrl+Y)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23,4 23,10 17,10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button
        class="toolbar-btn"
        data-testid="btn-toggle-file-tree"
        @click="emit('toggle-file-tree')"
        title="切换文件树"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        data-testid="btn-settings"
        @click="emit('toggle-settings')"
        title="设置"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>

    <div class="toolbar-spacer"></div>

    <div class="toolbar-group">
      <span class="toolbar-info" v-if="isDirty" data-testid="dirty-indicator">
        <span class="dirty-indicator">●</span>
        未保存
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
// Props
interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
}

defineProps<ToolbarProps>();

// Emits
const emit = defineEmits<{
  'new-file': [];
  'open-file': [];
  'save': [];
  'save-as': [];
  'undo': [];
  'redo': [];
  'toggle-file-tree': [];
  'toggle-settings': [];
}>();
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 8px;
  background: var(--n-color, #252526);
  border-bottom: 1px solid var(--n-border-color, #333);
  user-select: none;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  margin: 0 8px;
  background: var(--n-border-color, #333);
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--n-text-color, #ccc);
  transition: background 0.15s, color 0.15s;
}

.toolbar-btn:hover:not(.disabled) {
  background: var(--n-hover-color, #2a2d2e);
  color: var(--n-text-color, #fff);
}

.toolbar-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--n-text-color, #999);
}

.dirty-indicator {
  color: #e5c07b;
  font-size: 10px;
}
</style>
