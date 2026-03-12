# 跨平台文本编辑器技术架构文档

> 基于 Tauri + Vue3 的现代化文本编辑器架构设计  
> 支持 Windows、macOS、Linux 跨平台运行

---

## 1. 整体技术架构

### 1.1 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      操作系统层                              │
│              Windows / macOS / Linux                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Tauri 后端层 (Rust)                      │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐ │
│  │  文件系统   │  窗口管理   │  系统托盘   │  原生对话框  │ │
│  │   Module    │   Module    │   Module    │   Module    │ │
│  └─────────────┴─────────────┴─────────────┴─────────────┘ │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐ │
│  │  自动保存   │  历史记录   │  插件系统   │  安全沙箱   │ │
│  │   Service   │   Service   │   Service   │   Service   │ │
│  └─────────────┴─────────────┴─────────────┴─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                    IPC (invoke/send)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vue3 前端层 (TypeScript)                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   渲染进程 (Renderer)                │   │
│  │  ┌───────────┬───────────┬───────────┬───────────┐  │   │
│  │  │  编辑器   │  多标签   │  语法高亮  │  主题系统  │  │   │
│  │  │  Component │ Component │  Service  │  Service  │  │   │
│  │  └───────────┴───────────┴───────────┴───────────┘  │   │
│  │  ┌───────────┬───────────┬───────────┬───────────┐  │   │
│  │  │  Pinia    │  Vue      │  Vue      │  Vue      │  │   │
│  │  │  Store    │  Router   │  i18n     │  Composables│ │   │
│  │  └───────────┴───────────┴───────────┴───────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 技术选型理由

| 层级 | 技术 | 理由 |
|------|------|------|
| 后端框架 | **Tauri v2** | 轻量级、安全性高、Rust 性能优势、原生 API 访问 |
| 前端框架 | **Vue 3.4+** | Composition API、响应式系统、生态成熟 |
| 语言 | **TypeScript 5+** | 类型安全、开发体验好、工具链完善 |
| 构建工具 | **Vite 5+** | 极速热更新、按需编译、插件生态丰富 |
| 状态管理 | **Pinia** | Vue 3 官方推荐、TypeScript 友好、轻量 |
| UI 组件库 | **Naive UI** | 完整的组件集、TypeScript 支持好、主题定制灵活 |
| 代码编辑器 | **Monaco Editor** | VS Code 同款、功能强大、语法高亮完善 |
| 图标库 | **Iconify** | 统一图标 API、按需加载、跨平台一致 |

---

## 2. 项目目录结构

```
text-editor/
├── src-tauri/                    # Tauri 后端 (Rust)
│   ├── src/
│   │   ├── main.rs               # 应用入口
│   │   ├── lib.rs                # 库入口
│   │   ├── commands/             # Tauri 命令模块
│   │   │   ├── mod.rs
│   │   │   ├── file.rs           # 文件操作命令
│   │   │   ├── window.rs         # 窗口管理命令
│   │   │   └── settings.rs       # 设置相关命令
│   │   ├── services/             # 后端服务
│   │   │   ├── mod.rs
│   │   │   ├── file_watcher.rs   # 文件监听服务
│   │   │   ├── auto_save.rs      # 自动保存服务
│   │   │   └── history.rs        # 历史记录服务
│   │   ├── models/               # 数据模型
│   │   │   ├── mod.rs
│   │   │   ├── file.rs           # 文件模型
│   │   │   └── settings.rs       # 设置模型
│   │   └── utils/                # 工具函数
│   │       ├── mod.rs
│   │       └── path.rs           # 路径处理
│   ├── Cargo.toml                # Rust 依赖配置
│   ├── tauri.conf.json           # Tauri 配置文件
│   └── build.rs                  # 构建脚本
│
├── src/                          # Vue3 前端 (TypeScript)
│   ├── main.ts                   # 应用入口
│   ├── App.vue                   # 根组件
│   ├── components/               # 可复用组件
│   │   ├── editor/
│   │   │   ├── EditorCore.vue    # 编辑器核心组件
│   │   │   ├── EditorTab.vue     # 标签页组件
│   │   │   ├── EditorTabs.vue    # 标签栏组件
│   │   │   ├── EditorStatus.vue  # 状态栏组件
│   │   │   └── EditorMinimap.vue # 缩略图组件
│   │   ├── layout/
│   │   │   ├── MainLayout.vue    # 主布局
│   │   │   ├── Sidebar.vue       # 侧边栏
│   │   │   └── TitleBar.vue      # 标题栏 (自定义)
│   │   ├── common/
│   │   │   ├── ContextMenu.vue   # 上下文菜单
│   │   │   ├── Modal.vue         # 模态框
│   │   │   └── Tooltip.vue       # 提示框
│   │   └── settings/
│   │       ├── SettingsModal.vue # 设置面板
│   │       └── ThemePicker.vue   # 主题选择器
│   │
│   ├── composables/              # 组合式函数
│   │   ├── useEditor.ts          # 编辑器逻辑
│   │   ├── useFile.ts            # 文件操作
│   │   ├── useTheme.ts           # 主题切换
│   │   ├── useSettings.ts        # 设置管理
│   │   └── useTauri.ts           # Tauri API 封装
│   │
│   ├── stores/                   # Pinia 状态管理
│   │   ├── index.ts
│   │   ├── editor.ts             # 编辑器状态
│   │   ├── file.ts               # 文件状态
│   │   ├── settings.ts           # 设置状态
│   │   └── ui.ts                 # UI 状态
│   │
│   ├── services/                 # 前端服务
│   │   ├── syntax/
│   │   │   ├── index.ts          # 语法高亮服务
│   │   │   ├── languages.ts      # 语言定义
│   │   │   └── themes.ts         # 高亮主题
│   │   ├── theme/
│   │   │   ├── index.ts          # 主题服务
│   │   │   ├── presets.ts        # 预设主题
│   │   │   └── custom.ts         # 自定义主题
│   │   └── history/
│   │       ├── index.ts          # 历史记录服务
│   │       └── undo.ts           # 撤销/重做
│   │
│   ├── types/                    # TypeScript 类型定义
│   │   ├── index.ts
│   │   ├── editor.ts             # 编辑器类型
│   │   ├── file.ts               # 文件类型
│   │   └── settings.ts           # 设置类型
│   │
│   ├── utils/                    # 工具函数
│   │   ├── index.ts
│   │   ├── path.ts               # 路径处理
│   │   ├── encoding.ts           # 编码处理
│   │   └── debounce.ts           # 防抖节流
│   │
│   ├── styles/                   # 样式文件
│   │   ├── main.scss             # 主样式
│   │   ├── variables.scss        # SCSS 变量
│   │   ├── themes/               # 主题样式
│   │   │   ├── light.scss
│   │   │   ├── dark.scss
│   │   │   └── system.scss
│   │   └── components/           # 组件样式
│   │
│   ├── locales/                  # 国际化
│   │   ├── index.ts
│   │   ├── zh-CN.ts              # 简体中文
│   │   ├── en-US.ts              # 英文
│   │   └── ja-JP.ts              # 日文
│   │
│   └── assets/                   # 静态资源
│       ├── icons/                # 图标
│       └── fonts/                # 字体
│
├── public/                       # 公共资源
│   ├── icon.ico                  # Windows 图标
│   ├── icon.icns                 # macOS 图标
│   └── icon.png                  # Linux 图标
│
├── tests/                        # 测试文件
│   ├── unit/                     # 单元测试
│   ├── e2e/                      # 端到端测试
│   └── fixtures/                 # 测试数据
│
├── docs/                         # 文档
│   ├── architecture.md           # 架构文档
│   ├── api.md                    # API 文档
│   └── development.md            # 开发指南
│
├── package.json                  # Node.js 依赖配置
├── tsconfig.json                 # TypeScript 配置
├── vite.config.ts                # Vite 配置
├── tailwind.config.js            # Tailwind CSS 配置 (可选)
├── .eslintrc.js                  # ESLint 配置
├── .prettierrc                   # Prettier 配置
└── README.md                     # 项目说明
```

---

## 3. 关键技术栈详解

### 3.1 状态管理 (Pinia)

```typescript
// stores/editor.ts
import { defineStore } from 'pinia'
import type { EditorState, Tab } from '@/types/editor'

export const useEditorStore = defineStore('editor', {
  state: (): EditorState => ({
    tabs: [],
    activeTabId: null,
    cursorPosition: { line: 1, column: 1 },
    selection: null,
  }),
  
  getters: {
    activeTab: (state) => state.tabs.find(t => t.id === state.activeTabId),
    unsavedTabs: (state) => state.tabs.filter(t => t.isDirty),
  },
  
  actions: {
    openTab(file: FileMeta) {
      // 打开新标签逻辑
    },
    closeTab(tabId: string) {
      // 关闭标签逻辑
    },
    setActiveTab(tabId: string) {
      this.activeTabId = tabId
    },
  },
})
```

### 3.2 UI 组件库 (Naive UI)

```typescript
// 按需引入，减少打包体积
import {
  NButton, NInput, NModal, NTabs, NTabPane,
  NConfigProvider, NMessageProvider, NDialogProvider,
  darkTheme
} from 'naive-ui'

// 主题切换
import { useOsTheme } from 'naive-ui'
```

### 3.3 代码编辑器 (Monaco Editor)

```typescript
// composables/useEditor.ts
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// 注册 worker
self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  },
  getWorkerUrl(label: string) {
    if (label === 'json') return new URL('...', import.meta.url).href
    if (label === 'css' || label === 'scss' || label === 'less') return '...'
    if (label === 'html' || label === 'handlebars' || label === 'razor') return '...'
    if (label === 'typescript' || label === 'javascript') return '...'
    return '...'
  },
}
```

### 3.4 Tauri 命令 (Rust)

```rust
// src-tauri/src/commands/file.rs
use tauri::command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub encoding: String,
}

#[command]
pub async fn read_file(path: String) -> Result<FileContent, String> {
    // 读取文件内容
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(FileContent {
        path,
        content,
        encoding: "utf-8".to_string(),
    })
}

#[command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    // 写入文件内容
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[command]
pub fn open_file_dialog() -> Result<Option<String>, String> {
    // 打开文件选择对话框
    // ...
}
```

---

## 4. 核心模块设计

### 4.1 文件管理模块

#### 功能清单
- [x] 打开文件 (支持拖拽、菜单、快捷键)
- [x] 保存文件 (支持另存为)
- [x] 自动保存 (可配置间隔)
- [x] 文件监听 (外部修改检测)
- [x] 编码检测与转换 (UTF-8, GBK, etc.)
- [x] 最近文件列表
- [x] 文件树浏览

#### 架构图
```
┌─────────────────────────────────────────────────────────┐
│                    FileManager                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ FileWatcher │  │ AutoSaver   │  │ Encoding    │    │
│  │   (debounce)│  │  (interval) │  │   Detector  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ RecentFiles │  │ FileTree    │  │ TabManager  │    │
│  │   (LRU)     │  │   (virtual) │  │   (state)   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────┘
```

#### 关键实现
```typescript
// services/file.ts
export class FileService {
  private watcher: Map<string, FSWatcher> = new Map()
  
  async openFile(path: string): Promise<FileMeta> {
    const content = await invoke('read_file', { path })
    const encoding = await this.detectEncoding(content)
    
    return {
      path,
      content: content.text,
      encoding,
      lastModified: content.mtime,
      isDirty: false,
    }
  }
  
  async saveFile(file: FileMeta): Promise<void> {
    await invoke('write_file', { 
      path: file.path, 
      content: file.content 
    })
    file.isDirty = false
    file.lastModified = Date.now()
  }
  
  watchFile(path: string, callback: (event: FileEvent) => void) {
    // 使用 Tauri FS Watcher API
  }
}
```

### 4.2 语法高亮模块

#### 支持的语言
- 基础：Plain Text, Markdown, JSON, XML, YAML
- Web：HTML, CSS, SCSS, Less, JavaScript, TypeScript
- 后端：Python, Java, C/C++, Rust, Go, PHP, Ruby
- 数据库：SQL, GraphQL
- 配置：TOML, INI, .env

#### Monaco 配置
```typescript
// services/syntax/languages.ts
import * as monaco from 'monaco-editor'

export function registerLanguages() {
  // 注册额外语言
  monaco.languages.register({ id: 'rust' })
  monaco.languages.register({ id: 'go' })
  monaco.languages.register({ id: 'python' })
  
  // 设置语言关联
  monaco.languages.setMonarchTokensProvider('rust', rustLanguageDefinition)
  monaco.languages.setLanguageConfiguration('rust', rustConfig)
  
  // 注册主题
  monaco.editor.defineTheme('my-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6a9955' },
      { token: 'keyword', foreground: '569cd6' },
      { token: 'string', foreground: 'ce9178' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
    },
  })
}
```

### 4.3 多标签模块

#### 数据结构
```typescript
// types/editor.ts
export interface Tab {
  id: string                    // 唯一标识 (uuid)
  file: FileMeta | null         // 文件元数据
  title: string                 // 标签标题
  icon?: string                 // 文件类型图标
  isDirty: boolean              // 是否有未保存更改
  cursor?: Position             // 光标位置
  scroll?: ScrollPosition       // 滚动位置
  history?: EditHistory         // 编辑历史
}

export interface EditorState {
  tabs: Tab[]
  activeTabId: string | null
  splitView: SplitConfig      // 分屏配置
}
```

#### 标签栏交互
```
┌─────────────────────────────────────────────────────────┐
│  [×] file1.ts  [×] file2.ts*  [×] file3.ts  [+]        │
│  └── 拖拽排序   └── * 表示未保存   └── 关闭按钮         │
└─────────────────────────────────────────────────────────┘
```

#### 快捷键
| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + T` | 新建标签 |
| `Ctrl/Cmd + W` | 关闭当前标签 |
| `Ctrl/Cmd + Shift + T` | 恢复关闭的标签 |
| `Ctrl/Cmd + Tab` | 切换下一个标签 |
| `Ctrl/Cmd + Shift + Tab` | 切换上一个标签 |
| `Ctrl/Cmd + 1~9` | 切换到指定位置标签 |

### 4.4 主题系统

#### 主题架构
```
┌─────────────────────────────────────────────────────────┐
│                      ThemeManager                        │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │              预设主题 (Presets)                  │   │
│  │  Light │ Dark │ System │ Solarized │ Dracula   │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │              自定义主题 (Custom)                 │   │
│  │  颜色变量 │ 字体设置 │ 间距配置 │ 动画效果     │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │              编辑器主题 (Monaco)                 │   │
│  │  vs │ vs-dark │ hc-black │ 自定义高亮主题     │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

#### 主题配置
```typescript
// services/theme/presets.ts
export const PRESET_THEMES = {
  light: {
    name: 'Light',
    colors: {
      background: '#ffffff',
      foreground: '#333333',
      primary: '#007acc',
      secondary: '#6c757d',
      sidebar: '#f3f3f3',
      editor: '#ffffff',
      statusBar: '#007acc',
    },
    monacoTheme: 'vs',
  },
  dark: {
    name: 'Dark',
    colors: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      primary: '#007acc',
      secondary: '#858585',
      sidebar: '#252526',
      editor: '#1e1e1e',
      statusBar: '#007acc',
    },
    monacoTheme: 'vs-dark',
  },
  system: {
    name: 'System',
    followOS: true,
  },
}
```

#### 主题切换实现
```typescript
// composables/useTheme.ts
import { darkTheme } from 'naive-ui'
import * as monaco from 'monaco-editor'

export function useTheme() {
  const theme = ref<'light' | 'dark' | 'system'>('system')
  const naivetheme = ref(darkTheme)
  
  const applyTheme = (newTheme: string) => {
    // 应用 Naive UI 主题
    naivetheme.value = newTheme === 'dark' ? darkTheme : undefined
    
    // 应用 Monaco 编辑器主题
    monaco.editor.setTheme(
      newTheme === 'dark' ? 'vs-dark' : 'vs'
    )
    
    // 应用 CSS 变量
    document.documentElement.setAttribute('data-theme', newTheme)
    
    // 保存到设置
    settingsStore.setTheme(newTheme)
  }
  
  // 监听系统主题变化
  if (theme.value === 'system') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', (e) => {
      applyTheme(e.matches ? 'dark' : 'light')
    })
  }
  
  return { theme, naivetheme, applyTheme }
}
```

---

## 5. 跨平台兼容性

### 5.1 文件系统差异

| 特性 | Windows | macOS | Linux | 处理方案 |
|------|---------|-------|-------|----------|
| 路径分隔符 | `\` | `/` | `/` | 使用 `path.join()` 统一处理 |
| 大小写敏感 | 否 | 否 (默认) | 是 | 路径比较时统一转小写 |
| 行结束符 | `\r\n` | `\n` | `\n` | 自动检测并保留原格式 |
| 文件权限 | ACL | POSIX | POSIX | Tauri FS API 抽象 |
| 特殊目录 | AppData | ~/Library | ~/.config | Tauri path resolver |

### 5.2 快捷键映射

```typescript
// utils/shortcuts.ts
export const SHORTCUTS = {
  // 使用 Tauri 的 accelerator 格式
  save: isMac ? 'Cmd+S' : 'Ctrl+S',
  open: isMac ? 'Cmd+O' : 'Ctrl+O',
  newTab: isMac ? 'Cmd+T' : 'Ctrl+T',
  closeTab: isMac ? 'Cmd+W' : 'Ctrl+W',
  find: isMac ? 'Cmd+F' : 'Ctrl+F',
  replace: isMac ? 'Cmd+H' : 'Ctrl+H',
  undo: isMac ? 'Cmd+Z' : 'Ctrl+Z',
  redo: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y',
}
```

### 5.3 窗口管理

```rust
// src-tauri/src/commands/window.rs
use tauri::{Manager, Window};

#[command]
pub fn create_window(app_handle: tauri::AppHandle) {
    let window = tauri::WindowBuilder::new(
        &app_handle,
        "main",
        tauri::WindowUrl::App("index.html".into()),
    )
    .title("文本编辑器")
    .inner_size(1200.0, 800.0)
    .min_inner_size(800.0, 600.0)
    .decorations(true)  // macOS 需要 true 以使用系统标题栏
    .transparent(false)
    .build()
    .unwrap();
    
    // macOS 特殊处理
    #[cfg(target_os = "macos")]
    {
        window.set_titlebar_style(tauri::TitleBarStyle::Transparent);
    }
}
```

### 5.4 打包配置

```json
// src-tauri/tauri.conf.json
{
  "bundle": {
    "active": true,
    "targets": ["app", "dmg", "msi", "deb", "rpm"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "category": "DeveloperTool",
    "shortDescription": "跨平台文本编辑器",
    "longDescription": "基于 Tauri + Vue3 的现代化文本编辑器"
  },
  "tauri": {
    "allowlist": {
      "fs": {
        "all": true,
        "scope": ["**"]
      },
      "dialog": {
        "all": true
      },
      "window": {
        "all": true
      }
    }
  }
}
```

---

## 6. 性能优化策略

### 6.1 前端优化
- **虚拟滚动**: 大文件只渲染可视区域
- **Web Worker**: 语法分析、编码检测在后台线程
- **懒加载**: Monaco Editor 按需加载语言包
- **防抖节流**: 文件保存、自动补全等高频操作
- **内存管理**: 及时释放关闭标签的编辑器实例

### 6.2 后端优化
- **异步 IO**: 使用 tokio 运行时处理文件操作
- **文件缓存**: 最近访问文件内容缓存
- **增量保存**: 只保存变更部分 (可选)
- **Rust 性能**: 核心逻辑用 Rust 实现

### 6.3 启动优化
- **预加载**: 常用语言包预加载
- **快照恢复**: 恢复上次会话的标签和状态
- **延迟初始化**: 非核心功能延迟加载

---

## 7. 安全考虑

### 7.1 Tauri 安全配置
```json
{
  "tauri": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'",
      "dangerousRemoteDomainIpcAccess": []
    }
  }
}
```

### 7.2 文件访问控制
- 使用 Tauri FS Scope 限制可访问目录
- 用户明确授权后才能访问特定路径
- 敏感目录 (系统目录) 访问需要二次确认

### 7.3 数据持久化
- 用户设置存储在安全的配置目录
- 敏感信息 (如 API Key) 使用系统密钥链
- 定期备份用户配置

---

## 8. 扩展性设计

### 8.1 插件系统架构
```
┌─────────────────────────────────────────────────────────┐
│                    PluginHost                           │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ Plugin API  │  │ Lifecycle   │  │ Sandboxing  │    │
│  │  Interface  │  │  Manager    │  │  (isolated) │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ Event Bus   │  │ Registry    │  │  Loader     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 8.2 插件 API 示例
```typescript
// 插件开发接口
export interface Plugin {
  id: string
  name: string
  version: string
  
  // 生命周期
  activate(ctx: PluginContext): Promise<void>
  deactivate(): Promise<void>
  
  // 扩展点
  commands?: Command[]
  menus?: Menu[]
  themes?: Theme[]
  languages?: Language[]
}
```

---

## 9. 开发路线图

### Phase 1: MVP (4-6 周)
- [ ] 基础编辑器 (Monaco 集成)
- [ ] 文件打开/保存
- [ ] 单标签支持
- [ ] 基础主题 (亮/暗)
- [ ] 快捷键支持

### Phase 2: 核心功能 (4-6 周)
- [ ] 多标签管理
- [ ] 语法高亮 (主流语言)
- [ ] 自动保存
- [ ] 文件监听
- [ ] 设置面板

### Phase 3: 增强功能 (4-6 周)
- [ ] 主题系统完善
- [ ] 插件系统基础
- [ ] 搜索/替换
- [ ] 撤销/重做历史
- [ ] 编码转换

### Phase 4:  polish (4-6 周)
- [ ] 性能优化
- [ ] 国际化
- [ ] 文档完善
- [ ] 测试覆盖
- [ ] 发布准备

---

## 10. 技术决策记录

### 为什么选择 Tauri 而不是 Electron?
- **体积**: Tauri 应用 ~10MB vs Electron ~150MB
- **内存**: Tauri 内存占用更低 (Rust 后端)
- **安全**: 更小的攻击面，原生安全模型
- **性能**: Rust 后端性能优势明显

### 为什么选择 Vue 3 而不是 React?
- **学习曲线**: Vue 对团队成员更友好
- **Composition API**: 逻辑复用更优雅
- **生态**: Vue 生态成熟，组件库丰富
- **性能**: Vue 3 性能已非常优秀

### 为什么选择 Monaco 而不是 CodeMirror?
- **功能**: Monaco 功能更完整 (VS Code 同款)
- **生态**: 语言支持更丰富
- **性能**: 大文件处理更优秀
- **定制**: 主题和扩展性更好

---

## 附录

### A. 依赖清单

#### Rust (Cargo.toml)
```toml
[dependencies]
tauri = { version = "2", features = ["api-all"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
notify = "6"  # 文件监听
encoding_rs = "0.8"  # 编码处理
```

#### Node.js (package.json)
```json
{
  "dependencies": {
    "vue": "^3.4",
    "pinia": "^2.1",
    "vue-router": "^4.3",
    "vue-i18n": "^9.8",
    "naive-ui": "^2.38",
    "monaco-editor": "^0.47",
    "@vueuse/core": "^10.9"
  },
  "devDependencies": {
    "typescript": "^5.4",
    "vite": "^5.2",
    "@vitejs/plugin-vue": "^5.0",
    "sass": "^1.72",
    "eslint": "^8.57",
    "prettier": "^3.2"
  }
}
```

### B. 推荐 VS Code 扩展
- Volar (Vue 开发)
- rust-analyzer (Rust 开发)
- Tauri CLI (Tauri 开发)
- ESLint + Prettier (代码格式化)

### C. 参考资源
- [Tauri 官方文档](https://tauri.app/)
- [Vue 3 官方文档](https://vuejs.org/)
- [Monaco Editor 文档](https://microsoft.github.io/monaco-editor/)
- [Naive UI 文档](https://www.naiveui.com/)

---

*文档版本: 1.0*  
*最后更新: 2026-03-11*  
*作者: 资深软件架构师 (AI)*
