#!/bin/bash

# VIBA Image Annotation Tool - Rollback Script
# 用于回滚到上一个部署版本

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

echo -e "${BLUE}🔄 VIBA Image Annotation Tool - Rollback Script${NC}"

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

# 显示回滚历史
echo -e "${BLUE}📜 Rollout history:${NC}"
kubectl rollout history deployment/${DEPLOYMENT_NAME} -n ${NAMESPACE}

# 获取当前状态
echo -e "${BLUE}📊 Current deployment status:${NC}"
kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE}

# 确认回滚
echo -e "${YELLOW}🤔 Do you want to rollback to the previous version?${NC}"
read -p "Continue with rollback? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}🛑 Rollback cancelled${NC}"
    exit 0
fi

# 执行回滚
echo -e "${BLUE}🔄 Rolling back deployment...${NC}"
kubectl rollout undo deployment/${DEPLOYMENT_NAME} -n ${NAMESPACE}

# 等待回滚完成
echo -e "${BLUE}⏳ Waiting for rollback to complete...${NC}"
kubectl rollout status deployment/${DEPLOYMENT_NAME} -n ${NAMESPACE} --timeout=300s

# 检查回滚后状态
echo -e "${BLUE}📊 Post-rollback status:${NC}"
kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE}
kubectl get pods -n ${NAMESPACE} -l app=viba-image

echo -e "${GREEN}✅ Rollback completed successfully!${NC}"

# 显示有用的命令
echo -e "${BLUE}📝 Useful commands:${NC}"
echo -e "   View logs: kubectl logs -n ${NAMESPACE} -l app=viba-image -c backend -f"
echo -e "   Check status: kubectl get pods -n ${NAMESPACE} -l app=viba-image"

