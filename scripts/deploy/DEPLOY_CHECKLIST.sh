#!/bin/bash

# 部署前检查清单
# 运行此脚本确保所有组件就绪

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   论坛爬虫服务 - 图片下载功能 部署前检查                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"

CHECKS_PASSED=0
CHECKS_FAILED=0
WARNINGS=0

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

check() {
  local name="$1"
  local condition="$2"
  
  echo -n "  $name ... "
  if eval "$condition" 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
  else
    echo -e "${RED}✗${NC}"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
  fi
}

warn() {
  local name="$1"
  local message="$2"
  
  echo -e "  ${YELLOW}⚠${NC} $name: $message"
  WARNINGS=$((WARNINGS + 1))
}

# ════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}1. 文件完整性检查${NC}"
# ════════════════════════════════════════════════════════════════

check "imageDownloader.js 存在" "[ -f backend/src/services/imageDownloader.js ]"
check "image_downloader.py 存在" "[ -f crawler/image_downloader.py ]"
check "public 目录存在" "[ -d public ]"
check "public/images 目录存在" "[ -d public/images ]"
check "public/images/uploads 目录存在" "[ -d public/images/uploads ]"

# ════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}2. 代码检查${NC}"
# ════════════════════════════════════════════════════════════════

check "crawl.py 导入 image_downloader" \
  "grep -q 'from image_downloader import' crawler/crawl.py"

check "crawl.py 调用 initialize_image_dirs" \
  "grep -q 'initialize_image_dirs()' crawler/crawl.py"

check "crawl.py 调用 download_images" \
  "grep -q 'download_images.*image_urls' crawler/crawl.py"

check "index.js 配置静态中间件" \
  "grep -q \"express.static.*public\" backend/src/index.js"

check "PostPreview.js 有 getImageUrl 函数" \
  "grep -q 'getImageUrl' frontend/src/pages/PostPreview.js"

# ════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}3. Docker 配置检查${NC}"
# ════════════════════════════════════════════════════════════════

check "docker-compose.yml 包含 public_images 卷" \
  "grep -q 'public_images:' docker/docker-compose.yml"

check "backend 服务挂载卷" \
  "grep -A 20 'backend:' docker/docker-compose.yml | grep -q 'public_images:/app/public/images'"

check "Dockerfile.backend 复制 public 目录" \
  "grep -q 'COPY public' docker/Dockerfile.backend"

check "Dockerfile.backend 创建上传目录" \
  "grep -q 'mkdir.*public/images' docker/Dockerfile.backend"

# ════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}4. 依赖检查${NC}"
# ════════════════════════════════════════════════════════════════

check "Node.js 已安装" "command -v node > /dev/null"
check "Python3 已安装" "command -v python3 > /dev/null"
check "Docker 已安装" "command -v docker > /dev/null"
check "Docker Compose 已安装" "command -v docker-compose > /dev/null"

# ════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}5. 环境检查${NC}"
# ════════════════════════════════════════════════════════════════

if [ -d docker ] && [ -f docker/docker-compose.yml ]; then
  echo -n "  检查 Docker Compose 配置 ... "
  if docker-compose -f docker/docker-compose.yml config > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
  else
    echo -e "${RED}✗${NC}"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
  fi
fi

# ════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}6. 权限检查${NC}"
# ════════════════════════════════════════════════════════════════

check "public/images/uploads 可写" "[ -w public/images/uploads ]"

if [ -f TEST_INTEGRATION.sh ]; then
  check "测试脚本可执行" "[ -x TEST_INTEGRATION.sh ]"
fi

# ════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}7. 文档检查${NC}"
# ════════════════════════════════════════════════════════════════

check "IMPLEMENTATION_SUMMARY.md 存在" "[ -f IMPLEMENTATION_SUMMARY.md ]"
check "TEST_IMAGE_DOWNLOAD.md 存在" "[ -f TEST_IMAGE_DOWNLOAD.md ]"
check "QUICK_REFERENCE.md 存在" "[ -f QUICK_REFERENCE.md ]"

# ════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}8. 警告检查${NC}"
# ════════════════════════════════════════════════════════════════

# 检查磁盘空间
DISK_USAGE=$(df public/images/uploads 2>/dev/null | tail -1 | awk '{print $5}' | sed 's/%//')
if [ ! -z "$DISK_USAGE" ] && [ "$DISK_USAGE" -gt 80 ]; then
  warn "磁盘空间紧张" "使用率: ${DISK_USAGE}%（建议 < 80%）"
fi

# 检查 public/images 大小
if [ -d public/images ]; then
  SIZE=$(du -s public/images 2>/dev/null | cut -f1)
  if [ ! -z "$SIZE" ] && [ "$SIZE" -gt 1048576 ]; then
    SIZE_GB=$(echo "scale=2; $SIZE / 1048576" | bc)
    warn "图片目录较大" "当前大小: ${SIZE_GB}GB（预览模式可能会加载缓慢）"
  fi
fi

# ════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}9. 快速验证${NC}"
# ════════════════════════════════════════════════════════════════

if command -v node > /dev/null && [ -f backend/src/services/imageDownloader.js ]; then
  echo -n "  验证 imageDownloader.js 语法 ... "
  if node --check backend/src/services/imageDownloader.js 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
  else
    echo -e "${RED}✗${NC}"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
  fi
fi

if command -v python3 > /dev/null && [ -f crawler/image_downloader.py ]; then
  echo -n "  验证 image_downloader.py 语法 ... "
  if python3 -m py_compile crawler/image_downloader.py 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
  else
    echo -e "${RED}✗${NC}"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
  fi
fi

# ════════════════════════════════════════════════════════════════
echo -e "\n╔════════════════════════════════════════════════════════════════╗"
echo "║                       部署检查结果                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"

echo -e "\n  ${GREEN}✓ 通过${NC}: $CHECKS_PASSED"
if [ $CHECKS_FAILED -gt 0 ]; then
  echo -e "  ${RED}✗ 失败${NC}: $CHECKS_FAILED"
fi
if [ $WARNINGS -gt 0 ]; then
  echo -e "  ${YELLOW}⚠ 警告${NC}: $WARNINGS"
fi

echo -e "\n  总计: $((CHECKS_PASSED + CHECKS_FAILED)) 个检查\n"

# ════════════════════════════════════════════════════════════════
# 建议
# ════════════════════════════════════════════════════════════════

if [ $CHECKS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ 所有必需组件已就绪！${NC}"
  echo ""
  echo "下一步："
  echo "  1. 运行完整集成测试: bash TEST_INTEGRATION.sh"
  echo "  2. 启动 Docker 容器: cd docker && docker-compose up -d"
  echo "  3. 访问前端: http://localhost:3000"
  echo "  4. 参考文档: QUICK_REFERENCE.md"
  echo ""
  exit 0
else
  echo -e "${RED}✗ 存在 $CHECKS_FAILED 个失败项，无法部署。${NC}"
  echo ""
  echo "故障排查："
  echo "  1. 检查上面标记为 ✗ 的项目"
  echo "  2. 参考 IMPLEMENTATION_SUMMARY.md 了解实现细节"
  echo "  3. 运行 TEST_INTEGRATION.sh 获取更多诊断信息"
  echo ""
  exit 1
fi
