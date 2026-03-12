<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useFileSystemStore } from '@/stores/fileSystem'
import { useTabsStore } from '@/stores/tabs'
import { useEditorStore } from '@/stores/editor'
import { useSettingsStore } from '@/stores/settings'
import { useNotificationStore } from '@/stores/notification'
import { useKeyboardStore } from '@/stores/keyboard'

// Components
import Toolbar from './components/editor/Toolbar.vue'
import FileTree from './components/editor/FileTree.vue'
import EditorTabs from './components/editor/EditorTabs.vue'
import EditorCore from './components/editor/EditorCore.vue'
import StatusBar from './components/editor/StatusBar.vue'
import SettingsPanel from './components/editor/SettingsPanel.vue'
import Notification from './components/ui/Notification.vue'

// Stores
const fileSystemStore = useFileSystemStore()
const tabsStore = useTabsStore()
const editorStore = useEditorStore()
const settingsStore = useSettingsStore()
const notificationStore = useNotificationStore()
const keyboardStore = useKeyboardStore()

// State
const showFileTree = ref(true)
const fileTreeWidth = ref(250)
const showSettingsPanel = ref(false)

// Computed
const fileTree = computed(() => fileSystemStore.fileTree)
const loading = computed(() => fileSystemStore.loading)
const selectedPath = computed(() => fileSystemStore.selectedPath)
const tabs = computed(() => tabsStore.tabs)
const activeTabId = computed(() => tabsStore.activeTabId)
const activeTab = computed(() => tabsStore.activeTab || null)
const cursorPosition = computed(() => editorStore.cursorPosition)
const language = computed(() => editorStore.language)
const lineCount = computed(() => editorStore.lineCount)
const canUndo = computed(() => editorStore.canUndo)
const canRedo = computed(() => editorStore.canRedo)
const isDirty = computed(() => editorStore.isDirty)
const autoSaveEnabled = computed(() => settingsStore.autoSaveEnabled)
const wordCount = computed(() => {
  const content = editorStore.content || ''
  return content.trim() ? content.trim().split(/\s+/).length : 0
})

// ========== 文件操作方法（带错误处理和加载状态） ==========

const handleNewFile = async () => {
  console.log('New file')
  try {
    // 创建一个未命名的新标签
    const newTabId = (tabsStore as any).addTab({
      filePath: 'untitled',
      fileName: 'Untitled',
      language: 'plaintext',
      isDirty: false,
    })
    editorStore.setContent('')
    editorStore.setLanguage('plaintext')
    editorStore.markAsSaved()
    
    notificationStore.success('新建文件成功', '已创建新标签页')
    return newTabId
  } catch (error) {
    console.error('Failed to create new file:', error)
    notificationStore.error('新建文件失败', '无法创建新标签页，请重试')
  }
}

const handleOpenFile = () => {
  console.log('Open file')
  notificationStore.info('打开文件', '请从文件树中选择要打开的文件')
}

const handleSave = async () => {
  console.log('Save')
  if (!activeTabId.value || !activeTab.value) {
    notificationStore.warning('无法保存', '没有活动的标签页')
    return
  }
  
  const tab = activeTab.value
  if (tab.filePath === 'untitled') {
    // 未命名文件，需要另存为
    handleSaveAs()
    return
  }
  
  try {
    fileSystemStore.loading = true
    await fileSystemStore.writeFileContent(tab.filePath, editorStore.content)
    tabsStore.updateTabDirty(activeTabId.value, false)
    editorStore.markAsSaved()
    
    notificationStore.success('保存成功', `文件已保存：${tab.fileName}`)
  } catch (error: any) {
    console.error('Failed to save file:', error)
    notificationStore.error(
      '保存失败',
      error.message || '无法保存文件，请检查文件权限',
      {
        label: '重试',
        handler: () => handleSave()
      }
    )
  } finally {
    fileSystemStore.loading = false
  }
}

const handleSaveAs = () => {
  console.log('Save as')
  const newPath = prompt('请输入文件路径:')
  if (newPath && activeTabId.value) {
    const tab = tabsStore.tabs.find(t => t.id === activeTabId.value)
    if (tab) {
      tab.filePath = newPath
      tab.fileName = newPath.split('/').pop() || 'Untitled'
      handleSave()
    }
  }
}

const handleUndo = () => {
  console.log('Undo')
  // Monaco 编辑器内置了撤销功能，Ctrl+Z 可以直接触发
  notificationStore.info('撤销', '使用 Ctrl+Z 撤销操作')
}

const handleRedo = () => {
  console.log('Redo')
  // Monaco 编辑器内置了重做功能，Ctrl+Y 或 Ctrl+Shift+Z 可以直接触发
  notificationStore.info('重做', '使用 Ctrl+Y 重做操作')
}

const handleToggleFileTree = () => {
  showFileTree.value = !showFileTree.value
}

const handleToggleSettings = () => {
  showSettingsPanel.value = !showSettingsPanel.value
}

// ========== 文件树事件处理 ==========

const handleFileOpen = async (filePath: string) => {
  console.log('Open file:', filePath)
  
  // 检查文件是否已打开
  const existingTabId = tabsStore.getTabIdByPath(filePath)
  if (existingTabId) {
    tabsStore.activateTab(existingTabId)
    notificationStore.info('文件已打开', `已切换到：${filePath.split('/').pop()}`)
    return
  }
  
  // 文件未打开，读取内容并创建新标签
  try {
    fileSystemStore.loading = true
    const loadingNotif = notificationStore.loading('正在加载', `打开文件：${filePath.split('/').pop()}`)
    
    const content = await fileSystemStore.readFileContent(filePath)
    
    // 根据文件扩展名推断语言
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'vue': 'vue',
      'py': 'python',
      'java': 'java',
      'rs': 'rust',
      'md': 'markdown',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'sql': 'sql',
      'sh': 'shell',
      'go': 'go',
      'c': 'c',
      'cpp': 'cpp',
      'cs': 'csharp',
    }
    const language = languageMap[ext] || 'plaintext'
    
    // 创建新标签
    tabsStore.addTab({
      filePath,
      fileName: filePath.split('/').pop() || 'Untitled',
      language,
      isDirty: false,
    })
    
    // 设置编辑器内容
    editorStore.setContent(content)
    editorStore.setLanguage(language)
    editorStore.markAsSaved()
    
    fileSystemStore.selectEntry(filePath)
    
    // 关闭加载通知，显示成功通知
    notificationStore.dismiss(loadingNotif)
    notificationStore.success('文件加载成功', `已打开：${filePath.split('/').pop()}`)
  } catch (error: any) {
    console.error('Failed to open file:', error)
    notificationStore.error(
      '打开文件失败',
      error.message || '无法读取文件内容',
      {
        label: '重试',
        handler: () => handleFileOpen(filePath)
      }
    )
  } finally {
    fileSystemStore.loading = false
  }
}

const handleFolderToggle = (folderPath: string) => {
  fileSystemStore.toggleFolder(folderPath)
}

const handleRefresh = async () => {
  try {
    fileSystemStore.loading = true
    await fileSystemStore.refreshFileTree()
    notificationStore.success('刷新成功', '文件树已更新')
  } catch (error: any) {
    console.error('Failed to refresh file tree:', error)
    notificationStore.error('刷新失败', error.message || '无法刷新文件树')
  } finally {
    fileSystemStore.loading = false
  }
}

// ========== 标签页事件处理 ==========

const handleTabClick = (tabId: string) => {
  console.log('Tab clicked:', tabId)
  tabsStore.activateTab(tabId)
}

const handleTabClose = (tabId: string) => {
  console.log('Tab closed:', tabId)
  tabsStore.closeTab(tabId)
}

// ========== 编辑器事件处理 ==========

const handleContentChange = (content: string) => {
  console.log('Content changed')
  if (activeTabId.value) {
    tabsStore.updateTabDirty(activeTabId.value, true)
  }
}

const handleCursorChange = (position: { line: number; column: number }) => {
  editorStore.updateCursorPosition(position.line, position.column)
}

// ========== 状态栏事件处理 ==========

const handleLanguageChange = (language: string) => {
  editorStore.setLanguage(language)
  notificationStore.info('语言模式已更改', `当前语言：${language}`)
}

const handleThemeChange = (theme: string) => {
  settingsStore.updateSettings({ monacoTheme: theme as 'vs' | 'vs-dark' | 'hc-black' })
  notificationStore.info('主题已更改', `当前主题：${theme}`)
}

// ========== 快捷键注册 ==========

const registerShortcuts = () => {
  // 文件操作
  keyboardStore.register({
    id: 'new-file',
    key: 'n',
    modifiers: ['ctrl'],
    handler: handleNewFile,
    description: '新建文件',
  })

  keyboardStore.register({
    id: 'open-file',
    key: 'o',
    modifiers: ['ctrl'],
    handler: handleOpenFile,
    description: '打开文件',
  })

  keyboardStore.register({
    id: 'save',
    key: 's',
    modifiers: ['ctrl'],
    handler: handleSave,
    description: '保存文件',
  })

  // 编辑操作
  keyboardStore.register({
    id: 'undo',
    key: 'z',
    modifiers: ['ctrl'],
    handler: handleUndo,
    description: '撤销',
  })

  keyboardStore.register({
    id: 'redo',
    key: 'y',
    modifiers: ['ctrl'],
    handler: handleRedo,
    description: '重做',
  })

  keyboardStore.register({
    id: 'select-all',
    key: 'a',
    modifiers: ['ctrl'],
    handler: () => {
      // Monaco 编辑器内置全选功能
      notificationStore.info('全选', '使用 Ctrl+A 全选文本')
    },
    description: '全选',
  })

  // 标签页操作
  keyboardStore.register({
    id: 'next-tab',
    key: 'tab',
    modifiers: ['ctrl'],
    handler: () => {
      tabsStore.nextTab()
      notificationStore.info('切换标签', '已切换到下一个标签页')
    },
    description: '切换下一个标签页',
  })

  keyboardStore.register({
    id: 'prev-tab',
    key: 'tab',
    modifiers: ['ctrl', 'shift'],
    handler: () => {
      tabsStore.prevTab()
      notificationStore.info('切换标签', '已切换到上一个标签页')
    },
    description: '切换上一个标签页',
  })

  keyboardStore.register({
    id: 'close-tab',
    key: 'w',
    modifiers: ['ctrl'],
    handler: () => {
      if (activeTabId.value) {
        tabsStore.closeTab(activeTabId.value)
        notificationStore.info('关闭标签', '标签页已关闭')
      }
    },
    description: '关闭当前标签页',
  })

  // 设置
  keyboardStore.register({
    id: 'toggle-settings',
    key: ',',
    modifiers: ['ctrl'],
    handler: handleToggleSettings,
    description: '打开/关闭设置',
  })

  // 字体大小调整
  keyboardStore.register({
    id: 'increase-font',
    key: '+',
    modifiers: ['ctrl'],
    handler: () => {
      settingsStore.adjustFontSize(1)
      notificationStore.info('字体大小', `当前字体：${settingsStore.fontSize}px`)
    },
    description: '增大字体',
  })

  keyboardStore.register({
    id: 'decrease-font',
    key: '-',
    modifiers: ['ctrl'],
    handler: () => {
      settingsStore.adjustFontSize(-1)
      notificationStore.info('字体大小', `当前字体：${settingsStore.fontSize}px`)
    },
    description: '减小字体',
  })

  keyboardStore.register({
    id: 'reset-font',
    key: '0',
    modifiers: ['ctrl'],
    handler: () => {
      settingsStore.resetFontSize()
      notificationStore.info('字体大小', '字体已重置为默认大小')
    },
    description: '重置字体大小',
  })

  // 主题切换
  keyboardStore.register({
    id: 'toggle-theme',
    key: 'b',
    modifiers: ['ctrl'],
    handler: () => {
      settingsStore.toggleTheme()
      notificationStore.info('主题切换', `当前主题：${settingsStore.theme}`)
    },
    description: '切换深色/浅色主题',
  })
}

// ========== 生命周期 ==========

onMounted(() => {
  // 初始化设置（从 localStorage 加载）
  settingsStore.init()
  
  // 注册快捷键
  registerShortcuts()
  
  // 模拟加载文件树（开发测试用）
  fileSystemStore.fileTree = [
    {
      name: 'src',
      path: '/project/src',
      type: 'folder',
      isExpanded: true,
      children: [
        { name: 'App.vue', path: '/project/src/App.vue', type: 'file' },
        { name: 'main.ts', path: '/project/src/main.ts', type: 'file' },
      ],
    },
    {
      name: 'package.json',
      path: '/project/package.json',
      type: 'file',
    },
  ]
  
  // 显示欢迎消息
  notificationStore.info('欢迎使用文本编辑器', '快捷键：Ctrl+N 新建，Ctrl+S 保存，Ctrl+, 设置')
})

onUnmounted(() => {
  // 清理快捷键
  keyboardStore.removeGlobalHandler()
})
</script>

<template>
  <div class="app-container">
    <!-- 通知容器 -->
    <Notification />

    <!-- 顶部工具栏 -->
    <Toolbar
      :can-undo="canUndo"
      :can-redo="canRedo"
      :is-dirty="isDirty"
      @new-file="handleNewFile"
      @open-file="handleOpenFile"
      @save="handleSave"
      @save-as="handleSaveAs"
      @undo="handleUndo"
      @redo="handleRedo"
      @toggle-file-tree="handleToggleFileTree"
      @toggle-settings="handleToggleSettings"
    />

    <!-- 主体内容区 -->
    <div class="main-content">
      <!-- 左侧文件树 -->
      <div
        v-show="showFileTree"
        class="sidebar"
        :style="{ width: fileTreeWidth + 'px' }"
      >
        <FileTree
          :file-tree="fileTree"
          :loading="loading"
          :selected-path="selectedPath"
          @file-open="handleFileOpen"
          @folder-toggle="handleFolderToggle"
          @refresh="handleRefresh"
        />
      </div>

      <!-- 中间编辑区 -->
      <div class="editor-area">
        <EditorTabs
          :tabs="tabs"
          :active-tab-id="activeTabId"
          @tab-click="handleTabClick"
          @tab-close="handleTabClose"
        />
        <!-- 编辑器核心组件 -->
        <div class="editor-core-container">
          <EditorCore
            v-if="activeTab"
            :model-id="activeTabId!"
            :language="activeTab.language"
            :theme="settingsStore.monacoTheme"
            @content-change="handleContentChange"
            @cursor-change="handleCursorChange"
            @model-save="handleSave"
          />
        </div>
      </div>

      <!-- 右侧设置面板 -->
      <div
        v-show="showSettingsPanel"
        class="settings-sidebar"
      >
        <SettingsPanel @close="showSettingsPanel = false" />
      </div>
    </div>

    <!-- 底部状态栏 -->
    <StatusBar
      :cursor-position="cursorPosition"
      :language="language"
      :monaco-theme="settingsStore.monacoTheme"
      :auto-save-enabled="autoSaveEnabled"
      @language-change="handleLanguageChange"
      @theme-change="handleThemeChange"
    />
    
    <!-- 保存状态指示器 -->
    <div class="save-indicator" data-testid="save-status">
      <span v-if="isDirty">● 已修改</span>
      <span v-else>✓ 已保存</span>
    </div>
    
    <!-- 字数统计 -->
    <div class="word-count-display" data-testid="word-count">
      {{ wordCount }}
    </div>

    <!-- 加载遮罩 -->
    <div v-if="loading" class="loading-overlay" data-testid="loading-overlay">
      <div class="loading-spinner"></div>
      <span class="loading-text">加载中...</span>
    </div>
  </div>
</template>

<style>
/* 全局样式变量 */
:root {
  --n-color: #252526;
  --n-hover-color: #2a2d2e;
  --n-active-color: #37373d;
  --n-border-color: #333;
  --n-text-color: #ccc;
}

/* 浅色主题变量 */
:root.light {
  --n-color: #ffffff;
  --n-hover-color: #f3f3f3;
  --n-active-color: #e8e8e8;
  --n-border-color: #e0e0e0;
  --n-text-color: #333333;
}

/* 全局样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  background: var(--n-color);
  color: var(--n-text-color);
  transition: background 0.3s ease, color 0.3s ease;
}
</style>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  position: relative;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  flex-shrink: 0;
  border-right: 1px solid var(--n-border-color);
  overflow: hidden;
  transition: width 0.2s ease;
}

.settings-sidebar {
  flex-shrink: 0;
  width: 360px;
  border-left: 1px solid var(--n-border-color);
  overflow: hidden;
  transition: all 0.3s ease;
}

.editor-area {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.editor-core-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  position: relative;
}

.save-indicator {
  position: fixed;
  bottom: 30px;
  right: 12px;
  padding: 4px 8px;
  background: var(--n-color);
  color: var(--n-text-color);
  font-size: 11px;
  border-radius: 4px;
  opacity: 0.9;
}

.word-count-display {
  position: fixed;
  bottom: 30px;
  left: 12px;
  padding: 4px 8px;
  background: var(--n-color);
  color: var(--n-text-color);
  font-size: 11px;
  border-radius: 4px;
  opacity: 0.9;
}

/* 加载遮罩 */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9998;
  backdrop-filter: blur(2px);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--n-border-color);
  border-top-color: #007acc;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-text {
  margin-top: 16px;
  color: var(--n-text-color);
  font-size: 14px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
