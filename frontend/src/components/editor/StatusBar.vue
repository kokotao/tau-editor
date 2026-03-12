<template>
  <div class="status-bar" data-testid="status-bar">
    <div class="status-left">
      <div class="status-item">
        <span class="status-label" data-testid="cursor-position">行 {{ cursorPosition.line }}, 列 {{ cursorPosition.column }}</span>
      </div>
      <div class="status-item">
        <span class="status-label" data-testid="encoding-display">UTF-8</span>
      </div>
    </div>

    <div class="status-right">
      <div class="status-item" v-if="autoSaveEnabled">
        <span class="status-icon">💾</span>
        <span class="status-label" data-testid="auto-save-label">自动保存</span>
        <span class="status-value" data-testid="auto-save-status" v-if="lastSaveTime">
          {{ formatLastSaveTime(lastSaveTime) }}
        </span>
      </div>
      <div class="status-item">
        <select
          class="status-select"
          data-testid="theme-select"
          :value="monacoTheme"
          @change="handleThemeChange"
          title="编辑器主题"
        >
          <option value="vs">Light (vs)</option>
          <option value="vs-dark">Dark (vs-dark)</option>
          <option value="hc-black">High Contrast (hc-black)</option>
        </select>
      </div>
      <div class="status-item">
        <select
          class="status-select"
          data-testid="language-mode-display"
          :value="language"
          @change="handleLanguageChange"
          title="语言模式"
        >
          <option value="plaintext">Plain Text</option>
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
          <option value="java">Java</option>
          <option value="c">C</option>
          <option value="cpp">C++</option>
          <option value="csharp">C#</option>
          <option value="go">Go</option>
          <option value="rust">Rust</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
          <option value="scss">SCSS</option>
          <option value="json">JSON</option>
          <option value="xml">XML</option>
          <option value="markdown">Markdown</option>
          <option value="yaml">YAML</option>
          <option value="sql">SQL</option>
          <option value="shell">Shell</option>
        </select>
      </div>
      <div class="status-item">
        <span class="status-label" data-testid="line-count">Ln {{ lineCount }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';

// Props
interface StatusBarProps {
  cursorPosition?: { line: number; column: number };
  encoding?: string;
  language?: string;
  monacoTheme?: string;
  autoSaveEnabled?: boolean;
  lastSaveTime?: Date;
}

const props = withDefaults(defineProps<StatusBarProps>(), {
  cursorPosition: () => ({ line: 1, column: 1 }),
  encoding: 'utf-8',
  language: 'plaintext',
  monacoTheme: 'vs-dark',
  autoSaveEnabled: true,
  lastSaveTime: undefined,
});

// Emits
const emit = defineEmits<{
  'encoding-change': [encoding: string];
  'language-change': [language: string];
  'theme-change': [theme: string];
}>();

// Stores
const editorStore = useEditorStore();
const settingsStore = useSettingsStore();

// Computed
const lineCount = computed(() => editorStore.lineCount);

// Methods
const handleLanguageChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  emit('language-change', target.value);
};

const handleThemeChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  emit('theme-change', target.value);
};

const formatLastSaveTime = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) {
    return '刚刚';
  } else if (minutes < 60) {
    return `${minutes}分钟前`;
  } else if (hours < 24) {
    return `${hours}小时前`;
  } else {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
};
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
  padding: 0 12px;
  background: var(--n-color, #007acc);
  color: var(--n-text-color, #fff);
  font-size: 12px;
  border-top: 1px solid var(--n-border-color, #005a9e);
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.status-label {
  opacity: 0.9;
}

.status-value {
  opacity: 0.7;
  font-size: 11px;
}

.status-icon {
  font-size: 12px;
}

.status-select {
  background: transparent;
  border: none;
  color: inherit;
  font-size: inherit;
  cursor: pointer;
  outline: none;
  padding: 0;
  margin: 0;
  appearance: none;
}

.status-select option {
  background: #252526;
  color: #fff;
}
</style>
