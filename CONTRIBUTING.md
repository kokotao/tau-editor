# 贡献指南 (Contributing Guide)

> 欢迎参与跨平台文本编辑器的开发！

---

## 📖 目录

1. [如何贡献代码](#如何贡献代码)
2. [Pull Request 流程](#pull-request-流程)
3. [代码审查标准](#代码审查标准)

---

## 如何贡献代码

### 贡献类型

我们欢迎各种形式的贡献：

#### 🐛 Bug 修复
- 报告 Bug
- 修复现有 Bug
- 提供复现步骤

#### ✨ 新功能
- 提出新功能建议
- 实现新功能
- 完善相关文档

#### 📝 文档改进
- 修正文档错误
- 补充缺失文档
- 改进文档结构
- 翻译文档

#### 🎨 UI/UX 优化
- 界面改进建议
- 用户体验优化
- 主题/样式改进

#### 🧪 测试
- 编写单元测试
- 编写 E2E 测试
- 提高测试覆盖率

#### 🔧 性能优化
- 代码性能优化
- 构建速度优化
- 内存使用优化

### 开始贡献

#### 1. Fork 仓库

```bash
# 在 GitHub 上点击 Fork 按钮
# 然后克隆到你的本地
git clone https://github.com/YOUR_USERNAME/text-editor.git
cd text-editor
```

#### 2. 创建开发分支

```bash
# 切换到主分支
git checkout main

# 更新代码
git pull upstream main

# 创建新分支
git checkout -b feat/your-feature-name
# 或
git checkout -b fix/your-bug-fix
```

#### 3. 设置开发环境

```bash
cd frontend

# 安装依赖
pnpm install

# 启动开发模式
pnpm tauri dev
```

#### 4. 进行开发

- 编写代码
- 编写测试
- 确保所有测试通过
- 遵循代码规范

#### 5. 提交代码

```bash
# 添加修改的文件
git add .

# 提交（遵循 Conventional Commits 规范）
git commit -m "feat(editor): 添加多标签页支持"

# 推送到远程
git push origin feat/your-feature-name
```

---

## Pull Request 流程

### PR 准备清单

在提交 PR 之前，请确保：

- [ ] 代码遵循项目代码规范
- [ ] 所有测试通过
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] 代码通过 ESLint 检查
- [ ] 代码通过 Prettier 格式化
- [ ] TypeScript 类型检查通过
- [ ] 提交了有意义的提交信息

### 创建 PR

#### 1. 在 GitHub 上创建 Pull Request

1. 访问你的 Fork 仓库
2. 点击「Compare & pull request」
3. 填写 PR 信息

#### 2. PR 模板

请使用以下模板填写 PR 描述：

```markdown
## 📝 描述

简要描述此 PR 的目的和变更内容。

## 🔗 相关 Issue

- Closes #123
- Related to #456

## ✅ 检查清单

- [ ] 代码遵循项目规范
- [ ] 所有测试通过
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] 无 ESLint 警告
- [ ] TypeScript 类型检查通过

## 📸 截图（如适用）

如果涉及 UI 变更，请添加截图。

## 🧪 测试步骤

1. 步骤一
2. 步骤二
3. 预期结果

## 📋 变更类型

- [ ] ✨ 新功能
- [ ] 🐛 Bug 修复
- [ ] 📝 文档更新
- [ ] 🎨 样式/界面优化
- [ ] ♻️ 代码重构
- [ ] ⚡️ 性能优化
- [ ] 🧪 测试相关
- [ ] 🔧 构建/配置
```

#### 3. 等待审查

- 维护者会在 24-48 小时内审查你的 PR
- 可能需要根据反馈进行修改
- 审查通过后会合并到主分支

### PR 审查流程

```
提交 PR → 自动检查 → 维护者审查 → 反馈修改 → 再次审查 → 合并
```

#### 自动检查

提交 PR 后，GitHub Actions 会自动运行：

- ✅ 代码风格检查（ESLint + Prettier）
- ✅ TypeScript 类型检查
- ✅ 单元测试
- ✅ E2E 测试
- ✅ 构建测试

所有检查必须通过才能合并。

#### 人工审查

维护者会审查：

- 代码质量和可读性
- 功能是否符合需求
- 测试是否充分
- 文档是否完整
- 性能影响

### 修改 PR

如果审查者提出修改意见：

```bash
# 在本地进行修改
# ...

# 提交修改
git add .
git commit -m "fix: 根据审查意见修改"

# 推送（会自动更新 PR）
git push origin feat/your-feature-name
```

### PR 合并

审查通过后，维护者会：

1. 使用 Squash and Merge 合并提交
2. 删除源分支
3. 关闭相关 Issue
4. 在变更日志中记录

---

## 代码审查标准

### 通用标准

#### 代码质量

- [ ] **可读性**: 代码清晰易懂，命名有意义
- [ ] **简洁性**: 避免不必要的复杂性
- [ ] **一致性**: 遵循项目现有代码风格
- [ ] **注释**: 关键逻辑有适当注释

#### 功能正确性

- [ ] **功能完整**: 实现了 PR 描述的所有功能
- [ ] **边界处理**: 处理了边界情况和异常
- [ ] **兼容性**: 不影响现有功能
- [ ] **性能**: 无明显性能问题

#### 测试覆盖

- [ ] **单元测试**: 核心逻辑有单元测试
- [ ] **E2E 测试**: 用户流程有 E2E 测试
- [ ] **测试通过**: 所有测试通过
- [ ] **覆盖率**: 测试覆盖率不降低

#### 文档

- [ ] **代码注释**: 复杂逻辑有注释
- [ ] **API 文档**: 新增 API 有文档
- [ ] **用户文档**: 功能变更更新用户文档
- [ ] **变更日志**: 更新 CHANGELOG.md

### TypeScript 审查要点

#### 类型安全

```typescript
// ✅ 好的做法
interface User {
  id: number;
  name: string;
  email?: string;  // 可选字段明确标注
}

function getUser(id: number): User | null {
  // 返回类型明确
}

// ❌ 避免
function getUser(id: any): any {
  // 使用 any 类型
}
```

#### Composition API

```typescript
// ✅ 使用 Composition API
<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  title: string
  count?: number
}>()

const emit = defineEmits<{
  (e: 'update', value: string): void
}>()

const localCount = ref(props.count ?? 0)
</script>

// ❌ 避免使用 Options API（除非必要）
```

#### 状态管理

```typescript
// ✅ 使用 Pinia
import { defineStore } from 'pinia'

export const useFileStore = defineStore('file', {
  state: () => ({
    files: [] as FileState[],
    activeFileId: null as string | null,
  }),
  actions: {
    openFile(path: string) {
      // 逻辑清晰
    }
  }
})

// ❌ 避免：全局变量或混乱的状态管理
```

### Rust 审查要点

#### 错误处理

```rust
// ✅ 使用 Result 和 ? 操作符
fn read_file(path: &str) -> Result<String, io::Error> {
    let content = fs::read_to_string(path)?;
    Ok(content)
}

// ❌ 避免使用 unwrap()
fn read_file(path: &str) -> String {
    fs::read_to_string(path).unwrap()  // 可能 panic
}
```

#### 内存安全

```rust
// ✅ 使用借用和引用
fn process_data(data: &str) -> String {
    data.to_uppercase()
}

// ✅ 使用智能指针
let shared_data = Arc::new(Mutex::new(data));

// ❌ 避免：不必要的克隆
```

#### Tauri 命令

```rust
// ✅ 正确的命令定义
#[tauri::command]
async fn save_file(
    app_handle: AppHandle,
    path: String,
    content: String,
) -> Result<(), String> {
    // 实现
}

// ❌ 避免：阻塞主线程
#[tauri::command]
fn slow_operation() {
    // 耗时操作会阻塞 UI
}
```

### 性能审查要点

#### 前端性能

- [ ] 避免不必要的重渲染
- [ ] 使用虚拟列表处理大数据
- [ ] 懒加载非关键资源
- [ ] 合理使用 memoization

```typescript
// ✅ 使用 computed 缓存计算结果
const filteredFiles = computed(() => {
  return files.value.filter(f => f.modified)
})

// ✅ 使用 v-memo（Vue 3.4+）
<div v-memo="[count]">
  {{ count }}
</div>
```

#### Rust 性能

- [ ] 避免不必要的克隆
- [ ] 使用迭代器而非循环
- [ ] 合理使用并行计算
- [ ] 避免内存泄漏

```rust
// ✅ 使用迭代器
let sum: i32 = numbers.iter().filter(|&n| n > 0).sum();

// ❌ 避免：不必要的克隆
let new_vec = old_vec.clone();  // 考虑使用引用
```

### 安全审查要点

#### 输入验证

```typescript
// ✅ 验证用户输入
function validateFileName(name: string): boolean {
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  return validPattern.test(name) && name.length <= 255;
}

// ❌ 避免：直接使用用户输入
```

#### 文件系统安全

```rust
// ✅ 验证路径
fn safe_read_file(base_dir: &Path, user_path: &str) -> Result<String> {
    let full_path = base_dir.join(user_path);
    // 防止路径遍历攻击
    if !full_path.starts_with(base_dir) {
        return Err("Invalid path".into());
    }
    fs::read_to_string(full_path)
}
```

### 审查反馈处理

#### 接受反馈

- 感谢审查者的时间和建议
- 理解每个修改建议的原因
- 及时响应并修改

#### 讨论分歧

如果有不同意见：

1. **解释原因**: 说明你的实现考虑
2. **寻求共识**: 讨论最佳方案
3. **妥协**: 必要时做出让步
4. **记录**: 在评论中记录讨论结果

#### 修改提交

```bash
# 如果审查者要求修改
git add .
git commit -m "fix: 根据审查意见修改 XXX"

# 或者修改上一个提交（如果只有一个提交）
git commit --amend

# 推送（使用 force-with-lease 而非 force）
git push --force-with-lease
```

---

## 🎯 快速开始

### 第一次贡献？

从这里开始：

1. 查看 [Good First Issues](https://github.com/your-repo/text-editor/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
2. 阅读 [开发者文档](DEVELOPER_GUIDE.md)
3. 设置开发环境
4. 选择一个 Issue 开始

### 需要帮助？

- 💬 GitHub Discussions
- 📧 support@example.com
- 📖 [开发者文档](DEVELOPER_GUIDE.md)
- 📖 [用户手册](USER_GUIDE.md)

---

## 📜 行为准则

### 我们的承诺

为了营造开放和友好的环境，我们承诺：

- 尊重不同观点和经验
- 接受建设性批评
- 关注对社区最有利的事情
- 对其他社区成员表示同理心

### 不可接受的行为

- 使用性化的语言或图像
- 人身攻击或侮辱性评论
- 公开或私下骚扰
- 未经许可发布他人信息
- 其他不道德或不专业的行为

---

## 📄 许可证

贡献即表示你同意你的贡献遵循本项目的 [MIT License](LICENSE)。

---

*感谢您的贡献！* 🎉

*最后更新：2026-03-11*
