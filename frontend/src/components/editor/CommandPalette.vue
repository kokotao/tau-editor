<template>
  <teleport to="body">
    <div v-if="visible" class="command-palette-overlay" @click.self="emit('close')">
      <div class="command-palette">
        <div class="palette-search-row">
          <input
            ref="inputRef"
            class="palette-search-input"
            :value="query"
            type="text"
            placeholder="输入命令、分类或快捷键"
            @input="handleInput"
            @keydown.down.prevent="emit('move', 1)"
            @keydown.up.prevent="emit('move', -1)"
            @keydown.enter.prevent="emit('selectHighlighted')"
            @keydown.esc.prevent="emit('close')"
          >
        </div>

        <div class="palette-results">
          <button
            v-for="(command, index) in commands"
            :key="command.id"
            class="palette-item"
            :class="{ active: index === highlightedIndex }"
            @mouseenter="emit('highlight', index)"
            @click="emit('select', command.id)"
          >
            <div class="palette-item-main">
              <span class="palette-item-title">{{ command.title }}</span>
              <span class="palette-item-meta">{{ categoryLabels[command.category] }}</span>
            </div>
            <span v-if="command.shortcut" class="palette-shortcut">{{ command.shortcut }}</span>
          </button>

          <div v-if="commands.length === 0" class="palette-empty">
            没有找到匹配命令
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { CommandItem } from '@/stores/commands';

interface CommandPaletteProps {
  visible: boolean;
  query: string;
  commands: CommandItem[];
  highlightedIndex: number;
}

const props = defineProps<CommandPaletteProps>();

const emit = defineEmits<{
  close: [];
  move: [step: number];
  select: [id: string];
  selectHighlighted: [];
  highlight: [index: number];
  'update:query': [query: string];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

const categoryLabels: Record<CommandItem['category'], string> = {
  file: '文件',
  view: '视图',
  workspace: '工作区',
  search: '搜索',
};

const handleInput = (event: Event) => {
  emit('update:query', (event.target as HTMLInputElement).value);
};

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      return;
    }

    await nextTick();
    inputRef.value?.focus();
    inputRef.value?.select();
  },
);
</script>

<style scoped>
.command-palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  background: rgba(3, 7, 18, 0.48);
  backdrop-filter: blur(12px);
}

.command-palette {
  width: min(720px, calc(100vw - 32px));
  overflow: hidden;
  border-radius: 26px;
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.3));
  background:
    radial-gradient(circle at top right, rgba(124, 199, 255, 0.12), transparent 28%),
    var(--panel, #101726);
  box-shadow: 0 40px 100px rgba(15, 23, 42, 0.42);
}

.palette-search-row {
  padding: 18px;
  border-bottom: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
}

.palette-search-input {
  width: 100%;
  height: 54px;
  padding: 0 18px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary, #ecf2ff);
  font: inherit;
  font-size: 15px;
  outline: none;
}

.palette-search-input:focus {
  border-color: rgba(124, 199, 255, 0.55);
  box-shadow: 0 0 0 4px rgba(124, 199, 255, 0.12);
}

.palette-results {
  max-height: min(420px, 58vh);
  overflow-y: auto;
  padding: 10px;
}

.palette-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: none;
  border-radius: 18px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.palette-item:hover,
.palette-item.active {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.palette-item-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.palette-item-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #ecf2ff);
}

.palette-item-meta {
  font-size: 12px;
  color: var(--text-muted, #75829e);
}

.palette-shortcut {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary, #b6c2d9);
  font-size: 12px;
}

.palette-empty {
  padding: 28px 18px 32px;
  color: var(--text-muted, #75829e);
  text-align: center;
}
</style>
