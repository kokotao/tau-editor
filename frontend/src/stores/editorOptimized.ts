/**
 * 优化的 Editor Store
 * 
 * 支持非活动标签内容卸载、LRU 缓存、内存管理等优化
 */

import { defineStore } from 'pinia';
import type { Ref } from 'vue';
import { fileCommands, TauriError } from '@/lib/tauri';

// LRU 缓存配置
const MAX_CACHED_CONTENTS = 10;  // 最多缓存 10 个文件内容
const MAX_CONTENT_SIZE = 5 * 1024 * 1024;  // 单个内容最大 5MB

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
  // 自动保存相关
  autoSaveEnabled: boolean;     // 是否启用自动保存
  lastAutoSaveTime: Date | null; // 上次自动保存时间
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error'; // 自动保存状态
}

// 缓存的内容
interface CachedContent {
  filePath: string;
  content: string;
  language: string;
  lastAccessed: number;
  size: number;
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
    autoSaveEnabled: true,
    lastAutoSaveTime: null,
    autoSaveStatus: 'idle',
  }),

  // 非响应式缓存
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

  // 添加缓存状态
  actions: {
    // 内容缓存 (LRU)
    contentCache: new Map<string, CachedContent>(),
    
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

    // 启用/禁用自动保存
    setAutoSaveEnabled(enabled: boolean) {
      this.autoSaveEnabled = enabled;
    },

    // 更新自动保存时间
    updateLastAutoSaveTime() {
      this.lastAutoSaveTime = new Date();
    },

    // 设置自动保存状态
    setAutoSaveStatus(status: 'idle' | 'saving' | 'saved' | 'error') {
      this.autoSaveStatus = status;
    },

    // ========== 缓存管理 ==========
    
    // 缓存文件内容
    cacheContent(filePath: string, content: string, language: string) {
      // 检查缓存大小
      const contentSize = content.length;
      if (contentSize > MAX_CONTENT_SIZE) {
        console.log('[Editor] Content too large to cache:', filePath);
        return;
      }
      
      // 如果缓存已满，移除最久未使用的
      if (this.contentCache.size >= MAX_CACHED_CONTENTS) {
        this.evictOldestCache();
      }
      
      this.contentCache.set(filePath, {
        filePath,
        content,
        language,
        lastAccessed: Date.now(),
        size: contentSize,
      });
      
      console.log('[Editor] Cached content:', filePath);
    },
    
    // 获取缓存的内容
    getCachedContent(filePath: string): CachedContent | null {
      const cached = this.contentCache.get(filePath);
      if (cached) {
        // 更新访问时间
        cached.lastAccessed = Date.now();
        return cached;
      }
      return null;
    },
    
    // 移除缓存
    removeCachedContent(filePath: string) {
      this.contentCache.delete(filePath);
    },
    
    // 清除所有缓存
    clearCache() {
      this.contentCache.clear();
    },
    
    // 驱逐最久未使用的缓存
    evictOldestCache() {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      
      this.contentCache.forEach((value, key) => {
        if (value.lastAccessed < oldestTime) {
          oldestTime = value.lastAccessed;
          oldestKey = key;
        }
      });
      
      if (oldestKey) {
        this.contentCache.delete(oldestKey);
        console.log('[Editor] Evicted cache:', oldestKey);
      }
    },
    
    // 获取缓存统计
    getCacheStats() {
      let totalSize = 0;
      this.contentCache.forEach(entry => {
        totalSize += entry.size;
      });
      
      return {
        count: this.contentCache.size,
        totalSizeKB: Math.round(totalSize / 1024),
        maxSize: MAX_CACHED_CONTENTS,
      };
    },

    // ========== Tauri 文件操作 ==========

    // 读取文件内容 (带缓存)
    async readFile(filePath: string): Promise<string> {
      console.log('[Editor] 读取文件:', filePath);
      
      // 检查缓存
      const cached = this.getCachedContent(filePath);
      if (cached) {
        console.log('[Editor] 缓存命中:', filePath);
        return cached.content;
      }
      
      try {
        const content = await fileCommands.readFile(filePath);
        console.log('[Editor] 文件读取成功，内容长度:', content.length);
        
        // 缓存内容
        this.cacheContent(filePath, content, this.language);
        
        return content;
      } catch (error) {
        const tauriError = error instanceof TauriError ? error : TauriError.fromError(error, 'read_file');
        console.error('[Editor] 读取文件失败:', tauriError);
        throw new Error(`读取文件失败：${tauriError.message}`);
      }
    },

    // 保存文件内容
    async writeFile(filePath: string, content: string): Promise<void> {
      console.log('[Editor] 保存文件:', filePath);
      try {
        await fileCommands.writeFile(filePath, content);
        console.log('[Editor] 文件保存成功');
        
        // 更新缓存
        this.cacheContent(filePath, content, this.language);
        
        // 保存成功后标记为干净
        this.markAsSaved();
      } catch (error) {
        const tauriError = error instanceof TauriError ? error : TauriError.fromError(error, 'write_file');
        console.error('[Editor] 保存文件失败:', tauriError);
        throw new Error(`保存文件失败：${tauriError.message}`);
      }
    },

    // 加载文件到编辑器
    async loadFile(filePath: string): Promise<void> {
      console.log('[Editor] 加载文件到编辑器:', filePath);
      try {
        const content = await this.readFile(filePath);
        this.setContent(content);
        this.markAsSaved();
        console.log('[Editor] 文件加载完成');
      } catch (error) {
        console.error('[Editor] 加载文件失败:', error);
        throw error;
      }
    },

    // 保存当前编辑器内容
    async saveFile(filePath: string): Promise<void> {
      console.log('[Editor] 保存编辑器内容到:', filePath);
      try {
        await this.writeFile(filePath, this.content);
        console.log('[Editor] 编辑器内容保存完成');
      } catch (error) {
        console.error('[Editor] 保存编辑器内容失败:', error);
        throw error;
      }
    },
    
    // 卸载非活动文件内容 (释放内存)
    unloadInactiveContent(activeFilePath: string) {
      console.log('[Editor] 卸载非活动内容，保留:', activeFilePath);
      
      this.contentCache.forEach((entry, key) => {
        if (key !== activeFilePath) {
          this.contentCache.delete(key);
        }
      });
    },
  },
});
