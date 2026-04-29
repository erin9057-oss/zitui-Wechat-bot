![banner](https://github.com/user-attachments/assets/f199318c-2d14-4ed6-9ef8-646e17f3040d)

# 🚀 自推微信机器人

[English](./README.md) | **简体中文**
# 哈基米写的随便看看就好！以飞书教程为准
**自推微信机器人** 是一个基于独立网关架构的微信多模态 AI 机器人框架。
本项目脱胎于腾讯开源的底层通信协议，经过极致的“瘦身”与重构，彻底剥离了繁重的 OpenClaw 外层框架，专为沉浸式角色扮演（RP）与个人全能助理设计。

## ✨ 核心特性

- 🧠 **LLM 无缝驱动**: 完美对接任意兼容 OpenAI 格式的大模型接口（Gemini / Claude / DeepSeek 等），支持深度的 System Prompt 热重载。
- 📱 **物理跨次元联动 (Sensor 动态感知)**: 支持接入 MacroDroid/Tasker，实时监听用户的手机应用运行状态（如你在半夜打开了网易云音乐），AI 会在微信中主动触发专属的“查岗”或“潜意识关怀”。
- 🖥️ **SillyTavern UI 深度桥接**: 提供配套的酒馆（SillyTavern）前端插件，支持在 Web 端一键管理配置、查阅记忆日记、修改传感映射、互导对话记录。
- 🎨 **AI 物理显影 (生图)**: 深度集成 Gemini / Luma 反代等多模态能力，支持垫图锁定面部特征，自动识别语境向用户发送照片（伪装成原生微信图片气泡）。
- 🎙️ **可视化电台 (语音)**: 接入火山引擎 TTS 节点轮询，自动利用 FFmpeg 将音频压制为带“秒数时长”的微信语音气泡视频，以假乱真。
- 📦 **极简的一键部署**: 专为 Termux 与普通 Linux 编写了高度自动化的交互式安装脚本，终端扫码登录，告别繁琐的环境配置。

## 🚀 快速开始

### 1. 一键安装向导

无论你使用的是安卓 Termux 还是 Linux 服务器，只需在终端中执行以下命令：

```bash
bash <(curl -sSL [https://raw.githubusercontent.com/erin9057-oss/zitui-Wechat-bot/main/install.sh](https://raw.githubusercontent.com/erin9057-oss/zitui-Wechat-bot/main/install.sh))

```
*脚本会自动安装所需依赖，并引导你填写必填的角色真名与 API Key。*
### 2. 扫码登录
安装完成后，进入项目目录并执行独立登录脚本：
```bash
cd ~/WechatAI/openclaw-weixin
node login.js

```
终端将弹出一个二维码。请使用**准备作为机器人**的微信小号扫码并确认登录。凭证将自动安全加密保存在 accounts/ 目录下。
> 🚨 **【极其重要】防封号备份警告**：
> **第一次扫码登录成功后，请务必、一定要立即备份 accounts/ 目录下的三个 .json 凭证文件！**
> 微信的安全风控非常严格，同一个账号可能扫码登录一次后，就**再也不允许**通过二维码登录该底层协议了。只要你妥善备份了这三个文件，以后无论重装还是迁移服务器，直接放回即可免扫码秒启动。一旦丢失，该微信号可能永远无法再次接入！
> 
### 3. 启动引擎
一旦扫码成功并生成凭证，即可使用 PM2 启动所有服务：
```bash
pm2 start bot.js --name "wechat-bot"
pm2 start voice-server.js --name "voice-engine"
pm2 start image-server.js --name "image-engine"
pm2 start sensor.js --name "sensor-engine"
pm2 start summary.js --name "memory-engine"
pm2 save

```
## ⚙️ 进阶配置与人设魔改
本项目的代码与 Prompt 实现了 **100% 物理隔离**，且全面拥抱业界标准的 {{char}} 和 {{user}} 占位符规范，换人设只需修改配置即可。
### 🤖 人设与世界观定制 (Prompt 拼接逻辑)
所有的灵魂与规则全都在 workspace/ 目录下的 .md 文件中。系统在每次对话前，会严格按照以下顺序拼接 Prompt 发给大模型：
AGENTS.md ➔ IDENTITY.md ➔ USER.md ➔ MEMORY.md ➔ SOUL.md
 * **占位符规范**: 在上述所有 Markdown 文件中，请使用 {{char}} 代表 AI，使用 {{user}} 代表你。
 * **真名绑定**: 你必须在 config.json 的 profile 节点（或通过酒馆前端插件）绑定真实的名称。如果未绑定，机器人在微信中将拒绝回复并发送绑定引导。
 * **MEMORY.md**: 相当于**“世界书” (World Book)**，用于记录你们的重大羁绊或物理法则。
 * **IMAGE.md / VOICE.md / MIIO.md**: 附加能力的动态注入规则。
### 🖼️ 自推图生图 (垫图功能)
如果你需要让 AI 生成包含特定面部特征的照片，只需在项目根目录下放置一张你的参考图片，并严格命名为 **ref.jpg** 即可。
### 🔧 基础配置与调参
 * **统一化管理**: 推荐在电脑或手机浏览器安装配套的 [SillyTavern 桥接插件]，实现一站式可视化修改所有 API、角色名与运行策略。
 * **大模型调参**: workspace/API.json (控制 Temperature, Top_p 等底层参数)。
> 💡 **动态能力感知**: 如果你在 config.json 中没有配置生图或语音的 Key，系统将**自动隐藏**发送给大模型的对应功能指令，极限节省 Token 并彻底防止 AI 产生幻觉！
> 
## 鸣谢
 * 感谢腾讯 Tencent 提供的微信底层协议支持。
 * 本项目部分解密与通信代码基于 MIT 协议修改自开源社区。
## 许可证
本项目采用 MIT License 开源。
