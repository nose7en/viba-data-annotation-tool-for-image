#!/bin/bash

# Cleanup script for Colima
# 清理 Colima 和 Docker 环境

set -e

echo "🧹 Cleaning up Colima and Docker environment..."

# 停止 Colima
echo "🛑 Stopping Colima..."
if colima status &> /dev/null; then
    colima stop
    echo "✅ Colima stopped"
else
    echo "ℹ️  Colima is not running"
fi

# 删除 Colima 实例（可选，会删除所有数据）
read -p "🗑️  Do you want to delete the Colima instance? This will remove all containers and images. (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Deleting Colima instance..."
    colima delete --force
    echo "✅ Colima instance deleted"
fi

# 清理 Docker buildx builders
echo "🔧 Cleaning up Docker buildx builders..."
docker buildx rm multiarch &> /dev/null || echo "   No multiarch builder to remove"

# 重置 Docker context
echo "🔄 Resetting Docker context..."
docker context use default &> /dev/null || echo "   Already using default context"

echo "✅ Cleanup completed!"
echo ""
echo "💡 To restart fresh:"
echo "   ./scripts/setup-buildx.sh"
