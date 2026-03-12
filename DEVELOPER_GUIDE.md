# 开发者文档 (Developer Guide)

> 跨平台文本编辑器开发指南

---

## 📖 目录

1. [项目结构说明](#项目结构说明)
2. [开发环境搭建](#开发环境搭建)
3. [构建和运行指南](#构建和运行指南)
4. [代码规范](#代码规范)

---

## 项目结构说明

### 整体结构

```
text-editor/
├── frontend/                 # 前端代码目录
│   ├── src/                  # 源代码
│   │   ├── components/       # Vue 组件
│   │   │   ├── editor/       # 编辑器相关组件
│   │   │   ├── layout/       # 布局组件
│   │   │   └── common/       # 通用组件
│   │   ├── lib/              # 工具库
│   │   ├── router/           # 路由配置
│   │   ├── services/         # 服务层
│   │   ├── stores/           # Pinia 状态管理
│   │   ├── views/            # 页面视图
│   │   ├── assets/           # 静态资源
│   │   ├── main.ts           # 入口文件
│   │   └── App.vue           # 根组件
│   ├── src-tauri/            # Tauri 后端 (Rust)
│   │   ├── src/
│   │   │   ├── main.rs       # Rust 入口
│   │   │   ├── commands/     # Tauri 命令
│   │   │   ├── services/     # 后端服务
│   │   │   ├── models/       # 数据模型
│   │   │   └── utils/        # 工具函数
│   │   ├── Cargo.toml        # Rust 依赖
│   │   ├── tauri.conf.json   # Tauri 配置
│   │   └── build.rs          # 构建脚本
│   ├── public/               # 公共资源
│   ├── index.html            # HTML 模板
│   ├── package.json          # Node.js 依赖
│   ├── vite.config.ts        # Vite 配置
│   ├── tsconfig.json         # TypeScript 配置
│   └── tailwind.config.js    # Tailwind CSS 配置
├── tests/                    # 测试代码
│   ├── e2e/                  # E2E 测试 (Playwright)
│   └── unit/                 # 单元测试 (Vitest)
├── docs/                     # 项目文档
│   ├── 产品需求/             # 产品需求文档
│   └── 架构设计/             # 架构设计文档
├── .github/                  # GitHub 配置
│   └── workflows/            # CI/CD 工作流
├── requirements.md           # 产品需求
├── architecture.md           # 技术架构
├── package.json              # 项目配置
├── playwright.config.ts      # Playwright 配置
├── vitest.config.ts          # Vitest 配置
└── README.md                 # 项目说明
```

### 核心模块说明

#### 前端模块 (Vue3 + TypeScript)

| 目录 | 说明 |
|------|------|
| `components/editor/` | 编辑器核心组件（Monaco 集成） |
| `components/layout/` | 应用布局组件（菜单栏、状态栏等） |
| `stores/` | Pinia 状态管理（文件状态、编辑器状态等） |
| `services/` | 业务服务层（文件服务、设置服务等） |
| `lib/` | 工具函数库 |

#### 后端模块 (Tauri + Rust)

| 目录 | 说明 |
|------|------|
| `commands/` | Tauri 命令处理（文件操作、窗口管理等） |
| `services/` | 后端服务（文件监听、自动保存等） |
| `models/` | 数据模型定义 |
| `utils/` | Rust 工具函数 |

---

## 开发环境搭建

### 系统要求

| 组件 | 最低版本 | 推荐版本 |
|------|---------|---------|
| Node.js | 18.x | 20.x LTS |
| Rust | 1.70 | 1.75+ |
| pnpm | 8.x | 9.x |
| 操作系统 | Windows 10 / macOS 11 / Ubuntu 20.04 | 最新稳定版 |

### 安装步骤

#### 1. 安装 Rust

**Windows / macOS:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Linux:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

验证安装：
```bash
rustc --version
cargo --version
```

#### 2. 安装 Node.js

推荐使用 [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager):

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 安装 Node.js 20.x
nvm install 20
nvm use 20

# 验证
node --version
npm --version
```

#### 3. 安装 pnpm

```bash
npm install -g pnpm

# 验证
pnpm --version
```

#### 4. 安装 Tauri CLI

```bash
cargo install tauri-cli
```

#### 5. 克隆项目

```bash
git clone https://github.com/your-repo/text-editor.git
cd text-editor
```

#### 6. 安装依赖

```bash
# 安装前端依赖
cd frontend
pnpm install

# 验证 Tauri 环境
pnpm tauri info
```

#### 7. 系统依赖

**Windows:**
- 安装 [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- 选择「使用 C++ 的桌面开发」

**macOS:**
```bash
xcode-select --install
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.0-dev build-essential libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

---

## 构建和运行指南

### 开发模式

```bash
cd frontend

# 启动开发服务器（热重载）
pnpm tauri dev

# 或使用详细日志
pnpm tauri dev -- --verbose
```

开发模式下：
- 前端代码修改会热重载
- Rust 代码修改会重新编译
- 默认地址：`http://localhost:5173`

### 生产构建

```bash
cd frontend

# 构建发布版本
pnpm tauri build

# 构建产物位置：
# - Windows: frontend/src-tauri/target/release/bundle/msi/
# - macOS: frontend/src-tauri/target/release/bundle/dmg/
# - Linux: frontend/src-tauri/target/release/bundle/appimage/
```

### 测试

```bash
# 运行所有测试
pnpm test

# 单元测试
pnpm test:unit

# 单元测试（监听模式）
pnpm test:unit:watch

# 单元测试（带覆盖率）
pnpm test:unit:coverage

# E2E 测试
pnpm test:e2e

# E2E 测试（有头模式）
pnpm test:e2e:headed

# E2E 测试（调试模式）
pnpm test:e2e:debug

# 查看测试报告
pnpm test:e2e:report

# Rust 测试
pnpm test:rust

# 运行所有测试
pnpm test:all
```

### 代码检查

```bash
# ESLint 检查
pnpm lint

# ESLint 自动修复
pnpm lint:fix

# Prettier 格式化
pnpm format

# Prettier 检查
pnpm format:check

# TypeScript 类型检查
pnpm typecheck
```

### 调试技巧

#### 前端调试

1. **Vue DevTools**: 安装 [Vue.js devtools](https://devtools.vuejs.org/)
2. **浏览器调试**: 开发模式下按 `F12` 打开开发者工具
3. **控制台日志**: 使用 `console.log()` 或 `debugger` 语句

#### Rust 调试

```bash
# 使用 RUST_LOG 环境变量
RUST_LOG=debug pnpm tauri dev

# 使用 Rust 调试器
rust-lldb target/debug/text-editor
```

#### Tauri 调试

```bash
# 启用调试模式
pnpm tauri dev -- --debug

# 查看 Tauri 日志
# Windows: %APPDATA%\text-editor\logs\
# macOS: ~/Library/Logs/text-editor/
# Linux: ~/.config/text-editor/logs/
```

---

## 代码规范

### TypeScript 规范

#### 命名约定

```typescript
// 变量和函数：camelCase
const userName = 'John';
function getUserInfo() {}

// 类和组件：PascalCase
class UserService {}
const EditorComponent = defineComponent({})

// 常量和枚举：UPPER_SNAKE_CASE
const MAX_FILE_SIZE = 100 * 1024 * 1024;
enum FileType { TEXT, CODE, MARKDOWN }

// 接口和类型：PascalCase，接口可加 I 前缀
interface IUser { name: string }
type UserConfig = { theme: string }
```

#### 类型定义

```typescript
// ✅ 好的做法：明确定义类型
interface FileState {
  path: string | null;
  content: string;
  isModified: boolean;
  encoding: string;
}

// ❌ 避免：使用 any
const data: any = {};

// ✅ 使用 unknown 代替 any
const data: unknown = {};
if (typeof data === 'object') {
  // 类型守卫
}
```

#### 组件定义

```typescript
// 使用 Composition API
<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  title: string
  count?: number
}>()

const emit = defineEmits<{
  (e: 'update', value: string): void
  (e: 'close'): void
}>()

const localCount = ref(props.count ?? 0)
</script>
```

### Rust 规范

#### 命名约定

```rust
// 变量和函数：snake_case
let user_name = String::from("John");
fn get_user_info() {}

// 结构体和枚举：PascalCase
struct FileInfo {
    path: String,
    size: u64,
}

// 常量和静态：UPPER_SNAKE_CASE
const MAX_BUFFER_SIZE: usize = 1024 * 1024;
static INSTANCE: Lazy<App> = Lazy::new(|| App::new());

// Trait：PascalCase
trait Readable {
    fn read(&self) -> Result<String>;
}
```

#### 错误处理

```rust
// ✅ 使用 Result 类型
fn read_file(path: &str) -> Result<String, io::Error> {
    fs::read_to_string(path)
}

// ✅ 使用 ? 操作符传播错误
fn process_file(path: &str) -> Result<(), Box<dyn Error>> {
    let content = read_file(path)?;
    Ok(())
}

// ❌ 避免：使用 unwrap()
// let file = read_file(path).unwrap();

// ✅ 使用 expect() 提供错误信息
let file = read_file(path).expect("Failed to read file");
```

#### Tauri 命令

```rust
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to save file: {}", e))
}
```

### Git 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Type 类型

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档更新 |
| `style` | 代码格式（不影响功能） |
| `refactor` | 重构 |
| `test` | 测试相关 |
| `chore` | 构建/工具/配置 |

#### 示例

```bash
# 新功能
git commit -m "feat(editor): 添加多标签页支持"

# Bug 修复
git commit -m "fix(file): 修复大文件打开时的内存泄漏"

# 文档更新
git commit -m "docs(readme): 更新安装指南"

# 重构
git commit -m "refactor(store): 重构文件状态管理"
```

### 代码审查清单

#### 通用检查

- [ ] 代码是否通过所有测试？
- [ ] 是否遵循代码规范？
- [ ] 是否有适当的注释？
- [ ] 是否处理了边界情况？
- [ ] 是否有性能问题？

#### TypeScript 检查

- [ ] 类型定义是否完整？
- [ ] 是否避免了 `any` 类型？
- [ ] 组件 props 和 emits 是否明确定义？
- [ ] 是否使用了 Composition API？

#### Rust 检查

- [ ] 错误处理是否完善？
- [ ] 是否避免了 `unwrap()`？
- [ ] 内存管理是否合理？
- [ ] 是否遵循 Rust 最佳实践？

---

## 📚 参考资源

- [Vue 3 文档](https://vuejs.org/)
- [Tauri 文档](https://tauri.app/)
- [Rust 文档](https://doc.rust-lang.org/)
- [TypeScript 文档](https://www.typescriptlang.org/)
- [Monaco Editor 文档](https://microsoft.github.io/monaco-editor/)

---

*最后更新：2026-03-11*
