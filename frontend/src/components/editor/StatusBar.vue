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
        <span class="status-dot"></span>
        <span class="status-label" data-testid="auto-save-label">自动保存</span>
        <span class="status-value" data-testid="auto-save-status" v-if="lastSaveTime">
          {{ formatLastSaveTime(lastSaveTime) }}
        </span>
      </div>
      <div class="status-item">
        <label class="status-pill">
          <span class="pill-prefix">主题</span>
          <select
            class="status-select"
            data-testid="theme-select"
            :value="monacoTheme"
            @change="handleThemeChange"
            title="编辑器主题"
          >
            <option value="vs">明亮</option>
            <option value="vs-dark">暗夜</option>
            <option value="hc-black">高对比</option>
          </select>
        </label>
      </div>
      <div class="status-item">
        <label class="status-pill language-pill">
          <span class="pill-prefix">语言</span>
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
        </label>
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

interface StatusBarProps {
  cursorPosition?: { line: number; column: number };
  encoding?: string;
  language?: string;
  monacoTheme?: string;
  autoSaveEnabled?: boolean;
  lastSaveTime?: Date;
}

withDefaults(defineProps<StatusBarProps>(), {
  cursorPosition: () => ({ line: 1, column: 1 }),
  encoding: 'utf-8',
  language: 'plaintext',
  monacoTheme: 'vs-dark',
  autoSaveEnabled: true,
  lastSaveTime: undefined,
});

const emit = defineEmits<{
  'encoding-change': [encoding: string];
  'language-change': [language: string];
  'theme-change': [theme: string];
}>();

const editorStore = useEditorStore();
const lineCount = computed(() => editorStore.lineCount);

const handleLanguageChange = (event: Event) => {
  emit('language-change', (event.target as HTMLSelectElement).value);
};

const handleThemeChange = (event: Event) => {
  emit('theme-change', (event.target as HTMLSelectElement).value);
};

const formatLastSaveTime = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 0 14px;
  background:
    linear-gradient(90deg, rgba(76, 146, 255, 0.24), rgba(46, 204, 113, 0.12)),
    var(--panel-elevated, #111827);
  color: var(--text-primary, #f8fafc);
  font-size: 12px;
  border-top: 1px solid var(--border-strong, rgba(148, 163, 184, 0.3));
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
  min-height: 28px;
}

.status-label {
  opacity: 0.92;
}

.status-value {
  opacity: 0.74;
  font-size: 11px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #4ade80;
  box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.12);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.pill-prefix {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.68);
}

.status-select {
  min-width: 72px;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  appearance: none;
}

.status-select option {
  background: #1b2230;
  color: #fff;
}
</style>
