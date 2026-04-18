import express from 'express';
import fs from 'fs';

import {
    获取运行策略,
    获取梦境事件路径,
    获取紧急事件路径,
    写入JSON文件,
    读取JSON文件,
} from './lib/runtime-config.js';

const app = express();
app.use(express.json());

function 获取感知配置() {
    return 获取运行策略().sensor || {};
}

function readEvents() {
    return 读取JSON文件(获取梦境事件路径(), []);
}

function writeEvents(events) {
    写入JSON文件(获取梦境事件路径(), events);
}

app.post('/api/dream/events', (req, res) => {
    const { type, value, secret_token } = req.body;
    const sensorConfig = 获取感知配置();
    const secretToken = sensorConfig.secret_token || 'user_super_secret_666';

    if (secret_token !== secretToken) {
        console.warn('[安全警告] 拦截到无效密钥的请求！');
        return res.status(403).json({ error: '无权访问' });
    }

    if (!type || !value) {
        return res.status(400).json({ error: '参数不完整' });
    }

    const now = Date.now();
    let events = readEvents();

    const retentionHours = Number(sensorConfig.retention_hours ?? 24);
    const retentionMs = retentionHours * 60 * 60 * 1000;
    events = events.filter(e => e.timestamp > now - retentionMs);

    const duplicateWindowMs = Number(sensorConfig.duplicate_window_ms ?? 5 * 60 * 1000);
    const isDuplicate = events.some(e => e.value === value && (now - e.timestamp) < duplicateWindowMs);
    if (isDuplicate) {
        console.log(`[感知层拦截] 重复事件已忽略: ${value}`);
        return res.status(200).json({ status: 'ignored' });
    }

    const bjDate = new Date(now + 8 * 60 * 60 * 1000);
    const timeStr = bjDate.toISOString().replace('T', ' ').substring(11, 16);
    const newEvent = { type, value, timestamp: now, timeStr };

    events.push(newEvent);
    writeEvents(events);

    const urgentApps = Array.isArray(sensorConfig.urgent_apps) ? sensorConfig.urgent_apps : [];
    const isUrgent = urgentApps.some(appName => value.toLowerCase().includes(String(appName).toLowerCase()));

    if (isUrgent) {
        writeEvents(events);
        fs.writeFileSync(获取紧急事件路径(), JSON.stringify(newEvent), 'utf-8');
        console.log(`🚨 [警报触发] 捕捉到高敏操作：${value}，已下发紧急查岗令！`);
    }

    console.log(`✅ [物理记忆刻录] ${timeStr} ${value}`);
    res.status(200).json({
        status: 'success',
        event: newEvent,
        retention_hours: retentionHours,
        duplicate_window_ms: duplicateWindowMs,
    });
});

const sensorConfig = 获取感知配置();
const PORT = Number(sensorConfig.port ?? 7860);
app.listen(PORT, '0.0.0.0', () => {
    console.log('===================================');
    console.log('🌐 物理感知层已启动 (File DB Mode)');
    console.log(`📡 监听端口: ${PORT} | 代谢周期: ${sensorConfig.retention_hours ?? 24}小时`);
    console.log('===================================');
});
