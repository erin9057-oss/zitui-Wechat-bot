# 🚀 Zitui Wechat Bot

**English** | [简体中文](./README.zh_CN.md)

**Zitui Wechat Bot** is a multi-modal WeChat AI bot framework based on a standalone gateway architecture. 
Originating from Tencent's open-source underlying communication protocols, this project has been heavily refactored to strip away bulky outer frameworks. It is designed specifically for immersive Role-Playing (RP) and ultimate personal AI assistants.

## ✨ Key Features

- 🧠 **LLM Driven**: Seamlessly connects to any OpenAI-compatible LLM interface (Gemini / Claude / ChatGPT, etc.) with deep support for System Prompt hot-reloading.
- 🎨 **AI Image Generation**: Deeply integrated with Gemini's multi-modal capabilities. Supports reference images for facial feature locking and automatically sends photos disguised as WeChat image bubbles.
- 🎙️ **Visualized Voice Bubbles**: Connects to Volcengine (ByteDance) TTS nodes. Automatically uses FFmpeg to transcode audio into video bubbles with fake "duration watermarks", perfectly mimicking native WeChat voice messages.
- 💡 **Physical Reality Control (IoT)**: Integrated with the Miio protocol. The AI can control your real-world smart home devices (like Yeelight) through invisible commands in the chat (e.g., `[物理:开灯]`).
- 📦 **One-Click Deployment**: Comes with a highly automated, interactive installation script tailored for Termux and Linux. QR code login via terminal, eliminating tedious environment setups.

## 🚀 Quick Start

### 1. One-Click Installation

Whether you are using Android Termux or a Linux server, simply run the following command in your terminal:

```bash
bash <(curl -sSL [https://raw.githubusercontent.com/erin9057-oss/zitui-Wechat-bot/main/install.sh](https://raw.githubusercontent.com/erin9057-oss/zitui-Wechat-bot/main/install.sh))

```
*The script will automatically install Node.js, Python, FFmpeg, configure dependencies, and guide you to fill in your API Keys.*
### 2. QR Code Login
After installation, navigate to the project directory and run the standalone login script:
```bash
cd ~/WechatAI/openclaw-weixin
node login.js

```
A QR code will appear in your terminal. Use the WeChat account you intend to use as the bot to scan and confirm. Credentials will be securely saved in the accounts/ directory.
### 3. Start the Engines
Once logged in, start all micro-services using PM2:
```bash
pm2 start bot.js --name "wechat-bot"
pm2 start voice-server.js --name "voice-engine"
pm2 start image-server.js --name "image-engine"
pm2 save

```
## ⚙️ Advanced Configuration & Persona Customization
This project strictly separates code from prompts (100% isolation), making it incredibly easy to customize:
 * **Connections & Keys**: config.json (Manage all API keys, URLs, and device IPs).
 * **LLM Parameters**: workspace/API.json (Control Temperature, Top_p, and Safety Settings).
 * **Persona & Soul**: All rules are stored in .md files under the workspace/ directory.
   * AGENTS.md: Core logic and memory management protocols.
   * IMAGE.md / VOICE.md / MIIO.md: Dynamic rule injections for extended capabilities.
> 💡 **Dynamic Capability Awareness**: If you leave the Image or TTS API keys blank in config.json, the system will **automatically hide** the corresponding instructions from the LLM prompt. This maximizes token savings and prevents AI hallucinations!
> 
## Acknowledgements
 * Thanks to Tencent for the underlying WeChat protocol support.
 * Parts of the decryption and communication code are modified from the open-source community under the MIT License.
## License
This project is licensed under the MIT License.
