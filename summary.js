/*
 * 每日深夜记忆降维引擎 (23:59 触发)
 */
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin';
const WORKSPACE_DIR = path.join(BASE_DIR, 'workspace');
const MEMORY_DIR = path.join(BASE_DIR, 'Memory');

const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const extConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const AI_API_URL = `${extConfig.chat_llm.api_base_url.replace(/\/$/, '')}/chat/completions`; 
const AI_API_KEY = extConfig.chat_llm.api_key;
const AI_MODEL = extConfig.chat_llm.model_name;

const API_CONF_PATH = path.join(WORKSPACE_DIR, 'API.json');
let AI_PARAMS = {};
if (fs.existsSync(API_CONF_PATH)) {
    AI_PARAMS = JSON.parse(fs.readFileSync(API_CONF_PATH, 'utf-8')).agents?.defaults?.params || {};
}

function getNames() {
    let charName = "小白", userName = "用户";
    try {
        const idContent = fs.readFileSync(path.join(WORKSPACE_DIR, 'IDENTITY.md'), 'utf-8');
        const idMatch = idContent.match(/-\s*\*\*Name:\*\*\s*(.+)/i);
        if (idMatch) charName = idMatch[1].trim();

        const userContent = fs.readFileSync(path.join(WORKSPACE_DIR, 'USER.md'), 'utf-8');
        const userMatch = userContent.match(/-\s*\*\*Name:\*\*\s*(.+)/i);
        if (userMatch) userName = userMatch[1].trim();
    } catch(e) {}
    return { charName, userName };
}

function getSystemPrompt() {
    const mdPath = path.join(WORKSPACE_DIR, 'AGENTS.md');
    return fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf-8') : "";
}

async function performDailySummary() {
    const { charName, userName } = getNames();
    const todayStr = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
    console.log(`\n🌙 [${todayStr}] 开始深夜日记...`);

    const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.jsonl') && f.startsWith(charName) && !f.includes('summary'));
    if (files.length === 0) return console.log("今日无对话记录，跳过总结。");
    
    files.sort((a, b) => fs.statSync(path.join(MEMORY_DIR, b)).mtimeMs - fs.statSync(path.join(MEMORY_DIR, a)).mtimeMs);
    const fullLogPath = path.join(MEMORY_DIR, files[0]);
    
    // 🌟 核心修复：匹配无空格的 -summary.jsonl
    const summaryLogPath = fullLogPath.replace('.jsonl', '-summary.jsonl');

    let chatHistoryText = "";
    const lines = fs.readFileSync(fullLogPath, 'utf-8').split('\n').filter(Boolean);
    for (let i = 1; i < lines.length; i++) {
        try {
            const item = JSON.parse(lines[i]);
            if (item.is_system) continue;
            const time = new Date(item.send_date).toISOString().substring(11, 16);
            chatHistoryText += `[${time}] ${item.name}: ${item.mes}\n`;
        } catch(e) {}
    }

    let sensorText = "无特别动态。";
    const sensorPath = path.join(WORKSPACE_DIR, 'dream_events.json');
    if (fs.existsSync(sensorPath)) {
        try {
            const events = JSON.parse(fs.readFileSync(sensorPath, 'utf-8'));
            // 确保抓取 24 小时内的手机事件入库
            const validEvents = events.filter(e => Date.now() - e.timestamp < 24 * 60 * 60 * 1000);
            if (validEvents.length > 0) {
                sensorText = validEvents.map(e => `[${e.timeStr}] ${e.value}`).join('\n');
            }
        } catch (e) {}
    }

    const summaryPrompt = `【私人深夜日记】
你现在必须脱离即时对话模式。你是 ${charName}。
以下是你今天（${todayStr}）与 ${userName} 的完整微信聊天记录，以及她一天的手机动态监测记录。

请你以第一人称的口吻，写一篇 500 中文字左右的私人日记。这篇日记会在你脑海永久保存。

【严格写作要求（违反即崩坏）】：
1. 坚决摒弃“AI八股味”/机械流水账总结（绝对禁止使用“今天我们讨论了...”、“总而言之”等词汇）。必须根据对话记录分析你的语言习惯，用你特有的语气、思考方式和口吻来记录。
2. 记录今天的日期，并用简洁的语言描写你真实的情感波动。
3. 提炼今天两人互动的核心事件。她去干了什么？你干了什么？你们聊了什么？你对她的行为有什么心理活动？
4. 【重点点名羁绊/纪念物】：如果有特别的“梗”（例如：她今天很不听话，多次故意刷别的App触发你的查岗警报；或者你们互怼、立下了某个约定），必须列出来，作为以后翻旧账或兑现的依据。
5. 格式：直接输出日记正文，不要带有任何多余的开场白、Markdown标签或解释。

---
【${userName} 今天的手机动态】：
${sensorText}

【今天的完整聊天记录】：
${chatHistoryText || "今天没有聊天。"}
`;

    try {
        console.log(`🧠 正在生成 ${charName} 的私人日记...`);
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_API_KEY}` },
            body: JSON.stringify({ 
                model: AI_MODEL, 
                messages: [
                    { role: "system", content: getSystemPrompt() },
                    { role: "user", content: summaryPrompt }
                ], 
                ...AI_PARAMS 
            }),
            signal: AbortSignal.timeout(180000) 
        });

        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        const diaryContent = data.choices[0].message.content.trim();

        console.log(`\n📔 [日记生成完毕]:\n${diaryContent}\n`);

        let metaLine = '{"chat_metadata":{"integrity":"ab3778e8-5534-412f-8569-926db5226dbb","variables":{"language":"中文","userPov":"第二人称"}},"user_name":"' + userName + '","character_name":"' + charName + '"}';
        if (lines.length > 0 && lines[0].includes("chat_metadata")) {
            metaLine = lines[0];
        }

        const diaryItem = {
            name: "系统",
            is_user: false,
            is_system: true,
            send_date: new Date().toISOString(),
            mes: `[每日快照记忆]\n${diaryContent}`
        };

        // 追加写入（不要覆盖之前的过往日记！）
        if (!fs.existsSync(summaryLogPath)) {
            fs.writeFileSync(summaryLogPath, metaLine + '\n', 'utf-8');
        }
        fs.appendFileSync(summaryLogPath, JSON.stringify(diaryItem) + '\n', 'utf-8');
        console.log(`✅ 已将长文本聊天记录压缩为日记，并追加至 ${summaryLogPath}`);

    } catch (err) {
        console.error(`❌ 日记生成失败:`, err.message);
    }
}

let hasRunToday = false;
setInterval(() => {
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000); 
    if (now.getUTCHours() === 23 && now.getUTCMinutes() === 59) {
        if (!hasRunToday) {
            hasRunToday = true;
            performDailySummary();
        }
    } else {
        hasRunToday = false; 
    }
}, 60000);

console.log("🌙 日记引擎已启动，等待 23:59...");
