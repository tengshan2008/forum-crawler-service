#!/bin/bash

# 集成测试脚本 - 验证图片下载功能

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  论坛爬虫服务 - 图片下载功能集成测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试计数
TESTS_PASSED=0
TESTS_FAILED=0

# 测试函数
test_case() {
  local name="$1"
  local command="$2"
  local expected="$3"
  
  echo -e "\n${BLUE}[测试]${NC} $name"
  echo "  命令: $command"
  
  if eval "$command" > /tmp/test_output.txt 2>&1; then
    if [ -z "$expected" ] || grep -q "$expected" /tmp/test_output.txt; then
      echo -e "  ${GREEN}✓ 通过${NC}"
      TESTS_PASSED=$((TESTS_PASSED + 1))
      return 0
    fi
  fi
  
  echo -e "  ${RED}✗ 失败${NC}"
  cat /tmp/test_output.txt
  TESTS_FAILED=$((TESTS_FAILED + 1))
  return 1
}

# ============================================
# 测试 1: 目录结构检查
# ============================================
echo -e "\n${YELLOW}📁 测试 1: 目录结构检查${NC}"

test_case "public 目录存在" \
  "[ -d '/workspaces/forum-crawler-service/public' ]" ""

test_case "public/images 目录存在" \
  "[ -d '/workspaces/forum-crawler-service/public/images' ]" ""

test_case "public/images/uploads 目录存在" \
  "[ -d '/workspaces/forum-crawler-service/public/images/uploads' ]" ""

# ============================================
# 测试 2: 代码文件检查
# ============================================
echo -e "\n${YELLOW}📝 测试 2: 代码文件检查${NC}"

test_case "imageDownloader.js 存在" \
  "[ -f '/workspaces/forum-crawler-service/backend/src/services/imageDownloader.js' ]" ""

test_case "image_downloader.py 存在" \
  "[ -f '/workspaces/forum-crawler-service/crawler/image_downloader.py' ]" ""

test_case "crawl.py 导入 image_downloader" \
  "grep -q 'from image_downloader import' '/workspaces/forum-crawler-service/crawler/crawl.py'" ""

# ============================================
# 测试 3: 代码语法检查
# ============================================
echo -e "\n${YELLOW}🔍 测试 3: 代码语法检查${NC}"

test_case "Python image_downloader.py 语法正确" \
  "python3 -m py_compile '/workspaces/forum-crawler-service/crawler/image_downloader.py'" ""

test_case "Python crawl.py 语法正确" \
  "python3 -m py_compile '/workspaces/forum-crawler-service/crawler/crawl.py'" ""

test_case "JavaScript imageDownloader.js 语法正确" \
  "node --check '/workspaces/forum-crawler-service/backend/src/services/imageDownloader.js'" ""

test_case "JavaScript index.js 语法正确" \
  "node --check '/workspaces/forum-crawler-service/backend/src/index.js'" ""

test_case "JavaScript PostPreview.js 语法正确" \
  "node --check '/workspaces/forum-crawler-service/frontend/src/pages/PostPreview.js'" ""

# ============================================
# 测试 4: Docker 配置检查
# ============================================
echo -e "\n${YELLOW}🐳 测试 4: Docker 配置检查${NC}"

test_case "Docker Compose 文件有效" \
  "docker-compose -f '/workspaces/forum-crawler-service/docker/docker-compose.yml' config > /dev/null" ""

test_case "Docker Compose 包含 public_images 卷" \
  "grep -q 'public_images:' '/workspaces/forum-crawler-service/docker/docker-compose.yml'" ""

test_case "backend 服务挂载 public_images 卷" \
  "grep -A 20 'backend:' '/workspaces/forum-crawler-service/docker/docker-compose.yml' | grep -q 'public_images:/app/public/images'" ""

# ============================================
# 测试 5: 关键功能检查
# ============================================
echo -e "\n${YELLOW}⚙️  测试 5: 关键功能检查${NC}"

test_case "initializeImageDirs 函数存在（Python）" \
  "grep -q 'def initialize_image_dirs' '/workspaces/forum-crawler-service/crawler/image_downloader.py'" ""

test_case "download_images 函数存在（Python）" \
  "grep -q 'def download_images' '/workspaces/forum-crawler-service/crawler/image_downloader.py'" ""

test_case "initializeImageDirs 函数存在（Node.js）" \
  "grep -q 'function initializeImageDirs' '/workspaces/forum-crawler-service/backend/src/services/imageDownloader.js'" ""

test_case "downloadImages 函数存在（Node.js）" \
  "grep -q 'async function downloadImages' '/workspaces/forum-crawler-service/backend/src/services/imageDownloader.js'" ""

test_case "Express 静态中间件已添加" \
  "grep -q \"express.static.*public\" '/workspaces/forum-crawler-service/backend/src/index.js'" ""

test_case "前端 getImageUrl 函数已添加" \
  "grep -q 'getImageUrl.*media' '/workspaces/forum-crawler-service/frontend/src/pages/PostPreview.js'" ""

test_case "爬虫调用 initialize_image_dirs" \
  "grep -q 'initialize_image_dirs()' '/workspaces/forum-crawler-service/crawler/crawl.py'" ""

test_case "爬虫调用 download_images" \
  "grep -q 'download_images.*image_urls' '/workspaces/forum-crawler-service/crawler/crawl.py'" ""

# ============================================
# 测试 6: 内容完整性检查
# ============================================
echo -e "\n${YELLOW}📋 测试 6: 内容完整性检查${NC}"

test_case "Python 使用 local_path 键" \
  "grep -q \"'local_path'\" '/workspaces/forum-crawler-service/crawler/image_downloader.py'" ""

test_case "爬虫使用 local_path 键" \
  "grep -q \"result\\['local_path'\\]\" '/workspaces/forum-crawler-service/crawler/crawl.py'" ""

test_case "前端检查本地路径前缀" \
  "grep -q '/public' '/workspaces/forum-crawler-service/frontend/src/pages/PostPreview.js'" ""

# ============================================
# 输出测试总结
# ============================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  测试总结${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "  ${GREEN}✓ 通过${NC}: $TESTS_PASSED"
echo -e "  ${RED}✗ 失败${NC}: $TESTS_FAILED"
echo -e "  总计: $((TESTS_PASSED + TESTS_FAILED))"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "\n${GREEN}所有测试通过！可以开始部署。${NC}\n"
  exit 0
else
  echo -e "\n${RED}有 $TESTS_FAILED 个测试失败。请修复后重试。${NC}\n"
  exit 1
fi
