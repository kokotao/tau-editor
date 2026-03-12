# 🚀 SOC 协同调度中心 - Phase 7 重启计划

**日期:** 2026-03-11  
**阶段:** Phase 7 - 小步快跑，规避配额限制  
**项目:** 跨平台文本编辑器 (Tauri + Vue3)  
**调度中心:** 罗小虾 🦐  
**分配时间:** 11:15 UTC

---

## 📊 Phase 6 复盘

### ❌ 失败原因

| 智能体 | 状态 | 失败原因 |
|--------|------|----------|
| Build-Agent | 🔴 FAILED | API 配额耗尽 (429) |
| Test-Agent | 🔴 FAILED | API 配额耗尽 (429) |
| Frontend-Agent | 🔴 FAILED | API 配额耗尽 (429) |

### 根本问题
- 所有智能体在长耗时任务中触发了小时配额限制
- Tauri 构建和 E2E 测试都是耗时操作
- 单个任务 token 消耗过大 (200k-440k tokens)

### 已完成的进展
- ✅ Rust 环境已安装
- ✅ Tauri CLI 已安装
- ✅ Frontend 依赖已安装
- ⏳ 构建和测试未实际完成

---

## 📋 Phase 7 策略调整

### 新策略：小步快跑

1. **拆分任务** - 将大任务拆成 <5 分钟的小任务
2. **快速验证** - 每个子任务独立验证
3. **状态持久化** - 每步写入文件，避免丢失进度
4. **配额感知** - 监控 token 使用，主动让出时间

---

## 📋 Phase 7 任务分配

### 任务 A1: 构建环境验证 (5m)

**智能体:** `Env-Check-Agent`  
**优先级:** P0  
**预计耗时:** 3-5 分钟  
**Token 预算:** <50k  

**目标:** 验证构建环境就绪

**具体内容:**
- [ ] 验证 `rustc --version`
- [ ] 验证 `cargo tauri --version`
- [ ] 验证 `pnpm --version`
- [ ] 检查 src-tauri/Cargo.toml 存在
- [ ] 检查 frontend/package.json 存在
- [ ] 写入 ENV_CHECK.md

**验收:** ENV_CHECK.md 创建，所有检查通过

---

### 任务 A2: Frontend 预构建 (5m)

**智能体:** `Frontend-Build-Agent`  
**优先级:** P0  
**预计耗时:** 3-5 分钟  
**Token 预算:** <50k  

**目标:** 仅构建前端，不打包 Tauri

**具体内容:**
- [ ] `cd frontend && pnpm build`
- [ ] 验证 dist/ 目录生成
- [ ] 检查构建产物大小
- [ ] 写入 FRONTEND_BUILD_STATUS.md

**验收:** dist/ 目录存在，无构建错误

---

### 任务 A3: Tauri 构建执行 (10m)

**智能体:** `Tauri-Build-Agent`  
**优先级:** P0  
**预计耗时:** 8-10 分钟  
**Token 预算:** <80k  

**目标:** 执行 Tauri 打包

**具体内容:**
- [ ] `cd frontend/src-tauri && cargo tauri build`
- [ ] 后台运行，定期轮询
- [ ] 捕获构建日志
- [ ] 验证 bundle/ 目录生成
- [ ] 写入 BUILD_PROGRESS.md (每步)

**验收:** src-tauri/target/release/bundle/ 存在安装包

---

### 任务 B1: 测试环境诊断 (5m)

**智能体:** `Test-Diagnose-Agent`  
**优先级:** P1  
**预计耗时:** 3-5 分钟  
**Token 预算:** <50k  

**目标:** 诊断测试失败根因

**具体内容:**
- [ ] 检查 playwright.config.ts 配置
- [ ] 验证 webServer 启动命令
- [ ] 检查测试选择器匹配
- [ ] 运行单个测试 (--debug 模式)
- [ ] 写入 TEST_DIAGNOSIS.md

**验收:** 明确失败原因和修复方案

---

### 任务 B2: 测试配置修复 (5m)

**智能体:** `Test-Fix-Agent`  
**优先级:** P1  
**预计耗时:** 3-5 分钟  
**Token 预算:** <50k  

**目标:** 修复测试配置

**具体内容:**
- [ ] 根据诊断结果修复配置
- [ ] 调整超时时间
- [ ] 修复选择器不匹配
- [ ] 运行单个测试验证
- [ ] 写入 TEST_FIX_APPLIED.md

**验收:** 单个测试通过

---

## 🎯 执行流程

```
时间线 (UTC):
11:15 ─┬─ A1: Env-Check-Agent (5m)
       ├─ A2: Frontend-Build-Agent (5m) [并行]
       │
11:25 ─┼─ A3: Tauri-Build-Agent (10m) [依赖 A2]
       │
       ├─ B1: Test-Diagnose-Agent (5m) [并行]
       │
11:35 ─┼─ B2: Test-Fix-Agent (5m) [依赖 B1]
       │
11:45 ─┴─ Phase 8: 全量测试 + 发布准备
```

---

## 📈 进度追踪

| 时间 | 任务 | 智能体 | Session | 状态 |
|------|------|--------|---------|------|
| 11:15 | A1 环境验证 | Env-Check-Agent | 62aba647... | 🚀 已启动 |
| 11:15 | A2 前端构建 | Frontend-Build-Agent | 078d0135... | 🚀 已启动 |
| 11:25 | A3 Tauri 构建 | Tauri-Build-Agent | --:-- | ⏳ 等待 A2 |
| 11:15 | B1 测试诊断 | Test-Diagnose-Agent | 55b6883d... | 🚀 已启动 |
| 11:35 | B2 测试修复 | Test-Fix-Agent | --:-- | ⏳ 等待 B1 |

---

## 🔧 配额管理策略

1. **单任务 <100k tokens** - 避免触发配额
2. **后台任务轮询** - 使用 process.poll 而非 busy-wait
3. **状态文件持久化** - 每步写入 .md 文件
4. **失败快速退出** - 遇到阻塞立即汇报

---

## 📞 沟通机制

- **任务启动:** 智能体启动时回复 `🚀 [AgentName] 启动 - [任务简述]`
- **完成汇报:** `✅ [AgentName] 完成 - [结果]`
- **阻塞反馈:** `⚠️ [AgentName] 阻塞 - [原因] @调度中心`
- **配额预警:** 当 token >80k 时主动让出

---

**调度中心签名:** 🦐 罗小虾  
**调度时间:** 2026-03-11 11:15 UTC  
**下次检查:** 2026-03-11 11:45 UTC

---

*Phase 7 启动！小步快跑，规避配额！🏃💨*
