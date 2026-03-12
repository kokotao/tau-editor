/**
 * EditorOptimized Store 测试
 * 
 * 测试优化版编辑器存储的各项功能，包括 LRU 缓存、内存管理、文件操作等
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useEditorStore } from '@/stores/editorOptimized';

// Mock Tauri commands
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock('@/lib/tauri', () => ({
  fileCommands: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
  },
  TauriError: class TauriError extends Error {
    static fromError(error: any, operation: string) {
      return new TauriError(`[${operation}] ${error.message || 'Unknown error'}`);
    }
  },
}));

describe('EditorOptimized Store', () => {
  let pinia: ReturnType<typeof createPinia>;
  let store: ReturnType<typeof useEditorStore>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    store = useEditorStore();
    
    // 重置所有 mocks
    vi.clearAllMocks();
    
    // 重置 store 到初始状态
    store.$reset();
    store.contentCache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('初始状态测试', () => {
    it('应有正确的初始状态', () => {
      expect(store.content).toBe('');
      expect(store.language).toBe('plaintext');
      expect(store.encoding).toBe('utf-8');
      expect(store.cursorPosition).toEqual({ line: 1, column: 1 });
      expect(store.selection).toBeNull();
      expect(store.isReadOnly).toBe(false);
      expect(store.isDirty).toBe(false);
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);
      expect(store.zoomLevel).toBe(1);
      expect(store.autoSaveEnabled).toBe(true);
      expect(store.lastAutoSaveTime).toBeNull();
      expect(store.autoSaveStatus).toBe('idle');
    });

    it('应正确重置状态', () => {
      // 修改一些状态
      store.setContent('test content');
      store.setLanguage('typescript');
      store.updateCursorPosition(5, 10);
      
      // 重置
      store.$reset();
      
      expect(store.content).toBe('');
      expect(store.language).toBe('plaintext');
      expect(store.cursorPosition).toEqual({ line: 1, column: 1 });
    });
  });

  describe('Getters 测试', () => {
    it('currentLine 应返回当前行内容', () => {
      store.setContent('line 1\nline 2\nline 3');
      store.updateCursorPosition(2, 1);
      
      expect(store.currentLine).toBe('line 2');
    });

    it('currentLine 在超出范围时应返回空字符串', () => {
      store.setContent('line 1\nline 2');
      store.updateCursorPosition(10, 1);
      
      expect(store.currentLine).toBe('');
    });

    it('selectedText 应返回选中的文本', () => {
      store.setContent('Hello World');
      store.updateSelection(0, 5);
      
      expect(store.selectedText).toBe('Hello');
    });

    it('selectedText 在空选择时应返回空字符串', () => {
      store.setContent('Hello World');
      store.updateSelection(0, 0);
      
      expect(store.selectedText).toBe('');
    });

    it('selectedText 在没有选择时应返回空字符串', () => {
      store.setContent('Hello World');
      
      expect(store.selectedText).toBe('');
    });

    it('lineCount 应返回正确的行数', () => {
      store.setContent('line 1\nline 2\nline 3');
      
      expect(store.lineCount).toBe(3);
    });

    it('lineCount 对于空内容应返回 1', () => {
      store.setContent('');
      
      expect(store.lineCount).toBe(1);
    });
  });

  describe('内容管理测试', () => {
    it('setContent 应设置内容并标记为脏', () => {
      store.setContent('test content');
      
      expect(store.content).toBe('test content');
      expect(store.isDirty).toBe(true);
    });

    it('markAsSaved 应清除脏状态', () => {
      store.setContent('test content');
      expect(store.isDirty).toBe(true);
      
      store.markAsSaved();
      expect(store.isDirty).toBe(false);
    });

    it('reset 应重置编辑器状态', () => {
      store.setContent('test content');
      store.setLanguage('typescript');
      store.updateCursorPosition(5, 10);
      store.updateSelection(0, 5);
      
      store.reset();
      
      expect(store.content).toBe('');
      expect(store.language).toBe('plaintext');
      expect(store.cursorPosition).toEqual({ line: 1, column: 1 });
      expect(store.selection).toBeNull();
      expect(store.isDirty).toBe(false);
    });
  });

  describe('光标和选择测试', () => {
    it('updateCursorPosition 应更新光标位置', () => {
      store.updateCursorPosition(10, 20);
      
      expect(store.cursorPosition).toEqual({ line: 10, column: 20 });
    });

    it('updateSelection 应更新选择区域', () => {
      store.updateSelection(5, 15);
      
      expect(store.selection).toEqual({ start: 5, end: 15 });
    });

    it('updateSelection 在 start 等于 end 时应设为 null', () => {
      store.updateSelection(5, 5);
      
      expect(store.selection).toBeNull();
    });
  });

  describe('语言和只读模式测试', () => {
    it('setLanguage 应设置语言模式', () => {
      store.setLanguage('typescript');
      expect(store.language).toBe('typescript');
      
      store.setLanguage('python');
      expect(store.language).toBe('python');
    });

    it('setReadOnly 应设置只读模式', () => {
      store.setReadOnly(true);
      expect(store.isReadOnly).toBe(true);
      
      store.setReadOnly(false);
      expect(store.isReadOnly).toBe(false);
    });
  });

  describe('缩放测试', () => {
    it('setZoomLevel 应设置缩放级别', () => {
      store.setZoomLevel(1.5);
      expect(store.zoomLevel).toBe(1.5);
    });

    it('setZoomLevel 应限制最小值', () => {
      store.setZoomLevel(0.1);
      expect(store.zoomLevel).toBe(0.5);
    });

    it('setZoomLevel 应限制最大值', () => {
      store.setZoomLevel(3);
      expect(store.zoomLevel).toBe(2);
    });
  });

  describe('撤销重做状态测试', () => {
    it('updateUndoRedoState 应更新撤销重做状态', () => {
      store.updateUndoRedoState(true, false);
      
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(false);
      
      store.updateUndoRedoState(true, true);
      
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(true);
    });
  });

  describe('自动保存测试', () => {
    it('setAutoSaveEnabled 应启用/禁用自动保存', () => {
      store.setAutoSaveEnabled(false);
      expect(store.autoSaveEnabled).toBe(false);
      
      store.setAutoSaveEnabled(true);
      expect(store.autoSaveEnabled).toBe(true);
    });

    it('updateLastAutoSaveTime 应更新时间', () => {
      const before = Date.now();
      store.updateLastAutoSaveTime();
      const after = Date.now();
      
      expect(store.lastAutoSaveTime).toBeDefined();
      expect((store.lastAutoSaveTime as Date).getTime()).toBeGreaterThanOrEqual(before);
      expect((store.lastAutoSaveTime as Date).getTime()).toBeLessThanOrEqual(after);
    });

    it('setAutoSaveStatus 应更新自动保存状态', () => {
      store.setAutoSaveStatus('saving');
      expect(store.autoSaveStatus).toBe('saving');
      
      store.setAutoSaveStatus('saved');
      expect(store.autoSaveStatus).toBe('saved');
      
      store.setAutoSaveStatus('error');
      expect(store.autoSaveStatus).toBe('error');
      
      store.setAutoSaveStatus('idle');
      expect(store.autoSaveStatus).toBe('idle');
    });
  });

  describe('LRU 缓存测试', () => {
    it('cacheContent 应缓存文件内容', () => {
      store.cacheContent('/test/file.txt', 'test content', 'plaintext');
      
      expect(store.contentCache.size).toBe(1);
      const cached = store.contentCache.get('/test/file.txt');
      expect(cached).toBeDefined();
      expect(cached?.content).toBe('test content');
      expect(cached?.language).toBe('plaintext');
    });

    it('getCachedContent 应返回缓存的内容', () => {
      store.cacheContent('/test/file.txt', 'test content', 'plaintext');
      
      const cached = store.getCachedContent('/test/file.txt');
      expect(cached).toBeDefined();
      expect(cached?.content).toBe('test content');
    });

    it('getCachedContent 应更新访问时间', () => {
      store.cacheContent('/test/file.txt', 'test content', 'plaintext');
      const cached1 = store.getCachedContent('/test/file.txt');
      
      // 等待一小段时间
      vi.advanceTimersByTime(100);
      
      const cached2 = store.getCachedContent('/test/file.txt');
      expect(cached2?.lastAccessed).toBeGreaterThan(cached1?.lastAccessed || 0);
    });

    it('getCachedContent 对于不存在的缓存应返回 null', () => {
      const cached = store.getCachedContent('/nonexistent/file.txt');
      expect(cached).toBeNull();
    });

    it('removeCachedContent 应移除缓存', () => {
      store.cacheContent('/test/file.txt', 'test content', 'plaintext');
      expect(store.contentCache.size).toBe(1);
      
      store.removeCachedContent('/test/file.txt');
      expect(store.contentCache.size).toBe(0);
    });

    it('clearCache 应清除所有缓存', () => {
      store.cacheContent('/test/file1.txt', 'content 1', 'plaintext');
      store.cacheContent('/test/file2.txt', 'content 2', 'plaintext');
      store.cacheContent('/test/file3.txt', 'content 3', 'plaintext');
      
      expect(store.contentCache.size).toBe(3);
      
      store.clearCache();
      expect(store.contentCache.size).toBe(0);
    });

    it('evictOldestCache 应移除最久未使用的缓存', () => {
      // 添加多个缓存
      store.cacheContent('/test/file1.txt', 'content 1', 'plaintext');
      vi.advanceTimersByTime(100);
      
      store.cacheContent('/test/file2.txt', 'content 2', 'plaintext');
      vi.advanceTimersByTime(100);
      
      store.cacheContent('/test/file3.txt', 'content 3', 'plaintext');
      
      // 手动设置访问时间，确保 file1 是最老的
      const file1 = store.contentCache.get('/test/file1.txt');
      if (file1) {
        file1.lastAccessed = 1000;
      }
      
      store.evictOldestCache();
      
      expect(store.contentCache.size).toBe(2);
      expect(store.contentCache.has('/test/file1.txt')).toBe(false);
      expect(store.contentCache.has('/test/file2.txt')).toBe(true);
      expect(store.contentCache.has('/test/file3.txt')).toBe(true);
    });

    it('缓存达到上限时应自动驱逐最老的缓存', () => {
      // MAX_CACHED_CONTENTS = 10
      for (let i = 0; i < 12; i++) {
        store.cacheContent(`/test/file${i}.txt`, `content ${i}`, 'plaintext');
        vi.advanceTimersByTime(10);
      }
      
      expect(store.contentCache.size).toBeLessThanOrEqual(10);
    });

    it('超过最大内容大小的文件不应被缓存', () => {
      const largeContent = 'x'.repeat(6 * 1024 * 1024); // 6MB, 超过 5MB 限制
      
      store.cacheContent('/test/large.txt', largeContent, 'plaintext');
      
      expect(store.contentCache.size).toBe(0);
    });

    it('getCacheStats 应返回正确的统计信息', () => {
      store.cacheContent('/test/file1.txt', 'content 1', 'plaintext');
      store.cacheContent('/test/file2.txt', 'content 2', 'plaintext');
      
      const stats = store.getCacheStats();
      
      expect(stats.count).toBe(2);
      expect(stats.totalSizeKB).toBeGreaterThan(0);
      expect(stats.maxSize).toBe(10);
    });
  });

  describe('文件操作测试', () => {
    it('readFile 应从 Tauri 读取文件', async () => {
      mockReadFile.mockResolvedValue('file content');
      
      const content = await store.readFile('/test/file.txt');
      
      expect(content).toBe('file content');
      expect(mockReadFile).toHaveBeenCalledWith('/test/file.txt');
    });

    it('readFile 应缓存读取的内容', async () => {
      mockReadFile.mockResolvedValue('file content');
      
      await store.readFile('/test/file.txt');
      
      expect(store.contentCache.size).toBe(1);
      const cached = store.getCachedContent('/test/file.txt');
      expect(cached?.content).toBe('file content');
    });

    it('readFile 在缓存命中时应直接返回缓存', async () => {
      store.cacheContent('/test/file.txt', 'cached content', 'plaintext');
      
      const content = await store.readFile('/test/file.txt');
      
      expect(content).toBe('cached content');
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('readFile 在读取失败时应抛出错误', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      
      await expect(store.readFile('/nonexistent/file.txt'))
        .rejects
        .toThrow('读取文件失败');
    });

    it('writeFile 应写入文件到 Tauri', async () => {
      mockWriteFile.mockResolvedValue(undefined);
      
      await store.writeFile('/test/file.txt', 'new content');
      
      expect(mockWriteFile).toHaveBeenCalledWith('/test/file.txt', 'new content');
    });

    it('writeFile 应更新缓存', async () => {
      mockWriteFile.mockResolvedValue(undefined);
      
      await store.writeFile('/test/file.txt', 'new content');
      
      const cached = store.getCachedContent('/test/file.txt');
      expect(cached?.content).toBe('new content');
    });

    it('writeFile 应标记为已保存', async () => {
      mockWriteFile.mockResolvedValue(undefined);
      store.setContent('new content');
      expect(store.isDirty).toBe(true);
      
      await store.writeFile('/test/file.txt', 'new content');
      
      expect(store.isDirty).toBe(false);
    });

    it('writeFile 在写入失败时应抛出错误', async () => {
      mockWriteFile.mockRejectedValue(new Error('Permission denied'));
      
      await expect(store.writeFile('/readonly/file.txt', 'content'))
        .rejects
        .toThrow('保存文件失败');
    });

    it('loadFile 应读取文件并设置内容', async () => {
      mockReadFile.mockResolvedValue('file content');
      
      await store.loadFile('/test/file.txt');
      
      expect(store.content).toBe('file content');
      expect(store.isDirty).toBe(false);
    });

    it('saveFile 应保存当前编辑器内容', async () => {
      mockWriteFile.mockResolvedValue(undefined);
      store.setContent('editor content');
      
      await store.saveFile('/test/file.txt');
      
      expect(mockWriteFile).toHaveBeenCalledWith('/test/file.txt', 'editor content');
    });
  });

  describe('内存管理测试', () => {
    it('unloadInactiveContent 应只保留活动文件的缓存', () => {
      store.cacheContent('/test/file1.txt', 'content 1', 'plaintext');
      store.cacheContent('/test/file2.txt', 'content 2', 'plaintext');
      store.cacheContent('/test/file3.txt', 'content 3', 'plaintext');
      
      expect(store.contentCache.size).toBe(3);
      
      store.unloadInactiveContent('/test/file2.txt');
      
      expect(store.contentCache.size).toBe(1);
      expect(store.contentCache.has('/test/file2.txt')).toBe(true);
      expect(store.contentCache.has('/test/file1.txt')).toBe(false);
      expect(store.contentCache.has('/test/file3.txt')).toBe(false);
    });
  });
});
