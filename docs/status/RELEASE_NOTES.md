# Release Notes - v1.0.0

> 跨平台文本编辑器 - 首个正式版本  
> 发布日期：2026-03-11

---

## 🎉 欢迎使用 v1.0.0

我们很高兴地宣布跨平台文本编辑器的首个正式版本正式发布！这是一个基于 Tauri 2.0 + Vue 3 的现代化文本编辑器，支持 Windows、macOS 和 Linux 三大主流操作系统。

---

## ✨ 新功能

### 核心编辑功能

#### 📄 文件管理
- **新建/打开/保存** - 完整的文件操作支持
- **另存为** - 支持将文件保存为新位置或新格式
- **最近文件列表** - 快速访问最近编辑的文件
- **文件编码自动检测** - 支持 UTF-8、GBK 等多种编码格式自动识别

#### ✏️ 文本编辑
- **基础编辑操作** - 剪切、复制、粘贴、全选
- **撤销/重做** - 无限层级撤销重做支持
- **多光标编辑** - 同时编辑多个位置
- **代码折叠** - 折叠/展开代码块
- **自动缩进** - 智能代码缩进

#### 🔍 搜索与替换
- **快速查找** - Ctrl+F 快速打开搜索框
- **正则表达式** - 支持正则表达式搜索
- **批量替换** - 支持全部替换和逐个替换
- **匹配项高亮** - 所有匹配项自动高亮显示

#### 🏷️ 多标签页
- **多文件编辑** - 同时打开并编辑多个文件
- **标签页切换** - 点击标签页快速切换
- **未保存提示** - 关闭未保存文件时自动提醒
- **标签页关闭** - 单个或批量关闭标签页

### 语法高亮

- **50+ 编程语言支持** - 包括 JavaScript、TypeScript、Python、Java、C++、Go、Rust 等
- **自动语言检测** - 根据文件扩展名自动识别编程语言
- **主题适配** - 语法高亮颜色随主题自动调整

### 主题系统

- **浅色主题** - 明亮舒适的日间模式
- **深色主题** - 护眼舒适的夜间模式
- **快速切换** - Ctrl+Shift+L 快速切换主题
- **系统主题跟随** - 可选跟随系统主题自动切换

### 自动保存

- **可配置保存间隔** - 支持自定义自动保存时间间隔
- **崩溃恢复** - 意外关闭后自动恢复未保存内容
- **会话恢复** - 重新启动时自动恢复上次会话状态

### 跨平台支持

- **Windows 10+** - 提供 MSI 和 NSIS 安装包
- **macOS 11+** - 支持 Intel 和 Apple Silicon (M1/M2)
- **Linux** - 支持 Ubuntu、Fedora、Arch 等主流发行版，提供 DEB、RPM、AppImage 格式

---

## 🔧 技术特性

### 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| 后端框架 | Tauri | 2.0 |
| 前端框架 | Vue | 3.4 |
| 编程语言 | TypeScript | 5.4 |
| 构建工具 | Vite | 5.x |
| 状态管理 | Pinia | 2.x |
| UI 组件库 | Naive UI | 2.x |
| 代码编辑器 | Monaco Editor | 0.47+ |

### 性能优化

- **轻量级安装包** - 相比 Electron 方案减小约 80% 体积
- **快速启动** - 冷启动时间 < 2 秒
- **低内存占用** - 空闲时内存占用 < 100MB
- **原生性能** - Rust 后端提供原生级性能

### 安全性

- **沙箱隔离** - 前端运行在安全沙箱中
- **最小权限** - 仅请求必要的系统权限
- **代码签名** - 所有发布包均经过代码签名

---

## 📋 系统要求

### Windows

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10 版本 1903 或更高 |
| 处理器 | x64 或 x86 处理器 |
| 内存 | 最低 2GB，推荐 4GB |
| 磁盘空间 | 500MB 可用空间 |
| 其他 | .NET Framework 4.7+（通常已预装） |

### macOS

| 项目 | 要求 |
|------|------|
| 操作系统 | macOS 11.0 (Big Sur) 或更高 |
| 处理器 | Intel 或 Apple Silicon (M1/M2) |
| 内存 | 最低 2GB，推荐 4GB |
| 磁盘空间 | 500MB 可用空间 |

### Linux

| 项目 | 要求 |
|------|------|
| 操作系统 | Ubuntu 20.04+ / Fedora 34+ / Arch Linux 最新 |
| 处理器 | x86_64 (amd64) |
| 内存 | 最低 2GB，推荐 4GB |
| 磁盘空间 | 500MB 可用空间 |
| 系统依赖 | libwebkit2gtk, libgtk-3, libssl, libappindicator |

---

## 📦 安装说明

### Windows

**方法一：安装程序（推荐）**
1. 从 [Releases](https://github.com/your-repo/text-editor/releases) 下载 `text-editor_1.0.0_x64-setup.exe`
2. 双击运行安装程序
3. 按照安装向导完成安装
4. 从开始菜单或桌面快捷方式启动

**方法二：包管理器**
```powershell
# Scoop
scoop install text-editor

# Chocolatey
choco install text-editor
```

### macOS

**方法一：DMG 安装包（推荐）**
1. 从 [Releases](https://github.com/your-repo/text-editor/releases) 下载对应芯片版本的 DMG 文件
   - Intel: `text-editor_1.0.0_x64.dmg`
   - Apple Silicon: `text-editor_1.0.0_aarch64.dmg`
2. 双击打开 DMG 文件
3. 将应用拖拽到 Applications 文件夹
4. 从启动台或 Applications 启动

**方法二：Homebrew**
```bash
brew install --cask text-editor
```

### Linux

**Ubuntu/Debian**
```bash
# 下载并安装 DEB 包
wget https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor_1.0.0_amd64.deb
sudo apt install ./text-editor_1.0.0_amd64.deb
```

**Fedora/RHEL**
```bash
# 下载并安装 RPM 包
wget https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor-1.0.0.x86_64.rpm
sudo dnf install ./text-editor-1.0.0.x86_64.rpm
```

**Arch Linux**
```bash
# AUR 安装
yay -S text-editor
```

**通用（AppImage）**
```bash
# 下载 AppImage
wget https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor-1.0.0.AppImage
chmod +x text-editor-1.0.0.AppImage
./text-editor-1.0.0.AppImage
```

详细安装说明请查看 [INSTALL.md](INSTALL.md)

---

## 🐛 已知问题

### 中等问题

#### #101 大文件（>50MB）打开时可能卡顿
- **影响范围**: 打开超过 50MB 的大文件时
- **症状**: 应用响应变慢，滚动卡顿
- **临时方案**: 使用系统默认编辑器打开超大文件
- **计划修复**: v0.2.0

#### #102 某些中文字体在 Linux 下显示异常
- **影响范围**: 部分 Linux 发行版（主要是最小化安装）
- **症状**: 中文字体显示为方框或乱码
- **临时方案**: 安装完整字体包 `sudo apt install fonts-wqy-microhei fonts-wqy-zenhei`
- **计划修复**: v0.2.0

### 轻微问题

#### #201 主题切换后需要重启应用才能完全生效
- **影响范围**: 所有平台
- **症状**: 切换主题后部分 UI 元素颜色未更新
- **临时方案**: 切换主题后手动刷新应用（Ctrl+R）
- **计划修复**: v1.0.1

#### #202 首次启动时最近文件列表为空
- **影响范围**: 仅首次启动
- **症状**: 最近文件列表显示为空
- **说明**: 属预期行为，使用后会自动填充
- **计划修复**: 无需修复

---

## 📝 更新日志

完整的变更历史请查看 [CHANGELOG.md](CHANGELOG.md)

---

## 🔗 快速链接

- 📖 [用户手册](USER_GUIDE.md) - 功能介绍和使用指南
- 🛠️ [安装指南](INSTALL.md) - 详细安装步骤
- 💻 [开发者文档](DEVELOPER_GUIDE.md) - 源码编译和开发指南
- 📋 [快捷键列表](SHORTCUTS.md) - 所有快捷键速查
- 🐛 [问题反馈](https://github.com/your-repo/text-editor/issues) - 提交 Bug 或功能建议
- 💬 [社区讨论](https://github.com/your-repo/text-editor/discussions) - 参与社区讨论

---

## 🙏 致谢

感谢以下开源项目的支持：

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - 代码编辑器组件（VS Code 同款）
- [Naive UI](https://www.naiveui.com/) - Vue 3 组件库
- [TypeScript](https://www.typescriptlang.org/) - 类型化的 JavaScript

---

## 📞 联系方式

- 📧 Email: support@example.com
- 🐛 Issues: [GitHub Issues](https://github.com/your-repo/text-editor/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/your-repo/text-editor/discussions)

---

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

*感谢您选择跨平台文本编辑器！* 🦐

*最后更新：2026-03-11*
