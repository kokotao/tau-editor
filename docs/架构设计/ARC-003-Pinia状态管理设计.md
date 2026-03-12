# ARC-003: Pinia 状态管理设计

## 1. Store 概览

| Store 名称 | 职责 | 持久化 |
|-----------|------|--------|
| `editorStore` | 编辑器核心状态 (内容、光标、语言等) | 否 |
| `tabsStore` | 标签页管理 (打开的文件列表、激活状态) | 是 |
| `fileSystemStore` | 文件系统状态 (文件树、当前目录) | 是 |
| `settingsStore` | 用户设置 (主题、字体、自动保存等) | 是 |

---

## 2. editorStore

管理当前活动编辑器的状态。

```typescript
// stores/editor.ts
import { defineStore } from 'pinia';
import type { Ref } from 'vue';

export interface EditorState {
  content: string;              // 当前编辑器内容
  language: string;             // 语言模式
  encoding: string;             // 文件编码
  cursorPosition: {
    line: number;
    column: number;
  };
  selection: {
    start: number;
    end: number;
  } | null;
  isReadOnly: boolean;          // 只读模式
  isDirty: boolean;             // 是否有未保存的更改
  canUndo: boolean;             // 是否可以撤销
  canRedo: boolean;             // 是否可以重做
  zoomLevel: number;            // 缩放级别
}

export const useEditorStore = defineStore('editor', {
  state: (): EditorState => ({
    content: '',
    language: 'plaintext',
    encoding: 'utf-8',
    cursorPosition: { line: 1, column: 1 },
    selection: null,
    isReadOnly: false,
    isDirty: false,
    canUndo: false,
    canRedo: false,
    zoomLevel: 1,
  }),

  getters: {
    // 获取当前行内容
    currentLine: (state) => {
      const lines = state.content.split('\n');
      return lines[state.cursorPosition.line - 1] || '';
    },

    // 获取选中的文本
    selectedText: (state) => {
      if (!state.selection) return '';
      return state.content.substring(
        state.selection.start,
        state.selection.end
      );
    },

    // 行数统计
    lineCount: (state) => {
      return state.content.split('\n').length;
    },
  },

  actions: {
    // 设置内容
    setContent(content: string) {
      this.content = content;
      this.isDirty = true;
    },

    // 更新光标位置
    updateCursorPosition(line: number, column: number) {
      this.cursorPosition = { line, column };
    },

    // 更新选择区域
    updateSelection(start: number, end: number) {
      this.selection = start === end ? null : { start, end };
    },

    // 设置语言模式
    setLanguage(language: string) {
      this.language = language;
    },

    // 标记为已保存
    markAsSaved() {
      this.isDirty = false;
    },

    // 更新撤销/重做状态
    updateUndoRedoState(canUndo: boolean, canRedo: boolean) {
      this.canUndo = canUndo;
      this.canRedo = canRedo;
    },

    // 设置只读模式
    setReadOnly(readOnly: boolean) {
      this.isReadOnly = readOnly;
    },

    // 调整缩放
    setZoomLevel(level: number) {
      this.zoomLevel = Math.max(0.5, Math.min(2, level));
    },

    // 重置编辑器状态
    reset() {
      this.$patch({
        content: '',
        language: 'plaintext',
        cursorPosition: { line: 1, column: 1 },
        selection: null,
        isDirty: false,
        canUndo: false,
        canRedo: false,
      });
    },
  },
});
```

---

## 3. tabsStore

管理编辑器标签页。

```typescript
// stores/tabs.ts
import { defineStore } from 'pinia';

export interface Tab {
  id: string;                   // 唯一标识
  filePath: string;             // 文件路径
  fileName: string;             // 文件名
  language: string;             // 语言模式
  isDirty: boolean;             // 是否有未保存的更改
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
      this.tabs.splice(index, 1);

      // 如果关闭的是当前标签，切换到相邻标签
      if (this.activeTabId === tabId) {
        if (this.tabs.length > 0) {
          const newIndex = Math.min(index, this.tabs.length - 1);
          this.activeTabId = this.tabs[newIndex].id;
        } else {
          this.activeTabId = null;
        }
      }

      // 添加到最近关闭列表
      this.recentTabs.unshift(tab.filePath);
      this.recentTabs = this.recentTabs.slice(0, 10); // 保留最多 10 个
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

    // 重新打开最近关闭的标签
    reopenClosedTab() {
      if (this.recentTabs.length === 0) return null;
      const filePath = this.recentTabs.shift()!;
      return filePath;
    },
  },

  // 持久化配置
  persist: {
    storage: localStorage,
    paths: ['recentTabs'],
  },
});
```

---

## 4. fileSystemStore

管理文件系统状态。

```typescript
// stores/fileSystem.ts
import { defineStore } from 'pinia';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileEntry[];
  isExpanded?: boolean;
  size?: number;
  modified?: number;
}

export interface FileSystemState {
  rootPath: string | null;      // 工作目录根路径
  fileTree: FileEntry[];        // 文件树
  loading: boolean;             // 是否正在加载
  error: string | null;         // 错误信息
  selectedPath: string | null;  // 当前选中的文件/文件夹
}

export const useFileSystemStore = defineStore('fileSystem', {
  state: (): FileSystemState => ({
    rootPath: null,
    fileTree: [],
    loading: false,
    error: null,
    selectedPath: null,
  }),

  getters: {
    // 获取选中条目的详细信息
    selectedEntry: (state) => {
      if (!state.selectedPath) return null;
      return this.findEntryByPath(state.fileTree, state.selectedPath);
    },

    // 检查路径是否在工作目录内
    isInWorkdir: (state) => {
      return (path: string) => {
        if (!state.rootPath) return false;
        return path.startsWith(state.rootPath);
      };
    },
  },

  actions: {
    // 设置工作目录
    async setRootPath(path: string) {
      this.rootPath = path;
      await this.refreshFileTree();
    },

    // 刷新文件树
    async refreshFileTree() {
      if (!this.rootPath) return;

      this.loading = true;
      this.error = null;

      try {
        const entries = await invoke<FileEntry[]>('list_files', {
          dir: this.rootPath,
        });
        this.fileTree = this.buildTree(entries);
      } catch (e) {
        this.error = e as string;
      } finally {
        this.loading = false;
      }
    },

    // 构建文件树
    buildTree(entries: FileEntry[]): FileEntry[] {
      // 将平铺的条目转换为树形结构
      const tree: FileEntry[] = [];
      const folderMap = new Map<string, FileEntry>();

      // 首先创建所有文件夹
      entries.forEach(entry => {
        if (entry.type === 'folder') {
          folderMap.set(entry.path, { ...entry, children: [] });
        }
      });

      // 然后添加文件和子文件夹
      entries.forEach(entry => {
        if (entry.type === 'folder') {
          tree.push(folderMap.get(entry.path)!);
        } else {
          // 文件，找到父文件夹添加
          const parentPath = path.dirname(entry.path);
          const parent = folderMap.get(parentPath);
          if (parent && parent.children) {
            parent.children.push(entry);
          } else {
            tree.push(entry);
          }
        }
      });

      return tree;
    },

    // 切换文件夹展开状态
    toggleFolder(folderPath: string) {
      const folder = this.findEntryByPath(this.fileTree, folderPath);
      if (folder && folder.type === 'folder') {
        folder.isExpanded = !folder.isExpanded;
      }
    },

    // 按路径查找条目
    findEntryByPath(entries: FileEntry[], targetPath: string): FileEntry | null {
      for (const entry of entries) {
        if (entry.path === targetPath) {
          return entry;
        }
        if (entry.children) {
          const found = this.findEntryByPath(entry.children, targetPath);
          if (found) return found;
        }
      }
      return null;
    },

    // 设置选中项
    selectEntry(path: string | null) {
      this.selectedPath = path;
    },

    // 添加新条目到树
    addEntry(entry: FileEntry) {
      const parentPath = path.dirname(entry.path);
      if (parentPath === this.rootPath) {
        this.fileTree.push(entry);
      } else {
        const parent = this.findEntryByPath(this.fileTree, parentPath);
        if (parent && parent.children) {
          parent.children.push(entry);
        }
      }
    },

    // 从树中移除条目
    removeEntry(entryPath: string) {
      const parentPath = path.dirname(entryPath);
      if (parentPath === this.rootPath) {
        this.fileTree = this.fileTree.filter(e => e.path !== entryPath);
      } else {
        const parent = this.findEntryByPath(this.fileTree, parentPath);
        if (parent && parent.children) {
          parent.children = parent.children.filter(e => e.path !== entryPath);
        }
      }
    },
  },

  persist: {
    storage: localStorage,
    paths: ['rootPath'],
  },
});
```

---

## 5. settingsStore

管理用户设置。

```typescript
// stores/settings.ts
import { defineStore } from 'pinia';

export interface EditorSettings {
  // 编辑器外观
  theme: 'light' | 'dark' | 'system';
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  minimap: boolean;
  wordWrap: boolean;

  // 自动保存
  autoSaveEnabled: boolean;
  autoSaveInterval: number;     // 秒

  // 标签页
  tabSize: number;
  insertSpaces: boolean;
  trimTrailingWhitespace: boolean;

  // 文件树
  showHiddenFiles: boolean;
  fileTreeWidth: number;

  // 其他
  confirmBeforeClose: boolean;
  restoreLastSession: boolean;
}

export const useSettingsStore = defineStore('settings', {
  state: (): EditorSettings => ({
    theme: 'system',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 14,
    lineHeight: 1.6,
    minimap: true,
    wordWrap: false,
    autoSaveEnabled: true,
    autoSaveInterval: 30,
    tabSize: 2,
    insertSpaces: true,
    trimTrailingWhitespace: true,
    showHiddenFiles: false,
    fileTreeWidth: 250,
    confirmBeforeClose: true,
    restoreLastSession: true,
  }),

  getters: {
    // 获取 Monaco 配置选项
    monacoOptions: (state) => ({
      fontFamily: state.fontFamily,
      fontSize: state.fontSize,
      lineHeight: Math.round(state.lineHeight * 10),
      minimap: { enabled: state.minimap },
      wordWrap: state.wordWrap ? 'on' : 'off',
      tabSize: state.tabSize,
      insertSpaces: state.insertSpaces,
      trimAutoWhitespace: state.trimTrailingWhitespace,
    }),
  },

  actions: {
    // 更新设置
    updateSettings(partial: Partial<EditorSettings>) {
      this.$patch(partial);
    },

    // 重置为默认值
    resetToDefaults() {
      this.$reset();
    },

    // 应用主题
    applyTheme() {
      const root = document.documentElement;
      if (this.theme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
      } else if (this.theme === 'light') {
        root.classList.add('light');
        root.classList.remove('dark');
      } else {
        // system
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.toggle('dark', prefersDark);
        root.classList.toggle('light', !prefersDark);
      }
    },

    // 初始化
    init() {
      this.applyTheme();
      this.syncWithTauri();
    },

    // 同步设置到 Tauri 后端
    async syncWithTauri() {
      await invoke('auto_save_config', {
        interval: this.autoSaveEnabled ? this.autoSaveInterval : 0,
      });
    },
  },

  persist: {
    storage: localStorage,
    paths: [
      'theme',
      'fontFamily',
      'fontSize',
      'lineHeight',
      'minimap',
      'wordWrap',
      'autoSaveEnabled',
      'autoSaveInterval',
      'tabSize',
      'insertSpaces',
      'showHiddenFiles',
      'fileTreeWidth',
      'confirmBeforeClose',
      'restoreLastSession',
    ],
  },
});
```

---

## 6. Store 使用示例

```typescript
// 在组件中使用
import { useEditorStore } from '@/stores/editor';
import { useTabsStore } from '@/stores/tabs';
import { useSettingsStore } from '@/stores/settings';

const editorStore = useEditorStore();
const tabsStore = useTabsStore();
const settingsStore = useSettingsStore();

// 读取状态
const content = editorStore.content;
const activeTab = tabsStore.activeTab;
const theme = settingsStore.theme;

// 调用 actions
editorStore.setContent('new content');
tabsStore.addTab({ filePath: '/test.txt', fileName: 'test.txt', language: 'plaintext', isDirty: false });
settingsStore.updateSettings({ fontSize: 16 });
```

---

*文档版本: 1.0*
*创建时间: 2026-03-11*
