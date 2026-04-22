import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import {
    获取工作区目录,
    获取记忆目录,
    获取当前活跃记忆文件,
    获取角色名,
    获取用户名,
    设置活跃记忆文件,
} from './lib/runtime-config.js';

const WORKSPACE_DIR = 获取工作区目录();
const MEMORY_DIR = 获取记忆目录();

if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

// 工具函数：获取绝对纯净的北京时间 ISO 字符串。
function 获取北京时间ISO字符串() {
    return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00');
}

function 获取酒馆文件名时间戳() {
    const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}@${pad(d.getUTCHours())}h${pad(d.getUTCMinutes())}m${pad(d.getUTCSeconds())}s${String(d.getUTCMilliseconds()).padStart(3, '0')}ms`;
}

function 确保存在活跃会话文件() {
    const charName = 获取角色名('小白);
    const userName = 获取用户名('用户');
    const activeInfo = 获取当前活跃记忆文件(charName);

    if (activeInfo.fullLogPath) {
        return {
            fullLogPath: activeInfo.fullLogPath,
            summaryLogPath: activeInfo.summaryLogPath,
            charName,
            userName,
            activeFileName: activeInfo.activeFileName,
        };
    }

    const dateStr = 获取酒馆文件名时间戳();
    const newFileName = `${charName} - ${dateStr}.jsonl`;
    const fullLogPath = path.join(MEMORY_DIR, newFileName);
    const summaryLogPath = fullLogPath.replace('.jsonl', '-summary.jsonl');
    const meta = {
        chat_metadata: {
            integrity: crypto.randomUUID(),
            variables: {
                language: '中文',
                userPov: '第二人称',
            },
        },
        user_name: userName,
        character_name: charName,
    };

    fs.writeFileSync(fullLogPath, JSON.stringify(meta) + '\n', 'utf-8');
    设置活跃记忆文件(newFileName);

    return {
        fullLogPath,
        summaryLogPath,
        charName,
        userName,
        activeFileName: newFileName,
    };
}

// 核心：提取过往全部日记 + 今天全量实时聊天。
export function getChatContext(limit = 200) {
    const { fullLogPath, summaryLogPath, charName } = 确保存在活跃会话文件();
    const contextArray = [];

    if (fs.existsSync(summaryLogPath)) {
        const lines = fs.readFileSync(summaryLogPath, 'utf-8').split('\n').filter(Boolean);
        const diaries = [];
        for (let i = 1; i < lines.length; i++) {
            try {
                const item = JSON.parse(lines[i]);
                if (item.mes) diaries.push(item.mes);
            } catch (_error) {}
        }
        if (diaries.length > 0) {
            contextArray.push({ role: 'system', content: `【${charName}的核心快照记忆】：\n${diaries.join('\n\n')}` });
        }
    }

    let scriptText = '【今日实时聊天记录】：\n';
    if (fs.existsSync(fullLogPath)) {
        const lines = fs.readFileSync(fullLogPath, 'utf-8').split('\n').filter(Boolean);
        let todayLogs = [];

        const bjNowMs = Date.now() + 8 * 60 * 60 * 1000;
        const todayStr = new Date(bjNowMs).toISOString().split('T')[0];

        for (let i = 1; i < lines.length; i++) {
            try {
                const item = JSON.parse(lines[i]);
                if (item.is_system) continue;

                const msgMs = new Date(item.send_date).getTime();
                const msgBjMs = msgMs + 8 * 60 * 60 * 1000;
                const msgIso = new Date(msgBjMs).toISOString();
                const msgDateStr = msgIso.split('T')[0];
                const msgTimeStr = msgIso.substring(11, 16);

                if (msgDateStr === todayStr) {
                    todayLogs.push(`[${msgTimeStr}] ${item.name}: ${item.mes}`);
                }
            } catch (_error) {}
        }

        if (todayLogs.length > limit) todayLogs = todayLogs.slice(todayLogs.length - limit);
        scriptText += todayLogs.join('\n');

        if (todayLogs.length > 0) {
            contextArray.push({ role: 'system', content: scriptText });
        }
    }

    return contextArray;
}

export function saveInteraction(userText, _aiThoughts, aiCleanReply) {
    const { fullLogPath, charName, userName } = 确保存在活跃会话文件();
    const sendDate = 获取北京时间ISO字符串();

    if (userText && userText !== '[系统触发]') {
        const userMes = { name: userName, is_user: true, is_system: false, send_date: sendDate, mes: userText };
        fs.appendFileSync(fullLogPath, JSON.stringify(userMes) + '\n', 'utf-8');
    }

    if (aiCleanReply) {
        const aiMes = { name: charName, is_user: false, is_system: false, send_date: sendDate, mes: aiCleanReply };
        fs.appendFileSync(fullLogPath, JSON.stringify(aiMes) + '\n', 'utf-8');
    }
}
