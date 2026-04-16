import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE_DIR = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin';
const WORKSPACE_DIR = path.join(BASE_DIR, 'workspace');
const MEMORY_DIR = path.join(BASE_DIR, 'Memory');

if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

// 🌟 工具函数：获取北京时间 ISO 字符串 (2026-04-17T01:03:00.000+08:00)
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

export function getChatContext(limit = 40) {
    const { fullLogPath, summaryLogPath } = getActiveSessionFiles();
    let contextArray = [];

    // 1. 读取 Summary 日记
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

    // 2. 读取今天的剧本，转换时间显示
    let scriptText = "【今日实时聊天记录】：\n";
    if (fs.existsSync(fullLogPath)) {
        const lines = fs.readFileSync(fullLogPath, 'utf-8').split('\n').filter(Boolean);
        let todayLogs = [];
        // 获取今天的日期字符串 (BJT) 用于过滤
        const todayStr = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];

        for (let i = 1; i < lines.length; i++) {
            try {
                const item = JSON.parse(lines[i]);
                if (item.is_system) continue;
                
                // 🌟 修正读取显示：解析 send_date 并强制转为北京时间显示给 LLM
                const d = new Date(item.send_date);
                const bjTimeStr = new Date(d.getTime() + (d.getTimezoneOffset() === 0 ? 8*60*60*1000 : 0)).toISOString();
                const time = bjTimeStr.substring(11, 16);
                const msgDate = bjTimeStr.split('T')[0];

                // 只提取当天的记录
                if (msgDate === todayStr) {
                    todayLogs.push(`[${time}] ${item.name}: ${item.mes}`);
                }
            } catch(e) {}
        }
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
    const sendDate = getBJTISOSteing(); // 🌟 写入时强制使用北京时间格式

    if (userText && userText !== "[系统触发]") {
        const userMes = { name: userName, is_user: true, is_system: false, send_date: sendDate, mes: userText };
        fs.appendFileSync(fullLogPath, JSON.stringify(userMes) + '\n', 'utf-8');
    }

    if (aiCleanReply) {
        const aiMes = { name: charName, is_user: false, is_system: false, send_date: sendDate, mes: aiCleanReply };
        fs.appendFileSync(fullLogPath, JSON.stringify(aiMes) + '\n', 'utf-8');
    }
}
