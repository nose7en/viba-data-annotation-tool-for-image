# VIBA Image Annotation Tool - EKS 部署指南

## 概述

本工具的 EKS 部署包含两个容器：
- **Backend**: Flask 应用，处理 API 请求和数据库操作
- **Frontend**: Nginx 静态文件服务，代理 API 请求到后端

## 前置条件

1. **EKS 集群**已配置
2. **ServiceAccount** `annot-backend-sa` 已创建，并配置了以下 IAM 权限：
   - RDS IAM 认证权限
   - S3 读写权限
3. **ECR 仓库**已创建：
   - `internal/annot-image-backend`
   - `internal/annot-image-frontend`

## 配置说明

### 环境变量配置

在 `k8s/eks-manifests-image.yaml` 中需要根据环境修改以下配置：

#### Secret 配置 (`viba-image-secrets`)
```yaml
stringData:
  DB_HOST: your-rds-endpoint.region.rds.amazonaws.com
  DB_PORT: "5432"
  DB_NAME: postgres
  DB_USER: your_db_user
  S3_BUCKET_NAME: your-s3-bucket-name  # 根据环境修改
```

#### 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DB_HOST` | RDS 数据库主机 | - |
| `DB_PORT` | 数据库端口 | 5432 |
| `DB_NAME` | 数据库名称 | postgres |
| `DB_USER` | 数据库用户 | - |
| `DB_AUTH_MODE` | 认证模式 | iam |
| `DB_SSLMODE` | SSL 模式 | require |
| `AWS_REGION` | AWS 区域 | us-west-2 |
| `S3_BUCKET_NAME` | S3 存储桶名称 | - |
| `S3_PREFIX` | S3 存储前缀 | viba-image-annotation/ |
| `S3_REGION` | S3 区域 | us-west-2 |

### 不同环境的配置示例

#### 开发环境
```yaml
S3_BUCKET_NAME: viba-image-dev
S3_PREFIX: "dev/viba-image-annotation/"
```

#### 生产环境
```yaml
S3_BUCKET_NAME: viba-image-prod
S3_PREFIX: "prod/viba-image-annotation/"
```

## 部署步骤

### 1. 构建和推送镜像

```bash
# 确保已登录 AWS CLI 并有 ECR 权限
./build-and-push-image.sh
```

### 2. 修改配置

编辑 `k8s/eks-manifests-image.yaml` 中的配置：
- 数据库连接信息
- S3 存储桶名称
- ECR 镜像地址（如果不同）

### 3. 部署到 EKS

```bash
kubectl apply -f k8s/eks-manifests-image.yaml
```

### 4. 验证部署

```bash
# 检查 Pod 状态
kubectl get pods -n prod-annotation -l app=viba-image

# 检查服务状态
kubectl get svc -n prod-annotation viba-image-svc

# 查看日志
kubectl logs -n prod-annotation -l app=viba-image -c backend
kubectl logs -n prod-annotation -l app=viba-image -c nginx
```

## 访问应用

应用将通过以下路径访问：
- **主页**: `/annot-image/`
- **API**: `/annot-image/api/` 或直接 `/api/`
- **健康检查**: `/health`

## 故障排查

### 常见问题

1. **数据库连接失败**
   - 检查 IAM 权限配置
   - 确认 DB_USER 有 RDS IAM 认证权限
   - 检查安全组配置

2. **S3 上传失败**
   - 检查 ServiceAccount IAM 权限
   - 确认 S3 存储桶存在且可访问
   - 检查 S3_BUCKET_NAME 配置

3. **Pod 启动失败**
   ```bash
   kubectl describe pod -n prod-annotation <pod-name>
   kubectl logs -n prod-annotation <pod-name> -c backend
   ```

### 健康检查

- **Backend**: `GET /api/health`
- **Frontend**: `GET /annot-image/`

## 扩展配置

### 资源限制

可以根据负载调整资源配置：

```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "200m"
  limits:
    memory: "1Gi"
    cpu: "500m"
```

### 副本数量

根据负载调整副本数：

```yaml
spec:
  replicas: 2  # 调整副本数
```

## 安全考虑

1. **IAM 权限**: 遵循最小权限原则
2. **网络策略**: 考虑配置 NetworkPolicy 限制网络访问
3. **Secrets 管理**: 使用 AWS Secrets Manager 或其他密钥管理工具
4. **镜像安全**: 定期更新基础镜像和依赖
