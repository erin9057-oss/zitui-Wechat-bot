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
    获取运行策略
} from './lib/runtime-config.js';

const WORKSPACE_DIR = 获取工作区目录();
const MEMORY_DIR = 获取记忆目录();

if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

function 获取北京时间ISO字符串() {
    return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00');
}

function 获取酒馆文件名时间戳() {
    const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}@${pad(d.getUTCHours())}h${pad(d.getUTCMinutes())}m${pad(d.getUTCSeconds())}s${String(d.getUTCMilliseconds()).padStart(3, '0')}ms`;
}

function 确保存在活跃会话文件() {
    const charName = 获取角色名();
    const userName = 获取用户名();
    
    if (!charName || !userName) throw new Error("无法创建记忆文件：未配置角色或用户名");

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

export function getCurrentSceneInfo() {
    const { fullLogPath } = 确保存在活跃会话文件();
    let currentSceneTitle = "无";
    let currentShifts = { "面具剥离": 0, "软性策略": 0, "理智让渡": 0, "依恋渴望": 0, "权力疲惫": 0, "边界溶解": 0 };
    let currentSceneId = null;
    let foundShifts = false;
    
    if (fs.existsSync(fullLogPath)) {
        const lines = fs.readFileSync(fullLogPath, 'utf-8').split('\n').filter(Boolean);
        for (let i = lines.length - 1; i >= 1; i--) {
            try {
                const item = JSON.parse(lines[i]);
                if (!foundShifts && item.active_shifts && typeof item.active_shifts === 'object') {
                    currentShifts = { ...currentShifts, ...item.active_shifts };
                    foundShifts = true;
                }
                if (currentSceneTitle === "无" && item.scene_title) {
                    currentSceneTitle = item.scene_title;
                    currentSceneId = `scene_${path.basename(fullLogPath)}_${i}`;
                    break;
                }
            } catch(e) {}
        }
    }
    return { currentSceneTitle, currentShifts, currentSceneId };
}

// 🌟 读取动态配置的滑动窗口，并增加【场景边界可视化】与【1小时强制断层切片】
export function getChatContext(limit = 200) {
    const runtimeCfg = 获取运行策略() || {};
    const maxScenes = runtimeCfg.chat_context?.recent_scenes ?? 3;
    
    const { fullLogPath } = 确保存在活跃会话文件();
    const contextArray = [];

    if (fs.existsSync(fullLogPath)) {
        const lines = fs.readFileSync(fullLogPath, 'utf-8').split('\n').filter(Boolean);
        let startIndex = -1;
        let sceneCount = 0;

        for (let i = lines.length - 1; i >= 1; i--) {
            try {
                const item = JSON.parse(lines[i]);
                
                if (item.scene_title) {
                    sceneCount++;
                    startIndex = i; 
                    
                    if (sceneCount >= maxScenes) {
                        break; 
                    }
                }
            } catch(e){}
        }

        if (startIndex === -1) startIndex = Math.max(1, lines.length - limit);

        let contextLogs = [];
        let lastMessageTimeMs = null; // 记录最后一条有效消息的时间

        for (let i = startIndex; i < lines.length; i++) {
            try {
                const item = JSON.parse(lines[i]);
                if (item.is_system) continue;
                const d = new Date(item.send_date);
                const timeStr = d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' });
                
                // 🌟 核心优化 1：给大模型画出明确的场景边界与起点时间
                if (item.scene_title) {
                    contextLogs.push(`\n=== 🎬 [场景：${item.scene_title}] (起点时间: ${timeStr}) ===`);
                }

                contextLogs.push(`[${timeStr}] ${item.name}: ${item.mes}`);
                
                if (!isNaN(d.getTime())) {
                    lastMessageTimeMs = d.getTime();
                }
            } catch (_error) {}
        }

        if (contextLogs.length > 0) {
            let scriptText = `【实时情景上下文（包含最近 ${maxScenes} 个场景的连贯溯源，请注意观察时间流逝边界）】：\n` + contextLogs.join('\n');
            
            // 🌟 核心优化 2：数学级断层检测（超过 1 小时强制切分）
            if (lastMessageTimeMs) {
                const nowMs = Date.now();
                const gapMs = nowMs - lastMessageTimeMs;
                
                // 如果距离上一次说话超过了 1 小时 (3600000 毫秒)
                if (gapMs > 60 * 60 * 1000) {
                    const gapHours = (gapMs / (60 * 60 * 1000)).toFixed(1);
                    scriptText += `\n\n⚠️ [系统强制指令]：注意！当前时间距离上述最后一条历史对话已过去 ${gapHours} 小时！时间发生了显著流逝。请在本次回复的 <scene_eval> 中强制使用 "action": "new" 开启新场景，并根据当前时间和话题概括新的 scene_title！`;
                }
            }

            contextArray.push({ role: 'system', content: scriptText });
        }
    }
    return contextArray;
}

export function getLatestDiaries(limit = 3) {
    const { summaryLogPath } = 确保存在活跃会话文件();
    if (!fs.existsSync(summaryLogPath) || limit <= 0) return [];
    
    const lines = fs.readFileSync(summaryLogPath, 'utf-8').split('\n').filter(Boolean);
    const diaries = [];
    
    for (let i = lines.length - 1; i >= 1; i--) {
        try {
            const item = JSON.parse(lines[i]);
            if (item.mes) {
                diaries.unshift(item.mes); 
                if (diaries.length >= limit) break;
            }
        } catch(e) {}
    }
    return diaries;
}

const DEFAULT_SHIFTS = { "面具剥离": 0, "软性策略": 0, "理智让渡": 0, "依恋渴望": 0, "权力疲惫": 0, "边界溶解": 0 };

function getLastShifts(lines) {
    let shifts = { ...DEFAULT_SHIFTS };
    for (let i = lines.length - 1; i >= 0; i--) {
        try {
            const item = JSON.parse(lines[i]);
            if (item.active_shifts && typeof item.active_shifts === 'object') {
                return { ...shifts, ...item.active_shifts };
            }
        } catch(e) {}
    }
    return shifts;
}

export function saveInteraction(userText, _aiThoughts, aiCleanReply, sceneData = {}) {
    const { fullLogPath, charName, userName } = 确保存在活跃会话文件();
    const sendDate = 获取北京时间ISO字符串();

    let lines = fs.readFileSync(fullLogPath, 'utf-8').split('\n').filter(Boolean);
    let currentShifts = getLastShifts(lines);

    if (sceneData.active_shifts && typeof sceneData.active_shifts === 'object') {
        for (const key in sceneData.active_shifts) {
            if (currentShifts.hasOwnProperty(key)) {
                currentShifts[key] = Number(sceneData.active_shifts[key]);
            }
        }
    }

    let userLineId = -1;
    if (userText && userText !== '[系统触发]') {
        const userMes = { name: userName, is_user: true, is_system: false, send_date: sendDate, mes: userText };
        lines.push(JSON.stringify(userMes));
        userLineId = lines.length - 1; 
    }

    let lastHeadIndex = -1;
    for (let i = lines.length - 1; i >= 1; i--) {
        try {
            const item = JSON.parse(lines[i]);
            if (item.scene_title) {
                lastHeadIndex = i;
                break;
            }
        } catch(e) {}
    }

    let aiMes = { name: charName, is_user: false, is_system: false, send_date: sendDate, mes: aiCleanReply };
    lines.push(JSON.stringify(aiMes));
    let aiLineId = lines.length - 1; 

    let action = sceneData.action === 'new' ? 'new' : 'continue';
    const sceneStartId = (action === 'new' || lastHeadIndex === -1) ? (userLineId !== -1 ? userLineId : aiLineId) : lastHeadIndex;

    if (action === 'new' || lastHeadIndex === -1) {
        try {
            let item = JSON.parse(lines[sceneStartId]);
            item.scene_title = sceneData.title || "新场景";
            item.scene_end_id = aiLineId; 
            item.memory_anchors = {
                zeigarnik: Array.isArray(sceneData.zeigarnik) ? sceneData.zeigarnik : [],
                salient: Array.isArray(sceneData.salient) ? sceneData.salient : []
            };
            item.active_shifts = currentShifts;
            lines[sceneStartId] = JSON.stringify(item); 
        } catch(e){}
    } else {
        try {
            let headItem = JSON.parse(lines[sceneStartId]);
            headItem.scene_end_id = aiLineId; 
            
            if (Array.isArray(sceneData.zeigarnik) && sceneData.zeigarnik.length > 0) {
                headItem.memory_anchors.zeigarnik = [...new Set([...(headItem.memory_anchors.zeigarnik || []), ...sceneData.zeigarnik])];
            }
            if (Array.isArray(sceneData.salient) && sceneData.salient.length > 0) {
                headItem.memory_anchors.salient = [...new Set([...(headItem.memory_anchors.salient || []), ...sceneData.salient])];
            }
            headItem.active_shifts = currentShifts; 
            
            lines[lastHeadIndex] = JSON.stringify(headItem);
        } catch(e) {}
    }

    fs.writeFileSync(fullLogPath, lines.join('\n') + '\n', 'utf-8');

    setTimeout(async () => {
        try {
            const { db, getEmbedding } = await import('./vector_store.js');
            const sceneLines = lines.slice(sceneStartId, aiLineId + 1).map(l => {
                try { const obj = JSON.parse(l); return `${obj.name}: ${obj.mes}`; } catch(e){ return ""; }
            }).filter(Boolean);
            
            const headItem = JSON.parse(lines[sceneStartId]);
            const sTitle = headItem.scene_title || "未知场景";
            const anchors = headItem.memory_anchors || { zeigarnik: [], salient: [] };
            const zStr = (anchors.zeigarnik || []).join(' ');
            const sStr = (anchors.salient || []).join(' ');
            
            const embedText = `[场景: ${sTitle}] 锚点: ${zStr} ${sStr} 对话记录: ${sceneLines.join(' | ')}`;
            const vectorId = `scene_${path.basename(fullLogPath)}_${sceneStartId}`;
            
            const vector = await getEmbedding(embedText);
            if (vector) {
                db.upsert({
                    id: vectorId,
                    type: 'scene',
                    text: embedText,
                    vector: vector,
                    metadata: {
                        source: path.basename(fullLogPath),
                        title: sTitle,
                        date: sendDate,
                        start_id: sceneStartId,
                        end_id: aiLineId,
                        memory_anchors: anchors,
                        active_shifts: currentShifts,
                        created_at: Date.now(),
                        last_accessed_at: Date.now(),
                        access_count: 1,
                        base_importance: 1.0
                    }
                });
                db.saveDB();
            }
        } catch(e) {
            console.error("异步更新场景向量失败:", e.message);
        }
    }, 100);
}
