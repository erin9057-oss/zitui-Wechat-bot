#!/bin/bash
set -e

# ===================================================
# 自推 Wechat Bot 一键安装与迁移向导
# ===================================================

REPO_URL="https://github.com/erin9057-oss/zitui-Wechat-bot.git"
BASE_DIR="$HOME/WechatAI"
APP_DIR="$BASE_DIR/openclaw-weixin"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$BASE_DIR/openclaw-weixin_backup_$TIMESTAMP"
MIGRATION_DIR="$BASE_DIR/.zitui_migration_$TIMESTAMP"

打印标题() {
    echo "==================================================="
    echo "🚀 欢迎使用 自推 Wechat Bot 安装程序"
    echo "==================================================="
}

复制若存在() {
    local source_path="$1"
    local target_path="$2"
    if [ -e "$source_path" ]; then
        mkdir -p "$(dirname "$target_path")"
        cp -a "$source_path" "$target_path"
    fi
}

迁移旧数据到临时区() {
    if [ ! -d "$APP_DIR" ]; then
        return
    fi

    echo "📦 检测到已有目录，正在提取灵魂数据（含 luma2api & ref.jpg）..."
    mkdir -p "$MIGRATION_DIR"

    # 核心数据迁移清单
    复制若存在 "$APP_DIR/accounts" "$MIGRATION_DIR/accounts"
    复制若存在 "$APP_DIR/workspace" "$MIGRATION_DIR/workspace"
    复制若存在 "$APP_DIR/Memory" "$MIGRATION_DIR/Memory"
    复制若存在 "$APP_DIR/config.json" "$MIGRATION_DIR/config.json"
    复制若存在 "$APP_DIR/sensor_map.json" "$MIGRATION_DIR/sensor_map.json"
    复制若存在 "$APP_DIR/ref.jpg" "$MIGRATION_DIR/ref.jpg"
    复制若存在 "$APP_DIR/luma2api" "$MIGRATION_DIR/luma2api"

    if [ -d "$MIGRATION_DIR/accounts" ]; then
        echo "✅ 数据迁移已就绪。"
    fi
}

恢复迁移数据() {
    if [ ! -d "$MIGRATION_DIR" ]; then
        return
    fi

    echo "🔁 正在恢复历史数据到新版本目录..."
    复制若存在 "$MIGRATION_DIR/accounts" "$APP_DIR/accounts"
    复制若存在 "$MIGRATION_DIR/workspace" "$APP_DIR/workspace"
    复制若存在 "$MIGRATION_DIR/Memory" "$APP_DIR/Memory"
    复制若存在 "$MIGRATION_DIR/config.json" "$APP_DIR/config.json"
    复制若存在 "$MIGRATION_DIR/sensor_map.json" "$APP_DIR/sensor_map.json"
    复制若存在 "$MIGRATION_DIR/ref.jpg" "$APP_DIR/ref.jpg"
    复制若存在 "$MIGRATION_DIR/luma2api" "$APP_DIR/luma2api"
    rm -rf "$MIGRATION_DIR"
}

生成默认传感映射() {
    if [ -f "$APP_DIR/sensor_map.json" ]; then return; fi
    echo "{}" > "$APP_DIR/sensor_map.json"
}

# 🌟 核心修复：全量初始化工作区模板
生成默认运行策略() {
    echo "📂 正在初始化工作区模板与灵魂设定..."
    mkdir -p "$APP_DIR/workspace"
    if [ -d "$APP_DIR/workspace_template" ]; then
        for f in "$APP_DIR/workspace_template"/*; do
            if [ -f "$f" ]; then
                bn=$(basename "$f")
                # 只有当目标文件不存在时才释放模板，防止覆盖用户已有的自定义设定
                if [ ! -f "$APP_DIR/workspace/$bn" ]; then
                    cp "$f" "$APP_DIR/workspace/$bn"
                    echo "  ✅ 已释放: $bn"
                fi
            fi
        done
    fi
}

写入新配置() {
    echo -e "\n📝 [5/6] 正在进入交互式配置向导..."
    echo "==================================================="
    echo "⚠️ 身份绑定（必填项，开启占位符架构核心）"
    echo "==================================================="
    
    while true; do
        read -p "👉 [必填] 请输入 AI 伴侣的名称: " CHAR_NAME < /dev/tty
        if [ -n "$(echo "$CHAR_NAME" | tr -d ' ')" ]; then
            break
        else
            echo "❌ 角色名称不能为空，请重新输入！"
        fi
    done

    while true; do
        read -p "👉 [必填] 请输入你的名称/称呼: " USER_NAME < /dev/tty
        if [ -n "$(echo "$USER_NAME" | tr -d ' ')" ]; then
            break
        else
            echo "❌ 用户名称不能为空，请重新输入！"
        fi
    done

    echo "==================================================="
    echo "请根据提示输入相应的 API Key 和参数（除聊天API外均可选，直接回车可跳过）。"
    echo "---------------------------------------------------"

    read -p "👉 [对话] 请输入聊天 AI API 地址 [默认: http://127.0.0.1:7861/v1]: " CHAT_API_BASE < /dev/tty
    CHAT_API_BASE=${CHAT_API_BASE:-"http://127.0.0.1:7861/v1"}

    read -p "👉 [对话] 请输入聊天 AI API Key: " CHAT_API_KEY < /dev/tty

    read -p "👉 [对话] 请输入模型名称 [默认: gemini-3.1-pro-preview-search]: " CHAT_MODEL < /dev/tty
    CHAT_MODEL=${CHAT_MODEL:-"gemini-3.1-pro-preview-search"}

    echo "---------------------------------------------------"
    read -p "👉 [生图] 请输入 Gemini 生图 API Key: " IMAGE_API_KEY < /dev/tty

    read -p "👉 [生图] 请输入生图模型名称 [默认: gemini-3-pro-image-preview]: " IMAGE_MODEL < /dev/tty
    IMAGE_MODEL=${IMAGE_MODEL:-"gemini-3-pro-image-preview"}

    echo "---------------------------------------------------"
    echo "🎙️  语音回复火山引擎 TTS 节点配置"
    read -p "👉 [TTS] 请输入 ByteDance AppID: " TTS_APPID < /dev/tty
    read -p "👉 [TTS] 请输入 ByteDance Token: " TTS_TOKEN < /dev/tty
    read -p "👉 [TTS] 请输入 Voice ID: " TTS_VOICE_ID < /dev/tty

    echo "---------------------------------------------------"
    echo "🏠 智能家居 Miio 配置（可选）"
    read -p "👉 [Miio] 请输入设备局域网 IP: " MIIO_IP < /dev/tty
    read -p "👉 [Miio] 请输入设备 Token: " MIIO_TOKEN < /dev/tty

    echo -e "\n🪄 正在生成 config.json 配置文件..."

    cat <<EOF > "$APP_DIR/config.json"
{
  "profile": {
    "char_name": "$CHAR_NAME",
    "user_name": "$USER_NAME"
  },
  "chat_llm": { "api_base_url": "$CHAT_API_BASE", "api_key": "$CHAT_API_KEY", "model_name": "$CHAT_MODEL" },
  "services": {
    "image_server_url": "http://127.0.0.1:7862/v1/images/generations",
    "voice_server_url": "http://127.0.0.1:7863/v1/voice/generations"
  },
  "tts": {
    "url": "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
    "credentials": [{ "appid": "$TTS_APPID", "token": "$TTS_TOKEN", "voiceId": "$TTS_VOICE_ID" }]
  },
  "image_generation": {
    "api_key": "$IMAGE_API_KEY",
    "model_name": "$IMAGE_MODEL",
    "reference_image_path": "$APP_DIR/ref.jpg"
  },
  "miio": { "ip": "$MIIO_IP", "token": "$MIIO_TOKEN" }
}
EOF
}

打印标题

# 1. 环境检查
echo -e "\n📦 [1/6] 检查系统依赖..."
if command -v pkg >/dev/null 2>&1; then
    MISSING_DEPS=""
    command -v git >/dev/null 2>&1 || MISSING_DEPS+=" git"
    command -v node >/dev/null 2>&1 || MISSING_DEPS+=" nodejs-lts"
    command -v python >/dev/null 2>&1 || MISSING_DEPS+=" python"
    command -v ffmpeg >/dev/null 2>&1 || MISSING_DEPS+=" ffmpeg"
    if [ -n "$MISSING_DEPS" ]; then
        pkg update -y && pkg install -y $MISSING_DEPS
    fi
else
    MISSING_DEPS=""
    command -v git >/dev/null 2>&1 || MISSING_DEPS+=" git"
    command -v node >/dev/null 2>&1 || MISSING_DEPS+=" nodejs npm"
    command -v python3 >/dev/null 2>&1 || MISSING_DEPS+=" python3 python3-pip"
    command -v ffmpeg >/dev/null 2>&1 || MISSING_DEPS+=" ffmpeg"
    if [ -n "$MISSING_DEPS" ]; then
        sudo apt update && sudo apt install -y $MISSING_DEPS
    fi
fi

if ! python -c "import pilk" >/dev/null 2>&1 && ! python3 -c "import pilk" >/dev/null 2>&1; then
    pip3 install pilk || pip install pilk
fi

# 2. 目录构建与迁移
echo -e "\n📁 [2/6] 构建目录与数据迁移..."
mkdir -p "$BASE_DIR"
cd "$BASE_DIR"
迁移旧数据到临时区

if [ -d "$APP_DIR" ]; then
    mv "$APP_DIR" "$BACKUP_DIR"
fi

git clone "$REPO_URL" openclaw-weixin
cd "$APP_DIR"
恢复迁移数据

# 3. 安装与编译
echo -e "\n⚙️ [4/6] 安装 Node.js 依赖..."
npm install && npm run build
command -v pm2 >/dev/null 2>&1 || npm install -g pm2

# 4. 初始化
mkdir -p accounts workspace Memory
生成默认传感映射
生成默认运行策略
[ -f "$APP_DIR/config.json" ] || 写入新配置

# 5. Bashrc 同步更新
BASHRC_FILE="$HOME/.bashrc"
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

echo "==================================================="
echo -e "\n📱 [6/6] 检查微信登录状态..."
if ls accounts/*-im-bot.json 1> /dev/null 2>&1; then
    echo "✅ 检测到本地已存在微信登录凭证，跳过扫码环节。"
else
    echo "⚠️ 即将获取微信登录二维码..."
    sleep 2
    node login.js < /dev/tty || true
fi

echo -e "\n✅ 正在通过 PM2 启动并注册后台引擎..."
pm2 start "$APP_DIR/bot.js" --name "wechat-bot" || pm2 restart "wechat-bot"
pm2 start "$APP_DIR/voice-server.js" --name "voice-engine" || pm2 restart "voice-engine"
pm2 start "$APP_DIR/image-server.js" --name "image-engine" || pm2 restart "image-engine"
pm2 start "$APP_DIR/sensor.js" --name "sensor-engine" || pm2 restart "sensor-engine"
pm2 start "$APP_DIR/summary.js" --name "memory-engine" || pm2 restart "memory-engine"
pm2 save

echo "==================================================="
echo "🎉 自推 Wechat Bot 安装、迁移与后台注册完成！"
echo "==================================================="
