# GitHub Release Template - v1.0.0

> 跨平台文本编辑器 - 首个正式版本  
> **发布日期:** 2026-03-11  
> **版本类型:** Stable (稳定版)

---

## 🎉 发布说明

我们很高兴地宣布 **跨平台文本编辑器 v1.0.0** 正式发布！这是经过 10 个开发阶段（Phase 1-10）迭代完善的首个正式版本。

这是一个基于 **Tauri 2.0 + Vue 3** 的现代化文本编辑器，支持 **Windows**、**macOS** 和 **Linux** 三大主流操作系统。

### 🏷️ 版本亮点

- ✅ **完整功能**: 文件管理、多标签编辑、语法高亮、主题切换、自动保存
- ✅ **跨平台**: Windows、macOS、Linux 全支持
- ✅ **现代化 UI**: 基于 Naive UI 的简洁界面
- ✅ **高性能**: Monaco Editor 核心，支持 50+ 编程语言
- ✅ **安全可靠**: Rust 后端，内存安全，沙箱隔离

---

## 📦 下载链接

### Windows

| 文件 | 架构 | 大小 | 下载 |
|------|------|------|------|
| `text-editor_1.0.0_x64-setup.exe` | 64 位 | ~15MB | [下载](https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor_1.0.0_x64-setup.exe) |
| `text-editor_1.0.0_x64_en-US.msi` | 64 位 | ~15MB | [下载](https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor_1.0.0_x64_en-US.msi) |

**包管理器:**
```powershell
# Scoop
scoop install text-editor

# Chocolatey
choco install text-editor
```

### macOS

| 文件 | 架构 | 大小 | 下载 |
|------|------|------|------|
| `text-editor_1.0.0_x64.dmg` | Intel | ~15MB | [下载](https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor_1.0.0_x64.dmg) |
| `text-editor_1.0.0_aarch64.dmg` | Apple Silicon (M1/M2) | ~15MB | [下载](https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor_1.0.0_aarch64.dmg) |

**Homebrew:**
```bash
brew install --cask text-editor
```

### Linux

| 文件 | 格式 | 架构 | 大小 | 下载 |
|------|------|------|------|------|
| `text-editor_1.0.0_amd64.deb` | DEB | x86_64 | ~15MB | [下载](https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor_1.0.0_amd64.deb) |
| `text-editor-1.0.0.x86_64.rpm` | RPM | x86_64 | ~15MB | [下载](https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor-1.0.0.x86_64.rpm) |
| `text-editor-1.0.0.AppImage` | AppImage | x86_64 | ~20MB | [下载](https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor-1.0.0.AppImage) |

**包管理器:**
```bash
# Arch Linux (AUR)
yay -S text-editor

# Ubuntu/Debian
wget https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor_1.0.0_amd64.deb
sudo apt install ./text-editor_1.0.0_amd64.deb

# Fedora/RHEL
wget https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor-1.0.0.x86_64.rpm
sudo dnf install ./text-editor-1.0.0.x86_64.rpm
```

---

## 📋 快速安装指南

### Windows 用户
1. 下载 `.exe` 或 `.msi` 安装包
2. 双击运行安装程序
3. 按照安装向导完成安装
4. 从开始菜单启动应用

**详细步骤:** [Windows 安装指南](https://github.com/your-repo/text-editor/blob/main/INSTALL.md#windows-安装步骤)

### macOS 用户
1. 下载对应芯片版本的 `.dmg` 文件
   - Intel Mac: `x64.dmg`
   - M1/M2 Mac: `aarch64.dmg`
2. 双击打开 DMG 文件
3. 将应用拖拽到 Applications 文件夹
4. 从启动台启动应用

**详细步骤:** [macOS 安装指南](https://github.com/your-repo/text-editor/blob/main/INSTALL.md#macos-安装步骤)

### Linux 用户
```bash
# Ubuntu/Debian
wget https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor_1.0.0_amd64.deb
sudo apt install ./text-editor_1.0.0_amd64.deb

# Fedora/RHEL
wget https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor-1.0.0.x86_64.rpm
sudo dnf install ./text-editor-1.0.0.x86_64.rpm

# Arch Linux
yay -S text-editor

# 通用（AppImage）
wget https://github.com/your-repo/text-editor/releases/download/v1.0.0/text-editor-1.0.0.AppImage
chmod +x text-editor-1.0.0.AppImage
./text-editor-1.0.0.AppImage
```

**详细步骤:** [Linux 安装指南](https://github.com/your-repo/text-editor/blob/main/INSTALL.md#linux-安装步骤)

---

## ✨ 主要功能

### 📄 文件管理
- 新建、打开、保存、另存为
- 最近文件列表
- 文件编码自动检测（UTF-8、GBK 等）

### ✏️ 文本编辑
- 剪切、复制、粘贴、撤销/重做
- 多光标编辑
- 代码折叠
- 自动缩进

### 🔍 搜索替换
- 快速查找（Ctrl+F）
- 正则表达式支持
- 批量替换

### 🏷️ 多标签页
- 同时编辑多个文件
- 标签页切换和拖拽
- 未保存提醒

### 🎨 语法高亮
- 支持 50+ 编程语言
- 自动语言检测
- 主题适配

### 🌙 主题系统
- 浅色/深色主题
- 快速切换（Ctrl+Shift+L）
- 系统主题跟随

### 💾 自动保存
- 可配置保存间隔
- 崩溃恢复
- 会话恢复

---

## 📋 系统要求

### Windows
- Windows 10 版本 1903 或更高
- x64 或 x86 处理器
- 2GB 内存（推荐 4GB）
- 500MB 磁盘空间

### macOS
- macOS 11.0 (Big Sur) 或更高
- Intel 或 Apple Silicon
- 2GB 内存（推荐 4GB）
- 500MB 磁盘空间

### Linux
- Ubuntu 20.04+ / Fedora 34+ / Arch Linux 最新
- x86_64 处理器
- 2GB 内存（推荐 4GB）
- 500MB 磁盘空间
- 系统依赖：libwebkit2gtk, libgtk-3, libssl

---

## 🐛 已知问题

### 中等问题
- **#101** 大文件（>50MB）打开时可能卡顿
  - 临时方案：使用系统默认编辑器打开超大文件
  - 计划修复：v0.2.0

- **#102** 某些中文字体在 Linux 下显示异常
  - 临时方案：`sudo apt install fonts-wqy-microhei fonts-wqy-zenhei`
  - 计划修复：v0.2.0

### 轻微问题
- **#201** 主题切换后需要重启应用才能完全生效
  - 临时方案：切换主题后手动刷新（Ctrl+R）
  - 计划修复：v1.0.1

**完整列表:** [已知问题](https://github.com/your-repo/text-editor/blob/main/RELEASE_NOTES.md#已知问题)

---

## 📚 文档资源

| 文档 | 链接 |
|------|------|
| 📖 用户手册 | [USER_GUIDE.md](https://github.com/your-repo/text-editor/blob/main/USER_GUIDE.md) |
| 🛠️ 安装指南 | [INSTALL.md](https://github.com/your-repo/text-editor/blob/main/INSTALL.md) |
| 💻 开发者文档 | [DEVELOPER_GUIDE.md](https://github.com/your-repo/text-editor/blob/main/DEVELOPER_GUIDE.md) |
| 📋 快捷键速查 | [SHORTCUTS.md](https://github.com/your-repo/text-editor/blob/main/SHORTCUTS.md) |
| 📝 变更日志 | [CHANGELOG.md](https://github.com/your-repo/text-editor/blob/main/CHANGELOG.md) |
| 🏗️ 技术架构 | [architecture.md](https://github.com/your-repo/text-editor/blob/main/architecture.md) |
| 🎯 产品需求 | [requirements.md](https://github.com/your-repo/text-editor/blob/main/requirements.md) |
| 🤝 贡献指南 | [CONTRIBUTING.md](https://github.com/your-repo/text-editor/blob/main/CONTRIBUTING.md) |
| 📦 发布说明 | [RELEASE_NOTES.md](https://github.com/your-repo/text-editor/blob/main/RELEASE_NOTES.md) |

---

## 🔧 从源码编译

### 环境要求
- Node.js >= 18.x
- Rust >= 1.70
- pnpm >= 8.x

### 编译步骤
```bash
# 克隆仓库
git clone https://github.com/your-repo/text-editor.git
cd text-editor/frontend

# 安装依赖
pnpm install

# 生产构建
pnpm tauri build
```

**详细指南:** [开发者文档](https://github.com/your-repo/text-editor/blob/main/DEVELOPER_GUIDE.md)

---

## 🗺️ 后续计划

### v0.2.0 (计划中)
- [ ] Markdown 实时预览
- [ ] JSON/XML 格式化
- [ ] CSV 表格视图
- [ ] 文件树侧边栏
- [ ] 大文件性能优化

### v0.3.0 (规划中)
- [ ] 插件系统
- [ ] 自定义主题
- [ ] 快捷键自定义
- [ ] 多窗口支持
- [ ] 文件对比功能

---

## 🙏 致谢

感谢以下开源项目：

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - 代码编辑器组件
- [Naive UI](https://www.naiveui.com/) - Vue 3 组件库
- [TypeScript](https://www.typescriptlang.org/) - 类型化的 JavaScript

---

## 📞 反馈与支持

- 🐛 **提交 Bug**: [GitHub Issues](https://github.com/your-repo/text-editor/issues)
- 💡 **功能建议**: [GitHub Discussions](https://github.com/your-repo/text-editor/discussions)
- 📧 **邮件联系**: support@example.com
- 💬 **社区讨论**: [GitHub Discussions](https://github.com/your-repo/text-editor/discussions)

---

## 📄 许可证

MIT License - 详见 [LICENSE](https://github.com/your-repo/text-editor/blob/main/LICENSE) 文件

---

*感谢您选择跨平台文本编辑器！* 🦐

*发布日期：2026-03-11*
