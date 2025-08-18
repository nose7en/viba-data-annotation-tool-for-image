#!/bin/bash

# VIBA Image Annotation Tool - CD Deployment Script
# 用于部署到 EKS 集群

set -e

# 配置
NAMESPACE="prod-annotation"
DEPLOYMENT_NAME="viba-image"
MANIFEST_FILE="k8s/eks-manifests-image.yaml"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 VIBA Image Annotation Tool - Deployment Script${NC}"

# 检查是否有 deployment-info.env
if [[ -f "./deployment-info.env" ]]; then
    echo -e "${GREEN}📋 Loading deployment info...${NC}"
    source ./deployment-info.env
    echo -e "   Build Tag: ${BUILD_TAG}"
    echo -e "   Build Time: ${BUILD_TIME}"
    echo -e "   Git Commit: ${GIT_COMMIT}"
else
    echo -e "${YELLOW}⚠️  No deployment-info.env found, using latest images${NC}"
fi

# 检查 kubectl 是否可用
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl is not installed or not in PATH${NC}"
    exit 1
fi

# 检查 kubectl 连接
echo -e "${BLUE}🔍 Checking kubectl connection...${NC}"
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}❌ Cannot connect to Kubernetes cluster. Please check your kubeconfig.${NC}"
    exit 1
fi

current_context=$(kubectl config current-context)
echo -e "${GREEN}✅ Connected to cluster: ${current_context}${NC}"

# 检查命名空间
echo -e "${BLUE}🔍 Checking namespace...${NC}"
if ! kubectl get namespace ${NAMESPACE} &> /dev/null; then
    echo -e "${YELLOW}⚠️  Namespace ${NAMESPACE} does not exist. Creating...${NC}"
    kubectl create namespace ${NAMESPACE}
else
    echo -e "${GREEN}✅ Namespace ${NAMESPACE} exists${NC}"
fi

# 检查 ServiceAccount
echo -e "${BLUE}🔍 Checking ServiceAccount...${NC}"
if ! kubectl get serviceaccount annot-backend-sa -n ${NAMESPACE} &> /dev/null; then
    echo -e "${RED}❌ ServiceAccount 'annot-backend-sa' not found in namespace ${NAMESPACE}${NC}"
    echo -e "${YELLOW}   Please create the ServiceAccount with appropriate IAM roles first:${NC}"
    echo -e "   kubectl create serviceaccount annot-backend-sa -n ${NAMESPACE}"
    echo -e "   # Then annotate with IAM role ARN"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${GREEN}✅ ServiceAccount 'annot-backend-sa' exists${NC}"
fi

# 检查清单文件
if [[ ! -f "${MANIFEST_FILE}" ]]; then
    echo -e "${RED}❌ Manifest file ${MANIFEST_FILE} not found${NC}"
    exit 1
fi

# 显示当前部署状态（如果存在）
echo -e "${BLUE}📊 Current deployment status:${NC}"
if kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE} &> /dev/null; then
    kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE}
    echo -e "${BLUE}   Current image versions:${NC}"
    kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.template.spec.containers[*].image}' | tr ' ' '\n' | while read image; do
        echo -e "   - ${image}"
    done
    echo
else
    echo -e "${YELLOW}   No existing deployment found${NC}"
fi

# 确认部署
echo -e "${YELLOW}🤔 Ready to deploy VIBA Image Annotation Tool${NC}"
if [[ -n "${BUILD_TAG}" ]]; then
    echo -e "   With images tagged: ${BUILD_TAG}"
fi
read -p "Continue with deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}🛑 Deployment cancelled${NC}"
    exit 0
fi

# 应用配置
echo -e "${BLUE}🚀 Applying Kubernetes manifests...${NC}"
kubectl apply -f ${MANIFEST_FILE}

# 等待部署完成
echo -e "${BLUE}⏳ Waiting for deployment to be ready...${NC}"
kubectl rollout status deployment/${DEPLOYMENT_NAME} -n ${NAMESPACE} --timeout=300s

# 检查部署状态
echo -e "${BLUE}📊 Deployment status:${NC}"
kubectl get deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE}
kubectl get pods -n ${NAMESPACE} -l app=viba-image

# 获取服务信息
echo -e "${BLUE}🌐 Service information:${NC}"
kubectl get service viba-image-svc -n ${NAMESPACE}

# 显示访问信息
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${BLUE}🔗 Access information:${NC}"
echo -e "   Application URL: /annot-image/"
echo -e "   Health check: /health"
echo -e "   API: /api/"

# 显示有用的命令
echo -e "${BLUE}📝 Useful commands:${NC}"
echo -e "   View logs (backend): kubectl logs -n ${NAMESPACE} -l app=viba-image -c backend -f"
echo -e "   View logs (frontend): kubectl logs -n ${NAMESPACE} -l app=viba-image -c nginx -f"
echo -e "   Scale deployment: kubectl scale deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE} --replicas=3"
echo -e "   Restart deployment: kubectl rollout restart deployment/${DEPLOYMENT_NAME} -n ${NAMESPACE}"

