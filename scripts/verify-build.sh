#!/bin/bash
# text-editor 构建验证脚本
# 用途：GTK3 依赖安装后，验证 Tauri 构建是否成功
# 使用：./scripts/verify-build.sh

set -e

echo "🔍 开始验证 text-editor 构建..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查点计数
CHECKS_PASSED=0
CHECKS_FAILED=0

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((CHECKS_PASSED++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((CHECKS_FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# 1. 检查 GTK3 依赖
echo "📦 检查 GTK3 依赖..."
if pkg-config --exists gdk-3.0 gtk+-3.0 2>/dev/null; then
    check_pass "GTK3 依赖已安装"
    pkg-config --modversion gdk-3.0
    pkg-config --modversion gtk+-3.0
else
    check_fail "GTK3 依赖未安装"
    echo "   请执行：sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf"
    exit 1
fi
echo ""

# 2. 检查 Cargo
echo "🦀 检查 Rust/Cargo..."
if command -v cargo &> /dev/null; then
    check_pass "Cargo 已安装: $(cargo --version)"
else
    check_fail "Cargo 未安装"
    exit 1
fi
echo ""

# 3. 检查 pnpm
echo "📦 检查 pnpm..."
if command -v pnpm &> /dev/null; then
    check_pass "pnpm 已安装: $(pnpm --version)"
else
    check_fail "pnpm 未安装"
    exit 1
fi
echo ""

# 4. 检查前端构建
echo "🎨 检查前端构建..."
if [ -d "frontend/dist" ] && [ -f "frontend/dist/index.html" ]; then
    check_pass "前端构建产物存在"
    FRONTEND_SIZE=$(du -sh frontend/dist | cut -f1)
    echo "   前端构建大小：$FRONTEND_SIZE"
else
    check_warn "前端构建产物不存在，将重新构建"
fi
echo ""

# 5. 检查 Tauri 配置
echo "🔧 检查 Tauri 配置..."
if [ -f "frontend/src-tauri/tauri.conf.json" ]; then
    check_pass "Tauri 配置文件存在"
else
    check_fail "Tauri 配置文件缺失"
    exit 1
fi
echo ""

# 6. 运行 Tauri 构建
echo "🔨 开始 Tauri 构建..."
echo "   这可能需要 10-15 分钟..."
echo ""

export PATH="$HOME/.cargo/bin:$PATH"

if pnpm tauri build; then
    check_pass "Tauri 构建成功"
else
    check_fail "Tauri 构建失败"
    exit 1
fi
echo ""

# 7. 验证构建产物
echo "📦 验证构建产物..."
if [ -d "frontend/src-tauri/target/release/bundle" ]; then
    check_pass "构建产物目录存在"
    
    # 检查 .deb 包
    if ls frontend/src-tauri/target/release/bundle/deb/*.deb 1> /dev/null 2>&1; then
        check_pass "DEB 包已生成"
        ls -lh frontend/src-tauri/target/release/bundle/deb/*.deb
    else
        check_warn "DEB 包未生成"
    fi
    
    # 检查 AppImage
    if ls frontend/src-tauri/target/release/bundle/appimage/*.AppImage 1> /dev/null 2>&1; then
        check_pass "AppImage 已生成"
        ls -lh frontend/src-tauri/target/release/bundle/appimage/*.AppImage
    else
        check_warn "AppImage 未生成"
    fi
    
    # 检查可执行文件
    if [ -f "frontend/src-tauri/target/release/text-editor" ]; then
        check_pass "可执行文件已生成"
        ls -lh frontend/src-tauri/target/release/text-editor
    else
        check_warn "可执行文件未找到"
    fi
else
    check_fail "构建产物目录不存在"
fi
echo ""

# 总结
echo "================================"
echo "验证完成!"
echo -e "通过：${GREEN}$CHECKS_PASSED${NC}"
echo -e "失败：${RED}$CHECKS_FAILED${NC}"
echo "================================"

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 所有检查通过！${NC}"
    echo ""
    echo "下一步:"
    echo "1. 运行 E2E 测试：./scripts/run-e2e-quick.sh"
    echo "2. 生成构建分析：pnpm build:analyze"
    echo "3. 准备 GitHub Release"
    exit 0
else
    echo -e "${RED}✗ 部分检查失败，请检查上方错误信息${NC}"
    exit 1
fi
