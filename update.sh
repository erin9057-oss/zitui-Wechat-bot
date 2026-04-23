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
cp -r luma2api "$BACKUP_DIR/" 2>/dev/null || true

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

if [ -d "workspace_template" ]; then
    for f in workspace_template/*; do
        bn=$(basename "$f")
        [ ! -f "workspace/$bn" ] && cp "$f" "workspace/$bn" && echo "✅ 补齐: $bn"
    done
fi

# 4. 重构依赖
echo -e "\n⚙️ [4/6] 重新编译 Node.js 逻辑..."
npm install --no-optional && npm run build

# 5. Bashrc 同步更新
BASHRC_FILE="$HOME/.bashrc"
APP_DIR=$(pwd)
echo -e "\n🧹 [5/6] 同步开机自启配置..."

sed -i '/wechat-bot/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/voice-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/image-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/sensor-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/memory-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/luma-engine/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/自推 Wechat Bot 开机自启/d' "$BASHRC_FILE" 2>/dev/null || true
sed -i '/# WECHAT_BOT_START_BEGIN/,/# WECHAT_BOT_START_END/d' "$BASHRC_FILE" 2>/dev/null || true

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
echo "⚠️ 【极其重要】架构升级提醒"
echo "由于底层架构全面升级为 {{char}} 和 {{user}} 占位符，预设中不再硬编码名字。"
echo "若尚未在config.json设置过名字请前往 config.json 或【酒馆前端桥接插件】的“基础配置”中，"
echo "重新设置并保存一次「自推角色名称」和「你的名称」！"
echo "config.json未配置名字的情况下，机器人在微信中将进入新用户引导模式并拒绝聊天。"
echo "==================================================="
echo "🎉 更新圆满完成！"
echo "==================================================="
