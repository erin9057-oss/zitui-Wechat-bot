# 🚀 自推微信机器人

[English](./README.md) | **简体中文**

下面是哈基米写的。。。
**自推微信机器人** 是一个基于独立网关架构的微信多模态 AI 机器人框架。
本项目脱胎于腾讯开源的底层通信协议，经过极致的“瘦身”与重构，彻底剥离了繁重的OpenClaw外层框架，专为沉浸式角色扮演（RP）与个人全能助理设计。

## ✨ 核心特性

- 🧠 **LLM 无缝驱动**: 完美对接任意兼容 OpenAI 格式的大模型接口（Gemini / Claude / ChatGPT 等），支持深度的 System Prompt 热重载。
- 🎨 **AI 物理显影 (生图)**: 深度集成 Gemini 多模态能力，支持垫图锁定面部特征，自动识别语境向用户发送照片（伪装成微信图片气泡）。
- 🎙️ **可视化电台 (语音)**: 接入火山引擎 TTS 节点轮询，自动利用 FFmpeg 将音频压制为带“秒数时长”的微信语音气泡视频，以假乱真。
- 💡 **现实物理穿透 (IoT)**: 深度集成 Miio 协议，AI 可在对话中通过隐形指令（如 `[物理:开灯]`）直接控制你现实房间的智能家居（如 Yeelight）。
- 📦 **极简的一键部署**: 专为 Termux 与普通 Linux 编写了高度自动化的交互式安装脚本，终端扫码登录，告别繁琐的环境配置。

## 🚀 快速开始

### 1. 一键安装向导

无论你使用的是安卓 Termux 还是 Linux 服务器，只需在终端中执行以下命令：

```bash
bash <(curl -sSL [https://raw.githubusercontent.com/erin9057-oss/zitui-Wechat-bot/main/install.sh](https://raw.githubusercontent.com/erin9057-oss/zitui-Wechat-bot/main/install.sh))

```
*脚本会自动安装 Node.js、Python、FFmpeg 及鹅语音魔改库，并引导你填写 API Key。*
### 2. 扫码登录
安装完成后，进入项目目录并执行独立登录脚本：
```bash
cd ~/WechatAI/openclaw-weixin
node login.js

```
终端将弹出一个二维码。请使用**准备作为机器人**的微信小号扫码并确认登录。凭证将自动安全加密保存在 accounts/ 目录下。
### 3. 启动引擎
一旦扫码成功并生成凭证，即可使用 PM2 启动所有服务：
```bash
pm2 start bot.js --name "wechat-bot"
pm2 start voice-server.js --name "voice-engine"
pm2 start image-server.js --name "image-engine"
pm2 save

```
## ⚙️ 进阶配置与人设魔改
本项目的代码与 Prompt 实现了 **100% 物理隔离**，小白也能轻松魔改：
 * **基础连接**: config.json (用于修改所有 API 密钥、URL 和 IP 地址)
 * **大模型调参**: workspace/API.json (控制 Temperature, Top_p 及安全阈值 Safety Settings)
 * **灵魂与人设**: 所有的规则全都在 workspace/ 目录下的 .md 文件中。
   * AGENTS.md: 核心运行逻辑与记忆读写规范
   * IMAGE.md / VOICE.md / MIIO.md: 附加能力的动态注入规则
> 💡 **动态能力感知**: 如果你在 config.json 中没有配置生图或语音的 Key，系统将**自动隐藏**发送给大模型的对应功能指令，极限节省 Token 并防止 AI 幻觉！
> 
## 鸣谢
 * 感谢腾讯 Tencent 提供的微信底层协议支持。
 * 本项目部分解密与通信代码基于 MIT 协议修改自开源社区。
## 许可证
本项目采用 MIT License 开源。
