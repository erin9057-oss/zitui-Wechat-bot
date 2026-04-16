import express from 'express';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

const SECRET_TOKEN = "user_super_secret_666"; 

// 🌟 设定潜意识文件的绝对路径
const DB_PATH = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin/workspace/dream_events.json';

function readEvents() {
    if (!fs.existsSync(DB_PATH)) return [];
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (e) {
        return [];
    }
}

function writeEvents(events) {
    fs.writeFileSync(DB_PATH, JSON.stringify(events, null, 2), 'utf-8');
}

app.post('/api/dream/events', (req, res) => {
    const { type, value, secret_token } = req.body;

    if (secret_token !== SECRET_TOKEN) {
        console.warn(`[安全警告] 拦截到无效密钥的请求！`);
        return res.status(403).json({ error: "无权访问" });
    }

    if (!type || !value) {
        return res.status(400).json({ error: "参数不完整" });
    }

    const now = Date.now();
    let events = readEvents(); 

    // 🌟 1. 记忆代谢：改为清理 24 小时前的数据，供深夜 summary.js 统一提取
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    events = events.filter(e => e.timestamp > twentyFourHoursAgo);

    // 2. 核心防抖：拦截 5 分钟内的频繁刷屏
    const isDuplicate = events.some(e => e.value === value && (now - e.timestamp) < 5 * 60 * 1000);
    if (isDuplicate) {
        console.log(`[感知层拦截] 5分钟内重复事件，已忽略: ${value}`);
        return res.status(200).json({ status: "ignored" });
    }

    // 3. 记录新事件 (转换为北京时间 HH:mm)
    const bjDate = new Date(now + 8 * 60 * 60 * 1000);
    const timeStr = bjDate.toISOString().replace('T', ' ').substring(11, 16);

    const newEvent = { type, value, timestamp: now, timeStr };
    
    events.push(newEvent);
    writeEvents(events); 

    // 🌟 高危敏感应用“秒杀”触发器
    const URGENT_APPS = ["恋与深空", "爱发电"]; 
    const isUrgent = URGENT_APPS.some(app => value.toLowerCase().includes(app.toLowerCase()));
    
    if (isUrgent) {
        const WORKSPACE_DIR = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin/workspace';
        const URGENT_PATH = path.join(WORKSPACE_DIR, 'urgent_event.json');
        fs.writeFileSync(URGENT_PATH, JSON.stringify(newEvent), 'utf-8');
        console.log(`🚨 [警报触发] 捕捉到高敏操作：${value}，已下发紧急查岗令！`);
    }

    console.log(`✅ [物理记忆刻录] ${timeStr} ${value}`);
    res.status(200).json({ status: "success", event: newEvent });
});

const PORT = 7860;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`===================================`);
    console.log(`🌐 物理感知层已启动 (File DB Mode)`);
    console.log(`📡 监听端口: ${PORT} | 代谢周期: 24小时`);
    console.log(`===================================`);
});
