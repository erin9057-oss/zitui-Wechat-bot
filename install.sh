#!/bin/bash

# ===================================================
# 🚀 自推 Wechat Bot 一键安装与配置向导
# ===================================================

echo "==================================================="
echo "🚀 欢迎使用 自推 Wechat Bot 一键安装程序"
echo "==================================================="

# 1. 环境检查与底层依赖安装
echo -e "\n📦 [1/6] 正在安装底层系统依赖 (FFmpeg & Python)..."
if command -v pkg >/dev/null 2>&1; then
    pkg update -y
    pkg install -y git nodejs python ffmpeg
else
    sudo apt update
    sudo apt install -y git nodejs npm python3 python3-pip ffmpeg
fi

echo "正在安装鹅语音 Python 依赖 (pilk)..."
pip3 install pilk

# 2. 创建标准目录结构
echo -e "\n📁 [2/6] 正在构建文件系统结构..."
mkdir -p ~/WechatAI
cd ~/WechatAI

# 3. 拉取 GitHub 仓库
echo -e "\n📥 [3/6] 正在从 GitHub 拉取核心代码..."
if [ -d "openclaw-weixin" ]; then
    echo "⚠️ 检测到已存在 openclaw-weixin 目录，正在备份旧版本..."
    mv openclaw-weixin "openclaw-weixin_backup_$(date +%s)"
fi

git clone https://github.com/erin9057-oss/zitui-Wechat-bot.git openclaw-weixin
cd openclaw-weixin

# 4. 安装 Node.js 依赖并编译
echo -e "\n⚙️ [4/6] 正在安装 Node.js 依赖并编译 TypeScript..."
npm install
npm run build
npm install -g pm2

# ===================================================
# 🌟 初始化用户工作区 (Workspace) 与凭证目录 (Accounts)
# ===================================================
echo -e "\n🧠 正在检查人设工作区与凭证目录..."

if [ ! -d "accounts" ]; then
    mkdir -p accounts
    echo "✅ 凭证目录 (accounts) 已就绪，等待扫码接入。"
else
    echo "✅ 检测到本地已有 accounts 文件夹，将为您保留历史登录记录。"
fi

if [ ! -d "workspace" ] || [ -z "$(ls -A workspace 2>/dev/null)" ]; then
    echo "📦 正在从 workspace_template 注入出厂人设与 API 配置文件..."
    mkdir -p workspace
    cp -r workspace_template/* workspace/ 2>/dev/null || true
    echo "✅ 工作区 (workspace) 初始化完毕！用户后续可自由修改 MD 文件与 API.json。"
else
    echo "✅ 检测到本地已有 workspace 数据，跳过初始化以保护原有配置。"
fi
# ===================================================

# 5. 交互式配置向导 (生成 config.json)
echo -e "\n📝 [5/6] 正在进入交互式配置向导..."
echo "请根据提示输入相应的 API Key 和参数 (直接按回车可使用括号内的默认值):"
echo "---------------------------------------------------"

read -p "👉 [对话] 请输入聊天AI API地址,结尾需添加/v1，不要添加/chat/completions [默认: http://127.0.0.1:7861/v1]: " CHAT_API_BASE < /dev/tty
CHAT_API_BASE=${CHAT_API_BASE:-"http://127.0.0.1:7861/v1"}

read -p "👉 [对话] 请输入聊天AI API Key: " CHAT_API_KEY < /dev/tty

read -p "👉 [对话] 请输入 模型名称 若使用非哈基米LLM请在./workspace/API.JSON里修改对应参数 [默认: gemini-3.1-pro-preview-search]: " CHAT_MODEL < /dev/tty
CHAT_MODEL=${CHAT_MODEL:-"gemini-3.1-pro-preview-search"}

echo "---------------------------------------------------"
read -p "👉 [生图] 请输入 Gemini 生图 目前只做了香蕉接口 API Key: " IMAGE_API_KEY < /dev/tty

read -p "👉 [生图] 请输入 生图模型名称 [默认: gemini-3-pro-image-preview]: " IMAGE_MODEL < /dev/tty
IMAGE_MODEL=${IMAGE_MODEL:-"gemini-3-pro-image-preview"}

echo "---------------------------------------------------"
echo "🎙️  语音回复 火山引擎 TTS 节点配置 (必填) 目前没有做别的接口"
read -p "👉 [TTS] 请输入 ByteDance AppID: " TTS_APPID < /dev/tty
read -p "👉 [TTS] 请输入 ByteDance Token: " TTS_TOKEN < /dev/tty
read -p "👉 [TTS] 请输入 Voice ID: " TTS_VOICE_ID < /dev/tty

echo "---------------------------------------------------"
echo "🏠 智能家居 Miio 配置 (可选，不使用请直接回车跳过)"
read -p "👉 [Miio] 请输入 设备局域网 IP: " MIIO_IP < /dev/tty
read -p "👉 [Miio] 请输入 设备 Token: " MIIO_TOKEN < /dev/tty

echo -e "\n🪄 正在生成 config.json 配置文件..."

cat <<EOF > ~/WechatAI/openclaw-weixin/config.json
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

# ===================================================
# 6. 首次扫码登录与启动
# ===================================================
echo "==================================================="
echo -e "\n📱 [6/6] 检查微信登录状态..."

if ls accounts/*-im-bot.json 1> /dev/null 2>&1; then
    echo "✅ 检测到本地已存在微信登录凭证，跳过扫码环节，完美继承原有状态！"
else
    echo "⚠️ 即将获取微信登录二维码..."
    echo "请准备好手机微信。如暂不方便扫码，可直接按回车跳过此步骤。"
    sleep 2
    # 🚨 核心修复：防止 login.js 吃掉后面的脚本代码
    node login.js < /dev/tty
fi
echo "==================================================="

# 🌟 强制配置 PM2 守护进程
echo -e "\n✅ 正在通过 PM2 启动并注册后台引擎..."

APP_DIR="$HOME/WechatAI/openclaw-weixin"

pm2 start "$APP_DIR/bot.js" --name "wechat-bot"
pm2 start "$APP_DIR/voice-server.js" --name "voice-engine"
pm2 start "$APP_DIR/image-server.js" --name "image-engine"
pm2 start "$APP_DIR/sensor.js" --name "sensor-engine"
pm2 start "$APP_DIR/summary.js" --name "memory-engine"

pm2 save

BASHRC_FILE="$HOME/.bashrc"
if ! grep -q "wechat-bot" "$BASHRC_FILE"; then
    echo -e "\n# 自推 Wechat Bot 开机自启" >> "$BASHRC_FILE"
    echo "pm2 start $APP_DIR/bot.js --name \"wechat-bot\" 2>/dev/null || true" >> "$BASHRC_FILE"
    echo "pm2 start $APP_DIR/voice-server.js --name \"voice-engine\" 2>/dev/null || true" >> "$BASHRC_FILE"
    echo "pm2 start $APP_DIR/image-server.js --name \"image-engine\" 2>/dev/null || true" >> "$BASHRC_FILE"
    echo "pm2 start $APP_DIR/sensor.js --name \"sensor-engine\" 2>/dev/null || true" >> "$BASHRC_FILE"
    echo "pm2 start $APP_DIR/summary.js --name \"memory-engine\" 2>/dev/null || true" >> "$BASHRC_FILE"
    echo "配置开机自启完成: 已注入绝对路径启动命令至 ~/.bashrc"
else
    echo "配置开机自启完成: 检测到 ~/.bashrc 中已有相关配置"
fi

echo "==================================================="
echo "🎉 自推 Wechat Bot 安装、配置及后台注册圆满完成！"
echo "==================================================="
if ls accounts/*-im-bot.json 1> /dev/null 2>&1; then
    echo "✅ 已检测到有效登录凭证，机器人已上线就绪！"
else
    echo "⚠️ 您刚才跳过了扫码环节，目前机器人尚无登录凭证。"
    echo "👉 请在准备好手机时，进入目录 ($APP_DIR) 手动执行 'node login.js' 扫码。"
    echo "扫码完成后机器人将自动接管消息，无需重启。"
fi
echo "💡 提示 1：服务已在后台静默运行。你可以输入 'pm2 logs' 查看运行日志。"
echo "💡 提示 2：如果未来需要添加多个 TTS 节点，请手动编辑 config.json。"
echo "==================================================="
