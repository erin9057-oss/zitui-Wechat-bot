#!/bin/bash
echo "==================================================="
echo "🚀 正在执行 自推 Wechat Bot 更新程序..."
echo "==================================================="

# 1. 创建配置文件临时备份路径
# 🌟 修复：改用 Termux 绝对有权限的上一级目录作为备份点
BACKUP_DIR="../wechat_bot_backup_$(date +%s)"
mkdir -p "$BACKUP_DIR"

echo -e "\n📦 [1/6] 正在将你的 配置文件与记忆数据转移至安全路径..."
# 备份所有核心用户数据（即使某些文件不存在也不会报错中断）
cp -r accounts "$BACKUP_DIR/" 2>/dev/null || true
cp -r workspace "$BACKUP_DIR/" 2>/dev/null || true
cp -r Memory "$BACKUP_DIR/" 2>/dev/null || true  # 🌟 新增：完美备份 Memory 目录
cp config.json "$BACKUP_DIR/" 2>/dev/null || true
cp ref.png "$BACKUP_DIR/" 2>/dev/null || true
cp voice.png "$BACKUP_DIR/" 2>/dev/null || true

# 2. 更新本地旧代码，强制与 GitHub 远端主分支对齐
echo -e "\n🌪️ [2/6] 正在拉取远端最新文件..."
# 🌟 修复：如果本地 .git 文件夹丢失，自动重新初始化并绑定远端
if [ ! -d ".git" ]; then
    echo "🔧 检测到缺失 Git 仓库记录，正在重新绑定..."
    git init
    git remote add origin https://github.com/erin9057-oss/zitui-Wechat-bot.git
fi
git fetch --all
git reset --hard origin/main
# 如果远端有新加的模板文件，确保工作区干净
git clean -fd 

# 3. 恢复配置文件
echo -e "\n💖 [3/6] 正在将灵魂数据重新注入最新架构..."
# 先清理拉取下来的空壳或模板
rm -rf accounts/ workspace/ Memory/
# 将备份的数据全盘覆盖回来
cp -r "$BACKUP_DIR"/* ./ 2>/dev/null || true

# 4. 重新安装依赖与编译
echo -e "\n⚙️ [4/6] 正在重构底层逻辑 (npm install & build)..."
# 🌟 修复：跳过某些在安卓上无法编译的可选 C++ 底层模块
npm install --no-optional
npm run build

# 5. 同步刷新 .bashrc 开机自启配置
echo -e "\n🧹 [5/6] 正在同步更新开机自启配置..."
APP_DIR="$HOME/WechatAI/openclaw-weixin"
BASHRC_FILE="$HOME/.bashrc"

sed -i '/wechat-bot/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/voice-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/image-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/sensor-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/memory-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/自推 Wechat Bot 开机自启/d' "$BASHRC_FILE" 2>/dev/null || true

echo "# 自推 Wechat Bot 开机自启" >> "$BASHRC_FILE"
echo "pm2 start $APP_DIR/bot.js --name \"wechat-bot\" 2>/dev/null || true" >> "$BASHRC_FILE"
echo "pm2 start $APP_DIR/voice-server.js --name \"voice-engine\" 2>/dev/null || true" >> "$BASHRC_FILE"
echo "pm2 start $APP_DIR/image-server.js --name \"image-engine\" 2>/dev/null || true" >> "$BASHRC_FILE"
echo "pm2 start $APP_DIR/sensor.js --name \"sensor-engine\" 2>/dev/null || true" >> "$BASHRC_FILE"
echo "pm2 start $APP_DIR/summary.js --name \"memory-engine\" 2>/dev/null || true" >> "$BASHRC_FILE"

# 6. 重启唤醒 (🌟 核心修复：存在则 restart，不存在则 start)
echo -e "\n🔄 [6/6] 正在重启后台服务，唤醒 AI..."
pm2 restart wechat-bot 2>/dev/null || pm2 start "$APP_DIR/bot.js" --name "wechat-bot"
pm2 restart voice-engine 2>/dev/null || pm2 start "$APP_DIR/voice-server.js" --name "voice-engine"
pm2 restart image-engine 2>/dev/null || pm2 start "$APP_DIR/image-server.js" --name "image-engine"
pm2 restart sensor-engine 2>/dev/null || pm2 start "$APP_DIR/sensor.js" --name "sensor-engine"
pm2 restart memory-engine 2>/dev/null || pm2 start "$APP_DIR/summary.js" --name "memory-engine"
pm2 save

echo "==================================================="
echo "🎉 更新圆满成功！新版本及 5 个引擎已在后台生效。"
echo "==================================================="
