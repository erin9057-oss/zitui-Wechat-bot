/*
 * Copyright (C) 2026 Tencent. All rights reserved.
 * Copyright (C) 2026 PlusXii. All rights reserved.
 *
 * openclaw-weixin is licensed under the MIT License.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { sendMessageWeixin } from '/data/data/com.termux/files/home/WechatAI/openclaw-weixin/dist/src/messaging/send.js';
import { downloadMediaFromItem } from '/data/data/com.termux/files/home/WechatAI/openclaw-weixin/dist/src/media/media-download.js';

const BASE_DIR = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin';
const ACCOUNT_DIR = path.join(BASE_DIR, 'accounts');
const WORKSPACE_DIR = path.join(BASE_DIR, 'workspace');

// 🌟 核心：动态扫描 accounts 文件夹，自动加载扫码生成的登录凭证
if (!fs.existsSync(ACCOUNT_DIR)) {
    console.error("❌ 找不到 accounts 文件夹，请先执行 node login.js 扫码登录！");
    process.exit(1);
}

const accountFiles = fs.readdirSync(ACCOUNT_DIR).filter(f => f.endsWith('-im-bot.json'));

if (accountFiles.length === 0) {
    console.error("❌ 在 accounts 文件夹中未找到登录凭证 (*-im-bot.json)，请先执行 node login.js 扫码登录！");
    process.exit(1);
}

const mainConfigFile = accountFiles[0];
const baseName = mainConfigFile.replace('.json', '');

const MAIN_CONF_PATH = path.join(ACCOUNT_DIR, mainConfigFile);
const SYNC_CONF_PATH = path.join(ACCOUNT_DIR, `${baseName}.sync.json`);
const CTX_CONF_PATH = path.join(ACCOUNT_DIR, `${baseName}.context-tokens.json`);

console.log(`✅ 成功加载微信登录凭证: ${mainConfigFile}`);

const wxConfig = JSON.parse(fs.readFileSync(MAIN_CONF_PATH, 'utf-8'));
const WECHAT_BASE_URL = wxConfig.baseUrl; 
const WECHAT_TOKEN = wxConfig.token;
const CDN_BASE_URL = wxConfig.baseUrl; 
const MY_USER_ID = wxConfig.userId;

// 🌟 核心：从统一的 config.json 动态读取所有核心鉴权与路由
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const extConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
// 🌟 修复 1：防死锁，过滤掉 api_base_url 末尾多余的斜杠，防止 //chat/completions 导致网关 404 或挂死
const AI_API_URL = `${extConfig.chat_llm.api_base_url.replace(/\/$/, '')}/chat/completions`; 
const AI_API_KEY = extConfig.chat_llm.api_key;
const AI_MODEL = extConfig.chat_llm.model_name;

const API_CONF_PATH = path.join(WORKSPACE_DIR, 'API.json');
let AI_PARAMS = {};
if (fs.existsSync(API_CONF_PATH)) {
    const aiConfig = JSON.parse(fs.readFileSync(API_CONF_PATH, 'utf-8'));
    AI_PARAMS = aiConfig.agents?.defaults?.params || {};
}

const mdFiles = ['AGENTS.md', 'IDENTITY.md', 'USER.md', 'MEMORY.md', 'SOUL.md'];
let SYSTEM_PROMPT = "";
for (const file of mdFiles) {
    const filePath = path.join(WORKSPACE_DIR, file);
    if (fs.existsSync(filePath)) {
        SYSTEM_PROMPT += `\n\n=== ${file} ===\n` + fs.readFileSync(filePath, 'utf-8');
    }
}

// 🌟 2. 动态能力注入引擎
const hasMiio = extConfig.miio?.ip && !extConfig.miio.ip.includes("YOUR_") && extConfig.miio?.token && !extConfig.miio.token.includes("YOUR_");
const hasImage = extConfig.image_generation?.api_key && !extConfig.image_generation.api_key.includes("YOUR_");
const hasVoice = extConfig.tts?.credentials?.some(c => c.appid && !c.appid.includes("YOUR_"));

let ruleIndex = 8;
let dynamicRules = "";

try {
    if (hasMiio) {
        const miioContent = fs.readFileSync(path.join(WORKSPACE_DIR, 'MIIO.md'), 'utf-8');
        dynamicRules += `\n## ${ruleIndex++}. Physical Reality Control\n${miioContent}\n`;
    }
    if (hasImage) {
        const imageContent = fs.readFileSync(path.join(WORKSPACE_DIR, 'IMAGE.md'), 'utf-8');
        dynamicRules += `\n## ${ruleIndex++}. Image Generation\n${imageContent}\n`;
    }
    if (hasVoice) {
        const voiceContent = fs.readFileSync(path.join(WORKSPACE_DIR, 'VOICE.md'), 'utf-8');
        dynamicRules += `\n## ${ruleIndex++}. Voice Messages\n${voiceContent}\n`;
    }
    if (fs.existsSync(path.join(WORKSPACE_DIR, 'FORMAT.md'))) {
        const formatContent = fs.readFileSync(path.join(WORKSPACE_DIR, 'FORMAT.md'), 'utf-8');
        dynamicRules += `\n## ${ruleIndex}. Mandatory Output Format\n${formatContent}\n`;
    }
    if (dynamicRules) SYSTEM_PROMPT += `\n\n=== DYNAMIC_CAPABILITIES ===\n` + dynamicRules;
} catch (err) {
    console.error("❌ 读取动态能力 Prompt 失败！", err.message);
}

const chatMemory = {}; 
let lastInteractionTime = Date.now(); 

const userMessageBuffers = {}; 
const userMediaBuffers = {}; 
const userTimers = {};         
const isThinking = {};       
const WAIT_TIME_MS = 7000;   

let contextTokens = {};
if (fs.existsSync(CTX_CONF_PATH)) {
    try {
        contextTokens = JSON.parse(fs.readFileSync(CTX_CONF_PATH, 'utf-8'));
    } catch (e) {}
}

// 🌟 核心修复 1：UIN 必须全局唯一！每次请求动态生成会被微信风控静默吞包
const GLOBAL_UIN = Buffer.from(String(crypto.randomBytes(4).readUInt32BE(0)), "utf-8").toString("base64");

function getWechatHeaders() {
    return {
        'Content-Type': 'application/json',
        'AuthorizationType': 'ilink_bot_token',  
        'Authorization': `Bearer ${WECHAT_TOKEN}`, 
        'X-WECHAT-UIN': GLOBAL_UIN, // 🚨 换成全局固定的 UIN
        'iLink-App-Id': 'bot',
        'iLink-App-ClientVersion': '131335',
        // 🚨 核心修复 2：补充标准浏览器 UA，防止腾讯云 WAF 将请求当作爬虫拦截
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
}

const saveMediaMock = async (buffer, contentType, subdir, maxBytes, originalFilename) => {
    const tmpDir = path.join(BASE_DIR, 'tmp_media');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
    let ext = '.bin';
    if (contentType) {
        if (contentType.includes('image/jpeg')) ext = '.jpg';
        else if (contentType.includes('image/png')) ext = '.png';
        else if (contentType.includes('image/gif')) ext = '.gif';
        else if (contentType.includes('audio/wav')) ext = '.wav';   
        else if (contentType.includes('audio/silk')) ext = '.silk';
        else if (contentType.includes('video/mp4')) ext = '.mp4';
    }
    const fileName = `media_${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`;
    const fullPath = path.join(tmpDir, fileName);
    fs.writeFileSync(fullPath, buffer);
    return { path: fullPath };
}

// 🌟 核心修复 3：恢复 Typing 状态同步与错误日志
async function setTypingStatus(userId, cToken, isTyping) {
    try {
        if (!cToken) return; // 没有上下文 token 时不发送，防止报错
        
        const confRes = await fetch(`${WECHAT_BASE_URL}/ilink/bot/getconfig`, {
            method: 'POST',
            headers: getWechatHeaders(),
            body: JSON.stringify({ ilink_user_id: userId, context_token: cToken, base_info: { channel_version: "2.1.7" }})
        });
        
        if (!confRes.ok) throw new Error(`获取 Config 失败 (HTTP ${confRes.status})`);
        
        const confData = await confRes.json();
        if (confData.typing_ticket) {
            const typeRes = await fetch(`${WECHAT_BASE_URL}/ilink/bot/sendtyping`, {
                method: 'POST',
                headers: getWechatHeaders(),
                body: JSON.stringify({ ilink_user_id: userId, typing_ticket: confData.typing_ticket, status: isTyping ? 1 : 2, base_info: { channel_version: "2.1.7" }})
            });
            
            if (!typeRes.ok) throw new Error(`发送 Typing 失败 (HTTP ${typeRes.status})`);
            
            // 🌟 恢复日志打印，方便监控
            console.log(isTyping ? "✨ AI 正在输入中..." : "🔕 输入状态结束");
        }
    } catch (err) {
        // 🌟 恢复错误抛出，如果微信风控拦截了，能第一时间在控制台看见
        console.warn(`⚠️ Typing 状态同步跳过: ${err.message}`);
    }
}

function saveSyncCursor(cursor) {
    fs.writeFileSync(SYNC_CONF_PATH, JSON.stringify({ get_updates_buf: cursor }), 'utf-8');
}
function saveContextToken(userId, token) {
    contextTokens[userId] = token;
    fs.writeFileSync(CTX_CONF_PATH, JSON.stringify(contextTokens), 'utf-8');
}

async function callAI(userId, textContent, mediaPaths = []) {
    if (!chatMemory[userId]) {
        chatMemory[userId] = [{ role: "system", content: SYSTEM_PROMPT }];
    }
    
    let contentArray = [];
    if (textContent) contentArray.push({ type: "text", text: textContent });

    for (const mediaPath of mediaPaths) {
        try {
            if (!fs.existsSync(mediaPath)) continue;
            const ext = path.extname(mediaPath).toLowerCase();
            const b64 = fs.readFileSync(mediaPath).toString('base64');
            
            // MIME 走私！将音频装进 image_url 标签
            if (ext === '.wav' || ext === '.mp3' || ext === '.m4a' || ext === '.amr') {
                let mimeType = 'audio/wav';
                if (ext === '.mp3') mimeType = 'audio/mp3';
                if (ext === '.m4a') mimeType = 'audio/m4a';
                
                contentArray.push({
                    type: "image_url", 
                    image_url: { url: `data:${mimeType};base64,${b64}` }
                });
            } 
            else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
                let mime = ext === '.jpg' ? 'jpeg' : ext.replace('.', '');
                contentArray.push({
                    type: "image_url",
                    image_url: { url: `data:image/${mime};base64,${b64}` }
                });
            }
        } catch (e) { console.error("附件加载失败:", e.message); }
    }

    if (contentArray.length === 0) return null;

    const finalContent = (contentArray.length === 1 && contentArray[0].type === "text") 
        ? contentArray[0].text 
        : contentArray;

    chatMemory[userId].push({ role: "user", content: finalContent });
    if (chatMemory[userId].length > 15) chatMemory[userId].splice(1, 2); 

    try {
        console.log(`\n🧠 AI 正在动用多模态感官处理信息 (模型: ${AI_MODEL})...`);
        
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_API_KEY}` },
            body: JSON.stringify({ model: AI_MODEL, messages: chatMemory[userId], ...AI_PARAMS }),
            signal: AbortSignal.timeout(120000) // 120秒极限超时
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => "无返回体");
            throw new Error(`HTTP ${response.status} | 代理网关报错信息: ${errText}`);
        }
        
        const data = await response.json();
        const rawReply = data.choices[0].message.content.trim();
        
        chatMemory[userId].push({ role: "assistant", content: rawReply });
        return rawReply;
    } catch (err) {
        console.error(`\n❌ AI 请求失败:`, err.name === 'TimeoutError' ? '请求严重超时！(代理网关可能卡死了)' : err.message);
        chatMemory[userId].pop(); 
        return null;
    }
}

async function processBuffer(userId) {
    if (isThinking[userId]) return; 
    if (userMessageBuffers[userId].length === 0 && userMediaBuffers[userId].length === 0) return;

    isThinking[userId] = true; 
    
    const combinedText = userMessageBuffers[userId].join("\n");
    const collectedMedia = [...userMediaBuffers[userId]];
    
    userMessageBuffers[userId] = [];
    userMediaBuffers[userId] = [];
    
    console.log(`\n⏳ 缓冲提取完毕，发往 AI (文本: ${combinedText.length}字符, 媒体: ${collectedMedia.length}个)`);

    const cToken = contextTokens[userId];
    await setTypingStatus(userId, cToken, true);
    
    const aiReply = await callAI(userId, combinedText, collectedMedia);
    
    await setTypingStatus(userId, cToken, false);

    if (aiReply) {
        console.log(`📤 交由 send.js 执行发送...`);
        await sendMessageWeixin({
            to: userId,
            text: aiReply,
            opts: { baseUrl: WECHAT_BASE_URL, token: WECHAT_TOKEN, contextToken: cToken, timeoutMs: 15000 }
        });
    }
    
    isThinking[userId] = false; 

    if (userMessageBuffers[userId].length > 0 || userMediaBuffers[userId].length > 0) {
        processBuffer(userId);
    }
}

async function startBot() {
    let syncCursor = "";
    if (fs.existsSync(SYNC_CONF_PATH)) {
        try {
            const syncData = JSON.parse(fs.readFileSync(SYNC_CONF_PATH, 'utf-8'));
            syncCursor = syncData.get_updates_buf || "";
        } catch (e) {}
    }

    console.log("🚀 独立网关 (大道至简版) 已启动...");

    while (true) {
        try {
            const pollRes = await fetch(`${WECHAT_BASE_URL}/ilink/bot/getupdates`, {
                method: 'POST',
                headers: getWechatHeaders(),
                body: JSON.stringify({ get_updates_buf: syncCursor, base_info: { channel_version: "2.1.7" } }),
                signal: AbortSignal.timeout(40000) 
            });

            if (!pollRes.ok) {
                if (pollRes.status === 524) continue; 
                throw new Error(`WeChat API Error: ${pollRes.status}`);
            }
            const data = await pollRes.json();
            if (data.get_updates_buf && data.get_updates_buf !== syncCursor) {
                syncCursor = data.get_updates_buf;
                saveSyncCursor(syncCursor);
            }

            if (data.msgs && data.msgs.length > 0) {
                for (const msg of data.msgs) {
                    const userId = msg.from_user_id;
                    if (msg.context_token) saveContextToken(userId, msg.context_token);

                    if (msg.message_type === 1 && msg.item_list) {
                        lastInteractionTime = Date.now();
                        
                        if (!userMessageBuffers[userId]) userMessageBuffers[userId] = [];
                        if (!userMediaBuffers[userId]) userMediaBuffers[userId] = [];

                        let hasContent = false;

                        for (const item of msg.item_list) {
                            
                            if (item.type === 1 && item.text_item) {
                                let content = item.text_item.text;
                                if (content.includes('<appmsg')) {
                                    const titleMatch = content.match(/<title>?(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i);
                                    const urlMatch = content.match(/<url>?(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/url>/i);
                                    if (titleMatch) {
                                        content = `[User分享了一个链接]\n标题: ${titleMatch[1]}\n链接: ${urlMatch ? urlMatch[1] : '无链接'}`;
                                    }
                                }
                                userMessageBuffers[userId].push(content);
                                hasContent = true;
                                console.log(`\n📩 收到消息: ${content.slice(0, 50)}... (已入池)`);
                            } 
                            else if (item.type === 3 && item.voice_item) {
                                console.log(`\n🎙️ 收到User语音，交由官方核心引擎处理...`);
                                try {
                                    const mediaOpts = await downloadMediaFromItem(item, {
                                        cdnBaseUrl: CDN_BASE_URL, saveMedia: saveMediaMock,
                                        log: () => {}, errLog: () => {}, label: "inbound_voice"
                                    });

                                    const downloadedPath = mediaOpts.decryptedVoicePath;
                                    
                                    if (downloadedPath && fs.existsSync(downloadedPath)) {
                                        let finalPath = downloadedPath;
                                        const ext = path.extname(finalPath).toLowerCase();
                                        if (ext !== '.wav') {
                                            const header = fs.readFileSync(finalPath, { length: 4 }).toString('ascii');
                                            if (header === 'RIFF') {
                                                const newPath = finalPath + '.wav';
                                                fs.renameSync(finalPath, newPath);
                                                finalPath = newPath;
                                            }
                                        }

                                        userMediaBuffers[userId].push(finalPath);
                                        userMessageBuffers[userId].push(`[User发送了一条语音消息，请听音频附件感知语气。`);
                                        hasContent = true;
                                        console.log(`✅ 语音提取并转码完毕！已接通听觉神经 (${finalPath})`);
                                    } else {
                                        throw new Error("框架未产生有效的语音文件");
                                    }
                                } catch (err) {
                                    console.error("❌ 语音处理失败:", err.message);
                                    userMessageBuffers[userId].push(`[User发了一条特殊的语音消息，系统提取失败，请结合上下文回应]`);
                                    hasContent = true;
                                }
                            }
                            else {
                                try {
                                    const mediaOpts = await downloadMediaFromItem(item, {
                                        cdnBaseUrl: CDN_BASE_URL, saveMedia: saveMediaMock,
                                        log: () => {}, errLog: () => {}, label: "inbound_media"
                                    });
                                    const downloadedPath = mediaOpts.decryptedPicPath || mediaOpts.filePath || mediaOpts.path;
                                    if (downloadedPath) {
                                        userMediaBuffers[userId].push(downloadedPath);
                                        userMessageBuffers[userId].push(`[发送了一张图片/多媒体，请查看视觉附件]`);
                                        hasContent = true;
                                        console.log(`\n🏞️ 收到多媒体: ${downloadedPath} (已并入感官通道)`);
                                    }
                                } catch(e) {}
                            }
                        }

                        if (!hasContent) continue;
                        if (userTimers[userId]) clearTimeout(userTimers[userId]);
                        userTimers[userId] = setTimeout(() => {
                            delete userTimers[userId];
                            processBuffer(userId);
                        }, WAIT_TIME_MS); 
                    }
                }
            }
            await new Promise(r => setTimeout(r, 500));
        } catch (err) {
            if (err.name !== 'TimeoutError' && err.name !== 'AbortError') await new Promise(r => setTimeout(r, 5000));
        }
    }
}

setInterval(async () => {
    const IDLE_LIMIT = 30 * 60 * 1000; 
    const nowMs = Date.now();
    
    const bjDate = new Date(nowMs + 8 * 60 * 60 * 1000);
    const currentHour = bjDate.getUTCHours(); 
    const timeStr = bjDate.toISOString().replace('T', ' ').substring(0, 19); 
    
    const isValidTime = currentHour >= 9 || currentHour < 3;
    if (isValidTime && (nowMs - lastInteractionTime > IDLE_LIMIT) && !isThinking[MY_USER_ID]) {
        lastInteractionTime = Date.now(); 
        const hiddenPrompt = `[系统提醒：现在是北京时间 ${timeStr}。你已经半小时没和User说话了。请严格执行 AGENTS.md 第 7 条规则。]`;
        const aiReply = await callAI(MY_USER_ID, hiddenPrompt);
        if (aiReply) {
            await sendMessageWeixin({
                to: MY_USER_ID, text: aiReply,
                opts: { baseUrl: WECHAT_BASE_URL, token: WECHAT_TOKEN, contextToken: contextTokens[MY_USER_ID] }
            });
        }
    }
}, 60000);

startBot();
