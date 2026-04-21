/*
 * 每日深夜日记（北京时间 23:59 触发）
 */
import fs from 'fs';

import {
    获取工作区目录,
    获取主配置,
    获取角色名,
    获取用户名,
    获取梦境事件路径,
    获取当前活跃记忆文件,
} from './lib/runtime-config.js';

const WORKSPACE_DIR = 获取工作区目录();
const extConfig = 获取主配置();
const AI_API_URL = `${extConfig.chat_llm.api_base_url.replace(/\/$/, '')}/chat/completions`;
const AI_API_KEY = extConfig.chat_llm.api_key;
const AI_MODEL = extConfig.chat_llm.model_name;

const API_CONF_PATH = `${WORKSPACE_DIR}/API.json`;
let AI_PARAMS = {};
if (fs.existsSync(API_CONF_PATH)) {
    AI_PARAMS = JSON.parse(fs.readFileSync(API_CONF_PATH, 'utf-8')).agents?.defaults?.params || {};
}

function 获取系统提示词() {
    const mdPath = `${WORKSPACE_DIR}/AGENTS.md`;
    return fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf-8') : '';
}

async function performDailySummary() {
    const charName = 获取角色名('小白');
    const userName = 获取用户名('用户');
    const nowBJT = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const todayStr = nowBJT.toISOString().split('T')[0];

    console.log(`\n🌙 [${todayStr}] 开始执行深夜日记总结...`);

    const activeInfo = 获取当前活跃记忆文件(charName);
    if (!activeInfo.fullLogPath || !fs.existsSync(activeInfo.fullLogPath)) {
        return console.log('今日无对话记录，跳过总结。');
    }

    const fullLogPath = activeInfo.fullLogPath;
    const summaryLogPath = activeInfo.summaryLogPath;
    let chatHistoryText = '';
    const lines = fs.readFileSync(fullLogPath, 'utf-8').split('\n').filter(Boolean);

    for (let i = 1; i < lines.length; i++) {
        try {
            const item = JSON.parse(lines[i]);
            if (item.is_system) continue;

            // 🌟 转换北京时间 智障ISO
            const msgMs = new Date(item.send_date).getTime();
            const msgBJT = new Date(msgMs + 8 * 60 * 60 * 1000); // 强制偏移北京时间
            const msgIso = msgBJT.toISOString();
            const msgDateStr = msgIso.split('T')[0];
            const msgTimeStr = msgIso.substring(11, 16);

            // 🌟 改bug...加拦截日期条件
            if (msgDateStr === todayStr) {
                chatHistoryText += `[${msgTimeStr}] ${item.name}: ${item.mes}\n`;
            }
        } catch (_error) {}
    }

    // 🌟 优化：如果今天其实没聊过天（哪怕文件存在），直接终止，省 Token
    if (!chatHistoryText.trim()) {
        return console.log(`[${todayStr}] 今天没有新增聊天记录，跳过日记生成。`);
    }

    let sensorText = '无特别动态。';
    const sensorPath = 获取梦境事件路径();
    if (fs.existsSync(sensorPath)) {
        try {
            const events = JSON.parse(fs.readFileSync(sensorPath, 'utf-8'));
            const validEvents = events.filter(e => Date.now() - e.timestamp < 24 * 60 * 60 * 1000);
            if (validEvents.length > 0) {
                sensorText = validEvents.map(e => `[${e.timeStr}] ${e.value}`).join('\n');
            }
        } catch (_error) {}
    }

    const summaryPrompt = `【私人深夜日记】\n你现在必须脱离即时对话模式。你是 ${charName}。\n以下是你今天（${todayStr}）与 ${userName} 的完整微信聊天记录，以及她一天的手机动态监测记录。\n\n请你以第一人称的口吻，写一篇 500 中文字左右的私人日记。这篇日记会在你脑海永久保存。\n\n【严格写作要求（违反即崩坏）】：\n1. 坚决摒弃“AI八股味”/机械流水账总结（绝对禁止使用“今天我们讨论了...”、“总而言之”等词汇）。必须根据对话记录分析你的语言习惯，用你特有的语气、思考方式和口吻来记录。\n2. 记录今天的日期，并用简洁的语言描写你真实的情感波动。\n3. 提炼今天两人互动的核心事件。她去干了什么？你干了什么？你们聊了什么？你对她的行为有什么心理活动？\n4. 【重点点名羁绊/纪念物】：如果有特别的“梗”（例如：她今天很不听话，多次故意刷别的App触发你的查岗警报；或者你们互怼、立下了某个约定），必须列出来，作为以后翻旧账或兑现的依据。\n5. 格式：直接输出日记正文，不要带有任何多余的开场白、Markdown标签或解释。\n\n---\n【${userName} 今天的手机动态】：\n${sensorText}\n\n【今天的完整聊天记录】：\n${chatHistoryText}`;

    try {
        console.log(`🧠 正在为 ${charName} 炼化记忆 (今日聊天字数: ${chatHistoryText.length})...`);
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
            body: JSON.stringify({ model: AI_MODEL, messages: [{ role: 'system', content: 获取系统提示词() }, { role: 'user', content: summaryPrompt }], ...AI_PARAMS }),
            signal: AbortSignal.timeout(180000),
        });

        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        const diaryContent = data.choices[0].message.content.trim();
        const bjtIsoString = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00');

        const diaryItem = {
            name: '系统',
            is_user: false,
            is_system: true,
            send_date: bjtIsoString,
            mes: `[每日快照记忆]\n${diaryContent}`,
        };

        let metaLine = `{"chat_metadata":{"integrity":"ab3778e8-5534-412f-8569-926db5226dbb","variables":{"language":"中文","userPov":"第二人称"}},"user_name":"${userName}","character_name":"${charName}"}`;
        if (lines.length > 0 && lines[0].includes('chat_metadata')) {
            metaLine = lines[0];
        }

        if (!fs.existsSync(summaryLogPath)) {
            fs.writeFileSync(summaryLogPath, metaLine + '\n', 'utf-8');
        }
        fs.appendFileSync(summaryLogPath, JSON.stringify(diaryItem) + '\n', 'utf-8');
        console.log(`✅ 已将记忆沉淀至 ${summaryLogPath}`);
    } catch (err) {
        console.error('❌ 日记生成失败:', err.message);
    }
}

let hasRunToday = false;
setInterval(() => {
    const bjNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const hours = bjNow.getUTCHours();
    const minutes = bjNow.getUTCMinutes();

    if (hours === 23 && minutes === 59) {
        if (!hasRunToday) {
            hasRunToday = true;
            performDailySummary();
        }
    } else {
        hasRunToday = false;
    }
}, 60000);

console.log('🌙 记忆总结引擎已就绪，将在北京时间 23:59 准时触发。');
