#!/bin/bash
# text-editor E2E 测试快速运行脚本
# 用途：快速验证 E2E 测试是否通过
# 使用：./scripts/run-e2e-quick.sh

set -e

echo "🧪 开始运行 E2E 测试快速验证..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Playwright 是否安装
echo "📦 检查 Playwright..."
if ! command -v npx &> /dev/null; then
    echo -e "${RED}✗ npx 未找到${NC}"
    exit 1
fi

# 检查测试文件
echo "📄 检查测试文件..."
TEST_COUNT=$(find tests -name "*.spec.ts" | wc -l)
echo "   找到 $TEST_COUNT 个测试文件"

if [ $TEST_COUNT -eq 0 ]; then
    echo -e "${RED}✗ 未找到测试文件${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 测试文件存在${NC}"
echo ""

# 运行 E2E 测试
echo "🚀 运行 E2E 测试..."
echo "   这可能需要 10-15 分钟..."
echo ""

# 设置超时为 15 分钟
export PLAYWRIGHT_TEST_TIMEOUT=900000

if pnpm test:e2e; then
    echo ""
    echo -e "${GREEN}✓ E2E 测试通过!${NC}"
    echo ""
    echo "测试报告位置：playwright-report/index.html"
    echo ""
    echo "下一步:"
    echo "1. 查看测试报告：pnpm exec playwright show-report"
    echo "2. 生成构建分析：pnpm build:analyze"
    exit 0
else
    echo ""
    echo -e "${RED}✗ E2E 测试失败${NC}"
    echo ""
    echo "请检查测试输出以了解失败原因"
    echo "测试报告位置：playwright-report/index.html"
    exit 1
fi
