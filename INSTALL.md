# 安装指南 (Installation Guide)

> 跨平台文本编辑器安装说明
>
> **官方渠道只有 [GitHub Releases](https://github.com/kokotao/tau-editor/releases)**：Windows（exe / msi）、macOS（dmg）、Linux（deb / rpm / AppImage）。
> Homebrew、Microsoft Store、Mac App Store、Scoop、Chocolatey、PPA、COPR、AUR、Flatpak、Snap 等渠道标记为「规划中」，命令尚未生效。

---

## 📖 目录

1. [Windows 安装步骤](#windows-安装步骤)
2. [macOS 安装步骤](#macos-安装步骤)
3. [Linux 安装步骤](#linux-安装步骤)
4. [从源码编译指南](#从源码编译指南)

---

## Windows 安装步骤

### 方法一：安装程序（推荐）

#### 1. 下载安装程序

从 [Releases](https://github.com/kokotao/tau-editor/releases) 下载最新版本的安装包：
- `Tau.Editor_0.4.2_x64-setup.exe`（NSIS 安装程序，64 位）
- `Tau.Editor_0.4.2_x64_zh-CN.msi`（MSI 安装包，64 位）

> 当前仅提供 x64 安装包，未提供 32 位（x86）版本。

#### 2. 运行安装程序

1. 双击下载的 `.exe` 文件
2. 点击「下一步」继续
3. 阅读并接受许可协议
4. 选择安装位置（默认：`C:\Program Files\text-editor`）
5. 选择是否创建桌面快捷方式
6. 点击「安装」
7. 等待安装完成
8. 点击「完成」启动应用

#### 3. 验证安装

- 在开始菜单中查找「文本编辑器」
- 或双击桌面快捷方式
- 应用应正常启动

### 方法二：Microsoft Store（规划中，暂未提供）

1. 打开 Microsoft Store
2. 搜索「文本编辑器」或「Text Editor」
3. 点击「获取」或「安装」
4. 等待下载和安装完成
5. 从开始菜单启动应用

### 方法三：Scoop 包管理器（规划中，暂未提供）

```powershell
# 安装 Scoop（如果尚未安装）
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# 添加仓库并安装
scoop bucket add extras
scoop install text-editor
```

### 方法四：Chocolatey 包管理器（规划中，暂未提供）

```powershell
# 安装 Chocolatey（如果尚未安装）
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 安装文本编辑器
choco install text-editor
```

### 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10 或更高版本 |
| 架构 | x64 或 x86 |
| 内存 | 最低 2GB，推荐 4GB |
| 磁盘空间 | 500MB 可用空间 |
| .NET | .NET Framework 4.7+（通常已预装） |

### 卸载

1. 打开「设置」→「应用」→「应用和功能」
2. 找到「文本编辑器」
3. 点击「卸载」
4. 按照提示完成卸载

---

## macOS 安装步骤

### 方法一：DMG 安装包（推荐）

#### 1. 下载 DMG 文件

从 [Releases](https://github.com/kokotao/tau-editor/releases) 下载：
- `Tau.Editor_0.4.2_aarch64.dmg`（Apple Silicon M 系列，当前唯一发布格式）

> 当前未提供 Intel（x64）DMG；Intel Mac 需参考 [从源码编译指南](#从源码编译指南) 自行构建。

#### 2. 安装应用

1. 双击下载的 `.dmg` 文件
2. 将「Tau Editor」图标拖拽到「Applications」文件夹
3. 等待复制完成
4. 弹出 DMG

#### 3. 首次运行

1. 打开「Applications」文件夹
2. 找到「Tau Editor」
3. 双击打开
4. 如果提示「无法验证开发者」，在「系统设置 → 隐私与安全性」中点击「仍要打开」
5. 如果提示「已损坏，无法打开」，按下方常见问题中的命令修复一次

#### 4. 添加到 Dock（可选）

1. 启动应用
2. 右键点击 Dock 中的图标
3. 选择「选项」→「在 Dock 中保留」

### 方法二：Homebrew（规划中，暂未提供）

```bash
# 安装 Homebrew（如果尚未安装）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 添加仓库并安装
brew tap kokotao/tau-editor
brew install --cask text-editor
```

### 方法三：Mac App Store（规划中，暂未提供）

1. 打开 Mac App Store
2. 搜索「文本编辑器」
3. 点击「获取」
4. 使用 Apple ID 下载
5. 从启动台或 Applications 启动

### 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | macOS 11.0 (Big Sur) 或更高 |
| 架构 | Intel 或 Apple Silicon |
| 内存 | 最低 2GB，推荐 4GB |
| 磁盘空间 | 500MB 可用空间 |

### 常见问题

#### Q: 首次打开提示「无法验证开发者」或「已损坏，无法打开」

**当前状态：** 构建流程会在打包前对 `.app` 执行 ad-hoc 签名
（`frontend/src-tauri/tauri.conf.json` → `bundle.macOS.signingIdentity = "-"`）。
签名覆盖 `Info.plist` 与 `Contents/Resources`，`codesign --verify` 可以完整通过，
不会再因为只有链接器签名而报「已损坏」。

**正常打开流程（无需终端）：**
1. 双击 App，出现「无法验证开发者」提示时点击「完成」
2. 打开「系统设置 → 隐私与安全性」，在安全性区域点击「仍要打开」
3. 再次双击 App，确认「打开」

macOS 12 及更早版本也可以直接右键点击 App，选择「打开」。

这是 ad-hoc 签名的预期行为：macOS 仍要求用户手动白名单一次，但不再需要终端命令，
也不会再出现无解的「已损坏」提示。

**旧安装包仍提示「已损坏」时（`v0.4.1` 及更早）：** 把 App 拖到「应用程序」后执行一次：

```bash
# 1. 清除下载隔离属性
xattr -cr "/Applications/Tau Editor.app"

# 2. 补上完整的 ad-hoc 签名（生成 Contents/_CodeSignature）
codesign --force --sign - "/Applications/Tau Editor.app"
```

**验证签名：**

```bash
codesign --verify --deep --strict --verbose=2 "/Applications/Tau Editor.app"
# 输出 valid on disk / satisfies its Designated Requirement 即正常
```

**根治方案（用户零提示）：** 使用 Apple Developer ID 证书签名并公证（notarization）。
CI 已支持以下 GitHub Actions Secrets，配置后 `Desktop Build` 工作流会自动签名、公证并 staple，
并在构建后校验 `spctl` 与 `stapler`；未配置时回退到 ad-hoc 签名。

| Secret | 说明 |
|---|---|
| `APPLE_CERTIFICATE` | Developer ID Application 证书 `.p12` 的 base64（单行） |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` 导出密码 |
| `APPLE_SIGNING_IDENTITY` | `security find-identity -v -p codesigning` 输出的完整身份名 |
| `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | 公证账号：Apple ID、App 专用密码、Team ID |

#### Q: Apple Silicon 运行缓慢

**解决方案：**
确保下载了 ARM64 (aarch64) 版本，而非 Intel 版本。

### 卸载

```bash
# 手动卸载
rm -rf "/Applications/Tau Editor.app"

# 或使用 Homebrew
brew uninstall --cask text-editor
```

---

## Linux 安装步骤

### Ubuntu/Debian

#### 方法一：DEB 包（推荐）

```bash
# 1. 下载 DEB 包
wget https://github.com/kokotao/tau-editor/releases/download/v0.4.2/Tau.Editor_0.4.2_amd64.deb

# 2. 安装
sudo apt install ./Tau.Editor_0.4.2_amd64.deb

# 3. 启动
text-editor
```

#### 方法二：PPA（规划中，暂未提供）

```bash
# 添加 PPA
sudo add-apt-repository ppa:kokotao/tau-editor
sudo apt update

# 安装
sudo apt install text-editor

# 更新
sudo apt update && sudo apt upgrade text-editor
```

### Fedora/RHEL

#### 方法一：RPM 包

```bash
# 下载 RPM 包
wget https://github.com/kokotao/tau-editor/releases/download/v0.4.2/Tau.Editor-0.4.2-1.x86_64.rpm

# 安装
sudo dnf install ./Tau.Editor-0.4.2-1.x86_64.rpm

# 启动
text-editor
```

#### 方法二：COPR 仓库（规划中，暂未提供）

```bash
# 启用 COPR 仓库
sudo dnf copr enable kokotao/tau-editor

# 安装
sudo dnf install text-editor
```

### Arch Linux

#### 方法一：AUR（规划中，暂未提供）

```bash
# 使用 yay
yay -S text-editor

# 或使用 paru
paru -S text-editor

# 启动
text-editor
```

#### 方法二：手动构建 AUR

```bash
# 克隆 AUR 仓库
git clone https://aur.archlinux.org/text-editor.git
cd text-editor

# 构建并安装
makepkg -si
```

### openSUSE

```bash
# 下载 RPM 包
wget https://github.com/kokotao/tau-editor/releases/download/v0.4.2/Tau.Editor-0.4.2-1.x86_64.rpm

# 安装
sudo zypper install ./Tau.Editor-0.4.2-1.x86_64.rpm
```

### AppImage（通用）

```bash
# 1. 下载 AppImage
wget https://github.com/kokotao/tau-editor/releases/download/v0.4.2/Tau.Editor_0.4.2_amd64.AppImage

# 2. 添加执行权限
chmod +x Tau.Editor_0.4.2_amd64.AppImage

# 3. 运行
./Tau.Editor_0.4.2_amd64.AppImage

# 4. （可选）集成到系统
./Tau.Editor_0.4.2_amd64.AppImage --appimage-install
```

### Flatpak（规划中，暂未提供）

```bash
# 1. 安装 Flatpak（如果尚未安装）
sudo apt install flatpak  # Debian/Ubuntu
sudo dnf install flatpak  # Fedora

# 2. 添加 Flathub 仓库
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/appstream

# 3. 安装应用
flatpak install flathub com.example.text-editor

# 4. 运行
flatpak run com.example.text-editor
```

### Snap（规划中，暂未提供）

```bash
# 安装 Snap（如果尚未安装）
sudo apt install snapd  # Debian/Ubuntu

# 安装应用
sudo snap install text-editor

# 运行
text-editor
```

### 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Ubuntu 20.04+ / Fedora 34+ / Arch 最新 |
| 架构 | x86_64 (amd64) |
| 内存 | 最低 2GB，推荐 4GB |
| 磁盘空间 | 500MB 可用空间 |
| 依赖 | libwebkit2gtk, libgtk-3, libssl |

### 依赖安装

#### Ubuntu/Debian

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.0-dev build-essential libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

#### Fedora

```bash
sudo dnf install -y webkit2gtk3-devel openssl-devel \
  gtk3-devel libappindicator-gtk3-devel librsvg2-devel
```

#### Arch

```bash
sudo pacman -S webkit2gtk openssl gtk3 libappindicator-gtk3 librsvg
```

### 卸载

```bash
# DEB/Ubuntu
sudo apt remove text-editor
sudo apt autoremove

# RPM/Fedora
sudo dnf remove text-editor

# Arch
yay -R text-editor

# AppImage
rm ~/Applications/text-editor.AppImage

# Flatpak
flatpak uninstall com.example.text-editor

# Snap
sudo snap remove text-editor
```

---

## 从源码编译指南

### 前置要求

| 组件 | 版本 | 安装方式 |
|------|------|---------|
| Node.js | 18.x+ | [nvm](https://github.com/nvm-sh/nvm) |
| Rust | 1.70+ | [rustup](https://rustup.rs) |
| pnpm | 8.x+ | `npm i -g pnpm` |
| Git | 最新 | 系统包管理器 |

### 克隆仓库

```bash
git clone https://github.com/kokotao/tau-editor.git
cd text-editor
```

### 安装依赖

```bash
# 进入 frontend 目录
cd frontend

# 安装 Node.js 依赖
pnpm install

# 验证 Tauri 环境
pnpm tauri info
```

### 开发模式

```bash
# 启动开发服务器
pnpm tauri dev

# 带详细日志
pnpm tauri dev -- --verbose
```

### 生产构建

```bash
# 构建发布版本
pnpm tauri build

# 构建产物位置
# Windows: frontend/src-tauri/target/release/bundle/msi/
# macOS: frontend/src-tauri/target/release/bundle/dmg/
# Linux: frontend/src-tauri/target/release/bundle/appimage/
```

### 交叉编译

#### 为 Windows 编译（在 Linux/macOS 上）

```bash
# 安装 Windows 目标
rustup target add x86_64-pc-windows-msvc

# 安装 mingw（Linux）
sudo apt install mingw-w64

# 构建
pnpm tauri build --target x86_64-pc-windows-msvc
```

#### 为 macOS 编译（在 Linux 上）

```bash
# 安装 macOS 目标
rustup target add x86_64-apple-darwin
rustup target add aarch64-apple-darwin

# 构建（需要 macOS SDK）
pnpm tauri build --target x86_64-apple-darwin
```

#### 为 Linux 编译（在任何平台上）

```bash
# 安装 Linux 目标
rustup target add x86_64-unknown-linux-gnu

# 构建
pnpm tauri build --target x86_64-unknown-linux-gnu
```

### 自定义构建

```bash
# 构建时禁用调试符号
pnpm tauri build --release

# 构建特定架构
pnpm tauri build --target aarch64-apple-darwin

# 构建时指定配置
pnpm tauri build --config tauri.conf.prod.json
```

### 构建优化

#### 减小二进制大小

```rust
// 在 Cargo.toml 中添加
[profile.release]
lto = true
codegen-units = 1
strip = true
```

#### 优化编译速度

```bash
# 使用 sccache 缓存编译
cargo install sccache
export RUSTC_WRAPPER=sccache

# 使用 mold 链接器（Linux）
sudo apt install mold
export RUSTFLAGS="-C link-arg=-fuse-ld=mold"
```

### 故障排查

#### 常见问题

**Q: Rust 编译错误**
```bash
# 更新 Rust
rustup update

# 清理构建缓存
cargo clean
pnpm tauri build
```

**Q: Node.js 依赖问题**
```bash
# 清理并重新安装
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

**Q: 缺少系统依赖（Linux）**
```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.0-dev build-essential libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Fedora
sudo dnf install webkit2gtk3-devel openssl-devel \
  gtk3-devel libappindicator-gtk3-devel librsvg2-devel
```

**Q: macOS 签名问题**
```bash
# 开发模式下可禁用签名
# 在 tauri.conf.json 中设置
{
  "tauri": {
    "bundle": {
      "macOS": {
        "signingIdentity": "-"
      }
    }
  }
}
```

### 构建产物验证

```bash
# 检查构建产物
ls -lh frontend/src-tauri/target/release/bundle/

# 验证签名（macOS）
codesign --verify --deep --strict "/Applications/Tau Editor.app"

# 测试运行
./frontend/src-tauri/target/release/text-editor
```

---

## 📦 v1.0.0 最终构建说明

### 构建前准备

#### 系统依赖安装

**Ubuntu/Debian**
```bash
sudo apt-get update
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev \
  libappindicator3-dev librsvg2-dev patchelf build-essential \
  libssl-dev pkg-config
```

**Fedora**
```bash
sudo dnf install -y gtk3-devel webkit2gtk4.1-devel \
  libappindicator-gtk3-devel librsvg2-devel patchelf \
  openssl-devel pkg-config
```

**Arch Linux**
```bash
sudo pacman -S webkit2gtk appindicator-gtk3 librsvg \
  pkgconf openssl
```

**macOS**
```bash
# 安装 Xcode Command Line Tools
xcode-select --install

# 安装 Rust（如果尚未安装）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Windows**
- 安装 [Visual Studio Build Tools 2019+](https://visualstudio.microsoft.com/downloads/)
- 安装 "使用 C++ 的桌面开发" 工作负载
- 安装 [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

### 构建步骤

```bash
# 1. 克隆仓库
git clone https://github.com/kokotao/tau-editor.git
cd text-editor

# 2. 进入 frontend 目录
cd frontend

# 3. 安装依赖
pnpm install

# 4. 验证 Tauri 环境
pnpm tauri info

# 5. 生产构建
pnpm tauri build
```

### 构建产物

构建完成后，产物位于 `frontend/src-tauri/target/release/bundle/`：

**Windows**
- `msi/Tau Editor_0.4.2_x64_en-US.msi` - MSI 安装包
- `nsis/Tau Editor_0.4.2_x64-setup.exe` - NSIS 安装程序

**macOS**
- `dmg/Tau Editor_0.4.2_aarch64.dmg` - Apple Silicon（当前发布格式）
- `macos/Tau Editor.app` - 应用包

**Linux**
- `deb/Tau Editor_0.4.2_amd64.deb` - DEB 包
- `rpm/Tau Editor-0.4.2-1.x86_64.rpm` - RPM 包
- `appimage/Tau Editor_0.4.2_amd64.AppImage` - AppImage

> CI 上传到 Release 时会将文件名规范化为 `Tau.Editor_0.4.2_*.dmg` 这类形式，与本地构建名字略有差异。

### 构建验证

```bash
# 检查构建产物
ls -lh frontend/src-tauri/target/release/bundle/

# 验证签名（macOS）
codesign -verify /Applications/text-editor.app

# 测试运行（Linux）
./frontend/src-tauri/target/release/text-editor

# 检查版本
text-editor --version
```

### 构建优化

#### 减小二进制大小

在 `frontend/src-tauri/Cargo.toml` 中添加：

```toml
[profile.release]
lto = true
codegen-units = 1
strip = true
```

#### 优化编译速度

```bash
# 使用 sccache 缓存编译
cargo install sccache
export RUSTC_WRAPPER=sccache

# 使用 mold 链接器（Linux）
sudo apt install mold
export RUSTFLAGS="-C link-arg=-fuse-ld=mold"
```

---

## 🌐 Web 版本部署说明

### 构建 Web 版本

如果只需要 Web 版本（无需 Tauri 后端）：

```bash
cd frontend

# 安装依赖
pnpm install

# 构建生产版本
pnpm build
```

构建产物位于 `frontend/dist/`，约 15MB。

### 部署到静态服务器

#### Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 启用 Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # 缓存静态资源
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### Apache

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    DocumentRoot /path/to/frontend/dist

    <Directory /path/to/frontend/dist>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted

        # 启用重写规则
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
</VirtualHost>
```

#### Docker 部署

```dockerfile
# Dockerfile
FROM nginx:alpine

# 复制构建产物
COPY frontend/dist /usr/share/nginx/html

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

构建和运行：

```bash
docker build -t text-editor .
docker run -d -p 80:80 text-editor
```

#### Vercel 部署

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
cd frontend
vercel --prod
```

#### Netlify 部署

```bash
# 安装 Netlify CLI
npm i -g netlify-cli

# 部署
cd frontend
netlify deploy --prod --dir=dist
```

### Web 版本限制

⚠️ **注意**: Web 版本相比桌面版本有以下限制：

- ❌ 无法访问本地文件系统（需要用户手动选择文件）
- ❌ 无法使用系统对话框
- ❌ 无法使用系统托盘
- ❌ 自动保存功能受限
- ❌ 文件关联不可用
- ✅ 所有编辑功能正常
- ✅ 语法高亮正常
- ✅ 主题切换正常

### PWA 支持

Web 版本支持渐进式 Web 应用（PWA），可以安装到桌面：

1. 访问部署的 Web 版本
2. 点击浏览器地址栏的安装图标
3. 或手动添加为桌面应用

---

## 📞 获取帮助

如果安装过程中遇到问题：

1. **查看日志**: 检查安装日志和错误信息
2. **GitHub Issues**: [提交问题](https://github.com/kokotao/tau-editor/issues)
3. **开发者文档**: [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)
4. **社区讨论**: GitHub Discussions
5. **发布说明**: [docs/status/RELEASE_NOTES.md](docs/status/RELEASE_NOTES.md) - 查看已知问题

---

*最后更新：2026-03-11*
