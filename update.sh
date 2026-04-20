#!/bin/bash
echo "==================================================="
echo "🚀 正在执行 自推 Wechat Bot 更新程序..."
echo "==================================================="

# 1. 备份数据
BACKUP_DIR="../wechat_bot_backup_$(date +%s)"
mkdir -p "$BACKUP_DIR"

echo -e "\n📦 [1/6] 正在备份核心灵魂数据（含 luma2api & ref.jpg）..."
cp -r accounts "$BACKUP_DIR/" 2>/dev/null || true
cp -r workspace "$BACKUP_DIR/" 2>/dev/null || true
cp -r Memory "$BACKUP_DIR/" 2>/dev/null || true  
cp config.json "$BACKUP_DIR/" 2>/dev/null || true
cp sensor_map.json "$BACKUP_DIR/" 2>/dev/null || true
cp ref.jpg "$BACKUP_DIR/" 2>/dev/null || true
cp -r luma2api "$BACKUP_DIR/" 2>/dev/null || true # 🌟 备份反代文件夹

# 2. 拉取更新
echo -e "\n🌪️ [2/6] 正在拉取远端最新文件..."
if [ ! -d ".git" ]; then
    git init
    git remote add origin https://github.com/erin9057-oss/zitui-Wechat-bot.git
fi
git fetch --all
git reset --hard origin/main
git clean -fd 

# 3. 数据还原
echo -e "\n💖 [3/6] 正在重新注入数据..."
rm -rf accounts/ workspace/ Memory/
cp -r "$BACKUP_DIR"/* ./ 2>/dev/null || true

# 智能补齐模板文件
if [ -d "workspace_template" ]; then
    for f in workspace_template/*; do
        bn=$(basename "$f")
        [ ! -f "workspace/$bn" ] && cp "$f" "workspace/$bn" && echo "✅ 补齐: $bn"
    done
fi

# 4. 重构依赖
echo -e "\n⚙️ [4/6] 重新编译 Node.js 逻辑..."
npm install --no-optional && npm run build

# 5. Bashrc 同步更新 (兼容老版本 + 全新定界符架构)
BASHRC_FILE="$HOME/.bashrc"
APP_DIR=$(pwd)
echo -e "\n🧹 [5/6] 同步开机自启配置..."

# 🗡️ 清理第一阶段：狙击老版本用户的散装残留代码
sed -i '/wechat-bot/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/voice-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/image-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/sensor-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/memory-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/luma-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/自推 Wechat Bot 开机自启/d' "$BASHRC_FILE" 2>/dev/null || true

# 💣 清理第二阶段：爆破新架构的定界符区块（防重复写入）
sed -i '/# WECHAT_BOT_START_BEGIN/,/# WECHAT_BOT_START_END/d' "$BASHRC_FILE" 2>/dev/null || true

# 🧱 写入新版结构化定界符代码
cat <<EOF >> "$BASHRC_FILE"
# WECHAT_BOT_START_BEGIN
echo "🤖 正在检查并唤醒TA..."
start_engine() {
    local name=\$1
    local path=\$2
    local interpreter=\$3
    if ! pm2 ls | grep -q "\$name"; then
        echo "  正在拉起 \$name..."
        if [ -n "\$interpreter" ]; then
            pm2 start "\$path" --name "\$name" --interpreter "\$interpreter" > /dev/null 2>&1
        else
            pm2 start "\$path" --name "\$name" > /dev/null 2>&1
        fi
    fi
}
start_engine "wechat-bot" "$APP_DIR/bot.js"
start_engine "voice-engine" "$APP_DIR/voice-server.js"
start_engine "image-engine" "$APP_DIR/image-server.js"
start_engine "sensor-engine" "$APP_DIR/sensor.js"
start_engine "memory-engine" "$APP_DIR/summary.js"
if [ -d "$APP_DIR/luma2api" ]; then
    start_engine "luma-engine" "$APP_DIR/luma2api/app.py" "python3"
fi
pm2 save > /dev/null 2>&1
echo "✅ 全部就绪！"
# WECHAT_BOT_START_END
EOF

# 6. 重启服务
echo -e "\n🔄 [6/6] 重启后台引擎..."
pm2 restart all || true
pm2 save

echo "==================================================="
echo "🎉 更新圆满完成！"
echo "==================================================="
