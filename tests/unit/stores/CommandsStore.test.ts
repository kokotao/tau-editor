import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useCommandStore } from '@/stores/commands';

describe('CommandsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('应支持按中文分类检索命令', () => {
    const store = useCommandStore();

    store.registerCommands([
      {
        id: 'view.toggleSidebar',
        title: '切换资源管理器',
        category: 'view',
      },
      {
        id: 'file.openFolder',
        title: '打开文件夹',
        category: 'workspace',
      },
    ]);

    store.setQuery('视图');
    expect(store.filteredCommands.map((item) => item.id)).toEqual(['view.toggleSidebar']);

    store.setQuery('工作区');
    expect(store.filteredCommands.map((item) => item.id)).toEqual(['file.openFolder']);
  });

  it('应保留英文分类检索兼容性', () => {
    const store = useCommandStore();

    store.registerCommands([
      {
        id: 'commandPalette.open',
        title: '打开命令面板',
        category: 'search',
      },
    ]);

    store.setQuery('search');
    expect(store.filteredCommands.map((item) => item.id)).toEqual(['commandPalette.open']);
  });
});
