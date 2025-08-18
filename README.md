# 模型参考图标注工具 - 后端服务

## 系统架构

- **Flask** - Web 框架
- **PostgreSQL + pgvector** - 数据库和向量存储
- **AWS S3** - 图片存储
- **Sentence Transformers** - 文本向量嵌入

## 快速开始

### 1. 环境要求

- Python 3.11+ (推荐 3.11，3.12 也可以)
- PostgreSQL 13+ with pgvector extension
- AWS S3 bucket

### 2. 安装步骤

```bash
# 克隆项目
git clone <repository>
cd viba-data-annotation-tool-for-image

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate     # Windows

# 安装依赖
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

### 3. 配置环境变量

创建 `.env` 文件：

```bash
# 数据库配置（连接已存在的数据库）
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=viba
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password

# AWS S3配置
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET=viba-dev              # 您的S3 bucket名称
S3_REGION=us-east-1             # 您的AWS区域
CLOUDFRONT_DOMAIN=               # 可选，CDN域名

# 应用配置
FLASK_ENV=development
FLASK_DEBUG=True
SECRET_KEY=your-secret-key-here
```

### 4. 数据库准备

确保数据库已有以下表结构，并添加必要字段：

```sql
-- 添加主图URL字段（如果还没有）
ALTER TABLE viba.reference_images
ADD COLUMN IF NOT EXISTS reference_image_url TEXT NOT NULL;
```

### 5. 启动服务

```bash
python app.py
```

服务将在 http://localhost:5000 启动

## 向量嵌入模型说明

### 使用的模型

本系统使用 **sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2** 模型：

- **模型大小**: 约 118MB
- **支持语言**: 50+ 种语言（包括中文和英文）
- **向量维度**: 384 维（可扩展到 768 维）
- **用途**: 生成文本的语义向量，用于相似度搜索

### 首次运行

**重要**：首次运行时会自动下载嵌入模型（约 100-200MB），请确保网络连接正常。

下载进度示例：

```
Downloading modules.json: 100%
Downloading config_sentence_transformers.json: 100%
Downloading sentence_bert_config.json: 100%
Downloading pytorch_model.bin: 100%
```

模型会缓存在 `~/.cache/huggingface/` 目录，之后运行无需重新下载。

### 禁用向量嵌入（可选）

如果暂时不需要向量搜索功能，可以禁用：

1. 修改 `embedding_service.py`：

```python
class EmbeddingService:
    def __init__(self):
        self.available = False
    def generate_embedding(self, text, dimension):
        return [0.0] * dimension
```

2. 或设置环境变量跳过下载：

```bash
export TRANSFORMERS_OFFLINE=1
```

## 项目结构

```
project/
├── app.py                  # 主应用文件
├── embedding_service.py    # 向量嵌入服务
├── image_validator.py      # 图片验证（竖屏）
├── s3_uploader.py         # S3上传服务
├── requirements.txt       # Python依赖
├── .env                   # 环境变量配置
├── docker-compose.yml     # Docker配置（可选）
└── README.md             # 本文档
```

## S3 文件结构

```
viba-dev/                           # S3 Bucket
├── reference_images/               # 主业务图片
│   └── 2024/01/15/{uuid}.jpg
└── prompt_references/              # AI参考图
    ├── pose/2024/01/{uuid}.jpg
    ├── outfit/2024/01/{uuid}.jpg
    ├── scene/2024/01/{uuid}.jpg
    ├── composition/2024/01/{uuid}.jpg
    └── style/2024/01/{uuid}.jpg
```

## API 端点

### 基础端点

- `GET /` - 服务状态
- `GET /api/health` - 健康检查

### 标签管理

- `GET /api/tags/all` - 获取所有标签（推荐，一次性加载）
- `GET /api/tags/{type}` - 获取特定类型标签

### 图片上传

- `POST /api/upload-image` - 上传单张图片
- `POST /api/upload-batch` - 批量上传

### 参考图管理

- `POST /api/reference-images` - 创建标注
- `GET /api/reference-images/{id}` - 获取详情
- `POST /api/reference-images/search` - 搜索

### 主题

- `GET /api/themes` - 获取所有主题

## 标签体系

### 多级标签（4 级树状）

- `product_type` - 产品类型
- `style` - 风格
- `occasion` - 场合
- `silhouette` - 廓形

### 单级标签

- `fabric` - 面料
- `pose` - 姿势
- `model_gender` - 模特性别
- `model_age` - 模特年龄
- `model_race` - 模特种族
- `model_fit` - 模特体型（原 model_size）
- 等等...

## 图片要求

- **格式**: PNG, JPG, JPEG
- **方向**: 必须为竖屏（高度 > 宽度）
- **分辨率**:
  - 最小: 1080 × 1920
  - 最大: 2160 × 3840
- **文件大小**: 最大 50MB
- **自动处理**: 大于 10MB 自动压缩

## 故障排查

### 1. psycopg2 安装失败

```bash
# macOS
brew install postgresql
# 或
brew install libpq
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
```

### 2. numpy 版本冲突

```bash
# Python 3.12需要numpy 1.26+
pip install numpy==1.26.0
```

### 3. 模型下载慢

- 使用代理或镜像源
- 或暂时禁用嵌入功能（见上文）

### 4. S3 权限问题

确保 IAM 用户有以下权限：

- s3:PutObject
- s3:GetObject
- s3:DeleteObject
- s3:ListBucket

## 性能优化

1. **缓存策略**

   - 标签数据缓存 2 小时
   - 主题数据缓存 10 分钟
   - 图片哈希缓存 24 小时

2. **数据库优化**

   - 确保所有索引已创建
   - 定期运行 `VACUUM ANALYZE`

3. **向量搜索**
   - 使用 IVFFlat 索引加速
   - 考虑批量处理嵌入生成

## Docker 部署

### 本地开发
```bash
# 使用Docker Compose（前后端分离）
docker-compose up -d

# 查看日志
docker-compose logs -f app
```

### EKS 生产部署

详细部署指南请参考：[scripts/README.md](scripts/README.md)

```bash
# 1. 初始化 Colima 和 Buildx（首次使用）
./scripts/setup-buildx.sh

# 2. 构建和推送镜像
./scripts/ci-build-and-push.sh

# 3. 部署到 EKS
./scripts/cd-deploy.sh
```

## 生产部署

使用 Gunicorn：

```bash
gunicorn --bind 0.0.0.0:5000 --workers 4 --timeout 120 app:app
```

使用 Nginx 反向代理：

```nginx
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## 监控

- 使用 `/api/health` 端点进行健康检查
- 查看日志文件了解详细错误
- 跟踪 S3 存储使用量

## 支持

如遇问题，请检查：

1. 环境变量是否正确配置
2. 数据库连接是否正常
3. 标签数据是否已导入
4. 查看应用日志获取错误详情

## License

[Your License]

## 更新日志

- 2024-01-XX: 初始版本
  - 支持多级和单级标签
  - 竖屏图片验证
  - S3 文件管理
  - 向量嵌入搜索
