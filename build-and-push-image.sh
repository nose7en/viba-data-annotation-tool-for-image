#!/bin/bash

# VIBA Image Annotation Tool - Build and Push Script
# 用于构建和推送后端和前端 Docker 镜像到 ECR

set -e

# 配置
AWS_REGION="us-west-2"
ECR_REGISTRY="686255979277.dkr.ecr.us-west-2.amazonaws.com"
BACKEND_REPO="internal/annot-image-backend"
FRONTEND_REPO="internal/annot-image-frontend"

# 获取当前时间戳作为标签
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
TAG="${TIMESTAMP}-${GIT_COMMIT}"

echo "Building and pushing VIBA Image Annotation Tool images..."
echo "Tag: ${TAG}"

# 登录到 ECR
echo "Logging in to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

# 构建后端镜像
echo "Building backend image..."
docker build -f Dockerfile.backend -t ${ECR_REGISTRY}/${BACKEND_REPO}:${TAG} .
docker tag ${ECR_REGISTRY}/${BACKEND_REPO}:${TAG} ${ECR_REGISTRY}/${BACKEND_REPO}:latest

# 构建前端镜像
echo "Building frontend image..."
docker build -f Dockerfile.frontend -t ${ECR_REGISTRY}/${FRONTEND_REPO}:${TAG} .
docker tag ${ECR_REGISTRY}/${FRONTEND_REPO}:${TAG} ${ECR_REGISTRY}/${FRONTEND_REPO}:latest

# 推送镜像
echo "Pushing backend image..."
docker push ${ECR_REGISTRY}/${BACKEND_REPO}:${TAG}
docker push ${ECR_REGISTRY}/${BACKEND_REPO}:latest

echo "Pushing frontend image..."
docker push ${ECR_REGISTRY}/${FRONTEND_REPO}:${TAG}
docker push ${ECR_REGISTRY}/${FRONTEND_REPO}:latest

echo "Build and push completed successfully!"
echo "Backend image: ${ECR_REGISTRY}/${BACKEND_REPO}:${TAG}"
echo "Frontend image: ${ECR_REGISTRY}/${FRONTEND_REPO}:${TAG}"

# 显示部署命令
echo ""
echo "To deploy to EKS, run:"
echo "kubectl apply -f k8s/eks-manifests-image.yaml"
