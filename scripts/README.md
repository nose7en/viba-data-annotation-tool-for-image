# VIBA Image Annotation Tool - Scripts Usage Guide

## 🚀 Quick Start

### 1. 初始化 Colima 和 Buildx（首次使用）

```bash
# 设置 Colima 和 Docker Buildx
./scripts/setup-buildx.sh
```

这个脚本会：
- 启动 Colima（优先使用 vz，回退到 qemu）
- 设置 Docker context 到 colima
- 创建 multiarch buildx builder

### 2. 构建和推送镜像（CI）

```bash
# 构建 Linux 镜像并推送到 ECR
./scripts/ci-build-and-push.sh
```

这个脚本会：
- 使用 buildx 构建 linux/amd64 镜像
- 推送到 ECR
- 生成 `deployment-info.env` 文件

### 3. 部署到 EKS（CD）

```bash
# 部署到 Kubernetes 集群
./scripts/cd-deploy.sh
```

这个脚本会：
- 检查 kubectl 连接和权限
- 应用 K8s 配置
- 等待部署完成

## 📋 详细脚本说明

### CI/CD 脚本

| 脚本 | 用途 | 何时使用 |
|------|------|----------|
| `setup-buildx.sh` | 初始化 Colima 和 Buildx | 首次使用或重置环境 |
| `ci-build-and-push.sh` | 构建和推送镜像 | 代码变更后 |
| `cd-deploy.sh` | 部署到 EKS | 推送镜像后 |

### 运维脚本

| 脚本 | 用途 | 使用场景 |
|------|------|----------|
| `logs.sh` | 查看应用日志 | 调试问题 |
| `rollback.sh` | 回滚部署 | 部署出问题时 |

## 🔧 Colima 配置详解

### 正确的启动参数

```bash
# 优先使用 vz（macOS 13+ 支持，性能更好）
colima start --arch x86_64 --runtime docker --vm-type vz --cpu 4 --memory 8

# 如果不支持 vz，使用 qemu
colima start --arch x86_64 --runtime docker --vm-type qemu --cpu 4 --memory 8
```

### 重要：设置 Docker Context

```bash
# 必须设置 context 到 colima
docker context use colima
```

### 参数说明

- `--arch x86_64`: 指定 x86_64 架构（AWS EKS 使用）
- `--runtime docker`: 使用 Docker 运行时
- `--vm-type vz`: 使用 Virtualization.framework（更快）
- `--vm-type qemu`: 回退选项（兼容性更好）

## 🐛 常见问题

### 1. Docker 构建失败

```bash
# 检查 Docker context
docker context ls
docker context use colima

# 重新初始化 buildx
./scripts/setup-buildx.sh
```

### 2. Colima 启动失败

```bash
# 停止并重启 Colima
colima stop
colima start --arch x86_64 --runtime docker --vm-type qemu
```

### 3. 镜像架构不匹配

确保使用 `linux/amd64` 平台：
```bash
docker buildx build --platform linux/amd64 ...
```

### 4. ECR 推送权限问题

```bash
# 重新登录 ECR
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin 686255979277.dkr.ecr.us-west-2.amazonaws.com
```

## 📝 使用示例

### 完整的 CI/CD 流程

```bash
# 1. 首次设置（只需运行一次）
./scripts/setup-buildx.sh

# 2. 开发循环
./scripts/ci-build-and-push.sh  # 构建和推送
./scripts/cd-deploy.sh          # 部署

# 3. 查看日志
./scripts/logs.sh backend -f    # 查看后端日志

# 4. 如果有问题，回滚
./scripts/rollback.sh
```

### 日志查看示例

```bash
# 查看所有日志（最后 100 行）
./scripts/logs.sh

# 实时跟踪后端日志
./scripts/logs.sh backend -f

# 查看最后 1 小时的前端日志
./scripts/logs.sh frontend --since 1h
```

## 🔐 权限要求

### AWS 权限
- ECR 推送权限
- EKS 集群访问权限

### K8s 权限
- 创建/更新 Deployment、Service、ConfigMap、Secret
- ServiceAccount `annot-backend-sa` 必须存在且有适当的 IAM 角色

## 📊 监控和维护

### 健康检查
```bash
# K8s 内健康检查
kubectl get pods -n prod-annotation -l app=viba-image

# 应用健康检查
curl http://your-ingress/health
```

### 扩容
```bash
kubectl scale deployment viba-image -n prod-annotation --replicas=3
```

### 更新配置
1. 修改 `k8s/eks-manifests-image.yaml`
2. 运行 `./scripts/cd-deploy.sh`
