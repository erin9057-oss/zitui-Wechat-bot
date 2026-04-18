#!/bin/bash
set -e

# ===================================================
# 自推 Wechat Bot Enhanced 一键安装与迁移向导
# ===================================================

REPO_URL="https://github.com/erin9057-oss/zitui-Wechat-bot-enhanced.git"
BASE_DIR="$HOME/WechatAI"
APP_DIR="$BASE_DIR/openclaw-weixin"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$BASE_DIR/openclaw-weixin_backup_$TIMESTAMP"
MIGRATION_DIR="$BASE_DIR/.zitui_migration_$TIMESTAMP"

打印标题() {
    echo "==================================================="
    echo "🚀 欢迎使用 自推 Wechat Bot Enhanced 安装程序"
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

    echo "📦 检测到已有 openclaw-weixin 目录，正在提取关键数据用于安全迁移..."
    mkdir -p "$MIGRATION_DIR"

    复制若存在 "$APP_DIR/accounts" "$MIGRATION_DIR/accounts"
    复制若存在 "$APP_DIR/workspace" "$MIGRATION_DIR/workspace"
    复制若存在 "$APP_DIR/Memory" "$MIGRATION_DIR/Memory"
    复制若存在 "$APP_DIR/config.json" "$MIGRATION_DIR/config.json"
    复制若存在 "$APP_DIR/sensor_map.json" "$MIGRATION_DIR/sensor_map.json"

    if [ -d "$MIGRATION_DIR/accounts" ]; then
        echo "✅ 已迁移最高优先级目录 accounts/ 到临时安全区。"
    else
        echo "ℹ️ 旧目录中未发现 accounts/，将按全新安装流程继续。"
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
    rm -rf "$MIGRATION_DIR"
}

生成默认传感映射() {
    if [ -f "$APP_DIR/sensor_map.json" ]; then
        echo "✅ 检测到现有 sensor_map.json，保持不变。"
        return
    fi

    cat <<'EOF' > "$APP_DIR/sensor_map.json"
{}
EOF
    echo "✅ 已生成默认 sensor_map.json。"
}

生成默认运行策略() {
    mkdir -p "$APP_DIR/workspace"

    if [ ! -f "$APP_DIR/workspace/plugin_runtime.json" ] && [ -f "$APP_DIR/workspace_template/plugin_runtime.json" ]; then
        cp "$APP_DIR/workspace_template/plugin_runtime.json" "$APP_DIR/workspace/plugin_runtime.json"
        echo "✅ 已生成 plugin_runtime.json。"
    fi

    if [ ! -f "$APP_DIR/workspace/active_memory.json" ] && [ -f "$APP_DIR/workspace_template/active_memory.json" ]; then
        cp "$APP_DIR/workspace_template/active_memory.json" "$APP_DIR/workspace/active_memory.json"
        echo "✅ 已生成 active_memory.json。"
    fi
}

写入新配置() {
    echo -e "\n📝 [5/6] 正在进入交互式配置向导..."
    echo "请根据提示输入相应的 API Key 和参数（直接按回车可使用默认值）。"
    echo "---------------------------------------------------"

    read -p "👉 [对话] 请输入聊天 AI API 地址，结尾需添加 /v1，不要添加 /chat/completions [默认: http://127.0.0.1:7861/v1]: " CHAT_API_BASE < /dev/tty
    CHAT_API_BASE=${CHAT_API_BASE:-"http://127.0.0.1:7861/v1"}

    read -p "👉 [对话] 请输入聊天 AI API Key: " CHAT_API_KEY < /dev/tty

    read -p "👉 [对话] 请输入模型名称 [默认: gemini-3.1-pro-preview-search]: " CHAT_MODEL < /dev/tty
    CHAT_MODEL=${CHAT_MODEL:-"gemini-3.1-pro-preview-search"}

    echo "---------------------------------------------------"
    read -p "👉 [生图] 请输入 Gemini 生图 API Key: " IMAGE_API_KEY < /dev/tty

    read -p "👉 [生图] 请输入生图模型名称 [默认: gemini-3-pro-image-preview]: " IMAGE_MODEL < /dev/tty
    IMAGE_MODEL=${IMAGE_MODEL:-"gemini-3-pro-image-preview"}

    echo "---------------------------------------------------"
    echo "🎙️ 语音回复火山引擎 TTS 节点配置"
    read -p "👉 [TTS] 请输入 ByteDance AppID: " TTS_APPID < /dev/tty
    read -p "👉 [TTS] 请输入 ByteDance Token: " TTS_TOKEN < /dev/tty
    read -p "👉 [TTS] 请输入 Voice ID: " TTS_VOICE_ID < /dev/tty

    echo "---------------------------------------------------"
    echo "🏠 智能家居 Miio 配置（可选，不使用请直接回车跳过）"
    read -p "👉 [Miio] 请输入设备局域网 IP: " MIIO_IP < /dev/tty
    read -p "👉 [Miio] 请输入设备 Token: " MIIO_TOKEN < /dev/tty

    echo -e "\n🪄 正在生成 config.json 配置文件..."

    cat <<EOF > "$APP_DIR/config.json"
{
  "chat_llm": {
    "api_base_url": "$CHAT_API_BASE",
    "api_key": "$CHAT_API_KEY",
    "model_name": "$CHAT_MODEL"
  },
  "services": {
    "image_server_url": "http://127.0.0.1:7862/v1/images/generations",
    "voice_server_url": "http://127.0.0.1:7863/v1/voice/generations"
  },
  "tts": {
    "url": "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
    "credentials": [
      { "appid": "$TTS_APPID", "token": "$TTS_TOKEN", "voiceId": "$TTS_VOICE_ID" }
    ]
  },
  "image_generation": {
    "api_key": "$IMAGE_API_KEY",
    "model_name": "$IMAGE_MODEL",
    "reference_image_path": "/data/data/com.termux/files/home/WechatAI/openclaw-weixin/ref.jpg"
  },
  "voice_generation": {
    "cover_image_path": "/data/data/com.termux/files/home/WechatAI/openclaw-weixin/voice.png",
    "font_path": "/system/fonts/Roboto-Bold.ttf"
  },
  "miio": {
    "ip": "$MIIO_IP",
    "token": "$MIIO_TOKEN"
  }
}
EOF
}

打印标题

# ===================================================
# 1. 环境检查与底层依赖安装 (🌟 智能探测版)
# ===================================================

echo -e "\n📦 [1/6] 正在检查底层系统依赖..."

if command -v pkg >/dev/null 2>&1; then
    # Termux 环境：精准探测，缺啥补啥
    MISSING_DEPS=""
    command -v git >/dev/null 2>&1 || MISSING_DEPS+=" git"
    command -v node >/dev/null 2>&1 || MISSING_DEPS+=" nodejs-lts" # 🌟 核心：用户没有装才装，而且装最稳定的 LTS 版
    command -v python >/dev/null 2>&1 || MISSING_DEPS+=" python"
    command -v ffmpeg >/dev/null 2>&1 || MISSING_DEPS+=" ffmpeg"

    if [ -n "$MISSING_DEPS" ]; then
        echo "⏳ 检测到缺失依赖:$MISSING_DEPS，正在为您安全安装..."
        pkg update -y
        pkg install -y $MISSING_DEPS
    else
        echo "✅ 底层系统依赖已全部满足，跳过系统级安装，完美保护您的现有环境！"
    fi
else
    # Linux 环境
    MISSING_DEPS=""
    command -v git >/dev/null 2>&1 || MISSING_DEPS+=" git"
    command -v node >/dev/null 2>&1 || MISSING_DEPS+=" nodejs npm"
    command -v python3 >/dev/null 2>&1 || MISSING_DEPS+=" python3 python3-pip"
    command -v ffmpeg >/dev/null 2>&1 || MISSING_DEPS+=" ffmpeg"

    if [ -n "$MISSING_DEPS" ]; then
        echo "⏳ 检测到缺失依赖:$MISSING_DEPS，正在为您安全安装..."
        sudo apt update
        sudo apt install -y $MISSING_DEPS
    else
        echo "✅ 底层系统依赖已全部满足，跳过系统级安装，完美保护您的现有环境！"
    fi
fi

# 检查 Python Pilk
echo -e "\n🐍 检查 Python 依赖..."
if ! python -c "import pilk" >/dev/null 2>&1 && ! python3 -c "import pilk" >/dev/null 2>&1; then
    echo "正在安装鹅语音 Python 依赖 (pilk)..."
    pip3 install pilk || pip install pilk
else
    echo "✅ Python 依赖 (pilk) 已安装，跳过。"
fi


# 2. 创建标准目录结构

echo -e "\n📁 [2/6] 正在构建文件系统结构..."
mkdir -p "$BASE_DIR"
cd "$BASE_DIR"

# 3. 迁移旧数据并拉取增强版仓库

echo -e "\n📥 [3/6] 正在准备拉取增强版仓库..."
迁移旧数据到临时区
if [ -d "$APP_DIR" ]; then
    echo "⚠️ 旧版本目录将整体备份到: $BACKUP_DIR"
    mv "$APP_DIR" "$BACKUP_DIR"
fi

git clone "$REPO_URL" openclaw-weixin
cd "$APP_DIR"
恢复迁移数据

# 4. 安装 Node.js 依赖并编译

echo -e "\n⚙️ [4/6] 正在安装 Node.js 依赖并编译 TypeScript..."
npm install
npm run build

# 检查并安装 PM2
if ! command -v pm2 >/dev/null 2>&1; then
    echo "正在全局安装守护进程管理器 (pm2)..."
    npm install -g pm2
fi

# 4.5 初始化工作区

echo -e "\n🧠 正在检查工作区与凭证目录..."
mkdir -p accounts
if [ ! -d "workspace" ] || [ -z "$(ls -A workspace 2>/dev/null)" ]; then
    echo "📦 正在从 workspace_template 注入默认工作区..."
    mkdir -p workspace
    cp -r workspace_template/* workspace/ 2>/dev/null || true
else
    echo "✅ 检测到已有 workspace 数据，保持不变。"
fi

mkdir -p Memory
生成默认传感映射
生成默认运行策略

if [ -f "$APP_DIR/config.json" ]; then
    echo -e "\n✅ 检测到已有 config.json，将保持原配置，不覆盖。"
else
    写入新配置
fi

# 6. 首次扫码登录与启动

echo "==================================================="
echo -e "\n📱 [6/6] 检查微信登录状态..."

if ls accounts/*-im-bot.json 1> /dev/null 2>&1; then
    echo "✅ 检测到本地已存在微信登录凭证，跳过扫码环节。"
else
    echo "⚠️ 即将获取微信登录二维码..."
    echo "请准备好手机微信。如暂不方便扫码，可直接按回车跳过此步骤。"
    sleep 2
    node login.js < /dev/tty || true
fi

echo "==================================================="
echo -e "\n✅ 正在通过 PM2 启动并注册后台引擎..."

pm2 start "$APP_DIR/bot.js" --name "wechat-bot" || pm2 restart "wechat-bot"
pm2 start "$APP_DIR/voice-server.js" --name "voice-engine" || pm2 restart "voice-engine"
pm2 start "$APP_DIR/image-server.js" --name "image-engine" || pm2 restart "image-engine"
pm2 start "$APP_DIR/sensor.js" --name "sensor-engine" || pm2 restart "sensor-engine"
pm2 start "$APP_DIR/summary.js" --name "memory-engine" || pm2 restart "memory-engine"
pm2 save

BASHRC_FILE="$HOME/.bashrc"
sed -i '/wechat-bot/d' "$BASHRC_FILE" || true
sed -i '/voice-engine/d' "$BASHRC_FILE" || true
sed -i '/image-engine/d' "$BASHRC_FILE" || true
sed -i '/sensor-engine/d' "$BASHRC_FILE" || true
sed -i '/memory-engine/d' "$BASHRC_FILE" || true
sed -i '/自推 Wechat Bot 开机自启/d' "$BASHRC_FILE" || true

echo "# 自推 Wechat Bot 开机自启" >> "$BASHRC_FILE"
echo "pm2 start $APP_DIR/bot.js --name \"wechat-bot\" 2>/dev/null || true" >> "$BASHRC_FILE"
echo "pm2 start $APP_DIR/voice-server.js --name \"voice-engine\" 2>/dev/null || true" >> "$BASHRC_FILE"
echo "pm2 start $APP_DIR/image-server.js --name \"image-engine\" 2>/dev/null || true" >> "$BASHRC_FILE"
echo "pm2 start $APP_DIR/sensor.js --name \"sensor-engine\" 2>/dev/null || true" >> "$BASHRC_FILE"
echo "pm2 start $APP_DIR/summary.js --name \"memory-engine\" 2>/dev/null || true" >> "$BASHRC_FILE"

echo "==================================================="
echo "🎉 自推 Wechat Bot Enhanced 安装、迁移与后台注册完成！"
echo "==================================================="
echo "✅ 当前仓库来源：$REPO_URL"
echo "✅ 历史目录备份：$BACKUP_DIR"
echo "✅ accounts/ 已被视为最高优先级数据并优先迁移。"
echo "💡 正确的一键安装命令：bash <(curl -sSL https://raw.githubusercontent.com/erin9057-oss/zitui-Wechat-bot-enhanced/main/install.sh)"
echo "==================================================="
