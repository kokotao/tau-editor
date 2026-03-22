<template>
  <div class="toolbar" data-testid="toolbar">
    <div class="toolbar-group">
      <button class="toolbar-btn" data-testid="btn-new-file" @click="emit('new-file')" title="新建文件 (Ctrl+N)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      </button>
      <button class="toolbar-btn" data-testid="btn-open-file" @click="emit('open-file')" title="打开文件 (Ctrl+O)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
        </svg>
      </button>
      <button class="toolbar-btn" data-testid="btn-open-folder" @click="emit('open-folder')" title="打开文件夹">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1" />
          <path d="M3 10h18l-2 8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
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
      <button class="toolbar-btn" data-testid="btn-save-as" @click="emit('save-as')" title="另存为">
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
        title="撤销"
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
        title="重做"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23,4 23,10 17,10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        data-testid="btn-toggle-file-tree"
        @click="emit('toggle-file-tree')"
        :title="sidebarVisible ? '折叠资源管理器' : '展开资源管理器'"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="9" y1="4" x2="9" y2="20" />
        </svg>
      </button>
      <button
        v-if="isMarkdown"
        class="toolbar-btn"
        data-testid="btn-markdown-preview-mode"
        @click="emit('cycle-markdown-preview')"
        :title="`Markdown 视图：${previewModeLabel}`"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="8" y1="4" x2="8" y2="20" />
          <line x1="16" y1="4" x2="16" y2="20" />
        </svg>
      </button>
      <button class="toolbar-btn" data-testid="btn-settings" @click="emit('toggle-settings')" title="设置">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l-.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>

    <div class="toolbar-spacer"></div>

    <div class="toolbar-group">
      <span class="toolbar-info" v-if="isDirty" data-testid="dirty-indicator">
        <span class="dirty-indicator">●</span>
        当前标签未保存
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  isMarkdown?: boolean;
  markdownPreviewMode?: 'edit' | 'split' | 'preview';
  sidebarVisible?: boolean;
}

const props = withDefaults(defineProps<ToolbarProps>(), {
  isMarkdown: false,
  markdownPreviewMode: 'split',
  sidebarVisible: true,
});

const previewModeLabelMap: Record<'edit' | 'split' | 'preview', string> = {
  edit: '仅编辑',
  split: '分栏',
  preview: '仅预览',
};

const previewModeLabel = computed(() => previewModeLabelMap[props.markdownPreviewMode]);

const emit = defineEmits<{
  'new-file': [];
  'open-file': [];
  'open-folder': [];
  'save': [];
  'save-as': [];
  'undo': [];
  'redo': [];
  'toggle-file-tree': [];
  'toggle-settings': [];
  'cycle-markdown-preview': [];
}>();
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 14px;
  gap: 6px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent),
    var(--panel-elevated, #151d2d);
  border-bottom: 1px solid var(--border-strong, rgba(148, 163, 184, 0.3));
  user-select: none;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-divider {
  width: 1px;
  height: 28px;
  margin: 0 6px;
  background: var(--border-soft, rgba(148, 163, 184, 0.18));
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.toolbar-btn:hover:not(.disabled) {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--border-soft, rgba(148, 163, 184, 0.18));
  color: var(--text-primary, #f8fafc);
  transform: translateY(-1px);
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
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  background: var(--surface-muted, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  color: var(--text-secondary, #cbd5e1);
  font-size: 12px;
}

.dirty-indicator {
  color: var(--accent-amber, #ffd166);
  font-size: 10px;
}
</style>
