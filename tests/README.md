# 文本编辑器测试指南

## 📋 目录结构

```
text-editor/
├── docs/
│   ├── 需求文档.md          # 功能需求说明
│   ├── 测试策略.md          # 测试策略和计划
│   └── 测试用例.md          # 详细测试用例
├── tests/
│   ├── unit/               # 单元测试
│   │   ├── setup.ts        # 测试环境配置
│   │   ├── utils/          # 工具函数测试
│   │   ├── components/     # 组件测试
│   │   ├── store/          # 状态管理测试
│   │   └── hooks/          # Hooks 测试
│   ├── integration/        # 集成测试
│   │   ├── file-operations.test.ts
│   │   ├── tab-management.test.ts
│   │   └── ...
│   └── e2e/               # E2E 测试
│       ├── specs/         # 测试规格
│       │   ├── file-operations.spec.ts
│       │   ├── editing.spec.ts
│       │   └── ...
│       ├── fixtures/      # 测试数据
│       └── utils/         # 测试工具
├── frontend/src-tauri/
│   └── tests/             # Rust 端测试
│       ├── command_tests.rs
│       └── ...
├── vitest.config.ts       # Vitest 配置
├── playwright.config.ts   # Playwright 配置
└── package.json           # 测试脚本
```

## 🚀 快速开始

### 安装依赖

```bash
# 安装 Node.js 依赖
pnpm install

# 安装 Playwright 浏览器
pnpm exec playwright install

# 安装 Rust 工具链（如未安装）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 运行测试

```bash
# 运行所有测试
pnpm test

# 仅运行单元测试
pnpm test:unit

# 仅运行 E2E 测试
pnpm test:e2e

# 仅运行 Rust 测试
pnpm test:rust

# 单元测试（监视模式）
pnpm test:unit:watch

# E2E 测试（有头模式）
pnpm test:e2e:headed

# E2E 测试（调试模式）
pnpm test:e2e:debug
```

### 查看测试报告

```bash
# 查看单元测试报告
pnpm test:unit:coverage
open coverage/index.html

# 查看 E2E 测试报告
pnpm test:e2e:report
```

## 📝 编写测试

### 单元测试示例

```typescript
// tests/unit/utils/string.test.ts
import { describe, it, expect } from 'vitest'
import { countLines } from '@/utils/string'

describe('String Utils', () => {
  it('should count lines correctly', () => {
    expect(countLines('line1\nline2\nline3')).toBe(3)
  })
})
```

### 组件测试示例

```typescript
// tests/unit/components/Editor.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { Editor } from '@/components/Editor'

it('should update content when typing', () => {
  render(<Editor />)
  const textarea = screen.getByTestId('editor-textarea')
  
  fireEvent.change(textarea, { target: { value: 'Hello' } })
  
  expect(textarea).toHaveValue('Hello')
})
```

### E2E 测试示例

```typescript
// tests/e2e/specs/file-operations.spec.ts
import { test, expect } from '@playwright/test'

test('should save file', async ({ page }) => {
  await page.goto('/')
  
  // 输入内容
  await page.fill('[data-testid="editor-textarea"]', 'Test content')
  
  // 保存
  await page.click('[data-testid="btn-save"]')
  
  // 验证保存成功
  await expect(page.locator('[data-testid="toast-success"]')).toBeVisible()
})
```

### Rust 测试示例

```rust
// frontend/src-tauri/tests/command_tests.rs
#[tokio::test]
async fn test_read_file() {
    let result = file::read_file("test.txt".to_string()).await;
    assert!(result.is_ok());
}
```

## 🎯 测试覆盖目标

| 测试类型 | 覆盖率目标 | 当前状态 |
|---------|-----------|---------|
| 单元测试 | ≥ 80% | ⏳ 待开发 |
| 集成测试 | 核心流程 100% | ⏳ 待开发 |
| E2E 测试 | P0 用例 100% | ⏳ 待开发 |
| Rust 测试 | 核心命令 100% | ⏳ 待开发 |

## 🔧 测试工具

### Vitest (单元测试)
- 快速执行，与 Vite 集成
- 内置覆盖率报告
- 支持快照测试

### Playwright (E2E 测试)
- 跨浏览器测试
- 自动等待
- 追踪和截图

### Cargo Test (Rust 测试)
- 内置测试框架
- 文档测试支持
- 基准测试

## 📊 CI/CD 集成

GitHub Actions 自动执行：

1. **Lint** - 代码风格检查
2. **TypeCheck** - TypeScript 类型检查
3. **Unit Tests** - Vitest 单元测试
4. **Rust Tests** - Cargo 测试
5. **E2E Tests** - Playwright E2E
6. **Build** - 构建验证

## 🐛 调试技巧

### 单元测试调试
```bash
# 运行单个测试文件
pnpm test:unit tests/unit/utils/string.test.ts

# 运行匹配的测试
pnpm test:unit -t "should count lines"

# 使用 UI 模式
pnpm test:unit:ui
```

### E2E 测试调试
```bash
# 调试模式（逐步执行）
pnpm test:e2e:debug

# 有头模式（显示浏览器）
pnpm test:e2e:headed

# 运行单个测试文件
pnpm test:e2e tests/e2e/specs/file-operations.spec.ts

# 运行单个测试用例
pnpm test:e2e --grep "should save file"
```

### Rust 测试调试
```bash
# 运行单个测试
cd frontend/src-tauri && cargo test test_read_file

# 显示输出
cd frontend/src-tauri && cargo test -- --nocapture

# 使用 rust-lldb 调试
cd frontend/src-tauri && cargo test --no-run
rust-lldb target/debug/deps/*
```

## 📋 测试清单

### 开发时
- [ ] 编写新功能时同步编写单元测试
- [ ] 运行 `pnpm lint` 和 `pnpm typecheck`
- [ ] 运行 `pnpm test:unit` 确保单元测试通过

### 提交前
- [ ] 运行 `pnpm test` 运行所有测试
- [ ] 检查覆盖率报告
- [ ] 确保无 lint 错误

### 发布前
- [ ] 运行完整 E2E 测试套件
- [ ] 验证 CI/CD 流水线通过
- [ ] 检查性能测试结果

## 📚 相关文档

- [需求文档](../docs/需求文档.md)
- [测试策略](../docs/测试策略.md)
- [测试用例](../docs/测试用例.md)

## 🆘 常见问题

### Q: 测试运行缓慢？
A: 使用 `--pool=forks` 并发执行，或只运行相关测试文件。

### Q: E2E 测试失败但手动操作正常？
A: 检查选择器是否正确，添加适当的等待条件。

### Q: 如何 Mock Tauri API？
A: 在 `tests/unit/setup.ts` 中已配置全局 Mock。

### Q: Rust 测试依赖缺失？
A: 运行 `sudo apt-get install libwebkit2gtk-4.1-dev ...` 安装系统依赖。
