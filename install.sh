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
    # Termux 环境
    pkg update -y
    pkg install -y git nodejs python ffmpeg
else
    # 普通 Linux 环境 (Ubuntu/Debian 等)
    sudo apt update
    sudo apt install -y git nodejs npm python3 python3-pip ffmpeg
fi

# 安装腾讯 SILK 魔改库
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

# 🌟github地址
git clone https://github.com/erin9057-oss/zitui-Wechat-bot.git openclaw-weixin
cd openclaw-weixin

# 4. 安装 Node.js 依赖并编译
echo -e "\n⚙️ [4/6] 正在安装 Node.js 依赖并编译 TypeScript..."
npm install
npm run build
npm install -g pm2

# 5. 交互式配置向导 (生成 config.json)
echo -e "\n📝 [5/6] 正在进入交互式配置向导..."
echo "请根据提示输入相应的 API Key 和参数 (直接按回车可使用括号内的默认值):"
echo "---------------------------------------------------"

# --- 大模型配置 ---
read -p "👉 [对话] 请输入聊天AI API地址,结尾需添加/v1，不要添加/chat/completions [默认: http://127.0.0.1:7861/v1]: " CHAT_API_BASE
CHAT_API_BASE=${CHAT_API_BASE:-"http://127.0.0.1:7861/v1"}

read -p "👉 [对话] 请输入聊天AI API Key: " CHAT_API_KEY

read -p "👉 [对话] 请输入 模型名称 若使用非哈基米LLM请在./workspace/API.JSON里修改对应参数 [默认: gemini-3.1-pro-preview-search]: " CHAT_MODEL
CHAT_MODEL=${CHAT_MODEL:-"gemini-3.1-pro-preview-search"}

# --- 生图配置 ---
echo "---------------------------------------------------"
read -p "👉 [生图] 请输入 Gemini 生图 目前只做了香蕉接口 API Key: " IMAGE_API_KEY

read -p "👉 [生图] 请输入 生图模型名称 [默认: gemini-3-pro-image-preview]: " IMAGE_MODEL
IMAGE_MODEL=${IMAGE_MODEL:-"gemini-3-pro-image-preview"}

# --- 语音配置 ---
echo "---------------------------------------------------"
echo "🎙️  语音回复 火山引擎 TTS 节点配置 (必填) 目前没有做别的接口"
read -p "👉 [TTS] 请输入 ByteDance AppID: " TTS_APPID
read -p "👉 [TTS] 请输入 ByteDance Token: " TTS_TOKEN
read -p "👉 [TTS] 请输入 Voice ID: " TTS_VOICE_ID

# --- 智能家居配置 ---
echo "---------------------------------------------------"
echo "🏠 智能家居 Miio 配置 (可选，不使用请直接回车跳过)"
read -p "👉 [Miio] 请输入 设备局域网 IP: " MIIO_IP
read -p "👉 [Miio] 请输入 设备 Token: " MIIO_TOKEN


# 🌟 生成动态 config.json 文件
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

# 6. 首次扫码登录与启动
echo "==================================================="
echo -e "\n📱 [6/6] 准备就绪！即将获取微信登录二维码..."
echo "⚠️ 请准备好手机微信。扫码并确认登录后，系统将自动启动所有服务。"
echo "==================================================="
sleep 3

# 执行扫码脚本 (该脚本会阻塞直到扫码成功或失败)
node login.js

# 检查是否成功生成了凭证
if ls accounts/*-im-bot.json 1> /dev/null 2>&1; then
    echo -e "\n✅ 检测到登录凭证，正在通过 PM2 启动后台引擎..."
    pm2 start bot.js --name "wechat-bot"
    pm2 start voice-server.js --name "voice-engine"
    pm2 start image-server.js --name "image-engine"
    pm2 save
    
    echo "==================================================="
    echo "🎉 自推 Wechat Bot 安装、配置及启动圆满完成！"
    echo "==================================================="
    echo "💡 提示 1：服务已在后台静默运行。你可以输入 'pm2 logs' 查看运行日志。"
    echo "💡 提示 2：如果未来需要添加多个 TTS 节点，请手动编辑 config.json (最多支持10个API轮询)。"
    echo "💡 提示 3：若要开机自启，建议在 ~/.bashrc 或 ~/.zshrc 末尾添加 'pm2 resurrect'。"
    echo "==================================================="
else
    echo "==================================================="
    echo "❌ 未检测到登录凭证。可能是二维码过期或扫码中断。"
    echo "请随时在目录 (~/WechatAI/openclaw-weixin) 下手动执行 'node login.js' 重新扫码。"
    echo "扫码成功后，执行以下命令启动服务："
    echo "pm2 start bot.js && pm2 start voice-server.js && pm2 start image-server.js"
    echo "==================================================="
fi
