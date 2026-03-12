# 🚀 SOC 协同调度中心 - Phase 9 执行计划

**日期:** 2026-03-11  
**阶段:** Phase 9 - 测试修复 + 构建验证  
**项目:** 跨平台文本编辑器 (Tauri + Vue3)  
**调度中心:** 罗小虾 🦐  
**分配时间:** 11:47 UTC

---

## 📊 Phase 7-8 状态回顾

### ✅ 已完成任务

| 任务 | 智能体 | 状态 | 产出 |
|------|--------|------|------|
| 环境验证 | Env-Check-Agent | ✅ 完成 | `ENV_CHECK.md` |
| 测试诊断 | Test-Diagnose-Agent | ✅ 完成 | `TEST_DIAGNOSIS.md` |

### ⏱️ 超时/失败任务

| 任务 | 智能体 | 状态 | 原因 |
|------|--------|------|------|
| 前端构建 | Frontend-Build-Agent | ⏱️ 超时 (5m) | 构建耗时较长 |
| 早期构建/测试 | Build/Test/Frontend-Agent | ❌ 失败 | API 配额限制 (429) |

### 🔍 核心发现 (来自 TEST_DIAGNOSIS.md)

**根因:** E2E 测试 `beforeEach` 直接等待 `editor-container`，但该组件使用 `v-if="activeTab"` 条件渲染，初始无标签页时容器不存在。

**解决方案:** 修改测试 `beforeEach`，先点击"新建文件"创建标签页，再等待编辑器容器。

---

## 🎯 Phase 9 策略

**核心思路:** 快速修复 + 分步验证

1. **立即应用测试修复** (5 分钟)
2. **手动执行前端构建** (10 分钟)
3. **运行 E2E 测试验证** (15 分钟)
4. **根据结果决定 Tauri 构建** (30 分钟)

---

## 📋 Phase 9 任务清单

### 任务 1: 应用测试修复 ⭐ P0

**预计耗时:** 5 分钟  
**文件:** `tests/e2e/specs/file-operations.spec.ts`

**修复内容:**

原代码:
```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('[data-testid="editor-container"]')
})
```

修改为:
```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // 先等待工具栏加载
  await page.waitForSelector('[data-testid="toolbar"]')
  // 点击新建文件创建初始标签页
  await page.click('[data-testid="btn-new-file"]')
  // 现在等待编辑器容器 (此时 activeTab 已存在)
  await page.waitForSelector('[data-testid="editor-container"]', {
    timeout: 15000
  })
})
```

**验收:** 文件已修改并保存

---

### 任务 2: 前端构建 ⭐ P0

**预计耗时:** 10 分钟  
**命令:** `cd /home/node/.openclaw/workspace/text-editor/frontend && pnpm build`

**验收:**
- [ ] 构建成功退出 (exit code 0)
- [ ] `frontend/dist/` 目录存在
- [ ] `frontend/dist/index.html` 存在

---

### 任务 3: E2E 测试验证 ⭐ P0

**预计耗时:** 15 分钟  
**命令:** `cd /home/node/.openclaw/workspace/text-editor && npx playwright test tests/e2e/specs/file-operations.spec.ts`

**验收:**
- [ ] 测试运行完成
- [ ] 通过率 > 80%
- [ ] 无超时错误

---

### 任务 4: Tauri 构建 ⭐ P1 (可选)

**条件:** 任务 1-3 全部通过  
**预计耗时:** 30 分钟  
**命令:** `cd src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo tauri build`

**验收:**
- [ ] 构建成功
- [ ] `src-tauri/target/release/bundle/` 存在安装包

---

## 📈 成功标准

| 指标 | 目标值 | 优先级 |
|------|--------|--------|
| 测试修复 | ✅ 已应用 | P0 |
| 前端构建 | ✅ 成功 | P0 |
| E2E 测试 | ✅ >80% 通过 | P0 |
| Tauri 打包 | ✅ 生成安装包 | P1 |

---

## ⏱️ 时间线 (UTC)

```
11:47 ─┬─ Phase 9 启动
       │
11:52 ─┼─ 任务 1 完成 (测试修复)
       │
12:02 ─┼─ 任务 2 完成 (前端构建)
       │
12:17 ─┼─ 任务 3 完成 (E2E 验证)
       │
12:47 ─┴─ 任务 4 完成 (Tauri 构建，如执行)
```

---

## 🔧 风险缓解

| 风险 | 缓解措施 |
|------|----------|
| 测试修复后仍失败 | 增加超时时间至 30 秒，检查组件渲染逻辑 |
| 前端构建失败 | 检查 node_modules，执行 `pnpm install` |
| Tauri 构建失败 | 验证 Rust 环境，检查 `src-tauri/Cargo.toml` |

---

## 📞 交付物

- [ ] `PHASE9_PROGRESS.md` - 执行进度记录
- [ ] `PHASE9_SUMMARY.md` - 阶段总结报告
- [ ] 更新的测试文件
- [ ] 构建产物 (dist/, bundle/)

---

**调度中心签名:** 🦐 罗小虾  
**调度时间:** 2026-03-11 11:47 UTC  
**预计完成:** 2026-03-11 12:47 UTC

---

*Phase 9 启动！修复测试，验证构建！🏃💨*
