#!/bin/bash

# E2E 测试运行脚本
# 用法：./run-e2e-tests.sh [选项]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Text Editor E2E 测试运行器${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查依赖
check_dependencies() {
    echo -e "${YELLOW}检查依赖...${NC}"
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}错误：Node.js 未安装${NC}"
        exit 1
    fi
    
    if ! command -v pnpm &> /dev/null; then
        echo -e "${RED}错误：pnpm 未安装${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ 依赖检查通过${NC}"
    echo ""
}

# 安装依赖
install_dependencies() {
    echo -e "${YELLOW}安装依赖...${NC}"
    
    if [ ! -d "node_modules" ]; then
        pnpm install
        echo -e "${GREEN}✓ 根目录依赖安装完成${NC}"
    fi
    
    if [ ! -d "frontend/node_modules" ]; then
        cd frontend && pnpm install && cd ..
        echo -e "${GREEN}✓ Frontend 依赖安装完成${NC}"
    fi
    
    echo ""
}

# 安装 Playwright 浏览器
install_playwright() {
    echo -e "${YELLOW}安装 Playwright 浏览器...${NC}"
    npx playwright install chromium
    echo -e "${GREEN}✓ Playwright 浏览器安装完成${NC}"
    echo ""
}

# 运行测试
run_tests() {
    local project=${1:-chromium}
    local reporter=${2:-list}
    
    echo -e "${YELLOW}运行 E2E 测试 (项目：$project, 报告：$reporter)...${NC}"
    echo ""
    
    # 运行测试
    if pnpm test:e2e -- --project="$project" --reporter="$reporter"; then
        echo ""
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}  ✓ 所有测试通过!${NC}"
        echo -e "${GREEN}========================================${NC}"
    else
        echo ""
        echo -e "${RED}========================================${NC}"
        echo -e "${RED}  ✗ 部分测试失败${NC}"
        echo -e "${RED}========================================${NC}"
        echo -e "${YELLOW}查看测试报告：pnpm test:e2e:report${NC}"
        exit 1
    fi
}

# 显示帮助
show_help() {
    echo "用法：$0 [选项]"
    echo ""
    echo "选项:"
    echo "  --all           运行所有测试（默认）"
    echo "  --chromium      只在 Chromium 上运行"
    echo "  --firefox       只在 Firefox 上运行"
    echo "  --webkit        只在 WebKit 上运行"
    echo "  --headed        有头模式（显示浏览器）"
    echo "  --debug         调试模式"
    echo "  --report        生成并显示 HTML 报告"
    echo "  --install       安装依赖和浏览器"
    echo "  --help          显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 --all                    # 运行所有测试"
    echo "  $0 --chromium               # 只在 Chromium 上运行"
    echo "  $0 --headed --chromium      # 有头模式运行"
    echo "  $0 --report                 # 显示测试报告"
    echo ""
}

# 主程序
main() {
    local mode="all"
    local project="chromium"
    local reporter="list"
    local headed=""
    local debug=""
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --all)
                mode="all"
                shift
                ;;
            --chromium)
                project="chromium"
                shift
                ;;
            --firefox)
                project="firefox"
                shift
                ;;
            --webkit)
                project="webkit"
                shift
                ;;
            --headed)
                headed="--headed"
                shift
                ;;
            --debug)
                debug="--debug"
                shift
                ;;
            --report)
                mode="report"
                shift
                ;;
            --install)
                mode="install"
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                echo -e "${RED}未知选项：$1${NC}"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 执行对应操作
    case $mode in
        install)
            check_dependencies
            install_dependencies
            install_playwright
            ;;
        report)
            echo -e "${YELLOW}生成 HTML 报告...${NC}"
            pnpm test:e2e -- --reporter=html
            echo -e "${GREEN}报告生成完成，打开浏览器查看：pnpm test:e2e:report${NC}"
            ;;
        *)
            check_dependencies
            install_dependencies
            
            if [ -z "$headed" ] && [ -z "$debug" ]; then
                # 无头模式，先检查是否需要安装浏览器
                if [ ! -d "$HOME/.cache/ms-playwright" ]; then
                    install_playwright
                fi
            fi
            
            run_tests "$project" "$reporter"
            ;;
    esac
}

# 如果没有参数，显示帮助
if [ $# -eq 0 ]; then
    main --all
else
    main "$@"
fi
