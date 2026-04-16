import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE_DIR = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin';
const WORKSPACE_DIR = path.join(BASE_DIR, 'workspace');
const MEMORY_DIR = path.join(BASE_DIR, 'Memory');

if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

function getCharacterName() {
    const identityPath = path.join(WORKSPACE_DIR, 'IDENTITY.md');
    if (fs.existsSync(identityPath)) {
        const match = fs.readFileSync(identityPath, 'utf-8').match(/-\s*\*\*Name:\*\*\s*(.+)/i);
        if (match && match[1]) return match[1].trim();
    }
    return "小白";
}

function getUserName() {
    const userPath = path.join(WORKSPACE_DIR, 'USER.md');
    if (fs.existsSync(userPath)) {
        const match = fs.readFileSync(userPath, 'utf-8').match(/-\s*\*\*Name:\*\*\s*(.+)/i);
        if (match && match[1]) return match[1].trim();
    }
    return "用户";
}

function getSillyTavernDateStr() {
    const d = new Date(Date.now() + 8 * 60 * 60 * 1000); 
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}@${pad(d.getUTCHours())}h${pad(d.getUTCMinutes())}m${pad(d.getUTCSeconds())}s${String(d.getUTCMilliseconds()).padStart(3, '0')}ms`;
}

function getActiveSessionFiles() {
    const charName = getCharacterName();
    // 确保绝对不抓取 summary 文件
    const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.jsonl') && f.startsWith(charName) && !f.includes('summary'));
    
    let fullLogPath, summaryLogPath;
    if (files.length > 0) {
        files.sort((a, b) => fs.statSync(path.join(MEMORY_DIR, b)).mtimeMs - fs.statSync(path.join(MEMORY_DIR, a)).mtimeMs);
        fullLogPath = path.join(MEMORY_DIR, files[0]);
        // 🌟 核心修复：去掉空格，严丝合缝匹配你上传的 -summary.jsonl
        summaryLogPath = fullLogPath.replace('.jsonl', '-summary.jsonl');
    } else {
        const dateStr = getSillyTavernDateStr();
        fullLogPath = path.join(MEMORY_DIR, `${charName} - ${dateStr}.jsonl`);
        summaryLogPath = path.join(MEMORY_DIR, `${charName} - ${dateStr}-summary.jsonl`);

        const meta = {
            "chat_metadata": { "integrity": crypto.randomUUID(), "variables": { "language": "中文", "userPov": "第二人称" } },
            "user_name": getUserName(),
            "character_name": charName
        };
        fs.writeFileSync(fullLogPath, JSON.stringify(meta) + '\n', 'utf-8');
        // 初始化时顺手把 summary 的 Meta 头也写好
        if (!fs.existsSync(summaryLogPath)) {
            fs.writeFileSync(summaryLogPath, JSON.stringify(meta) + '\n', 'utf-8');
        }
    }
    return { fullLogPath, summaryLogPath, charName, userName: getUserName() };
}

// 🌟 提取全部 Summary 和 今天非 Summary，组装发给 AI 的上下文
export function getChatContext(limit = 40) {
    const { fullLogPath, summaryLogPath } = getActiveSessionFiles();
    let contextArray = [];

    // 1. 🌟 优先注入过往的【核心快照日记】
    if (fs.existsSync(summaryLogPath)) {
        const lines = fs.readFileSync(summaryLogPath, 'utf-8').split('\n').filter(Boolean);
        let diaries = [];
        for (let i = 1; i < lines.length; i++) { // 跳过第一行的 Meta 头
            try {
                const item = JSON.parse(lines[i]);
                if (item.mes) diaries.push(item.mes);
            } catch(e) {}
        }
        if (diaries.length > 0) {
            // 将所有日记拼接成一个高权重系统级记忆块
            contextArray.push({ 
                role: "system", 
                content: `【顾时夜的核心快照记忆】：\n${diaries.join('\n\n')}` 
            });
        }
    }

    // 2. 🌟 随后注入今天的【实时聊天剧本】
    let scriptText = "【今日实时聊天记录】：\n";
    if (fs.existsSync(fullLogPath)) {
        const lines = fs.readFileSync(fullLogPath, 'utf-8').split('\n').filter(Boolean);
        let todayLogs = [];
        for (let i = 1; i < lines.length; i++) {
            try {
                const item = JSON.parse(lines[i]);
                if (item.is_system) continue; // 只读你们俩的真实对话
                const time = new Date(item.send_date).toISOString().substring(11, 16);
                todayLogs.push(`[${time}] ${item.name}: ${item.mes}`);
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

// 🌟 存入 memory，只存全量记录，绝不碰 summary 文件 (留给 summary.js 去处理)
export function saveInteraction(userText, aiThoughts, aiCleanReply) {
    const { fullLogPath, charName, userName } = getActiveSessionFiles();
    const sendDate = new Date().toISOString();

    if (userText && userText !== "[系统触发]") {
        const userMes = { 
            name: userName, 
            is_user: true, 
            is_system: false, 
            send_date: sendDate, 
            mes: userText 
        };
        fs.appendFileSync(fullLogPath, JSON.stringify(userMes) + '\n', 'utf-8');
    }

    if (aiCleanReply) {
        // 🚀 核心修改：去掉了 extra: { reasoning: aiThoughts }，只存最纯净的聊天文本！
        const aiMes = { 
            name: charName, 
            is_user: false, 
            is_system: false, 
            send_date: sendDate, 
            mes: aiCleanReply 
        };
        fs.appendFileSync(fullLogPath, JSON.stringify(aiMes) + '\n', 'utf-8');
    }
}
