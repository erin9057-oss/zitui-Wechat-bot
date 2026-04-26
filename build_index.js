import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { VectorStore } from './vector_store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin';
const WORKSPACE_DIR = path.join(BASE_DIR, 'workspace');
const MEMORY_DIR = path.join(BASE_DIR, 'Memory');
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');

let config = {};
if (fs.existsSync(CONFIG_PATH)) {
    try {
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {
        console.error("读取 config.json 失败:", e.message);
    }
}

const EMBED_CONFIG = config.embedding || {
    api_base_url: "https://api.siliconflow.cn/v1",
    api_key: "",
    model_name: "Qwen/Qwen3-Embedding-8B"
};

const DB_PATH = path.join(WORKSPACE_DIR, 'vector_db.json');
const db = new VectorStore(DB_PATH);

async function getEmbedding(text) {
    try {
        const res = await fetch(`${EMBED_CONFIG.api_base_url.replace(/\/$/, '')}/embeddings`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${EMBED_CONFIG.api_key}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: EMBED_CONFIG.model_name,
                input: text
            })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return data.data[0].embedding;
    } catch (e) {
        console.error(`向量化 API 请求错误: ${e.message}`);
        return null;
    }
}

function processSummaryFile(filePath) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    if (lines.length <= 1) return;

    for (let i = 1; i < lines.length; i++) {
        try {
            const item = JSON.parse(lines[i]);
            if (!item.mes) continue;
            
            const dateStr = item.send_date.substring(0, 10);
            const id = `diary_${dateStr}_${i}`;
            
            if (db.records.find(r => r.id === id)) continue;

            const anchors = item.memory_anchors || {};
            const zStr = (anchors.zeigarnik || []).join(' ');
            const sStr = (anchors.salient || []).join(' ');
            const embedText = `[日期: ${dateStr}] 日记内容: ${item.mes} ${zStr} ${sStr}`;

            globalChunksToProcess.push({
                id,
                type: 'diary',
                text: embedText,
                metadata: {
                    source: path.basename(filePath),
                    date: item.send_date,
                    memory_anchors: anchors,
                    active_shifts: item.active_shifts || {},
                    created_at: new Date(item.send_date).getTime(),
                    last_accessed_at: Date.now(),
                    access_count: 1,
                    base_importance: 1.5 
                }
            });
        } catch(e) {
            // 忽略格式损坏的行
        }
    }
}

function processFullLogFile(filePath) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    if (lines.length <= 1) return;

    let currentSceneLines = [];
    let currentSceneTitle = "无标题";
    let currentAnchors = { zeigarnik: [], salient: [] };
    let currentShifts = {};
    let sceneStartDate = null;
    let sceneEndId = null;
    let currentSceneStartId = null;

    for (let i = 1; i < lines.length; i++) {
        try {
            const item = JSON.parse(lines[i]);
            
            if (!sceneStartDate && item.send_date) {
                sceneStartDate = item.send_date;
            }
            
            currentSceneLines.push(`${item.name}: ${item.mes}`);

            if (item.scene_title) {
                currentSceneStartId = i;
                currentSceneTitle = item.scene_title;
            }

            if (item.scene_end_id) {
                sceneEndId = item.scene_end_id;
                if (item.memory_anchors) {
                    currentAnchors.zeigarnik = [...new Set([...currentAnchors.zeigarnik, ...(item.memory_anchors.zeigarnik || [])])];
                    currentAnchors.salient = [...new Set([...currentAnchors.salient, ...(item.memory_anchors.salient || [])])];
                }
                if (item.active_shifts) {
                    Object.assign(currentShifts, item.active_shifts);
                }
            }

            if (sceneEndId !== null && i >= sceneEndId && currentSceneStartId !== null) {
                const id = `scene_${path.basename(filePath)}_${currentSceneStartId}`;
                
                if (!db.records.find(r => r.id === id)) {
                    const zStr = currentAnchors.zeigarnik.join(' ');
                    const sStr = currentAnchors.salient.join(' ');
                    const embedText = `[场景: ${currentSceneTitle}] 锚点: ${zStr} ${sStr} 对话记录: ${currentSceneLines.join(' | ')}`;

                    globalChunksToProcess.push({
                        id,
                        type: 'scene',
                        text: embedText,
                        metadata: {
                            source: path.basename(filePath),
                            title: currentSceneTitle,
                            date: sceneStartDate,
                            start_id: currentSceneStartId,
                            end_id: sceneEndId,
                            memory_anchors: currentAnchors,
                            active_shifts: currentShifts,
                            created_at: new Date(sceneStartDate).getTime(),
                            last_accessed_at: Date.now(),
                            access_count: 1,
                            base_importance: 1.0
                        }
                    });
                }

                currentSceneLines = [];
                currentSceneTitle = "无标题";
                currentAnchors = { zeigarnik: [], salient: [] };
                currentShifts = {};
                sceneStartDate = null;
                sceneEndId = null;
                currentSceneStartId = null;
            }
            
        } catch(e) {
            // 忽略格式损坏的行
        }
    }
}

let globalChunksToProcess = [];

async function main() {
    if (!EMBED_CONFIG.api_key) {
        console.error("未在 config.json 中找到 embedding.api_key，请先配置 API Key。");
        return;
    }

    console.log("🔍 开始扫描本地 Memory 目录...");
    const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.jsonl'));
    
    for (const file of files) {
        const filePath = path.join(MEMORY_DIR, file);
        if (file.includes('summary')) {
            processSummaryFile(filePath);
        } else {
            processFullLogFile(filePath);
        }
    }

    console.log(`📦 扫描完成。发现 ${globalChunksToProcess.length} 个新数据块需要获取向量。`);

    for (let i = 0; i < globalChunksToProcess.length; i++) {
        const chunk = globalChunksToProcess[i];
        console.log(`[${i + 1}/${globalChunksToProcess.length}] 正在请求 Embedding: ${chunk.id}`);
        
        const vector = await getEmbedding(chunk.text);
        if (vector) {
            chunk.vector = vector;
            db.upsert(chunk);
            if (i > 0 && i % 5 === 0) {
                db.saveDB();
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 200)); 
    }

    db.saveDB();
    console.log("✅ 所有向量数据处理完毕并入库！");
}

main();
