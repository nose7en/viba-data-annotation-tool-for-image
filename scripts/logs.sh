#!/bin/bash

# VIBA Image Annotation Tool - Logs Script
# 用于查看应用日志

set -e

# 配置
NAMESPACE="prod-annotation"
DEPLOYMENT_NAME="viba-image"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 显示使用说明
show_usage() {
    echo -e "${BLUE}📝 VIBA Image Annotation Tool - Logs Viewer${NC}"
    echo ""
    echo "Usage: $0 [CONTAINER] [OPTIONS]"
    echo ""
    echo "CONTAINER:"
    echo "  backend   - View backend (Flask) logs"
    echo "  frontend  - View frontend (Nginx) logs"
    echo "  all       - View all container logs (default)"
    echo ""
    echo "OPTIONS:"
    echo "  -f, --follow     Follow log output"
    echo "  -t, --tail N     Show last N lines (default: 100)"
    echo "  --since DURATION Show logs since duration (e.g., 1h, 30m)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Show all logs (last 100 lines)"
    echo "  $0 backend -f         # Follow backend logs"
    echo "  $0 frontend --tail 50 # Show last 50 lines of frontend logs"
    echo "  $0 all --since 1h     # Show all logs from last hour"
}

# 默认参数
CONTAINER="all"
FOLLOW=""
TAIL="100"
SINCE=""

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        backend|frontend|all)
            CONTAINER="$1"
            shift
            ;;
        -f|--follow)
            FOLLOW="-f"
            shift
            ;;
        -t|--tail)
            TAIL="$2"
            shift 2
            ;;
        --since)
            SINCE="--since=$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            show_usage
            exit 1
            ;;
    esac
done

# 检查 kubectl 是否可用
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl is not installed or not in PATH${NC}"
    exit 1
fi

# 检查部署是否存在
if ! kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE} &> /dev/null; then
    echo -e "${RED}❌ Deployment ${DEPLOYMENT_NAME} not found in namespace ${NAMESPACE}${NC}"
    exit 1
fi

# 构建 kubectl logs 命令
base_cmd="kubectl logs -n ${NAMESPACE} -l app=viba-image"

if [[ -n "$TAIL" ]]; then
    base_cmd="$base_cmd --tail=$TAIL"
fi

if [[ -n "$SINCE" ]]; then
    base_cmd="$base_cmd $SINCE"
fi

if [[ -n "$FOLLOW" ]]; then
    base_cmd="$base_cmd $FOLLOW"
fi

# 显示日志
case $CONTAINER in
    backend)
        echo -e "${BLUE}📋 Showing backend logs...${NC}"
        echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
        eval "$base_cmd -c backend"
        ;;
    frontend)
        echo -e "${BLUE}📋 Showing frontend logs...${NC}"
        echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
        eval "$base_cmd -c nginx"
        ;;
    all)
        echo -e "${BLUE}📋 Showing all container logs...${NC}"
        echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
        if [[ -n "$FOLLOW" ]]; then
            # 对于 follow 模式，我们需要分别显示
            echo -e "${GREEN}=== Backend Logs ===${NC}"
            eval "$base_cmd -c backend" &
            backend_pid=$!
            echo -e "${GREEN}=== Frontend Logs ===${NC}"
            eval "$base_cmd -c nginx" &
            frontend_pid=$!
            
            # 等待任一进程结束
            wait $backend_pid $frontend_pid
        else
            echo -e "${GREEN}=== Backend Logs ===${NC}"
            eval "$base_cmd -c backend"
            echo ""
            echo -e "${GREEN}=== Frontend Logs ===${NC}"
            eval "$base_cmd -c nginx"
        fi
        ;;
esac

