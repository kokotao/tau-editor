import { defineStore } from 'pinia';

export interface Tab {
  id: string;                   // 唯一标识
  filePath: string | null;      // 文件路径
  fileName: string;             // 文件名
  language: string;             // 语言模式
  isDirty: boolean;             // 是否有未保存的更改
  isUntitled: boolean;          // 是否为未保存文件
  content: string;              // 标签内容
  createdAt: number;            // 创建时间戳
}

export interface TabsState {
  tabs: Tab[];                  // 所有标签
  activeTabId: string | null;   // 当前激活的标签 ID
  recentTabs: string[];         // 最近关闭的标签 (用于重新打开)
}

export const useTabsStore = defineStore('tabs', {
  state: (): TabsState => ({
    tabs: [],
    activeTabId: null,
    recentTabs: [],
  }),

  getters: {
    // 获取当前激活的标签
    activeTab: (state) => {
      return state.tabs.find(tab => tab.id === state.activeTabId) || null;
    },

    // 获取标签数量
    tabCount: (state) => state.tabs.length,

    // 获取所有脏标签 (有未保存更改)
    dirtyTabs: (state) => {
      return state.tabs.filter(tab => tab.isDirty);
    },

    hasDirtyTabs: (state) => state.tabs.some(tab => tab.isDirty),

    // 检查文件是否已打开
    isFileOpen: (state) => {
      return (filePath: string) => {
        return state.tabs.some(tab => tab.filePath === filePath);
      };
    },

    // 获取指定文件的标签 ID
    getTabIdByPath: (state) => {
      return (filePath: string) => {
        const tab = state.tabs.find(tab => tab.filePath === filePath);
        return tab?.id || null;
      };
    },
  },

  actions: {
    // 添加新标签
    addTab(tab: Omit<Tab, 'id' | 'createdAt'>) {
      const id = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newTab: Tab = {
        ...tab,
        id,
        createdAt: Date.now(),
      };
      this.tabs.push(newTab);
      this.activeTabId = id;
      return id;
    },

    // 关闭标签
    closeTab(tabId: string) {
      const index = this.tabs.findIndex(tab => tab.id === tabId);
      if (index === -1) return;

      const tab = this.tabs[index];
      if (!tab) return;
      
      this.tabs.splice(index, 1);

      // 如果关闭的是当前标签，切换到相邻标签
      if (this.activeTabId === tabId) {
        if (this.tabs.length > 0) {
          const newIndex = Math.min(index, this.tabs.length - 1);
          const newTab = this.tabs[newIndex];
          if (newTab) {
            this.activeTabId = newTab.id;
          } else {
            this.activeTabId = null;
          }
        } else {
          this.activeTabId = null;
        }
      }

      // 添加到最近关闭列表
      if (tab.filePath) {
        this.recentTabs.unshift(tab.filePath);
        this.recentTabs = this.recentTabs.slice(0, 10); // 保留最多 10 个
      }
    },

    // 关闭其他标签
    closeOthers(tabId: string) {
      this.tabs = this.tabs.filter(tab => tab.id === tabId);
      this.activeTabId = tabId;
    },

    // 关闭所有标签
    closeAll() {
      this.tabs = [];
      this.activeTabId = null;
    },

    // 激活标签
    activateTab(tabId: string) {
      if (this.tabs.some(tab => tab.id === tabId)) {
        this.activeTabId = tabId;
      }
    },

    // 更新标签的脏状态
    updateTabDirty(tabId: string, isDirty: boolean) {
      const tab = this.tabs.find(tab => tab.id === tabId);
      if (tab) {
        tab.isDirty = isDirty;
      }
    },

    updateTab(tabId: string, updates: Partial<Omit<Tab, 'id' | 'createdAt'>>) {
      const tab = this.tabs.find(item => item.id === tabId);
      if (!tab) return;

      Object.assign(tab, updates);
    },

    restoreSession(tabs: Tab[], activeTabId: string | null) {
      this.tabs = tabs;
      this.activeTabId = activeTabId && tabs.some((tab) => tab.id === activeTabId)
        ? activeTabId
        : tabs[0]?.id || null;
    },

    // 重新打开最近关闭的标签
    reopenClosedTab() {
      if (this.recentTabs.length === 0) return null;
      const filePath = this.recentTabs.shift()!;
      return filePath;
    },

    // 切换到下一个标签
    nextTab() {
      if (this.tabs.length <= 1 || !this.activeTabId) return;
      
      const currentIndex = this.tabs.findIndex(tab => tab.id === this.activeTabId);
      const nextIndex = (currentIndex + 1) % this.tabs.length;
      const nextTab = this.tabs[nextIndex];
      if (nextTab) {
        this.activeTabId = nextTab.id;
      }
    },

    // 切换到上一个标签
    prevTab() {
      if (this.tabs.length <= 1 || !this.activeTabId) return;
      
      const currentIndex = this.tabs.findIndex(tab => tab.id === this.activeTabId);
      const prevIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
      const prevTab = this.tabs[prevIndex];
      if (prevTab) {
        this.activeTabId = prevTab.id;
      }
    },
  },

  // 持久化配置 - 暂时禁用，等待类型修复
  // persist: {
  //   storage: localStorage,
  //   paths: ['recentTabs'],
  // },
});
