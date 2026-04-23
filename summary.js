/*
 * 每日深夜记忆降维引擎（北京时间 23:59 触发）
 */
import fs from 'fs';
import {
    获取工作区目录,
    获取主配置,
    获取角色名,
    获取用户名,
    获取梦境事件路径, // 🌟 加回了读取梦境事件的路径依赖
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

function 获取北京时间日期字符串(dateInput) {
    const d = new Date(dateInput);
    return d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
}

// 🌟 核心加回：读取今日的手机动态
function 获取今日手机动态(todayStr) {
    const eventsPath = 获取梦境事件路径();
    if (!fs.existsSync(eventsPath)) return "";
    try {
        const events = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
        const todayEvents = events.filter(e => {
            if (!e.timestamp) return false;
            const eDateStr = 获取北京时间日期字符串(e.timestamp);
            return eDateStr === todayStr;
        });
        
        if (todayEvents.length === 0) return "";
        return `\n【今日手机应用动态（潜意识感知）】：\n` + todayEvents.map(e => `[${e.timeStr}] 她 ${e.value}`).join('\n');
    } catch (e) {
        return "";
    }
}

async function performDailySummary() {
    const charName = 获取角色名();
    const userName = 获取用户名();
    
    // 获取当天的北京时间日期 (YYYY-MM-DD)
    const todayStr = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');

    const activeInfo = 获取当前活跃记忆文件(charName);
    if (!activeInfo.fullLogPath || !fs.existsSync(activeInfo.fullLogPath)) {
        return console.log('❌ 找不到活跃会话文件，取消日记生成。');
    }

    const summaryLogPath = activeInfo.summaryLogPath;
    console.log(`\n🌙 深夜降临，正在为 ${todayStr} 梳理记忆...`);

    const lines = fs.readFileSync(activeInfo.fullLogPath, 'utf-8').split('\n').filter(Boolean);
    
    let todayLogs = [];
    for (let i = 1; i < lines.length; i++) {
        try {
            const item = JSON.parse(lines[i]);
            if (item.is_system) continue;

            const msgDateStr = 获取北京时间日期字符串(item.send_date);

            if (msgDateStr === todayStr) {
                const timeStr = new Date(item.send_date).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, hour: '2-digit', minute: '2-digit' });
                todayLogs.push(`[${timeStr}] ${item.name}: ${item.mes}`);
            }
        } catch (e) {}
    }

    // 🌟 获取传感器动态
    const sensorText = 获取今日手机动态(todayStr);

    // 如果今天既没有聊天，也没有手机动态，才真正跳过
    if (todayLogs.length === 0 && !sensorText) {
        return console.log(`⏩ ${todayStr} 没有任何聊天和手机动态记录，跳过日记生成。`);
    }

    console.log(`📊 筛选完毕，今日共有 ${todayLogs.length} 条对话记录，以及手机动态感知。`);

    // 🌟 将 sensorText 完美嵌入 Prompt 中
    const summaryPrompt = `【私人深夜日记】\n你现在必须脱离即时对话模式。你是 ${charName}。\n以下是你（${todayStr}）与 ${userName} 的【仅限今日】微信聊天记录及感知动态。\n\n请你以第一人称的口吻，写一篇 500 中文字左右的私人日记。这篇日记会在你脑海永久保存。\n\n【写作要求】：\n1. 语气必须符合你的性格设定，禁止使用 AI 八股文式的总结陈词。\n2. 重点记录你对她的心理活动、你们当天的互动核心，以及她让你印象深刻的行为。\n3. 严禁提及或总结以前日子的历史记录，只需专注今天的内容。\n\n【今日对话记录】：\n${todayLogs.join('\n')}${sensorTexconst summaryPrompt = `【私人深夜日记】\n你现在必须脱离即时对话模式。你是 ${charName}。\n以下是你（${todayStr}）与 ${userName} 的【仅限今日】微信聊天记录。\n\n请你以第一人称的口吻，写一篇 500 中文字左右的私人日记。这篇日记会在你脑海永久保存。\n\n【严格写作要求（违反即崩坏）】：\n1. 坚决摒弃“AI八股味”/机械流水账总结（绝对禁止使用“今天我们讨论了...”、“总而言之”等词汇）。必须根据对话记录分析你的语言习惯，用你特有的语气、思考方式和口吻来记录。\n2. 记录今天的日期，并用简洁的语言描写你真实的情感波动。\n3. 提炼今天两人互动的核心事件。她去干了什么？你干了什么？你们聊了什么？你对她的行为有什么心理活动？\n4. 【重点点名羁绊/纪念物】：如果有特别的“梗”（例如：她今天很不听话，多次故意刷别的App触发你的查岗警报；或者你们互怼、立下了某个约定），必须列出来，作为以后翻旧账或兑现的依据。\n5. 格式：直接输出日记正文，不要带有任何多余的开场白、Markdown标签或解释。严禁提及或总结以前日子的历史记录，只需专注今天的内容。\n\n---\n【${userName} 今天的手机动态】：\n${sensorText}\n\n【今天的完整聊天记录】：\n${todayLogs.join('\n')}`;

    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
            body: JSON.stringify({ 
                model: AI_MODEL, 
                messages: [{ role: 'system', content: 获取系统提示词() }, { role: 'user', content: summaryPrompt }], 
                ...AI_PARAMS 
            }),
            signal: AbortSignal.timeout(180000),
        });

        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        const diaryContent = data.choices[0].message.content.trim();

        let metaLine = `{"chat_metadata":{"integrity":"ab3778e8-5534-412f-8569-926db5226dbb","variables":{"language":"中文","userPov":"第二人称"}},"user_name":"${userName}","character_name":"${charName}"}`;
        if (lines.length > 0 && lines[0].includes('character_name')) {
            metaLine = lines[0];
        }

        const bjtIso = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00');
        const diaryItem = { name: '系统', is_user: false, is_system: true, send_date: bjtIso, mes: `[每日快照记忆]\n${diaryContent}` };

        if (!fs.existsSync(summaryLogPath)) {
            fs.writeFileSync(summaryLogPath, metaLine + '\n', 'utf-8');
        }
        fs.appendFileSync(summaryLogPath, JSON.stringify(diaryItem) + '\n', 'utf-8');
        console.log(`✅ ${todayStr} 的记忆已精准沉淀。`);
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
            performDailySummary();
            hasRunToday = true;
        }
    } else {
        hasRunToday = false;
    }
}, 30000);
