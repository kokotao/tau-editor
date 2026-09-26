# 变更日志 (Changelog)

> 项目：[Tau Editor](https://github.com/kokotao/tau-editor)
> 维护口径：以 Git tag、GitHub Release、`docs/release` 发布记录和相邻标签代码差异为准。
> 最后更新：2026-09-25
> 当前稳定版本：`v0.4.2`

---

## 发布索引

| 版本                                                               | 日期       | 发布状态         | 标签提交  | 主要变更                                                      |
| ------------------------------------------------------------------ | ---------- | ---------------- | --------- | ------------------------------------------------------------- |
| [0.4.2](https://github.com/kokotao/tau-editor/releases/tag/v0.4.2) | 2026-09-26 | 公开 Release     | 待发布回填 | 微圆角体系、macOS 签名修复、Developer ID 公证开关             |
| [0.4.1](https://github.com/kokotao/tau-editor/releases/tag/v0.4.1) | 2026-09-25 | 公开 Release     | `335f6ab` | 平角工作台、字体层级、标签交互、浮层收口、视觉基线            |
| [0.4.0](https://github.com/kokotao/tau-editor/releases/tag/v0.4.0) | 2026-09-22 | 公开 Release     | `8128e02` | 主题包、快捷键自定义、Diff、多窗口、Provider、启动性能        |
| [0.3.3](https://github.com/kokotao/tau-editor/releases/tag/v0.3.3) | 2026-09-22 | 公开 Release     | `cdbca32` | 恢复库 v2、文件监听、三方冲突、大文件事务、搜索替换安全收口   |
| [0.3.2](https://github.com/kokotao/tau-editor/releases/tag/v0.3.2) | 2026-08-24 | 公开 Release     | `6a96a83` | 修复 Windows 控制台闪窗，文件关联按需加载                     |
| [0.3.1](https://github.com/kokotao/tau-editor/releases/tag/v0.3.1) | 2026-08-24 | 公开 Release     | `dd1ed2e` | Windows 文件关联修复与运行时配置，修复 Cargo.lock             |
| [0.3.0](https://github.com/kokotao/tau-editor/releases/tag/v0.3.0) | 2026-07-16 | 公开 Release     | `65ae7f4` | 工作区 Runtime、快速打开、项目搜索、Git 上下文、Markdown 导出 |
| [0.2.6](https://github.com/kokotao/tau-editor/releases/tag/v0.2.6) | 2026-07-16 | 公开 Release     | `7f02544` | 三栏工作台、Context Rail、文档大纲、响应式侧栏                |
| [0.2.5](https://github.com/kokotao/tau-editor/releases/tag/v0.2.5) | 2026-04-12 | 公开 Release     | `d5f15da` | 编辑器补全、外部文件同步、macOS 更新安装                      |
| [0.2.4](https://github.com/kokotao/tau-editor/releases/tag/v0.2.4) | 2026-04-12 | 公开 Release     | `ff87948` | 四套 Markdown 预览主题与右键菜单主题切换                      |
| [0.2.3](https://github.com/kokotao/tau-editor/releases/tag/v0.2.3) | 2026-03-28 | 公开 Release     | `24eb239` | 大文件分段加载与分段保存、标签切换性能                        |
| [0.2.2](https://github.com/kokotao/tau-editor/releases/tag/v0.2.2) | 2026-03-25 | 公开 Release     | `1b1794e` | 桌面包版本号收口                                              |
| [0.2.1](https://github.com/kokotao/tau-editor/releases/tag/v0.2.1) | 2026-03-23 | 公开 Release     | `79cdc15` | 设置工作区重构、自动更新、文件关联、标签内存护栏              |
| [0.2.0](https://github.com/kokotao/tau-editor/releases/tag/v0.2.0) | 2026-03-23 | 公开 Release     | `3e3d692` | 作者与捐赠信息内置、新应用图标、三平台打包                    |
| [0.1.9](https://github.com/kokotao/tau-editor/tree/v0.1.9)         | 2026-03-23 | 内部验证 tag     | `3ee5d26` | Markdown 预览、Mermaid、侧栏交互、主题与国际化基础            |
| [0.1.8](https://github.com/kokotao/tau-editor/tree/v0.1.8)         | 2026-03-13 | 内部验证 tag     | `5b0a49e` | 修复文件/文件夹选择器与窗口关闭                               |
| [0.1.4](https://github.com/kokotao/tau-editor/tree/v0.1.4)         | 2026-03-13 | 内部验证 tag     | `57334f6` | 修复标签区域重复嵌套布局                                      |
| [0.1.3](https://github.com/kokotao/tau-editor/tree/v0.1.3)         | 2026-03-13 | 内部验证 tag     | `b49534f` | 修复 macOS 选择器权限与关闭按钮                               |
| [0.1.2](https://github.com/kokotao/tau-editor/tree/v0.1.2)         | 2026-03-13 | 内部验证 tag     | `89c1d2b` | 首个可构建基线，命令面板与工作区根目录统一                    |
| [0.1.0](https://github.com/kokotao/tau-editor/releases/tag/v0.1.0) | 2026-03-23 | 首个公开 Release | `5deca07` | 作者与捐赠入口，Tau Editor 命名统一                           |

---

## 历史口径说明

- 发布日期优先采用 GitHub Release 发布时间；没有公开 Release 的内部 tag 采用 tag 时间。
- `v0.1.2` 至 `v0.1.9` 有 Git tag，但没有对应 GitHub Release，本文标记为“内部验证 tag”。
- `v0.1.0` 是首个公开 Release，但 tag 指向 `5deca07` 时，代码树已经包含 `v0.1.9` 的能力，且发布资产名仍为 `0.1.9`。
- 仓库没有 `v1.0.0` tag 或 Release。旧版 `CHANGELOG.md` 中的 `1.0.0` 内容属于规划稿，已在“未发布与无标签归档”中更正。
- 仓库没有 `v0.1.1`、`v0.1.5`、`v0.1.6`、`v0.1.7` tag，不对缺失号段补写不存在的发布记录。
- 当前官方安装渠道只有 [GitHub Releases](https://github.com/kokotao/tau-editor/releases)。Homebrew、Scoop、Chocolatey、AUR、Flatpak、Snap 等渠道未在本仓库发布记录中声明。

---

## [0.4.2] - 2026-09-26

### 发布定位

微圆角视觉修订版，在不改变桌面编辑器工具感的前提下，为交互控件和浮层增加克制圆角；同时修复 macOS 构建包仅带 linker 签名导致的「已损坏」问题，并接入 Developer ID 签名与公证开关。

### 改进

- 建立 `0 / 2 / 4 / 6 / 8px` 圆角体系与圆形例外规则。
- 三栏、工具栏、状态栏、全宽列表和 Monaco 区域继续保持平角。
- 按钮、输入框、状态项、未保存徽标和菜单项应用 `4px` 微圆角。
- 标签仅顶部使用 `4px`，底部继续与编辑区平齐。
- 设置卡片、菜单、通知和 Markdown 内容使用 `6px`，大浮层最高使用 `8px`。
- 清除全部 `9px` 以上硬编码圆角，降低圆角套圆角问题。

### 修复

- macOS 构建期对整个 `.app` 执行 ad-hoc 完整签名，绑定 `Info.plist` 和资源，修复旧产物可能被 Gatekeeper 判定为「已损坏」的问题。
- 打包脚本增加 quarantine 属性清理、签名有效性检查和 Developer ID 防覆盖保护。
- Desktop Build 新增 macOS 签名校验，Developer ID 模式下额外校验 `spctl` 与 `stapler`。
- CI 支持通过 Secrets 启用 Apple Developer ID 签名、公证和 staple；未配置时安全回退到 ad-hoc 签名。

### 验证

- `npm run type-check`：通过。
- `npx vitest run`：51 个文件、778 项测试通过。
- `npm run build`：通过。
- `npm run test:visual:baseline`：双视口基线生成成功，深色与浅色主题完成复核。
- GitHub CI 与 Desktop Build 结果将在发布后回填。

### 兼容性

- 不涉及数据模型、API、存储格式和保存逻辑变更。
- 未配置 Apple Secrets 时仍可正常构建，macOS 首次打开需在系统设置中放行一次。
- 配置 Developer ID Secrets 后不需要用户手动放行。

## [0.4.1] - 2026-09-25

### 发布定位

在 `v0.4.0` 功能体验版基础上，统一编辑器工作台视觉语言，优化字体层级、标签交互、状态反馈和浮层样式，并补充可重复执行的视觉回归基线。

### 改进

- 工具栏、标签栏、状态栏、文件树、上下文栏、设置页和对话框统一为平角设计。
- 统一 UI 字号 token，提升活动标签、路径、状态信息和设置控件的中文可读性。
- 右上角未保存提示改为单行紧凑徽标，修复中文逐字换行和挤压问题。
- 标签新增悬浮详情，展示文件名、完整路径、保存状态、重命名和右键操作提示。
- 活动标签增加顶部定位线；关闭按钮增加默认、悬浮和键盘焦点状态。
- 标签栏增加 `tablist` 语义，支持方向键、Home/End、Enter/Space 激活。
- Command Palette、设置工作区、工作区搜索、替换预览、外部变更和通知统一平角与字体规范。
- 新增视觉基线采集命令 `npm run test:visual:baseline`，覆盖编辑器、命令面板、设置页和紧凑视口。

### 验证

- `npm run type-check`：通过。
- `npm run build`：通过。
- `npx vitest run`：51 个文件、778 项测试通过。
- `npm run test:visual:baseline`：成功生成 4 张视觉基线。
- `RUSTFLAGS="-D warnings" cargo check --all-targets --locked`：通过。
- `cargo test --all-targets --locked`：135 项测试通过。
- Playwright 人工复核：1680×1050、1280×720 无状态徽标溢出和标签 Tooltip 遮挡。

### 兼容性

- 不涉及数据模型、API、存储格式和保存逻辑变更。
- 回滚到 `v0.4.0` 不影响配置文件和用户数据。

## [0.4.0] - 2026-09-22

### 发布定位

在 `v0.3.3` 的数据安全闭环之上，补齐“可定制、可比对、可扩展”的体验能力，并完成首屏性能分包。

### 新增

- 新增主题包 JSON 模型与校验，支持 `id`、`name`、`colors`、`monaco` 字段和 256 KB 上限。
- 设置面板支持导入文件、粘贴导入、导出当前主题、删除和切换主题包。
- 主题包同时驱动 UI CSS 变量与 Monaco 配色；注册失败时自动回退内置主题。
- 内置 Provider 附带 Tau Midnight 主题包，可直接导出后二次修改。
- 新增 `keybindingService`，提供快捷键归一化、冲突检测、显示格式化和持久化。
- 设置面板支持录制改键、冲突覆盖确认、单条重置和全部重置。
- 命令面板展示当前生效快捷键；F1 固定保留为命令面板入口。
- 新增只读 Monaco Diff 视图，支持并排和内联切换。
- Diff 入口覆盖命令面板“比较当前文件与...”、文件树右键和 Git 变更项。
- Git 变更对比以 HEAD 版本为基准，并保留未保存内容参与对比。
- 新增多窗口标签迁移，支持“在新窗口打开当前标签”和“移动到新窗口”。
- 新增主题、命令、文件动作三类 Provider 注册表，重复注册会覆盖并告警。
- 新增内置文件动作：复制路径、在文件管理器中显示。

### 改进

- Monaco 编辑器改为异步组件加载，不再进入首屏依赖。
- marked、DOMPurify、mermaid 拆分为独立 Markdown 渲染 chunk，仅在预览和导出时加载。
- 构建分包细化为 monaco、mermaid、markdown-renderer、ui-vendor、vue-vendor、tauri。
- 入口 chunk 从 1,115 KB 降至 313 KB，gzip 从 313 KB 降至 95 KB。

### 安全与边界

- Diff 单侧文件上限为 2 MB，并增加二进制文件守卫。
- 多窗口迁移单次上限为 8 个标签、8 MB，迁移 payload 与窗口 label 绑定，取出即删，10 分钟过期。
- Provider 抛错会被隔离并在设置面板可见，不影响应用启动。
- 主题包和快捷键覆盖均为增量设置字段，回滚到 `v0.3.3` 时多余字段会被忽略。

### 验证

- 新增 61 个单元测试用例，覆盖主题包、快捷键、Diff、窗口迁移和 Provider。
- 前端单元测试：51 个文件、777 项通过。
- `pnpm type-check`、`pnpm build` 通过。
- `RUSTFLAGS="-D warnings" cargo check --all-targets --locked` 通过。
- `cargo test --all-targets --locked`：61 项通过。
- Playwright Chromium E2E：51 条通过。
- GitHub CI run `35714658258` 四道门禁全部通过。
- Desktop Build run `35715143481` 三平台构建和资产上传成功。

### 发布产物

- macOS：`Tau.Editor_0.4.0_aarch64.dmg`
- Windows：`Tau.Editor_0.4.0_x64-setup.exe`、`Tau.Editor_0.4.0_x64_zh-CN.msi`
- Linux：`Tau.Editor_0.4.0_amd64.deb`、`Tau.Editor-0.4.0-1.x86_64.rpm`、`Tau.Editor_0.4.0_amd64.AppImage`

### 已知限制

- macOS 产物未使用 Apple Developer ID 签名和公证，首次下载打开可能触发 Gatekeeper 提示。
- 当前只提供 Apple Silicon 的 macOS DMG，未提供 Intel 或 universal 包。
- 回滚到 `v0.3.3` 不会破坏设置文件；阻断问题以 `v0.4.1` 修复，不覆盖既有 tag。

---

## [0.3.3] - 2026-09-22

### 发布定位

安全收口版，补齐恢复、外部变更、大文件、搜索替换、Markdown 资产五条数据安全链路，并为主要路径增加自动化门禁。

### 新增

- 新增应用数据目录下的 `recovery-v2` 恢复库，会话索引和草稿分文件存放。
- 启动时异步恢复工作区、标签、活动文件、光标、滚动位置和未保存草稿。
- 支持 v1 会话和草稿迁移；损坏或超大记录不会阻塞启动。
- 工作区监听改为 `notify` 递归监听，通过 `workspace:file-changed` 推送外部变更。
- dirty 文件被外部修改时标记三方冲突，提供重新加载、保留当前内容和另存为。
- clean 文件被外部修改时自动重载，外部重命名会跟随已打开标签。
- 大文件打开、分段加载、取消、重试、完成、保存进入明确状态机。
- 大文件保存采用“写临时文件、复核 revision、原子替换”，超过 4 MiB 也能安全提交。
- 搜索升级为带 `searchId` 的可取消会话，失效请求不会回写旧结果。
- 替换增加不可重叠预览，再按文件独立提交，并逐项展示成功、跳过、失败和撤销结果。
- Markdown 图片可通过原生选择器导入到同级 `assets/`，同名同内容自动复用。
- Markdown 相对链接增加 600 ms 去抖校验，任务可聚合、可跳转。
- Markdown HTML 导出可直接选择目标目录。
- CI 新增 `frontend-e2e` job，覆盖 Chromium 51 个用例并上传失败报告。

### 修复

- 修复标签切换竞态导致的内容串写：输入去抖未落盘时先按标签 id 回写，再切换模型。
- 修复 Windows 下 Git 子进程弹出控制台黑框，统一补充 `CREATE_NO_WINDOW`。
- 修复安装包 Source Code 文件关联包含 `sh`、`bash`、`zsh`、`ps1` 的问题。

### 验证

- `pnpm typecheck`、`pnpm build` 通过。
- 前端单元测试：44 个文件、727 项通过。
- `cargo check --all-targets --locked` 在 `RUSTFLAGS=-D warnings` 下通过，0 warning。
- `cargo test --all-targets --locked`：132 项通过。
- Playwright Chromium E2E：51 passed、0 failed。
- `pnpm tauri build` 产出 macOS `.app` 和 `Tau.Editor_0.3.3_aarch64.dmg`。
- GitHub Desktop Build run `35672348704` 三平台构建全部成功。

### 发布产物

- macOS：`Tau.Editor_0.3.3_aarch64.dmg`
- Windows：`Tau.Editor_0.3.3_x64-setup.exe`、`Tau.Editor_0.3.3_x64_zh-CN.msi`
- Linux：`Tau.Editor_0.3.3_amd64.deb`、`Tau.Editor-0.3.3-1.x86_64.rpm`、`Tau.Editor_0.3.3_amd64.AppImage`

### 已知限制

- macOS 产物只提供 aarch64，Intel Mac 需要 x64 或 universal 构建。
- 替换按文件独立提交，不提供跨文件原子事务。
- 不包含远程同步、协作编辑、完整 LSP、插件市场和云存储。
- 所有桌面产物均为未签名构建。
- 数据层回滚时可继续读取保留的 v1 记录；阻断问题以 `v0.3.4` 修复，不覆盖已有 tag。

---

## [0.3.2] - 2026-08-24

### 修复

- 为 `reg`、`cmd`、`msiexec`、`explorer` 子进程增加 `CREATE_NO_WINDOW`，消除 Windows GUI 启动、保存、打开文件时的控制台闪窗。
- “文件关联”设置改为进入对应分类时才读取系统状态，避免启动阶段批量执行 `reg` 查询。
- 版本号统一升级到 `0.3.2`。

### 验证

- macOS、Linux、Windows 三平台桌面构建成功。
- 该版本随后作为 `v0.3.3` 的开发基线，由 `v0.3.3` 全量 CI 门禁覆盖。

### 发布产物

- macOS：`Tau.Editor_0.3.2_aarch64.dmg`
- Windows：`Tau.Editor_0.3.2_x64-setup.exe`、`Tau.Editor_0.3.2_x64_zh-CN.msi`
- Linux：`Tau.Editor_0.3.2_amd64.deb`、`Tau.Editor-0.3.2-1.x86_64.rpm`、`Tau.Editor_0.3.2_amd64.AppImage`

---

## [0.3.1] - 2026-08-24

### 新增

- 设置面板新增“文件关联”（仅 Windows），可在运行时勾选或取消 Tau Editor 作为扩展名默认打开程序。
- 脚本类扩展名 `bat`、`cmd`、`ps1`、`sh`、`bash`、`zsh` 默认不参与关联，避免占用系统执行能力。

### 修复

- 安装器不再把 `.bat`、`.cmd` 注册为 Tau Editor 打开，双击脚本恢复系统默认执行行为。
- 修复 `Cargo.lock` 指向不可用 crate 版本导致构建失败的问题。
- 统一 root package、frontend package、Cargo 和 Tauri 版本号到 `0.3.1`。

### 验证

- `cargo check` 与新增单测通过。
- `vue-tsc` 类型检查通过。
- `vite build` 通过。
- macOS、Linux、Windows 桌面构建全部成功。

### 发布产物

- macOS：`Tau.Editor_0.3.1_aarch64.dmg`
- Windows：`Tau.Editor_0.3.1_x64-setup.exe`、`Tau.Editor_0.3.1_x64_zh-CN.msi`
- Linux：`Tau.Editor_0.3.1_amd64.deb`、`Tau.Editor-0.3.1-1.x86_64.rpm`、`Tau.Editor_0.3.1_amd64.AppImage`

---

## [0.3.0] - 2026-07-16

### 发布定位

将编辑器升级为本地优先的写作与代码一体工作台。

### 新增

- 工作区安全 Runtime：受限 `workspaceId`、文件 revision 和条件原子写入。
- 会话和未保存草稿恢复，启动时可恢复或丢弃草稿。
- 外部文件修改处理，右侧上下文提供重新加载或保留当前内容。
- 大文件继续沿用分块加载、加载期只读和安全保存限制。
- 快速打开：`Cmd/Ctrl + P` 检索当前工作区已索引文件。
- 项目搜索：`Cmd/Ctrl + Shift + F` 支持工作区文本和正则搜索、源行定位。
- 后端增加 revision 校验替换接口。
- Git 上下文：状态、Diff、暂存、取消暂存和恢复工作区文件。
- Markdown 任务与链接导航、独立 HTML 导出。
- 代码符号和 Markdown 标题统一显示在右侧 Context Rail，可跳转到编辑器对应行。

### 验证

- 前端单元测试：625 项通过。
- Rust 测试：92 项通过。
- 前端类型检查、生产构建、Rust 检查和 macOS ARM64 DMG 打包通过。
- `Tau.Editor_0.3.0_aarch64.dmg` SHA-256：`e4af011f5b73730680ad2678d712421b9bf31fc1346d60fe1f0c6245d90a234d`。

### 发布产物

- macOS：`Tau.Editor_0.3.0_aarch64.dmg`
- Windows：`Tau.Editor_0.3.0_x64-setup.exe`、`Tau.Editor_0.3.0_x64_zh-CN.msi`
- Linux：`Tau.Editor_0.3.0_amd64.deb`、`Tau.Editor-0.3.0-1.x86_64.rpm`、`Tau.Editor_0.3.0_amd64.AppImage`

### 已知限制

- `v0.3.0` 的恢复、监听、三方冲突、大文件最终保存和替换预览尚未完全形成安全闭环，后续由 `v0.3.3` 收口。
- 回滚时可继续使用 `v0.2.6` Release，不覆盖已有 tag 或安装包。

---

## [0.2.6] - 2026-07-16

### 新增

- 新增扁平三栏工作台，使用细线分隔区域，移除工作区卡片阴影和大圆角。
- 新增右侧 Context Rail，可展示 Markdown 标题、代码符号、JSON/YAML 关键结构。
- Context Rail 支持点击后跳转到编辑器对应行。
- 新增 Context Rail 快捷操作：查找、跳转行、保存、Markdown 预览模式。
- Markdown 预览支持按源行同步定位，并处理围栏代码、HTML 块和 Mermaid 异步渲染。
- 右栏宽度和折叠偏好可持久化。

### 改进

- 窄屏下左右栏改为按需覆盖式抽屉，移动端宽度默认收起。
- 对异常本地设置值进行安全归一化。
- 修复并恢复全量单元测试门禁。
- 发布工作流支持原生 macOS bundle 和多平台构建。
- 提高 release 构建的 Node heap，避免打包阶段内存不足。

### 验证

- 单元测试：30 个文件、610 项通过。
- 前端类型检查和生产构建通过。
- Rust `cargo check` 通过。

### 发布产物

- macOS：`Tau.Editor_0.2.6_aarch64.dmg`
- Windows：`Tau.Editor_0.2.6_x64-setup.exe`、`Tau.Editor_0.2.6_x64_zh-CN.msi`
- Linux：`Tau.Editor_0.2.6_amd64.deb`、`Tau.Editor-0.2.6-1.x86_64.rpm`、`Tau.Editor_0.2.6_amd64.AppImage`

### 已知提示

- Vite 仍会提示 Monaco 相关 chunk 较大，不影响构建和安装包生成。

---

## [0.2.5] - 2026-04-12

### 新增

- 新增编辑器补全服务，提供 JavaScript、TypeScript、Python、Markdown、HTML、Vue、JSON 片段补全。
- 新增当前文档单词补全，输入至少 2 个字符后匹配文档内标识符。
- 新增 Monaco 补全注册，支持触发字符、片段插入和建议项类型映射。
- 新增外部文件同步服务，对活动标签进行 1.5 秒轮询检查。
- dirty 文件被外部修改时提示用户处理，clean 文件自动重载，并刷新工作区文件树。
- 新增 macOS 更新安装流程：下载 DMG、挂载、替换当前 `.app`、重新打开并清理挂载。
- 设置面板增加 GitHub Release 更新检查、推荐资产匹配和下载安装入口。

### 修复

- 修复 macOS 更新调用链中安装包启动方式不足的问题。
- 更新桌面版本号到 `0.2.5`，保持 Cargo 和 Tauri 配置一致。

### 验证

- 新增 `editorCompletionService` 和 `externalFileSync` 单元测试。
- 前端类型检查、构建和桌面打包流程沿用发布工作流执行。

### 发布产物

- macOS：`Tau.Editor_0.2.5_aarch64.dmg`
- Windows：`Tau.Editor_0.2.5_x64-setup.exe`、`Tau.Editor_0.2.5_x64_zh-CN.msi`
- Linux：`Tau.Editor_0.2.5_amd64.deb`、`Tau.Editor-0.2.5-1.x86_64.rpm`、`Tau.Editor_0.2.5_amd64.AppImage`

---

## [0.2.4] - 2026-04-12

### 新增

- 新增 4 套 Markdown 预览阅读主题：`docs-clean`、`paper-soft`、`editorial-warm`、`graphite-night`。
- 设置面板新增 Markdown 预览主题切换入口。
- Markdown 预览区右键菜单新增主题切换入口。
- 新增主题切换的单元测试和 E2E 回归测试。
- 新增右键菜单定位的单元测试和 E2E 回归测试。

### 修复

- 修复 Markdown 预览右键菜单位置偏移，菜单会贴近实际触发位置显示。
- 修正与当前设置工作区行为一致的测试断言。

### 验证

- 定向 Vitest：SettingsStore、SettingsPanel、MarkdownPreview、AppShell。
- `pnpm --dir frontend type-check` 通过。
- `pnpm --dir frontend build` 通过。
- Chromium E2E `sidebar-markdown.spec.ts` 通过。
- `pnpm --dir frontend tauri build --target universal-apple-darwin --bundles app` 通过。

### 发布产物

- macOS：`TauEditor_0.2.4_universal-macos.dmg`、`TauEditor_0.2.4_universal-macos.zip`、`Tau.Editor.app.tar.gz`
- Windows：`Tau.Editor_0.2.4_x64-setup.exe`、`Tau.Editor_0.2.4_x64_zh-CN.msi`
- Linux：`Tau.Editor_0.2.4_amd64.deb`、`Tau.Editor-0.2.4-1.x86_64.rpm`、`Tau.Editor_0.2.4_amd64.AppImage`

---

## [0.2.3] - 2026-03-28

### 发布定位

大文件编辑和标签性能改造版本。

### 新增

- 大文件支持分段加载，默认 12 MB 以上进入分块流程，默认分片 2 MB。
- 大文件支持分段保存，默认按 1 MB 分片写入。
- 分段读取会裁剪未完整 UTF-8 字符，避免中文等多字节字符在分片边界损坏。
- 新增大文件加载进度、已加载字节数、总大小、分片大小和加载会话 ID。
- 加载未完成时标签只读，加载完成后自动切换到可编辑状态。
- 新增标签模型缓存和视图状态缓存，标签切换时复用 Monaco model。
- 新增增量行数同步，避免标签切换时全量拆分内容。
- 新增编辑器右键菜单，包括撤销、重做、剪切、复制、粘贴、全选、复制路径和打开文件位置。
- 新增大文件性能选项：关闭 minimap、折叠、codeLens 和部分高亮。
- 新增大文件配置命令和二进制预览扩展名守卫。

### 修复

- 修复 UTF-8 多字节字符在分片边界被截断的问题。
- 修复大文件标签切换后模型内容串写和重复创建模型的问题。
- 修复超过 50 万字符时状态栏逐次统计字数的性能问题。
- 修复右键菜单定位和中文国际化缺失。

### 已知限制

- 大文件预览未完整加载前不能保存或另存为。
- `pdf`、`doc`、`docx`、`db`、`sqlite`、`sqlite3` 等二进制扩展名只做预览保护，不提供完整编辑能力。
- 该版本源码提交未新增自动化测试文件，回归主要依赖后续版本测试门禁覆盖。

### 发布产物

- macOS：`TauEditor_0.2.3_universal-macos.dmg`、`TauEditor_0.2.3_universal-macos.zip`、`Tau.Editor.app.tar.gz`
- Windows：`Tau.Editor_0.2.3_x64-setup.exe`、`Tau.Editor_0.2.3_x64_zh-CN.msi`
- Linux：`Tau.Editor_0.2.3_amd64.deb`、`Tau.Editor-0.2.3-1.x86_64.rpm`、`Tau.Editor_0.2.3_amd64.AppImage`

---

## [0.2.2] - 2026-03-25

### 修复

- 将 Cargo、Tauri 和桌面包版本统一为 `0.2.2`。
- 该 tag 本身的代码差异只有版本号，未新增功能代码。

### 发布说明

- GitHub Release 延续了 `v0.2.1` 的 UI、动画、标签性能和资源管理器交互改造结果。

### 发布产物

- macOS：`TauEditor_0.2.2_universal-macos.dmg`、`TauEditor_0.2.2_universal-macos.zip`、`Tau.Editor.app.tar.gz`
- Windows：`Tau.Editor_0.2.2_x64-setup.exe`、`Tau.Editor_0.2.2_x64_zh-CN.msi`
- Linux：`Tau.Editor_0.2.2_amd64.deb`、`Tau.Editor-0.2.2-1.x86_64.rpm`、`Tau.Editor_0.2.2_amd64.AppImage`

---

## [0.2.1] - 2026-03-23

### 新增

- 重构设置工作区，按通用、编辑器、更新、关于等分类展示。
- 新增版本信息、设备信息、GitHub Release 更新检查和推荐资产匹配。
- 新增下载更新包和触发安装能力，macOS 支持挂载 DMG、替换 `.app` 并重新打开。
- 新增单实例插件，重复启动时转发文件打开请求。
- 新增外部文件打开事件和启动参数队列。
- 新增首次安装操作说明标签页，并支持 14 天后再次提示。
- 新增字体缩放快捷键：放大、缩小、重置。
- 新增语言模式循环切换。
- 配置平台文件关联，覆盖文本、Markdown、JSON、YAML、TOML 和源码类型。
- 新增最大打开标签数和标签内存上限设置。

### 改进

- 重构设置面板、工具栏、状态栏、文件树、编辑器标签和 Markdown 预览样式。
- 引入 Manrope、JetBrains Mono 字体和动画能力。
- 优化标签切换、文件树批量刷新和内存估算。
- 新增标签容量护栏，超过限制时提示用户关闭标签或调整设置。
- CI 支持手动指定源码 ref 和 release tag，并集中发布三平台资产。
- 修复 macOS 包版本号在手动 dispatch 场景下不一致的问题。

### 发布产物

- macOS：`TauEditor_0.2.1_universal-macos.dmg`、`TauEditor_0.2.1_universal-macos.zip`、`Tau.Editor_0.2.1_aarch64.dmg`、`Tau.Editor.app.tar.gz`
- Windows：`Tau.Editor_0.2.1_x64-setup.exe`、`Tau.Editor_0.2.1_x64_zh-CN.msi`
- Linux：`Tau.Editor_0.2.1_amd64.deb`、`Tau.Editor-0.2.1-1.x86_64.rpm`、`Tau.Editor_0.2.1_amd64.AppImage`

---

## [0.2.0] - 2026-03-23

### 新增

- 设置页作者信息改为直接展示，不再使用弹窗。
- 设置页加入公益捐赠文案和微信、支付宝收款二维码。
- 打包图标切换为由新 Logo 生成的全平台图标。
- 打包脚本和工作流产品名统一为 `TauEditor`。

### 改进

- README 作者信息、捐赠信息和快速开始内容更新。
- 命令面板和工具栏命令注册同步调整。
- Markdown 预览、状态栏、文件树和设置面板跟随新品牌更新。
- Release 工作流补齐 macOS、Windows、Linux 资产上传。

### 发布产物

- macOS：`TauEditor_0.2.0_universal-macos.dmg`、`TauEditor_0.2.0_universal-macos.zip`、`Tau.Editor.app.tar.gz`
- Windows：`Tau.Editor_0.2.0_x64-setup.exe`、`Tau.Editor_0.2.0_x64_zh-CN.msi`
- Linux：`Tau.Editor_0.2.0_amd64.deb`、`Tau.Editor-0.2.0-1.x86_64.rpm`、`Tau.Editor_0.2.0_amd64.AppImage`

---

## [0.1.9] - 2026-03-23

> 内部验证 tag，无独立 GitHub Release。

### 新增

- 新增 Markdown 实时预览组件，支持仅编辑、分栏、仅预览三种模式。
- 新增 Mermaid 流程图渲染。
- 新增 Markdown 预览区右键菜单，增强复制、显示和交互能力。
- 新增工作台主题 CSS、UI 国际化和主题解析工具。
- 新增命令面板、快捷键状态、设置状态和工具栏命令的测试覆盖。
- 新增文件树键盘导航：Enter、Space、方向键。
- 新增侧栏折叠、展开、宽度拖拽和状态记忆。
- 新增 `Cmd/Ctrl + B` 切换侧栏。

### 改进

- 精简启动和成功场景提示，仅保留失败或需要用户处理的提示。
- 修复窗口关闭链路重入和关闭按钮无效问题。
- 修复编辑器与标签区域的重复嵌套布局。
- 文件树目录展开、折叠图标和刷新后的展开状态更稳定。
- 更新 Cargo.lock 和 Tauri capability schema。
- 版本号升级到 `0.1.9`。

### 验证

- 前端类型检查和生产构建通过。
- 定向单元测试：38/38 通过。
- Chromium E2E：`sidebar-markdown.spec.ts`、`file-operations.spec.ts` 通过。

---

## [0.1.8] - 2026-03-13

> 内部验证 tag，无独立 GitHub Release。

### 修复

- 恢复文件选择器和文件夹选择器流程。
- 修复窗口关闭在该版本基线上的不可靠行为。
- 调整窗口服务和 workspace 服务的调用顺序，减少选择器返回后状态不同步。

### 版本说明

- `package.json`、Cargo 和 Tauri 元数据仍保持 `0.1.4`，该 tag 仅用于隔离验证窗口与选择器修复。

---

## [0.1.4] - 2026-03-13

> 内部验证 tag，无独立 GitHub Release。

### 修复

- 修复 `EditorTabs` 和 `EditorCore` 重复嵌套编辑区布局的问题。
- 调整标签内容区域高度和滚动容器，避免标签切换后编辑器尺寸异常。

### 版本说明

- root package、Cargo 和 Tauri 版本号统一升级到 `0.1.4`。

---

## [0.1.3] - 2026-03-13

> 内部验证 tag，无独立 GitHub Release。

### 修复

- 修复 macOS 文件选择器因 capability 权限不足而报错的问题。
- 修复窗口关闭按钮无响应的问题。
- 调整 workspace 选择流程，避免关闭或取消选择器后的残留状态。
- 版本号升级到 `0.1.3`。

### 验证

- 针对 macOS 选择器和关闭链路进行回归验证。

---

## [0.1.2] - 2026-03-13

> 内部验证 tag，是仓库首个可构建 tag，无独立 GitHub Release。

### 新增

- 建立 Tauri 2、Vue 3、TypeScript、Vite、Monaco、Pinia 桌面编辑器基线。
- 新增命令面板，支持新建、打开、打开文件夹、保存、另存为、切换侧栏、打开设置。
- 统一工作区根目录来源，减少文件树、标签和保存路径不一致。
- 新增文件系统、标签、窗口、工作区和命令状态服务分层。
- 新增 macOS DMG 打包脚本。
- 新增桌面构建 artifact 上传流程。

### 修复

- 修复 Rust Tauri 后端编译错误。
- 修复 Windows Tauri 构建兼容问题。
- 修复 macOS DMG 打包配置。
- 补充 tab、editor、Tauri 类型更新，确保 CI 构建通过。

### 版本说明

- tag 名为 `v0.1.2`，但 root `package.json` 当时仍为 `0.1.0`，frontend package 为 `0.0.0`，属于早期版本元数据未对齐状态。

---

## [0.1.0] - 2026-03-23

> 首个 GitHub 公开 Release。
> 重要说明：tag 指向 `5deca07` 时，代码树已经包含 `v0.1.9` 的能力，发布资产名也仍为 `0.1.9`。

### 新增

- 作者信息入口新增公益捐赠文案与二维码展示。
- 编辑器命名统一为 Tau Editor / Tau 编辑器。
- README 可直接显示微信和支付宝收款码。
- `.gitignore` 忽略 `.idea` 和 `.tmp-release-assets-*` 临时目录。

### 发布产物

- Linux：`Tau.Editor_0.1.9_amd64.deb`、`Tau.Editor-0.1.9-1.x86_64.rpm`、`Tau.Editor_0.1.9_amd64.AppImage`
- 该公开 Release 未上传 macOS 和 Windows 资产；完整三平台 Release 从 `v0.2.0` 开始。

### 发布状态

- 这是 GitHub 上第一个公开 Release。
- 后续 `v0.1.2` 至 `v0.1.9` 的 tag 虽然有代码记录，但没有独立 GitHub Release。
- 回滚或复现时，应同时核对 tag commit 和 Release 资产版本号，不能只按 Release 名判断代码版本。

---

## 未发布与无标签归档

### [1.0.0] - 未发布

- 仓库不存在 `v1.0.0` tag，也没有对应 GitHub Release 或包版本。
- 旧版日志将 `1.0.0` 写为“首个正式版本”与仓库事实不一致，实际首个公开 Release 是 `v0.1.0`。
- 旧文档中的 Markdown 预览、文件树、自定义主题、快捷键、多窗口、Diff 等能力，已分别在 `v0.1.9` 至 `v0.4.0` 分阶段交付。
- 国际化、插件系统、设置完整性、发布流程等属于当时规划，未在本日志中声明为已交付。

### [0.0.1] - 未打 tag

- 仓库首个提交为 `9662472`，提交信息为 `Initial import from openClaw workspace`。
- 完成 Tauri 2、Vue 3、TypeScript、Vite、Monaco Editor、Naive UI 和基础工程结构导入。
- 早期文档曾记录日期为 2026-03-01，但 Git 提交历史显示为 2026-03-12，本文以 Git 记录为准。

### 缺失号段

- `v0.1.1`、`v0.1.5`、`v0.1.6`、`v0.1.7` 没有 Git tag，也没有发布记录。
- 缺失号段不补写为正式版本，避免形成无法追溯的变更历史。

---

## 版本规则

遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)：

- **MAJOR**：不兼容的 API、数据格式或用户工作流变更。
- **MINOR**：向后兼容的功能新增。
- **PATCH**：向后兼容的缺陷修复、安全修复和发布收口。

补充约定：

- 发布前必须统一 root package、frontend package、Cargo、Cargo.lock 和 Tauri 配置版本。
- 每个公开版本必须包含 Git tag、GitHub Release、平台产物和回滚说明。
- 内部验证 tag 可以早于公开 Release，但不得冒充正式 GitHub Release。
- 阻断问题通过新补丁版本修复，不覆盖已有 tag 或已上传资产。
- 回滚优先回退到上一公开 Release；涉及恢复库或设置格式时，需要同时核对数据兼容性。

## 版本条目模板

每个新增版本沿用统一条目结构；确实无内容的章节可以省略，其余章节保持顺序一致。

```markdown
## [x.y.z] - yyyy-mm-dd

### 发布定位

### 新增

### 改进

### 修复

### 验证

### 发布产物

### 已知限制

### 回滚
```

维护要求：

- 新版本必须先写入 `CHANGELOG.md`，再创建 tag。
- 版本日期以 GitHub Release 发布时间为准，准发布阶段可暂标计划日期。
- 验证章节必须记录真实命令、测试数量或明确写“未执行及原因”。
- 涉及数据格式、恢复库、设置或回滚时，必须写明兼容性和影响的版本。
- 不存在的 tag、Release、安装包或包管理器渠道不得写入发布结果。

---

## 发布渠道

- **Stable**：GitHub Releases，正式安装包和发布说明的唯一官方渠道。
- **Beta / Nightly**：当前未发布独立渠道。
- **包管理器**：当前未发布 Scoop、Chocolatey、Homebrew、AUR、Flatpak 或 Snap 官方包。
- **签名状态**：当前桌面产物为未签名构建；macOS 可能需要手动解除 quarantine，Windows 可能触发 SmartScreen 提示。

---

## 反馈与建议

- 问题反馈：[GitHub Issues](https://github.com/kokotao/tau-editor/issues)
- 版本下载：[GitHub Releases](https://github.com/kokotao/tau-editor/releases)
- 安装说明：[INSTALL.md](INSTALL.md)
- 使用手册：[USER_GUIDE.md](USER_GUIDE.md)

---

_最后更新：2026-09-23_
