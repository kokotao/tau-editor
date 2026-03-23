import { defineStore } from 'pinia';
import type { Ref } from 'vue';
import { fileCommands, TauriError } from '@/lib/tauri';

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
    setContent(content: string, markDirty: boolean = true) {
      this.content = content;
      this.isDirty = markDirty;
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

    // 设置文件编码
    setEncoding(encoding: string) {
      this.encoding = encoding?.trim().toLowerCase() || 'utf-8';
    },

    // 标记为已保存
    markAsSaved() {
      this.isDirty = false;
    },

    setDirty(isDirty: boolean) {
      this.isDirty = isDirty;
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
        encoding: 'utf-8',
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

    // ========== Tauri 文件操作 ==========

    // 读取文件内容
    async readFile(filePath: string): Promise<string> {
      console.log('[Editor] 读取文件:', filePath);
      try {
        const content = await fileCommands.readFile(filePath);
        console.log('[Editor] 文件读取成功，内容长度:', content.length);
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
        this.setContent(content, false);
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
  },
});
