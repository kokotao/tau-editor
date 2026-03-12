# E2E 测试指南

本文档说明如何运行和维护文本编辑器的端到端 (E2E) 测试。

## 快速开始

### 1. 安装依赖

```bash
# 安装项目依赖
cd /home/node/.openclaw/workspace/text-editor
pnpm install

# 安装 frontend 依赖
cd frontend
pnpm install
cd ..

# 安装 Playwright 浏览器
npx playwright install chromium
```

### 2. 运行测试

#### 简单模式
```bash
# 运行所有测试
npm run test:e2e

# 只在 Chromium 上运行
npm run test:e2e -- --project=chromium
```

#### 使用脚本
```bash
# 运行所有测试
./run-e2e-tests.sh --all

# 只在 Chromium 上运行
./run-e2e-tests.sh --chromium

# 有头模式（显示浏览器）
./run-e2e-tests.sh --headed --chromium

# 调试模式
./run-e2e-tests.sh --debug
```

### 3. 查看测试报告

```bash
# 生成 HTML 报告
npm run test:e2e -- --reporter=html

# 打开报告
npm run test:e2e:report
```

## 测试目录结构

```
tests/e2e/
├── fixtures/           # 测试夹具（测试数据）
│   └── test-files/
│       ├── sample.txt
│       └── utf8-sample.txt
├── specs/              # 测试规格文件
│   ├── file-operations.spec.ts
│   ├── tab-management.spec.ts
│   ├── editor-functions.spec.ts
│   ├── auto-save.spec.ts
│   └── editing.spec.ts
└── setup.ts            # 测试设置（可选）
```

## 测试文件说明

### file-operations.spec.ts
测试文件操作相关功能：
- 新建文件
- 打开文件
- 保存文件
- 文件编码
- 状态栏显示

### tab-management.spec.ts
测试标签页管理功能：
- 多标签打开
- 标签切换
- 标签关闭
- 脏状态显示
- 右键菜单

### editor-functions.spec.ts
测试编辑器核心功能：
- 编辑器加载
- 光标位置
- 撤销/重做
- 语言模式
- 主题切换
- 字数统计

### auto-save.spec.ts
测试自动保存功能：
- 保存状态指示
- 自动保存触发
- 保存按钮状态

### editing.spec.ts
测试编辑功能：
- 撤销重做
- 查找替换
- 快捷键
- 性能测试

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run test:e2e` | 运行所有 E2E 测试 |
| `npm run test:e2e -- --project=chromium` | 只在 Chromium 上运行 |
| `npm run test:e2e -- --headed` | 有头模式运行 |
| `npm run test:e2e -- --debug` | 调试模式 |
| `npm run test:e2e -- --reporter=html` | 生成 HTML 报告 |
| `npm run test:e2e:report` | 打开 HTML 报告 |
| `npm run test:e2e:ui` | 打开 Playwright UI 模式 |

## 编写新测试

### 基本结构

```typescript
import { test, expect } from '@playwright/test'

test.describe('功能组名称', () => {
  test.beforeEach(async ({ page }) => {
    // 每个测试前的准备工作
    await page.goto('/')
    await page.waitForSelector('[data-testid="editor-container"]')
  })

  test('E2E-XXX: 测试描述', async ({ page }) => {
    // Arrange - 准备测试数据
    await page.click('[data-testid="btn-new-file"]')
    
    // Act - 执行操作
    const editor = page.locator('[data-testid="editor-container"]')
    await editor.click()
    await page.keyboard.type('Test content')
    
    // Assert - 验证结果
    await expect(editor).toContainText('Test')
  })
})
```

### 最佳实践

1. **使用 data-testid**: 始终使用 `data-testid` 属性作为选择器
2. **AAA 模式**: 遵循 Arrange-Act-Assert 模式
3. **独立测试**: 每个测试应该独立，不依赖其他测试
4. **适当等待**: 使用 `waitForSelector` 而非硬编码的 `waitForTimeout`
5. **有意义的命名**: 测试名称应该清晰描述测试内容
6. **清理状态**: 测试后清理测试数据

### 选择器优先级

```typescript
// 最佳 - 使用 data-testid
page.locator('[data-testid="btn-save"]')

// 次佳 - 使用 role
page.getByRole('button', { name: 'Save' })

// 避免 - 使用 CSS 类或结构
page.locator('.btn.primary')  // 不推荐
```

## 调试测试

### 1. 使用调试模式

```bash
npm run test:e2e:debug
```

### 2. 使用 Playwright Inspector

```bash
PWDEBUG=1 npm run test:e2e
```

### 3. 添加断点

```typescript
await page.pause()  // 在此处暂停
```

### 4. 查看追踪

测试失败后，查看追踪文件：
```bash
npx playwright show-trace test-results/xxx/trace.zip
```

## 常见问题

### 测试超时

**问题**: 测试在等待某个元素时超时

**解决**:
```typescript
// 增加超时时间
await page.waitForSelector('[data-testid="xxx"]', { timeout: 10000 })

// 或者在配置中增加全局超时
// playwright.config.ts
timeout: 60 * 1000,
```

### 元素未找到

**问题**: `Error: locator.click: Error: strict mode violation`

**解决**:
```typescript
// 确保选择器唯一
page.locator('[data-testid="unique-id"]')

// 或者使用 first()
page.locator('[data-testid="btn"]').first()
```

### 测试不稳定

**问题**: 测试有时通过，有时失败

**解决**:
```typescript
// 使用明确的等待而非硬编码延迟
await page.waitForSelector('[data-testid="loaded"]')
// 而非
await page.waitForTimeout(5000)
```

## CI/CD 集成

### GitHub Actions 示例

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          pnpm install
          cd frontend && pnpm install
          npx playwright install chromium
      
      - name: Run E2E tests
        run: npm run test:e2e -- --project=chromium
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

## 性能优化

### 1. 并行执行

```bash
# 默认并行执行多个测试
npm run test:e2e

# 控制并发数
npm run test:e2e -- --workers=4
```

### 2. 测试分片

```bash
# 在 CI 中分片运行
npm run test:e2e -- --shard=1/3
npm run test:e2e -- --shard=2/3
npm run test:e2e -- --shard=3/3
```

### 3. 减少浏览器数量

```bash
# 只在需要的浏览器上运行
npm run test:e2e -- --project=chromium
```

## 资源

- [Playwright 官方文档](https://playwright.dev)
- [Playwright 测试指南](https://playwright.dev/docs/test-intro)
- [Playwright API 参考](https://playwright.dev/docs/api/class-test)

---

最后更新：2026-03-11
