# E2E 测试失败诊断报告

**生成时间**: 2026-03-11  
**测试文件**: `tests/e2e/specs/file-operations.spec.ts`  
**诊断代理**: Test-Diagnose-Agent

---

## 一、配置分析

### 1.1 Playwright 配置 (`playwright.config.ts`)

| 配置项 | 值 | 分析 |
|--------|-----|------|
| `baseURL` | `http://localhost:5173` | ✅ 正确，匹配 Vite 默认端口 |
| `webServer.command` | `cd frontend && npm run dev` | ✅ 正确 |
| `webServer.port` | `5173` | ✅ 正确 |
| `webServer.timeout` | `120000` (120 秒) | ✅ 足够长 |
| `timeout` | `30000` (30 秒) | ⚠️ 对于完整 E2E 测试可能偏短 |
| `expect.timeout` | `5000` (5 秒) | ⚠️ 对于慢加载组件可能不够 |
| `actionTimeout` | `10000` (10 秒) | ✅ 合理 |

### 1.2 前端开发服务器 (`frontend/package.json`)

```json
"scripts": {
  "dev": "vite"
}
```

✅ **配置正确** - Vite 开发服务器会启动在端口 5173

---

## 二、选择器对比分析

### 2.1 测试中使用的 data-testid 选择器

| 测试选择器 | 组件中实际存在 | 状态 |
|------------|----------------|------|
| `[data-testid="editor-container"]` | `EditorCore.vue` ✅ | ✅ 匹配 |
| `[data-testid="btn-new-file"]` | `Toolbar.vue` ✅ | ✅ 匹配 |
| `[data-testid="tab"]` | `EditorTabs.vue` ✅ | ✅ 匹配 |
| `[data-testid="btn-open-file"]` | `Toolbar.vue` ✅ | ✅ 匹配 |
| `[data-testid="btn-save"]` | `Toolbar.vue` ✅ | ✅ 匹配 |
| `[data-testid="btn-save-as"]` | `Toolbar.vue` ✅ | ✅ 匹配 |
| `[data-testid="btn-toggle-file-tree"]` | `Toolbar.vue` ✅ | ✅ 匹配 |
| `[data-testid="status-bar"]` | `StatusBar.vue` ✅ | ✅ 匹配 |
| `[data-testid="cursor-position"]` | `StatusBar.vue` ✅ | ✅ 匹配 |
| `[data-testid="encoding-display"]` | `StatusBar.vue` ✅ | ✅ 匹配 |
| `[data-testid="language-mode-display"]` | `StatusBar.vue` ✅ | ✅ 匹配 |
| `[data-testid="save-status"]` | `App.vue` ✅ | ✅ 匹配 |
| `[data-testid="word-count"]` | `App.vue` ✅ | ✅ 匹配 |

**结论**: 所有 data-testid 选择器在组件中都正确定义，**选择器本身没有问题**。

---

## 三、根因分析

### 🔴 主要问题：编辑器容器条件渲染

**问题位置**: `App.vue` 模板

```vue
<!-- 编辑器核心组件 -->
<div class="editor-core-container">
  <EditorCore
    v-if="activeTab"
    :model-id="activeTabId!"
    ...
  />
</div>
```

**问题描述**: 
- `EditorCore` 组件（包含 `data-testid="editor-container"`）**仅在 `activeTab` 存在时渲染**
- 测试的 `beforeEach` 钩子直接等待 `[data-testid="editor-container"]`，但**初始状态下没有活动标签页**
- 这导致 `waitForSelector` 超时失败

**测试代码问题**:
```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // ❌ 问题：此时还没有 activeTab，editor-container 不会被渲染
  await page.waitForSelector('[data-testid="editor-container"]')
})
```

### 🟡 次要问题：超时设置可能过短

- `expect.timeout: 5000` 对于首次加载可能不够
- Vite 开发服务器冷启动 + Vue 组件初始化可能需要 5-10 秒
- 特别是在 CI 环境或资源受限的机器上

### 🟡 其他潜在问题

1. **Monaco 编辑器初始化时间**: Monaco Editor 是一个大型库，初始化可能需要较长时间
2. **Pinia Store 初始化**: 多个 store 的初始化可能影响首屏渲染
3. **异步加载**: 如果有任何异步数据加载，可能延迟组件渲染

---

## 四、修复建议

### 方案一：修改测试 beforeEach（推荐）⭐

**修改 `tests/e2e/specs/file-operations.spec.ts`**:

```typescript
test.beforeEach(async ({ page }) => {
  // 访问应用
  await page.goto('/')
  
  // ✅ 先等待应用加载（使用更通用的选择器）
  await page.waitForSelector('[data-testid="toolbar"]')
  
  // ✅ 点击新建文件创建初始标签页
  await page.click('[data-testid="btn-new-file"]')
  
  // ✅ 现在等待编辑器容器（此时 activeTab 已存在）
  await page.waitForSelector('[data-testid="editor-container"]', {
    timeout: 15000
  })
})
```

### 方案二：修改前端组件默认状态

**修改 `App.vue`**，在 `onMounted` 时自动创建一个默认标签页：

```typescript
onMounted(() => {
  // ... 现有初始化代码 ...
  
  // ✅ 添加：自动创建一个默认标签页
  if (tabsStore.tabs.length === 0) {
    tabsStore.addTab({
      filePath: 'untitled',
      fileName: 'Untitled',
      language: 'plaintext',
      isDirty: false,
    })
  }
  
  // ... 其他代码 ...
})
```

### 方案三：增加超时时间

**修改 `playwright.config.ts`**:

```typescript
export default defineConfig({
  timeout: 60 * 1000,  // ⬆️ 从 30 秒增加到 60 秒
  expect: {
    timeout: 10000,    // ⬆️ 从 5 秒增加到 10 秒
  },
  // ...
  use: {
    actionTimeout: 15000,  // ⬆️ 从 10 秒增加到 15 秒
    navigationTimeout: 45000, // ⬆️ 从 30 秒增加到 45 秒
  },
})
```

### 方案四：添加加载状态指示器

**修改 `App.vue`**，在加载时显示明确的加载状态：

```vue
<!-- 在模板顶部添加 -->
<div v-if="!tabsStore.tabs.length" data-testid="app-loading">
  正在初始化编辑器...
</div>
```

然后修改测试：
```typescript
await page.goto('/')
await page.waitForSelector('[data-testid="app-loading"]', { state: 'detached' })
```

---

## 五、推荐修复步骤

### 立即可执行的修复（按优先级）

1. **第一步**: 修改测试文件的 `beforeEach` 钩子（方案一）
   - 这是最快的修复方式
   - 不需要修改应用代码
   - 符合实际用户操作流程（先新建文件再编辑）

2. **第二步**: 增加 Playwright 超时时间（方案三）
   - 避免偶发的超时失败
   - 提高测试稳定性

3. **第三步**（可选）: 考虑前端默认标签页（方案二）
   - 改善用户体验
   - 使应用行为更像传统编辑器（如 VS Code）

---

## 六、验证方法

修复后，运行以下命令验证：

```bash
# 运行单个测试文件
npx playwright test tests/e2e/specs/file-operations.spec.ts

# 以有头模式运行（观察实际行为）
npx playwright test tests/e2e/specs/file-operations.spec.ts --headed

# 生成 HTML 报告查看详细结果
npx playwright test --reporter=html
```

---

## 七、总结

| 问题类型 | 严重程度 | 修复难度 |
|----------|----------|----------|
| 编辑器容器条件渲染 | 🔴 高 | 🟢 低 |
| 超时设置偏短 | 🟡 中 | 🟢 低 |
| Monaco 初始化慢 | 🟡 中 | 🟡 中 |

**核心结论**: 测试失败的主要原因是**测试期望的编辑器容器在初始状态下不存在**，因为应用需要先创建标签页才会渲染编辑器。这不是选择器错误，而是测试流程与实际应用状态不匹配。

---

*诊断完成。建议优先实施方案一 + 方案三的组合修复。*
