#!/bin/bash

# 设置 Colima 和 Docker 的简化脚本

set -e

echo "🔧 Setting up Docker with Colima..."

# 停止现有的 Colima 实例
echo "🛑 Stopping existing Colima instance..."
colima stop 2>/dev/null || true

# 启动 Colima
echo "🚀 Starting Colima..."
if colima start --arch x86_64 --runtime docker --vm-type vz; then
    echo "✅ Colima started with vz VM type"
else
    echo "⚠️  vz not supported, falling back to qemu..."
    colima start --arch x86_64 --runtime docker --vm-type qemu
    echo "✅ Colima started with qemu VM type"
fi

# 设置 Docker 上下文
echo "🔧 Setting Docker context to colima..."
docker context use colima

# 确认架构
echo "📋 Checking architecture..."
docker info | grep -i 'Architecture' || echo "Architecture info not found"

echo "✅ Setup complete!"