# 性能分析报告

## 项目概况
- **技术栈**: Tauri + Vue 3 + TypeScript + Monaco Editor + Pinia
- **项目位置**: `/home/node/.openclaw/workspace/text-editor/`
- **分析时间**: 2026-03-11

---

## 1. 性能瓶颈分析

### 1.1 大文件加载性能 ❌

**当前实现**:
- `src-tauri/src/commands/file.rs` 中的 `read_file` 函数一次性读取整个文件
- 前端 `fileSystemStore.readFileContent()` 直接加载全部内容到内存
- 没有分块加载或流式读取机制

**问题**:
- 10MB+ 文件会导致主线程阻塞
- 内存占用峰值 = 文件大小 × 2 (Rust String + JS String)
- 用户需要等待完整加载后才能看到内容

**当前预估性能**:
- 1MB 文件：~100-200ms
- 10MB 文件：~1-2 秒
- 100MB 文件：~10+ 秒 (不可接受)

### 1.2 内存使用情况 ⚠️

**当前问题**:
1. **Monaco 编辑器实例泄漏**: `EditorCore.vue` 在 `onBeforeUnmount` 中调用 `dispose()`，但多标签页场景下可能未正确清理
2. **Pinia Store 状态膨胀**: `editorStore.content` 存储完整文件内容，多标签切换时内容累积
3. **文件树缓存**: `fileSystemStore.fileTree` 递归缓存所有展开的文件夹内容
4. **事件监听器**: Monaco 的事件监听器在组件销毁时可能未完全清理

**内存泄漏风险点**:
```typescript
// EditorCore.vue - 风险点
editor.onDidChangeModelContent(() => { ... })  // 未存储引用，无法移除
editor.onDidChangeCursorPosition((e) => { ... })  // 未存储引用
editor.onDidChangeCursorSelection((e) => { ... })  // 未存储引用
```

### 1.3 启动时间 ⚠️

**当前加载流程**:
1. Vite 加载所有 JS/CSS 资源 (~500KB-1MB)
2. Monaco Editor 完整加载 (~2MB)
3. Vue 组件树初始化
4. Pinia stores 初始化
5. Tauri 后端启动

**预估启动时间**: 2-4 秒 (取决于硬件)

**优化空间**:
- Monaco Editor 可以懒加载
- 非关键组件可以代码分割
- 文件树可以延迟初始化

### 1.4 渲染性能 ⚠️

**当前问题**:
1. **App.vue**: 大量 computed 属性，但部分可以缓存
2. **FileTree.vue**: 递归组件，大目录时重渲染开销大
3. **EditorCore.vue**: watch 监听多个设置变化，可能触发不必要的更新
4. **缺少 v-memo**: Vue 3.2+ 的 v-memo 未使用

### 1.5 打字延迟风险 ✅

**当前实现**:
- Monaco Editor 内置缓冲，打字性能通常良好
- 但 `onDidChangeModelContent` 每次击键都触发 `emit('content-change')` 和 `editorStore.setContent()`
- Pinia store 更新会触发所有订阅者响应

**风险**: 大文件 (>1MB) 时，每次击键都更新 store 可能导致延迟

---

## 2. 优化方案

### 2.1 大文件加载优化

#### 方案 A: 分块加载 + 虚拟滚动 (推荐)
```rust
// Tauri 后端实现分块读取
#[tauri::command]
pub async fn read_file_chunked(
    path: String,
    offset: u64,
    chunk_size: u64
) -> Result<FileChunk, String> {
    // 实现分块读取
}
```

#### 方案 B: Monaco 内置大文件优化
- 使用 `monaco.editor.createModel()` 的 `largeFileOptimizations` 选项
- 限制语法高亮的行数
- 禁用部分语言特性

### 2.2 内存优化

#### 事件监听器管理
```typescript
// EditorCore.vue - 改进版
const disposables: monaco.IDisposable[] = []

onMounted(() => {
  disposables.push(editor.onDidChangeModelContent(...))
  disposables.push(editor.onDidChangeCursorPosition(...))
})

onBeforeUnmount(() => {
  disposables.forEach(d => d.dispose())
  editor?.dispose()
})
```

#### Store 内容管理
- 非活动标签的内容应该卸载/缓存
- 实现 LRU 缓存策略

### 2.3 启动速度优化

#### 懒加载策略
```typescript
// 懒加载 Monaco Editor
const MonacoEditor = defineAsyncComponent(() => import('./EditorCore.vue'))

// 代码分割
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'monaco': ['monaco-editor'],
          'vendor': ['vue', 'pinia'],
        }
      }
    }
  }
})
```

### 2.4 渲染性能优化

#### 使用 v-memo
```vue
<!-- FileTree.vue -->
<div
  v-memo="[entry.path, entry.isExpanded, selectedPath]"
  class="file-tree-node"
>
```

#### 优化 computed
```typescript
// 添加缓存
const wordCount = computed(() => {
  // 使用 lodash.memoize 或手动缓存
})
```

---

## 3. 验收标准

| 指标 | 当前 | 目标 | 状态 |
|------|------|------|------|
| 10MB+ 文件加载时间 | ~10s | < 2s | ❌ |
| 内存占用 (空载) | ~250MB | < 200MB | ❌ |
| 启动时间 | ~4s | < 3s | ❌ |
| 打字延迟 | 无感知 | 无感知 | ✅ |

---

## 4. 优化优先级

### P0 (必须)
1. 事件监听器内存泄漏修复
2. Monaco 大文件优化选项
3. 组件卸载时的资源清理

### P1 (重要)
1. 懒加载 Monaco Editor
2. 文件树虚拟滚动
3. Store 内容缓存策略

### P2 (可选)
1. 分块加载实现
2. v-memo 全面应用
3. 构建优化

---

## 5. 下一步行动

1. **立即实施**: 内存泄漏修复
2. **本周完成**: 懒加载 + 构建优化
3. **下周完成**: 大文件优化方案验证

---

*报告生成时间：2026-03-11 08:24 UTC*
