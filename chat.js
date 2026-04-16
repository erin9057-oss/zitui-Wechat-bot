import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE_DIR = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin';
const WORKSPACE_DIR = path.join(BASE_DIR, 'workspace');
const MEMORY_DIR = path.join(BASE_DIR, 'Memory');

if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

// 🌟 工具函数：获取绝对纯净的北京时间 ISO 字符串
function getBJTISOSteing() {
    return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00');
}

function getCharacterName() {
    const identityPath = path.join(WORKSPACE_DIR, 'IDENTITY.md');
    if (fs.existsSync(identityPath)) {
        const match = fs.readFileSync(identityPath, 'utf-8').match(/-\s*\*\*Name:\*\*\s*(.+)/i);
        if (match && match[1]) return match[1].trim();
    }
    return "顾时夜";
}

function getUserName() {
    const userPath = path.join(WORKSPACE_DIR, 'USER.md');
    if (fs.existsSync(userPath)) {
        const match = fs.readFileSync(userPath, 'utf-8').match(/-\s*\*\*Name:\*\*\s*(.+)/i);
        if (match && match[1]) return match[1].trim();
    }
    return "林枫";
}

function getSillyTavernDateStr() {
    const d = new Date(Date.now() + 8 * 60 * 60 * 1000); 
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}@${pad(d.getUTCHours())}h${pad(d.getUTCMinutes())}m${pad(d.getUTCSeconds())}s${String(d.getUTCMilliseconds()).padStart(3, '0')}ms`;
}

function getActiveSessionFiles() {
    const charName = getCharacterName();
    const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.jsonl') && f.startsWith(charName) && !f.includes('summary'));
    
    let fullLogPath, summaryLogPath;
    if (files.length > 0) {
        files.sort((a, b) => fs.statSync(path.join(MEMORY_DIR, b)).mtimeMs - fs.statSync(path.join(MEMORY_DIR, a)).mtimeMs);
        fullLogPath = path.join(MEMORY_DIR, files[0]);
        summaryLogPath = fullLogPath.replace('.jsonl', '-summary.jsonl');
    } else {
        const dateStr = getSillyTavernDateStr();
        fullLogPath = path.join(MEMORY_DIR, `${charName} - ${dateStr}.jsonl`);
        summaryLogPath = path.join(MEMORY_DIR, `${charName} - ${dateStr}-summary.jsonl`);
        const meta = { "chat_metadata": { "integrity": crypto.randomUUID(), "variables": { "language": "中文", "userPov": "第二人称" } }, "user_name": getUserName(), "character_name": charName };
        fs.writeFileSync(fullLogPath, JSON.stringify(meta) + '\n', 'utf-8');
    }
    return { fullLogPath, summaryLogPath, charName, userName: getUserName() };
}

// 🌟 核心：提取过往全部日记 + 今天全量实时聊天
export function getChatContext(limit = 200) { // 放宽到200条，保证真正的一天“全量”
    const { fullLogPath, summaryLogPath } = getActiveSessionFiles();
    let contextArray = [];

    // 1. 读取所有的 Summary 快照日记（代表昨天及以前的记忆）
    if (fs.existsSync(summaryLogPath)) {
        const lines = fs.readFileSync(summaryLogPath, 'utf-8').split('\n').filter(Boolean);
        let diaries = [];
        for (let i = 1; i < lines.length; i++) {
            try {
                const item = JSON.parse(lines[i]);
                if (item.mes) diaries.push(item.mes);
            } catch(e) {}
        }
        if (diaries.length > 0) {
            contextArray.push({ role: "system", content: `【顾时夜的核心快照记忆】：\n${diaries.join('\n\n')}` });
        }
    }

    // 2. 读取今天的全量剧本，完美规避与昨日日记重复
    let scriptText = "【今日实时聊天记录】：\n";
    if (fs.existsSync(fullLogPath)) {
        const lines = fs.readFileSync(fullLogPath, 'utf-8').split('\n').filter(Boolean);
        let todayLogs = [];
        
        // 🌟 强行算出此刻（发消息时）的北京日期字符串，如 "2026-04-17"
        const bjNowMs = Date.now() + 8 * 60 * 60 * 1000;
        const todayStr = new Date(bjNowMs).toISOString().split('T')[0];

        for (let i = 1; i < lines.length; i++) {
            try {
                const item = JSON.parse(lines[i]);
                if (item.is_system) continue;
                
                // 🌟 将每一条消息的时间戳，转化为绝对的北京时间和日期
                const msgMs = new Date(item.send_date).getTime();
                const msgBjMs = msgMs + 8 * 60 * 60 * 1000;
                const msgIso = new Date(msgBjMs).toISOString(); // 得到 2026-04-17T01:03:00.000Z 格式
                
                const msgDateStr = msgIso.split('T')[0];
                const msgTimeStr = msgIso.substring(11, 16);

                // 🎯 核心：只要日历对得上今天，就全量加入！如果跨过了0点，过往记录将自动被截断抛弃，交由日记接管！
                if (msgDateStr === todayStr) {
                    todayLogs.push(`[${msgTimeStr}] ${item.name}: ${item.mes}`);
                }
            } catch(e) {}
        }
        
        // 增加了一个 200 条的超大防爆限制，防止你一天聊了上万句把大模型撑爆，日常使用相当于全量
        if (todayLogs.length > limit) todayLogs = todayLogs.slice(todayLogs.length - limit);
        scriptText += todayLogs.join('\n');
        
        if (todayLogs.length > 0) {
            contextArray.push({ role: "system", content: scriptText });
        }
    }
    return contextArray;
}

export function saveInteraction(userText, aiThoughts, aiCleanReply) {
    const { fullLogPath, charName, userName } = getActiveSessionFiles();
    const sendDate = getBJTISOSteing(); // 强行写入北京时间格式

    if (userText && userText !== "[系统触发]") {
        const userMes = { name: userName, is_user: true, is_system: false, send_date: sendDate, mes: userText };
        fs.appendFileSync(fullLogPath, JSON.stringify(userMes) + '\n', 'utf-8');
    }

    if (aiCleanReply) {
        // 纯净写入，不带 extra: reasoning
        const aiMes = { name: charName, is_user: false, is_system: false, send_date: sendDate, mes: aiCleanReply };
        fs.appendFileSync(fullLogPath, JSON.stringify(aiMes) + '\n', 'utf-8');
    }
}
