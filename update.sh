#!/bin/bash
echo "==================================================="
echo "🚀 正在执行 自推 Wechat Bot 更新程序..."
echo "==================================================="

# 1. 创建配置文件临时备份路径
BACKUP_DIR="/tmp/wechat_bot_backup_$(date +%s)"
mkdir -p "$BACKUP_DIR"

echo -e "\n📦 [1/5] 正在将你的 配置文件转移至安全路径..."
# 备份所有核心用户数据（即使某些文件不存在也不会报错中断）
cp -r accounts "$BACKUP_DIR/" 2>/dev/null || true
cp -r workspace "$BACKUP_DIR/" 2>/dev/null || true
cp config.json "$BACKUP_DIR/" 2>/dev/null || true
cp ref.png "$BACKUP_DIR/" 2>/dev/null || true
cp voice.png "$BACKUP_DIR/" 2>/dev/null || true

# 2. 更新本地旧代码，强制与 GitHub 远端主分支对齐
echo -e "\n🌪️ [2/5] 正在拉取远端最新文件..."
git fetch --all
git reset --hard origin/main
# 如果远端有新加的模板文件，确保工作区干净
git clean -fd 

# 3. 恢复配置文件
echo -e "\n💖 [3/5] 正在将灵魂数据重新注入最新架构..."
# 先清理拉取下来的空壳或模板
rm -rf accounts/ workspace/
# 将备份的数据全盘覆盖回来
cp -r "$BACKUP_DIR"/* ./ 2>/dev/null || true

# 4. 重新安装依赖与编译
echo -e "\n⚙️ [4/5] 正在重构底层逻辑 (npm install & build)..."
npm install
npm run build

# 5. 重启唤醒
echo -e "\n🔄 [5/5] 正在重启后台服务，唤醒 AI..."
pm2 restart wechat-bot 2>/dev/null || true
pm2 restart voice-engine 2>/dev/null || true
pm2 restart image-engine 2>/dev/null || true
pm2 save

echo "==================================================="
echo "🎉 更新圆满成功！新版本已在后台生效。"
echo "==================================================="
