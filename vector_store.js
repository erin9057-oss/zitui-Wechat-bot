import fs from 'fs';
import path from 'path';

const BASE_DIR = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin';
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

export async function getEmbedding(text) {
    if (!EMBED_CONFIG.api_key) return null;
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
        console.error(`Embedding API Error: ${e.message}`);
        return null;
    }
}

export class VectorStore {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.records = [];
        this.loadDB();
    }

    loadDB() {
        if (fs.existsSync(this.dbPath)) {
            try { 
                this.records = JSON.parse(fs.readFileSync(this.dbPath, 'utf-8')); 
            } catch (e) { 
                this.records = []; 
            }
        }
    }

    saveDB() {
        fs.writeFileSync(this.dbPath, JSON.stringify(this.records), 'utf-8');
    }

    upsert(record) {
        const index = this.records.findIndex(r => r.id === record.id);
        if (index !== -1) {
            this.records[index] = record;
        } else {
            this.records.push(record);
        }
    }

    markAccessed(id) {
        const index = this.records.findIndex(r => r.id === id);
        if (index !== -1) {
            // 模拟突触巩固：每次被成功检索，访问次数 +1，同时重置最后访问时间戳
            this.records[index].metadata.access_count = (this.records[index].metadata.access_count || 1) + 1;
            this.records[index].metadata.last_accessed_at = Date.now();
            // 内存更新访问次数，不在此处频繁读写硬盘，由主流程统一把控
        }
    }

    // 基础粗排算法：计算余弦相似度 (Cosine Similarity)
    cosineSimilarity(vecA, vecB) {
        let dotProduct = 0, normA = 0, normB = 0;
        // 计算两个向量的点积以及各自的模长
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        // 公式: (A·B) / (||A|| * ||B||)，结果在 -1 到 1 之间
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // 精排因子 1：六维情感共振打分 (基于多维空间欧氏距离)
    calcAffectiveScore(currentShifts, memShifts) {
        if (!currentShifts || !memShifts) return 0.5; // 若数据缺失则给予中立分数
        
        const keys = ["面具剥离", "软性策略", "理智让渡", "依恋渴望", "权力疲惫", "边界溶解"];
        let distanceSq = 0;
        
        // 步骤 1: 计算当前情感与历史情感在六维空间中的“欧氏距离平方”
        // 公式: (x1-x2)^2 + (y1-y2)^2 + ... + (z1-z2)^2
        for (const key of keys) {
            const v1 = Number(currentShifts[key]) || 0;
            const v2 = Number(memShifts[key]) || 0;
            distanceSq += Math.pow(v1 - v2, 2);
        }
        
        // 步骤 2: 计算理论上的极限最大距离平方
        // 每个维度取值范围是 0-100，最大差值为 100。6 个维度全部相差 100 即 6 * (100^2)
        const maxDistanceSq = 6 * Math.pow(100, 2); 
        
        // 步骤 3: 归一化计算，将距离转换为 0 到 1 之间的比例
        const normalizedDist = Math.sqrt(distanceSq) / Math.sqrt(maxDistanceSq);
        
        // 步骤 4: 翻转比例。空间距离越小(情感越吻合)，得分越高(趋近于1)；落差越大，得分越低。
        return 1 - normalizedDist;
    }

    // 精排因子 2：艾宾浩斯遗忘曲线打分
    calcEbbinghausScore(lastAccessed, accessCount, baseImportance) {
        const now = Date.now();
        
        // 步骤 1: 计算时间衰减因子 (t)
        // 记录距离【上一次被查阅/唤醒】过去了多少天。只要近期被回想过，t 就会很小。
        const daysPassed = Math.max(0, (now - lastAccessed) / (1000 * 60 * 60 * 24));
        
        // 步骤 2: 计算记忆强度因子 (S)
        // 公式: S = 先天重要性 * 后天强化倍数
        // 使用 log10 确保前几次的回想能带来巨大的强度提升，而几百次后的边际效应逐渐递减，防止指数爆炸。
        const s = baseImportance * (1 + Math.log10(accessCount));
        
        // 步骤 3: 应用变形版艾宾浩斯公式 R = e^(-t/S)
        // t 越大，负指数导致 R 越趋近于 0（遗忘）；
        // S 越大，衰减曲线越平缓，哪怕 t 很大，R 依然能维持高分（形成长时记忆）。
        return Math.exp(-daysPassed / Math.max(s, 0.1));
    }

    search(queryVector, currentShifts, type, limit = 3) {
        if (this.records.length === 0) return [];

        let candidates = [];
        for (const record of this.records) {
            if (record.type !== type) continue;

            const semanticScore = this.cosineSimilarity(queryVector, record.vector);
            if (semanticScore < 0.3) continue; // 粗排截断：若文本语义相似度低于 0.3，直接判定话题无关，丢弃

            const meta = record.metadata;
            const affectiveScore = this.calcAffectiveScore(currentShifts, meta.active_shifts);
            const timeScore = this.calcEbbinghausScore(meta.last_accessed_at, meta.access_count, meta.base_importance || 1.0);

            // 🌟 三维认知联合打分 (Total Score)
            // semanticScore (50%): 保证召回的话题在文本维度上是相关的（如都涉及到了同样的物品或地点）。
            // affectiveScore (30%): 保证心理动机连贯。只有当历史场景的情绪配比与此刻高度一致时才会共振，防止 OOC 错乱。
            // timeScore (20%): 引入自然的时间遗忘机制，优先召回深刻的“核心羁绊”和近期刚刚建立的“新梗”。
            const finalScore = (semanticScore * 0.5) + (affectiveScore * 0.3) + (timeScore * 0.2);

            candidates.push({ ...record, semanticScore, affectiveScore, timeScore, score: finalScore });
        }

        // 根据综合得分降序排列，切取 Top 结果注入大模型上下文
        candidates.sort((a, b) => b.score - a.score);
        return candidates.slice(0, limit);
    }
}

export const DB_PATH = path.join(BASE_DIR, 'workspace', 'vector_db.json');
export const db = new VectorStore(DB_PATH);
