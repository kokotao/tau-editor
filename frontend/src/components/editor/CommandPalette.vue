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
            :placeholder="commandPaletteText.placeholder"
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
              <span class="palette-item-meta">{{ commandPaletteText.categoryLabels[command.category] }}</span>
            </div>
            <span v-if="command.shortcut" class="palette-shortcut">{{ command.shortcut }}</span>
          </button>

          <div v-if="commands.length === 0" class="palette-empty">
            {{ commandPaletteText.empty }}
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { CommandItem } from '@/stores/commands';
import { useSettingsStore } from '@/stores/settings';
import { getCommandPaletteI18n } from '@/i18n/ui';

interface CommandPaletteProps {
  visible: boolean;
  query: string;
  commands: CommandItem[];
  highlightedIndex: number;
}

const props = defineProps<CommandPaletteProps>();
const settingsStore = useSettingsStore();

const emit = defineEmits<{
  close: [];
  move: [step: number];
  select: [id: string];
  selectHighlighted: [];
  highlight: [index: number];
  'update:query': [query: string];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

const commandPaletteText = computed(() => getCommandPaletteI18n(settingsStore.uiLanguage));

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
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-strong, rgba(148, 163, 184, 0.3));
  background: var(--panel, #101726);
  box-shadow: 0 30px 72px rgba(2, 6, 23, 0.46);
}

.palette-search-row {
  padding: 14px;
  border-bottom: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
}

.palette-search-input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--border-soft, rgba(148, 163, 184, 0.18));
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary, #ecf2ff);
  font: inherit;
  font-size: var(--font-size-ui-lg, 15px);
  outline: none;
}

.palette-search-input:focus {
  border-color: rgba(124, 199, 255, 0.55);
  box-shadow: inset 0 -2px 0 var(--accent-blue, #7cc7ff);
}

.palette-results {
  max-height: min(420px, 58vh);
  overflow-y: auto;
  padding: 8px;
}

.palette-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: inset 0 0 0 transparent;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.palette-item:hover,
.palette-item.active {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
  box-shadow: inset 2px 0 0 var(--accent-blue, #7cc7ff);
}

.palette-item-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.palette-item-title {
  font-size: var(--font-size-ui-md, 13px);
  font-weight: 650;
  color: var(--text-primary, #ecf2ff);
}

.palette-item-meta {
  font-size: var(--font-size-ui-xs, 11px);
  color: var(--text-muted, #75829e);
}

.palette-shortcut {
  padding: 4px 8px;
  border-radius: var(--radius-xs);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary, #b6c2d9);
  font-size: var(--font-size-ui-xs, 11px);
}

.palette-empty {
  padding: 28px 18px 32px;
  color: var(--text-muted, #75829e);
  text-align: center;
}
</style>
