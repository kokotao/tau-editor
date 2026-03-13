import { defineStore } from 'pinia';

export type CommandCategory = 'file' | 'view' | 'workspace' | 'search';

export interface CommandItem {
  id: string;
  title: string;
  category: CommandCategory;
  shortcut?: string;
  keywords?: string[];
}

interface CommandsState {
  paletteOpen: boolean;
  query: string;
  highlightedIndex: number;
  commands: CommandItem[];
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

export const useCommandStore = defineStore('commands', {
  state: (): CommandsState => ({
    paletteOpen: false,
    query: '',
    highlightedIndex: 0,
    commands: [],
  }),

  getters: {
    filteredCommands(state): CommandItem[] {
      const query = normalize(state.query);
      if (!query) {
        return state.commands;
      }

      return state.commands.filter((command) => {
        const haystacks = [
          command.title,
          command.id,
          command.category,
          command.shortcut ?? '',
          ...(command.keywords ?? []),
        ];

        return haystacks.some((value) => normalize(value).includes(query));
      });
    },

    highlightedCommand(): CommandItem | null {
      const filtered = this.filteredCommands;
      return filtered[this.highlightedIndex] ?? filtered[0] ?? null;
    },
  },

  actions: {
    registerCommands(commands: CommandItem[]) {
      this.commands = commands;
      this.highlightedIndex = 0;
    },

    openPalette(initialQuery = '') {
      this.paletteOpen = true;
      this.query = initialQuery;
      this.highlightedIndex = 0;
    },

    closePalette() {
      this.paletteOpen = false;
      this.query = '';
      this.highlightedIndex = 0;
    },

    setQuery(query: string) {
      this.query = query;
      this.highlightedIndex = 0;
    },

    moveHighlight(step: number) {
      const total = this.filteredCommands.length;
      if (total === 0) {
        this.highlightedIndex = 0;
        return;
      }

      this.highlightedIndex = (this.highlightedIndex + step + total) % total;
    },

    setHighlightedIndex(index: number) {
      const total = this.filteredCommands.length;
      if (total === 0) {
        this.highlightedIndex = 0;
        return;
      }

      this.highlightedIndex = Math.max(0, Math.min(index, total - 1));
    },
  },
});
