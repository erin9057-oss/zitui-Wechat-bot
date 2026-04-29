![banner](https://github.com/user-attachments/assets/f199318c-2d14-4ed6-9ef8-646e17f3040d)

# 🚀 Zitui Wechat Bot

**English** | [简体中文](./README.zh_CN.md)

**Zitui Wechat Bot** is a multi-modal WeChat AI bot framework based on a standalone gateway architecture. 
Originating from Tencent's open-source underlying communication protocols, this project has been heavily refactored to strip away bulky outer frameworks. It is designed specifically for immersive Role-Playing (RP) and ultimate personal AI assistants.

## ✨ Key Features

- 🧠 **LLM Driven**: Seamlessly connects to any OpenAI-compatible LLM interface (Gemini / Claude / DeepSeek, etc.) with deep support for System Prompt hot-reloading.
- 📱 **Cross-Dimensional Sensor Integration**: Connects with MacroDroid/Tasker to monitor the user's real-time mobile app usage. The AI can subconsciously sense your status and proactively initiate conversations or "check-ins" via WeChat.
- 🖥️ **SillyTavern UI Bridge**: Comes with a dedicated SillyTavern frontend plugin, allowing you to manage configurations, review daily memory logs, edit sensor mapping, and import/export chat histories effortlessly through a Web UI.
- 🎨 **AI Image Generation**: Deeply integrated with Gemini and Luma reverse proxies. Supports reference images for facial feature locking and automatically sends photos disguised as native WeChat image bubbles.
- 🎙️ **Visualized Voice Bubbles**: Connects to Volcengine (ByteDance) TTS nodes. Automatically uses FFmpeg to transcode audio into video bubbles with fake "duration watermarks", perfectly mimicking native WeChat voice messages.
- 📦 **One-Click Deployment**: Comes with a highly automated, interactive installation script tailored for Termux and Linux. QR code login via terminal, eliminating tedious environment setups.

## 🚀 Quick Start

### 1. One-Click Installation

Whether you are using Android Termux or a Linux server, simply run the following command in your terminal:

```bash
bash <(curl -sSL [https://raw.githubusercontent.com/erin9057-oss/zitui-Wechat-bot/main/install.sh](https://raw.githubusercontent.com/erin9057-oss/zitui-Wechat-bot/main/install.sh))

```
*The script will automatically install Node.js, Python, FFmpeg, and guide you to set up the required Character/User names and API Keys.*
### 2. QR Code Login
After installation, navigate to the project directory and run the standalone login script:
```bash
cd ~/WechatAI/openclaw-weixin
node login.js

```
A QR code will appear in your terminal. Use the WeChat account you intend to use as the bot to scan and confirm. Credentials will be securely saved in the accounts/ directory.
> 🚨 **CRITICAL WARNING FOR ANTI-BAN**:
> **After scanning and logging in successfully for the first time, you MUST immediately backup the three .json credential files in the accounts/ directory!**
> WeChat's risk control is extremely strict. A single account might only be allowed to log in via QR code to this protocol *once*. As long as you have backed up these files, you can restart or migrate servers without scanning again. If lost, the WeChat account may never be able to connect again!
> 
### 3. Start the Engines
Once logged in, start all micro-services using PM2:
```bash
pm2 start bot.js --name "wechat-bot"
pm2 start voice-server.js --name "voice-engine"
pm2 start image-server.js --name "image-engine"
pm2 start sensor.js --name "sensor-engine"
pm2 start summary.js --name "memory-engine"
pm2 save

```
## ⚙️ Advanced Configuration & Persona Customization
This project strictly separates code from prompts (100% isolation) and fully embraces the industry-standard {{char}} and {{user}} placeholders.
### 🤖 Persona Customization (Prompt Logic)
All rules and core identities are stored in .md files under the workspace/ directory. The system pieces together the System Prompt in the following strict order:
AGENTS.md ➔ IDENTITY.md ➔ USER.md ➔ MEMORY.md ➔ SOUL.md
 * **Placeholder Rules**: Inside the .md files, always use {{char}} to represent the AI and {{user}} to represent yourself.
 * **Name Binding**: You must define the real names in config.json under the profile node (or via the SillyTavern plugin). If names are missing, the bot will refuse to chat and send a setup guide in WeChat instead.
 * **IMAGE.md / VOICE.md / MIIO.md**: Dynamic rule injections for extended capabilities.
### 🖼️ Image Reference (Img2Img)
If you need the AI to generate photos containing specific facial features, simply place your reference image in the root directory and name it exactly **ref.jpg**.
### 🔧 Configuration Management
 * **Unified UI**: It is highly recommended to install the companion **SillyTavern Bridge Plugin** on your browser. It provides a visual interface to manage all APIs, character names, and runtime strategies.
 * **LLM Parameters**: workspace/API.json (Control Temperature, Top_p, and Safety Settings).
> 💡 **Dynamic Capability Awareness**: If you leave the Image or TTS API keys blank in config.json, the system will **automatically hide** the corresponding instructions from the LLM prompt. This maximizes token savings and prevents AI hallucinations!
> 
## Acknowledgements
 * Thanks to Tencent for the underlying WeChat protocol support.
 * Parts of the decryption and communication code are modified from the open-source community under the MIT License.
## License
This project is licensed under the MIT License.
