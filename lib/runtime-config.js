import fs from 'fs';
import path from 'path';

// 统一管理 bot 的路径与配置读取逻辑。
// 所有脚本都应尽量通过这里获取目录、主配置、运行策略与当前启用的记忆文件，避免继续散落硬编码。

export const DEFAULT_BASE_DIR = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin';

export function 获取基础目录() {
    return process.env.ZWB_BASE_DIR || DEFAULT_BASE_DIR;
}

export function 获取工作区目录() {
    return path.join(获取基础目录(), 'workspace');
}

export function 获取记忆目录() {
    return path.join(获取基础目录(), 'Memory');
}

export function 获取账号目录() {
    return path.join(获取基础目录(), 'accounts');
}

export function 获取主配置路径() {
    return path.join(获取基础目录(), 'config.json');
}

export function 获取传感映射路径() {
    return path.join(获取基础目录(), 'sensor_map.json');
}

export function 获取运行策略路径() {
    return path.join(获取工作区目录(), 'plugin_runtime.json');
}

export function 获取活跃记忆路径() {
    return path.join(获取工作区目录(), 'active_memory.json');
}

export function 获取梦境事件路径() {
    return path.join(获取工作区目录(), 'dream_events.json');
}

export function 获取紧急事件路径() {
    return path.join(获取工作区目录(), 'urgent_event.json');
}

export function 读取JSON文件(filePath, fallbackValue = {}) {
    try {
        if (!fs.existsSync(filePath)) return fallbackValue;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (_error) {
        return fallbackValue;
    }
}

export function 写入JSON文件(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function 读取文本文件(filePath, fallbackValue = '') {
    try {
        if (!fs.existsSync(filePath)) return fallbackValue;
        return fs.readFileSync(filePath, 'utf-8');
    } catch (_error) {
        return fallbackValue;
    }
}

export function 获取主配置() {
    return 读取JSON文件(获取主配置路径(), {});
}

export function 获取默认运行策略() {
    return {
        path_mode: 'local',
        remote_bridge_base_url: 'http://127.0.0.1:7860',
        wait_time_ms: 7000,
        idle_limit_ms: 30 * 60 * 1000,
        wake_window: {
            start_hour: 9,
            end_hour: 3,
        },
        sensor: {
            secret_token: 'user_super_secret_666',
            port: 7860,
            urgent_apps: [],
            duplicate_window_ms: 5 * 60 * 1000,
            retention_hours: 24,
        },
        backup: {
            include_accounts: true,
            include_config_json: true,
            include_sensor_map_json: true,
            include_workspace: true,
            include_memory: true,
        },
    };
}

function 是否为普通对象(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function 深合并(target, source) {
    const result = structuredClone(target);
    for (const [key, value] of Object.entries(source || {})) {
        if (Array.isArray(value)) {
            result[key] = [...value];
            continue;
        }
        if (是否为普通对象(value) && 是否为普通对象(result[key])) {
            result[key] = 深合并(result[key], value);
            continue;
        }
        result[key] = value;
    }
    return result;
}

export function 获取运行策略() {
    return 深合并(获取默认运行策略(), 读取JSON文件(获取运行策略路径(), {}));
}

export function 获取活跃记忆配置() {
    return 读取JSON文件(获取活跃记忆路径(), {
        active_full_log: null,
        updated_at: null,
        note: '当该值为空时，系统会回退到旧的按最新修改时间自动选择逻辑。',
    });
}

export function 设置活跃记忆文件(fileName) {
    写入JSON文件(获取活跃记忆路径(), {
        active_full_log: fileName || null,
        updated_at: new Date().toISOString(),
    });
}

export function 提取Markdown中的名字(filePath, fallbackValue) {
    const content = 读取文本文件(filePath, '');
    const match = content.match(/-\s*\*\*Name:\*\*\s*(.+)/i);
    return match && match[1] ? match[1].trim() : fallbackValue;
}

export function 获取角色名(defaultValue = '小白') {
    return 提取Markdown中的名字(path.join(获取工作区目录(), 'IDENTITY.md'), defaultValue);
}

export function 获取用户名(defaultValue = '用户') {
    return 提取Markdown中的名字(path.join(获取工作区目录(), 'USER.md'), defaultValue);
}

export function 列出角色记忆文件(charName = 获取角色名()) {
    const memoryDir = 获取记忆目录();
    if (!fs.existsSync(memoryDir)) return [];
    return fs.readdirSync(memoryDir)
        .filter(fileName => fileName.endsWith('.jsonl') && fileName.startsWith(charName) && !fileName.includes('summary'))
        .sort((a, b) => fs.statSync(path.join(memoryDir, b)).mtimeMs - fs.statSync(path.join(memoryDir, a)).mtimeMs);
}

export function 获取当前活跃记忆文件(charName = 获取角色名()) {
    const memoryDir = 获取记忆目录();
    if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });

    const activeConfig = 获取活跃记忆配置();
    const allFiles = 列出角色记忆文件(charName);
    const explicitName = activeConfig.active_full_log;

    if (explicitName && allFiles.includes(explicitName)) {
        const fullLogPath = path.join(memoryDir, explicitName);
        return {
            fullLogPath,
            summaryLogPath: fullLogPath.replace('.jsonl', '-summary.jsonl'),
            activeFileName: explicitName,
            source: 'active_memory',
        };
    }

    if (allFiles.length > 0) {
        const fallbackName = allFiles[0];
        const fullLogPath = path.join(memoryDir, fallbackName);
        return {
            fullLogPath,
            summaryLogPath: fullLogPath.replace('.jsonl', '-summary.jsonl'),
            activeFileName: fallbackName,
            source: 'latest_file',
        };
    }

    return {
        fullLogPath: null,
        summaryLogPath: null,
        activeFileName: null,
        source: 'empty',
    };
}

export function 当前北京时间() {
    return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

export function 当前是否处于唤醒时段() {
    const runtime = 获取运行策略();
    const hour = 当前北京时间().getUTCHours();
    const start = Number(runtime.wake_window?.start_hour ?? 9);
    const end = Number(runtime.wake_window?.end_hour ?? 3);

    if (start === end) return true;
    if (start < end) {
        return hour >= start && hour < end;
    }
    return hour >= start || hour < end;
}
