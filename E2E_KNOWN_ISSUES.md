# E2E 测试已知问题

**创建日期:** 2026-03-11  
**最后更新:** 2026-03-11 16:45 UTC  
**状态:** 已记录，待修复  
**影响:** E2E 测试全部超时 (44/44 测试)  
**严重程度:** 🟡 中 (不影响应用功能，仅影响自动化测试)

---

## 问题摘要

所有 E2E 测试在 `beforeEach` 钩子中超时，**非功能缺陷**，而是测试设计与组件渲染时序问题。

**核心原因:** 测试期望的编辑器容器在初始状态下不存在，因为应用需要先创建标签页才会渲染编辑器。

---

## 根因分析

### 🔴 主要问题：编辑器容器条件渲染

**问题描述:**
- `EditorCore` 组件 (包含 `data-testid="editor-container"`) 仅在 `activeTab` 存在时渲染
- 测试的 `beforeEach` 钩子直接等待 `editor-container`，但初始状态下没有活动标签页
- 导致 `waitForSelector` 超时失败

**问题代码位置:**

`App.vue` 模板:
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

**测试代码问题:**

`tests/e2e/specs/file-operations.spec.ts`:
```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // ❌ 问题：此时还没有 activeTab，editor-container 不会被渲染
  await page.waitForSelector('[data-testid="editor-container"]')
})
```

---

## 解决方案

### 方案 A: 修改测试 (推荐) ⭐

修改 `beforeEach` 钩子，先创建新文件再等待编辑器:

```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // ✅ 先点击新建按钮创建标签页
  await page.click('[data-testid="btn-new-file"]')
  // 等待编辑器容器渲染
  await page.waitForSelector('[data-testid="editor-container"]', { timeout: 10000 })
})
```

**优点:**
- 快速修复，不影响应用代码
- 符合实际用户操作流程（先新建文件再编辑）
- 工作量低 (~30 分钟)

**缺点:**
- 需要在所有 5 个测试文件中应用相同修改

### 方案 B: 修改组件渲染逻辑

修改 `App.vue`，使编辑器容器始终渲染，但空状态时显示欢迎界面:

```vue
<div class="editor-core-container">
  <EditorCore
    :model-id="activeTabId || 'welcome'"
    :key="activeTabId || 'welcome'"
    ...
  />
</div>
```

**优点:**
- 改善用户体验（启动即见编辑器）
- 测试代码无需修改

**缺点:**
- 需要修改组件逻辑
- 工作量中等 (~2 小时)
- 可能引入新的边界情况

### 方案 C: 增加超时时间 (临时方案)

```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('[data-testid="editor-container"]', { 
    timeout: 15000,
    state: 'visible'
  })
})
```

**优点:**
- 最快修复 (~10 分钟)

**缺点:**
- 治标不治本
- 可能导致测试不稳定
- 不推荐作为长期方案

---

## 修复优先级

| 方案 | 优先级 | 工作量 | 影响范围 | 推荐度 |
|------|--------|--------|----------|--------|
| 方案 A (修改测试) | 🔴 高 | 低 (~30min) | 仅测试代码 | ⭐⭐⭐⭐⭐ |
| 方案 B (修改组件) | 🟡 中 | 中 (~2h) | 组件逻辑 + 测试 | ⭐⭐⭐ |
| 方案 C (增加超时) | 🟢 低 | 低 (~10min) | 临时方案 | ⭐⭐ |

**推荐:** 采用方案 A，快速修复测试，不影响组件逻辑。

---

## 其他已知问题

### 次要问题

#### 1. Monaco Editor 初始化时间较长
- **现象:** 冷启动可能需要 3-5 秒
- **影响:** 首次测试可能超时
- **建议:** 增加首次加载的超时时间至 10-15 秒

#### 2. Vite 开发服务器冷启动
- **现象:** 首次启动可能需要 10-15 秒
- **当前配置:** `webServer.timeout: 120000` (已足够)
- **建议:** 无需修改

#### 3. Playwright 超时配置偏短
- **当前配置:** `expect.timeout: 5000`
- **建议:** 增加到 `10000` 以提高稳定性

#### 4. 移动端测试兼容性
- **现象:** 某些移动端特定功能可能未完全适配
- **建议:** 后续添加移动端特定测试用例

---

## 待修复的测试文件

以下测试文件需要更新 `beforeEach` 钩子:

- [ ] `tests/e2e/specs/file-operations.spec.ts` (10 个测试)
- [ ] `tests/e2e/specs/tab-management.spec.ts` (8 个测试)
- [ ] `tests/e2e/specs/editor-functions.spec.ts` (10 个测试)
- [ ] `tests/e2e/specs/auto-save.spec.ts` (6 个测试)
- [ ] `tests/e2e/specs/editing.spec.ts` (10 个测试)

**总计:** 44 个测试用例

---

## 环境要求

### 运行 E2E 测试的最低要求

| 组件 | 版本要求 | 验证命令 |
|------|---------|---------|
| Node.js | >= 18.x | `node --version` |
| pnpm | >= 8.x | `pnpm --version` |
| Playwright | 最新 | `npx playwright --version` |
| 浏览器 | Chromium/Firefox/WebKit | `npx playwright install` |

### 推荐配置

- **内存:** >= 4GB (Monaco Editor 较占用内存)
- **CPU:** >= 2 核心
- **磁盘:** >= 1GB 可用空间 (浏览器 + 测试产物)

### 可选配置

- **有头模式:** 用于调试 (`--headed`)
- **UI 模式:** 交互式调试 (`--ui`)
- **追踪:** 失败时保留追踪 (`--trace on`)

---

## 验证步骤

修复后运行:

```bash
cd /home/node/.openclaw/workspace/text-editor

# 运行所有测试
pnpm test:e2e --reporter=list

# 或以有头模式运行 (观察实际行为)
pnpm test:e2e:headed

# 生成 HTML 报告查看详细结果
pnpm test:e2e --reporter=html
pnpm test:e2e:report
```

**预期结果:** 44/44 测试通过

---

## 变通方法

### 临时手动测试

如果 E2E 测试仍然失败，可以手动验证核心功能:

1. **启动开发服务器:**
   ```bash
   cd frontend
   pnpm dev
   ```

2. **手动测试以下功能:**
   - 新建文件
   - 保存文件
   - 多标签切换
   - 撤销/重做
   - 主题切换

3. **检查控制台:**
   - 打开浏览器开发者工具
   - 查看是否有错误日志

### 使用单元测试替代

E2E 测试修复前，可以依赖单元测试:

```bash
# 运行单元测试
pnpm test:unit

# 查看覆盖率
pnpm test:unit:coverage
```

**当前状态:** 14/14 单元测试通过 ✅

---

## 备注

- ✅ E2E 测试问题**不影响应用功能**
- ✅ 应用 Dev Server 正常运行 2+ 小时无问题
- ✅ 所有单元测试 (14/14) 通过
- ⚠️ 此问题仅影响自动化 E2E 测试流程
- 📋 建议在 Phase 11 优先修复

---

## 相关文档

- [E2E 测试报告](E2E_TEST_REPORT.md) - 测试框架和用例详情
- [测试诊断报告](TEST_DIAGNOSIS.md) - 详细根因分析
- [开发者指南](DEVELOPER_GUIDE.md) - 测试开发规范

---

**记录人:** 🦐 罗小虾  
**审核人:** Test-Diagnose-Agent  
**最后更新:** 2026-03-11 16:45 UTC
