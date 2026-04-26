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

import { getChatContext, getLatestDiaries, saveInteraction, getCurrentSceneInfo } from './chat.js';
import { db, getEmbedding } from './vector_store.js';
import {
    获取基础目录,
    获取账号目录,
    获取工作区目录,
    获取主配置,
    获取主配置路径,
    获取运行策略,
    获取梦境事件路径,
    获取紧急事件路径,
    获取传感映射路径,
    当前是否处于唤醒时段,
    获取角色名, 
    获取用户名
} from './lib/runtime-config.js';

function updateConfigName(type, newName) {
    const cfgPath = 获取主配置路径();
    let cfg = {};
    if (fs.existsSync(cfgPath)) {
        cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    }
    cfg.profile = cfg.profile || {};
    if (type === 'char') cfg.profile.char_name = newName;
    if (type === 'user') cfg.profile.user_name = newName;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    return true;
}

const BASE_DIR = 获取基础目录();
const ACCOUNT_DIR = 获取账号目录();
const WORKSPACE_DIR = 获取工作区目录();

if (!fs.existsSync(ACCOUNT_DIR)) {
    console.error("❌ 找不到 accounts 文件夹，请先执行 node login.js 扫码登录！");
    process.exit(1);
}

const accountFiles = fs.readdirSync(ACCOUNT_DIR).filter(f => f.endsWith('-im-bot.json'));
if (accountFiles.length === 0) {
    console.error("❌ 在 accounts 文件夹中未找到登录凭证");
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

const extConfig = 获取主配置();
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
const current_char = 获取角色名() || "AI";
const current_user = 获取用户名() || "User";

for (const file of mdFiles) {
    const filePath = path.join(WORKSPACE_DIR, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf-8');
        content = content.replace(/\{\{char\}\}/gi, current_char).replace(/\{\{user\}\}/gi, current_user);
        SYSTEM_PROMPT += `\n\n=== ${file} ===\n` + content;
    }
}

const hasMiio = extConfig.miio?.ip && !extConfig.miio.ip.includes("YOUR_");
const hasImage = (extConfig.image_generation?.api_key && !extConfig.image_generation.api_key.includes("YOUR_")) || 
                 (extConfig.image_generation?.luma_realm_id) || 
                 (extConfig.luma?.realm_id);
const hasVoice = extConfig.tts?.credentials?.some(c => c.appid && !c.appid.includes("YOUR_"));

let ruleIndex = 8;
let dynamicRules = "";
try {
    if (hasMiio) dynamicRules += `\n## ${ruleIndex++}. Physical Reality Control\n${fs.readFileSync(path.join(WORKSPACE_DIR, 'MIIO.md'), 'utf-8')}\n`;
    if (hasImage) dynamicRules += `\n## ${ruleIndex++}. Image Generation\n${fs.readFileSync(path.join(WORKSPACE_DIR, 'IMAGE.md'), 'utf-8')}\n`;
    if (hasVoice) dynamicRules += `\n## ${ruleIndex++}. Voice Messages\n${fs.readFileSync(path.join(WORKSPACE_DIR, 'VOICE.md'), 'utf-8')}\n`;
 
    if (fs.existsSync(path.join(WORKSPACE_DIR, 'FORMAT.md'))) {
        dynamicRules += `\n## ${ruleIndex}. Mandatory Output Format\n${fs.readFileSync(path.join(WORKSPACE_DIR, 'FORMAT.md'), 'utf-8')}\n`;
    }
    if (dynamicRules) SYSTEM_PROMPT += `\n\n=== DYNAMIC_CAPABILITIES ===\n` + dynamicRules;
} catch (err) {}

let lastInteractionTime = Date.now(); 
const userMessageBuffers = {}; 
const userMediaBuffers = {}; 
const userTimers = {};         
const isThinking = {};       

function 获取等待时间毫秒() {
    return Number(获取运行策略().wait_time_ms ?? 7000);
}

let contextTokens = {};
if (fs.existsSync(CTX_CONF_PATH)) {
    try { contextTokens = JSON.parse(fs.readFileSync(CTX_CONF_PATH, 'utf-8')); } catch (e) {}
}

function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

function getWechatHeaders() {
    return {
        'Content-Type': 'application/json',
        'AuthorizationType': 'ilink_bot_token',  
        'Authorization': `Bearer ${WECHAT_TOKEN}`, 
        'X-WECHAT-UIN': randomWechatUin(),
        'iLink-App-Id': 'bot',
        'iLink-App-ClientVersion': '131335'
    };
}

const saveMediaMock = async (buffer, contentType) => {
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

async function setTypingStatus(userId, cToken, isTyping) {
    try {
        if (!cToken) return; 
        const confRes = await fetch(`${WECHAT_BASE_URL}/ilink/bot/getconfig`, {
            method: 'POST',
            headers: getWechatHeaders(),
            body: JSON.stringify({ ilink_user_id: userId, context_token: cToken, base_info: { channel_version: "2.1.7" }})
        });
        const confData = await confRes.json();
        if (confData.typing_ticket) {
            await fetch(`${WECHAT_BASE_URL}/ilink/bot/sendtyping`, {
                method: 'POST',
                headers: getWechatHeaders(),
                body: JSON.stringify({ ilink_user_id: userId, typing_ticket: confData.typing_ticket, status: isTyping ? 1 : 2, base_info: { channel_version: "2.1.7" }})
            });
            console.log(isTyping ? "✨ AI 正在输入中..." : "🔕 输入状态结束");
        }
    } catch (err) {}
}

function saveSyncCursor(cursor) { fs.writeFileSync(SYNC_CONF_PATH, JSON.stringify({ get_updates_buf: cursor }), 'utf-8'); }
function saveContextToken(userId, token) {
    contextTokens[userId] = token;
    fs.writeFileSync(CTX_CONF_PATH, JSON.stringify(contextTokens), 'utf-8');
}

async function callAI(userId, textContent, mediaPaths = [], proactivePrompt = null) {
    let currentContext = [{ role: "system", content: SYSTEM_PROMPT }];
    
    const bjNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const bjTimeStr = bjNow.toISOString().replace('T', ' ').substring(0, 16);
    currentContext.push({ role: "system", content: `【系统实时时钟】：当前北京时间为 ${bjTimeStr}` });

    // 🌟 读取动态上下文配置，用于卡住检索的规模
    const runtimeCfg = 获取运行策略();
    const chatCtxCfg = runtimeCfg.chat_context || { recall_scenes: 3, recall_diaries: 3 };

    let ragContext = [];
    const { currentSceneTitle, currentShifts, currentSceneId } = getCurrentSceneInfo();
    
    if (textContent || proactivePrompt) {
        const inputStr = textContent || "[系统触发的隐形指令]";
        const queryText = `[当前情景: ${currentSceneTitle}] 用户输入: ${inputStr}`;
        
        console.log(`\n🔍 [RAG 检索] 正在构建记忆查询向量...`);
        const queryVector = await getEmbedding(queryText);
        
        if (queryVector) {
            const topDiaries = db.search(queryVector, currentShifts, 'diary', chatCtxCfg.recall_diaries);
            let topScenes = db.search(queryVector, currentShifts, 'scene', chatCtxCfg.recall_scenes + 1); 
            
            if (currentSceneId) {
                topScenes = topScenes.filter(s => s.id !== currentSceneId);
            }
            topScenes = topScenes.slice(0, chatCtxCfg.recall_scenes);
            
            if (topDiaries.length > 0) {
                ragContext.push({ role: 'system', content: `【潜意识涌动：核心日记回忆】\n` + topDiaries.map(d => d.text).join('\n\n') });
                topDiaries.forEach(d => db.markAccessed(d.id));
            }
            if (topScenes.length > 0) {
                ragContext.push({ role: 'system', content: `【潜意识涌动：似曾相识的情境片段】\n` + topScenes.map(s => s.text).join('\n\n') });
                topScenes.forEach(s => db.markAccessed(s.id));
            }
            if (topDiaries.length > 0 || topScenes.length > 0) {
                db.saveDB(); 
                console.log(`✅ [RAG 检索] 成功召回 ${topDiaries.length} 篇日记与 ${topScenes.length} 个历史场景并注入潜意识。`);
            }
        } else {
            // 🌟 FALLBACK：如果 API 没配或者挂了，兜底直接硬拉最新的几篇日记
            if (chatCtxCfg.recall_diaries > 0) {
                const fallbackDiaries = getLatestDiaries(chatCtxCfg.recall_diaries);
                if (fallbackDiaries.length > 0) {
                    ragContext.push({ role: 'system', content: `【潜意识涌动：近期核心日记回忆】\n` + fallbackDiaries.join('\n\n') });
                }
            }
            console.log(`⚠️ [RAG 降级] 未配置向量 API 或请求失败，已降级为仅注入最近 ${chatCtxCfg.recall_diaries} 篇日记。`);
        }
    }

    currentContext = currentContext.concat(ragContext);

    try {
        const DB_PATH = path.join(WORKSPACE_DIR, 'dream_events.json');
        if (fs.existsSync(DB_PATH)) {
            const nowMs = Date.now();
            const events = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')).filter(e => nowMs - e.timestamp < 24 * 60 * 60 * 1000);
            if (events.length > 0) {
                const eventLog = events.map(e => `[${e.timeStr}] ${e.value}`).join('\n');
                currentContext.push({ role: "system", content: `【User今日手机动态监控】：\n${eventLog}` });
            }
        }
    } catch(e) {}

    currentContext = currentContext.concat(getChatContext());

    let contentArray = [];
    if (textContent) contentArray.push({ type: "text", text: textContent });
    for (const mediaPath of mediaPaths) {
        try {
            if (!fs.existsSync(mediaPath)) continue;
            const ext = path.extname(mediaPath).toLowerCase();
            const b64 = fs.readFileSync(mediaPath).toString('base64');
            if (['.wav', '.mp3', '.m4a', '.amr'].includes(ext)) {
                let mimeType = ext === '.wav' ? 'audio/wav' : `audio/${ext.replace('.', '')}`;
                contentArray.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${b64}` } });
            } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
                let mime = ext === '.jpg' ? 'jpeg' : ext.replace('.', '');
                contentArray.push({ type: "image_url", image_url: { url: `data:image/${mime};base64,${b64}` } });
            }
        } catch (e) {}
    }

    let finalContent = null;
    if (contentArray.length > 0) {
        finalContent = (contentArray.length === 1 && contentArray[0].type === "text") ? contentArray[0].text : contentArray;
        currentContext.push({ role: "user", content: finalContent });
    }

    if (proactivePrompt) {
        currentContext.push({ role: "system", content: proactivePrompt });
    }

    const debugContext = currentContext.map(msg => {
        if (msg.content === SYSTEM_PROMPT) {
            return { role: msg.role, content: "[静态系统设定：已隐藏 AGENTS.md / IDENTITY.md 等文件的注入内容]" };
        }
        if (Array.isArray(msg.content)) {
            const safeContent = msg.content.map(item => {
                if (item.type === "image_url") return { type: "image_url", image_url: { url: "[图片/语音 Base64 编码已隐藏]" } };
                return item;
            });
            return { ...msg, content: safeContent };
        }
        return msg;
    });
    console.log(`\n================= 🚀 [DEBUG: 发给 LLM 的完整上下文阵列] 🚀 =================`);
    console.log(JSON.stringify(debugContext, null, 2));
    console.log(`==============================================================================\n`);

    try {
        console.log(`\n🧠 AI 正在动用多模态感官处理信息 (模型: ${AI_MODEL})...`);
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_API_KEY}` },
            body: JSON.stringify({ model: AI_MODEL, messages: currentContext, ...AI_PARAMS }),
            signal: AbortSignal.timeout(300000) 
        });

        if (!response.ok) throw new Error(await response.text().catch(() => "无返回体"));
        
        const data = await response.json();
        const rawReply = data.choices[0].message.content.trim();
        
        let thoughts = "";
        let replyContent = rawReply;
        
        let sceneData = { action: 'continue' };

        const thinkMatch = rawReply.match(/<thinking>([\s\S]*?)<\/thinking>/i);
        if (thinkMatch) thoughts = thinkMatch[1].trim();

        const sceneMatches = [...rawReply.matchAll(/<scene_eval>([\s\S]*?)<\/scene_eval>/gi)];
        if (sceneMatches.length > 0) {
            try {
                let sceneStr = sceneMatches[sceneMatches.length - 1][1].replace(/```json/g, '').replace(/```/g, '').trim();
                sceneData = JSON.parse(sceneStr);
                
                const act = sceneData.action === 'new' ? `✨新场景[${sceneData.title}]` : '➡️场景延续';
                const zLogs = sceneData.zeigarnik?.join(' | ') || '无';
                const sLogs = sceneData.salient?.join(' | ') || '无';
                
                console.log(`\n📊 [RAG情景刻录] \n  - 动作: ${act}\n  - 悬念: ${zLogs}\n  - 显著物: ${sLogs}`);
            } catch (e) {
                console.log(`\n⚠️ [场景解析失败]:`, e.message);
            }
        }

        const replyMatches = [...rawReply.matchAll(/<reply>([\s\S]*?)<\/reply>/gi)];
        if (replyMatches.length > 0) {
            replyContent = replyMatches[replyMatches.length - 1][1].trim();
        } else {
            replyContent = rawReply.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
        }

        let cleanReply = replyContent;
        cleanReply = cleanReply.replace(/<pic[^>]*>([\s\S]*?)<\/pic>/gi, "[发送了一张照片/多媒体]");
        cleanReply = cleanReply.replace(/<pic prompt>([\s\S]*?)<\/pic prompt>/gi, "[发送了一张照片/多媒体]");
        cleanReply = cleanReply.replace(/<voice>([\s\S]*?)<\/voice>/gi, "$1");
        cleanReply = cleanReply.replace(/\[物理:开灯\]|\[物理:关灯\]|<开灯>|<关灯>/g, "");
        cleanReply = cleanReply.replace(/<scene_eval>[\s\S]*?<\/scene_eval>/gi, ""); 
        cleanReply = cleanReply.trim();

        if (thoughts) console.log(`\n💭 [内心独白]: ${thoughts}`);
        console.log(`📝 [准备发送]: ${replyContent.slice(0, 80)}...`);

        let logUserText = textContent;
        if (!logUserText && proactivePrompt) logUserText = "[系统触发]";
        
        saveInteraction(logUserText, thoughts, cleanReply, sceneData);

        return cleanReply; 
    } catch (err) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            console.error(`\n❌ AI 请求超时 (超过 5 分钟未返回数据)`);
        } else {
            console.error(`\n❌ AI 请求失败:`, err.message);
        }
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
        try { syncCursor = JSON.parse(fs.readFileSync(SYNC_CONF_PATH, 'utf-8')).get_updates_buf || ""; } catch (e) {}
    }

    console.log("🚀 独立网关 (沉浸剧本记忆+RAG向量版) 已启动...");

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

                    const charName = 获取角色名();
                    const userName = 获取用户名();

                    if (msg.message_type === 1 && msg.item_list) {
                        let rawText = msg.item_list[0]?.text_item?.text || "";

                        let charUpdated = false;
                        let userUpdated = false;
                        let replyMsgs = [];

                        const charMatch = rawText.match(/\/char\s+([^\/\n\r]+)/i);
                        if (charMatch) {
                            const n = charMatch[1].trim();
                            if (n) {
                                updateConfigName('char', n);
                                charUpdated = true;
                                replyMsgs.push(`✅ AI 角色名已更新为：${n}`);
                            }
                        }

                        const userMatch = rawText.match(/\/user\s+([^\/\n\r]+)/i);
                        if (userMatch) {
                            const n = userMatch[1].trim();
                            if (n) {
                                updateConfigName('user', n);
                                userUpdated = true;
                                replyMsgs.push(`✅ 用户称呼已更新为：${n}`);
                            }
                        }

                        if (charUpdated || userUpdated) {
                            replyMsgs.push("请在 Termux 终端执行 pm2 restart wechat-bot 即可生效！");
                            await sendMessageWeixin({ to: userId, text: replyMsgs.join('\n\n'), opts: { baseUrl: WECHAT_BASE_URL, token: WECHAT_TOKEN, contextToken: msg.context_token } });
                            continue;
                        }

                        if (rawText.trim().startsWith('/char') || rawText.trim().startsWith('/user')) {
                            await sendMessageWeixin({ to: userId, text: "❌ 名字提取失败或不能为空！\n请连着名字一起发（中间要有空格），例如：\n/char 小白 /user 用户", opts: { baseUrl: WECHAT_BASE_URL, token: WECHAT_TOKEN, contextToken: msg.context_token } });
                            continue;
                        }

                        if (!charName || !userName) {
                            const guide = `👋 欢迎使用自推 WechatAI！\n\n检测到你尚未初始化身份。为了创建专属记忆文件，请发送以下指令：1️⃣ 设置 AI 名字：/char 名字\n2️⃣ 设置你的名字：/user 名字\n\n(支持一次性发送，例如：/char 小白 /user 用户)\n\n设置完成后，我会正式苏醒。`;
                            await sendMessageWeixin({ to: userId, text: guide, opts: { baseUrl: WECHAT_BASE_URL, token: WECHAT_TOKEN, contextToken: msg.context_token } });
                            continue;
                        }

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
                                    if (titleMatch) content = `[User分享了一个链接]\n标题: ${titleMatch[1]}\n链接: ${urlMatch ? urlMatch[1] : '无链接'}`;
                                }
                                userMessageBuffers[userId].push(content);
                                hasContent = true;
                                console.log(`\n📩 收到消息: ${content.slice(0, 50)}... (已入池)`);
                            } 
                            else if (item.type === 3 && item.voice_item) {
                                try {
                                    const mediaOpts = await downloadMediaFromItem(item, { cdnBaseUrl: CDN_BASE_URL, saveMedia: saveMediaMock, log: () => {}, errLog: () => {}, label: "inbound_voice" });
                                    if (mediaOpts.decryptedVoicePath && fs.existsSync(mediaOpts.decryptedVoicePath)) {
                                        let finalPath = mediaOpts.decryptedVoicePath;
                                        if (path.extname(finalPath).toLowerCase() !== '.wav') {
                                            if (fs.readFileSync(finalPath, { length: 4 }).toString('ascii') === 'RIFF') {
                                                const newPath = finalPath + '.wav';
                                                fs.renameSync(finalPath, newPath);
                                                finalPath = newPath;
                                            }
                                        }
                                        userMediaBuffers[userId].push(finalPath);
                                        userMessageBuffers[userId].push(`[User发送了一条语音消息，请听音频附件感知语气。]`);
                                        hasContent = true;
                                    }
                                } catch (err) {}
                            }
                            else {
                                try {
                                    const mediaOpts = await downloadMediaFromItem(item, { cdnBaseUrl: CDN_BASE_URL, saveMedia: saveMediaMock, log: () => {}, errLog: () => {}, label: "inbound_media" });
                                    const downloadedPath = mediaOpts.decryptedPicPath || mediaOpts.filePath || mediaOpts.path;
                                    if (downloadedPath) {
                                        userMediaBuffers[userId].push(downloadedPath);
                                        userMessageBuffers[userId].push(`[发送了一张图片/多媒体，请查看视觉附件]`);
                                        hasContent = true;
                                    }
                                } catch(e) {}
                            }
                        }

                        if (!hasContent) continue;
                        if (userTimers[userId]) clearTimeout(userTimers[userId]);
                        userTimers[userId] = setTimeout(() => {
                            delete userTimers[userId];
                            processBuffer(userId);
                        }, 获取等待时间毫秒()); 
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
    const runtimeConfig = 获取运行策略();
    const IDLE_LIMIT = Number(runtimeConfig.idle_limit_ms ?? 30 * 60 * 1000);
    const nowMs = Date.now();
    const bjDate = new Date(nowMs + 8 * 60 * 60 * 1000);
    const timeStr = bjDate.toISOString().replace('T', ' ').substring(0, 19);
    
    if (当前是否处于唤醒时段() && (nowMs - lastInteractionTime > IDLE_LIMIT) && !isThinking[MY_USER_ID]) {
        lastInteractionTime = Date.now(); 

        let sensorContext = "";
        try {
            const DB_PATH = 获取梦境事件路径();
            const MAP_PATH = 获取传感映射路径();
            
            let sensorMap = {};
            if (fs.existsSync(MAP_PATH)) {
                try { sensorMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8')); } catch (e) {}
            }
            if (fs.existsSync(DB_PATH)) {
                const events = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')).filter(e => nowMs - e.timestamp < 24 * 60 * 60 * 1000);
                if (events.length > 0) {
                    events.sort((a, b) => b.timestamp - a.timestamp);
                    const eventLog = events.map(e => {
                        let extraHint = "";
                        for (const [key, desc] of Object.entries(sensorMap)) {
                            if (e.value.toLowerCase().includes(key.toLowerCase())) { extraHint = ` (背景设定注：${desc})`; break; }
                        }
                        return `[${e.timeStr}] ${e.value}${extraHint}`;
                    }).join('\n');
                    sensorContext = `\n\n【潜意识感知注入】：你的直觉察觉到了User近期的手机端动态：\n${eventLog}`;
                }
            }
        } catch (err) {}

        const hiddenPrompt = `[系统提醒：现在是北京时间 ${timeStr}。你已经半小时没和User说话了。${sensorContext}\n请严格执行 AGENTS.md 第 7 条规则，主动寻找话题。]`;
        
        console.log(`\n🕰️ 触发主动关怀机制，注入的隐形 Prompt 为:\n${hiddenPrompt}`);
        
        const aiReply = await callAI(MY_USER_ID, null, [], hiddenPrompt);
        if (aiReply) {
            await sendMessageWeixin({
                to: MY_USER_ID, text: aiReply,
                opts: { baseUrl: WECHAT_BASE_URL, token: WECHAT_TOKEN, contextToken: contextTokens[MY_USER_ID], timeoutMs: 15000 }
            });
        }
    }
}, 60000);

setInterval(async () => {
    if (isThinking[MY_USER_ID]) return; 

    const URGENT_PATH = 获取紧急事件路径();
    if (!fs.existsSync(URGENT_PATH)) return; 

    try {
        const raw = fs.readFileSync(URGENT_PATH, 'utf-8');
        fs.unlinkSync(URGENT_PATH); 
        
        const urgentEvent = JSON.parse(raw);
        const MAP_PATH = 获取传感映射路径();
        let extraHint = "";
        
        if (fs.existsSync(MAP_PATH)) {
            const sensorMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8'));
            for (const [key, desc] of Object.entries(sensorMap)) {
                if (urgentEvent.value.toLowerCase().includes(key.toLowerCase())) {
                    extraHint = ` (背景设定注：${desc})`;
                    break;
                }
            }
        }

        const bjDate = new Date(Date.now() + 8 * 60 * 60 * 1000);
        const timeStr = bjDate.toISOString().replace('T', ' ').substring(0, 19); 
        lastInteractionTime = Date.now(); 

        const hiddenPrompt = `[系统最高优先级警报：现在是北京时间 ${timeStr}。你突然察觉到了User的一项异常动态：\n[${urgentEvent.timeStr}] ${urgentEvent.value}${extraHint}\n请立刻严格执行 AGENTS.md 第 7 条规则进行查岗！
注意：因为这是你在她毫无防备时的查岗，请根据hexaco，【最多只发送一两个气泡】。【绝对不要】附带任何 <pic> 或 <voice> 标签以免错过查岗时机]`;

        console.log(`\n🚨 触发紧急查岗机制！向 AI 注入警报指令...`);
        
        const aiReply = await callAI(MY_USER_ID, null, [], hiddenPrompt);
        if (aiReply) {
            await sendMessageWeixin({
                to: MY_USER_ID, text: aiReply,
                opts: { baseUrl: WECHAT_BASE_URL, token: WECHAT_TOKEN, contextToken: contextTokens[MY_USER_ID], timeoutMs: 15000 }
            });
        }
    } catch (err) {}
}, 3000); 

startBot();
