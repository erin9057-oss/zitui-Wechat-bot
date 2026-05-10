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

// 公开版内置的轻量记忆唤醒参数。
// 六维不再作为独立相似度加权项，而是作为记忆 activation 的心理门控。
const RANKER_CONFIG = {
    semantic_threshold: 0.3,

    base_activation: {
        access_count_weight: 0.35,
        recency_decay_weight: 0.65,
        min_base_importance: 0.1,
        max_base_importance: 10,
    },

    affective_activation: {
        enabled: true,
        scale: 0.22,
        neutral_match: 0.45,
        min_log_gate: -0.15,
        max_log_gate: 0.25,
        intensity_floor: 0.85,
        intensity_scale: 0.35,
        dimension_weights: {
            "面具剥离": 1.0,
            "软性策略": 0.9,
            "理智让渡": 1.1,
            "依恋渴望": 1.15,
            "权力疲惫": 0.65,
            "边界溶解": 1.05,
        },
    },

    sigmoid: {
        center: 0,
        temperature: 1.0,
        activation_multiplier_base: 0.5,
    },
};

const SHIFT_KEYS = ["面具剥离", "软性策略", "理智让渡", "依恋渴望", "权力疲惫", "边界溶解"];

function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function sigmoid(value, temperature = 1.0, center = 0) {
    const t = Math.max(0.01, Number(temperature || 1.0));
    return 1 / (1 + Math.exp(-(Number(value || 0) - Number(center || 0)) / t));
}

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
            if (!this.records[index].metadata) this.records[index].metadata = {};

            // 记忆巩固：每次被成功检索，访问次数 +1，同时重置最后访问时间戳。
            // access_count 不是独立相似度，而是 base activation 的复现强化因子。
            this.records[index].metadata.access_count = (this.records[index].metadata.access_count || 1) + 1;
            this.records[index].metadata.last_accessed_at = Date.now();
        }
    }

    // 基础粗排算法：计算余弦相似度 (Cosine Similarity)
    cosineSimilarity(vecA, vecB) {
        if (!Array.isArray(vecA) || !Array.isArray(vecB)) return 0;
        if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) return 0;

        let dotProduct = 0, normA = 0, normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // 六维心理姿态匹配：看当前心理结构与历史记忆的六维方向是否相似。
    // 这里不再使用欧氏距离，也不把六维当作 finalScore 的独立相似度项。
    calcSixDimShapeMatch(currentShifts, memShifts) {
        if (!currentShifts || !memShifts) {
            return { shapeMatch: 0, currentIntensity: 0 };
        }

        const weights = RANKER_CONFIG.affective_activation.dimension_weights || {};

        let dot = 0;
        let normCurrent = 0;
        let normMemory = 0;
        let intensitySq = 0;
        let weightSum = 0;

        for (const key of SHIFT_KEYS) {
            const weight = Math.max(0, Number(weights[key] ?? 1));
            if (weight <= 0) continue;

            const c = Math.max(0, Math.min(1, (Number(currentShifts[key]) || 0) / 100));
            const m = Math.max(0, Math.min(1, (Number(memShifts[key]) || 0) / 100));

            dot += weight * c * m;
            normCurrent += weight * c * c;
            normMemory += weight * m * m;
            intensitySq += weight * c * c;
            weightSum += weight;
        }

        if (normCurrent <= 0 || normMemory <= 0 || weightSum <= 0) {
            return { shapeMatch: 0, currentIntensity: 0 };
        }

        return {
            shapeMatch: Math.max(0, Math.min(1, dot / (Math.sqrt(normCurrent) * Math.sqrt(normMemory)))),
            currentIntensity: Math.max(0, Math.min(1, Math.sqrt(intensitySq / weightSum))),
        };
    }

    // 六维心理唤醒门控：不是“情绪相似度得分”，而是当前心理姿态对这段记忆的 activation 调制。
    calcAffectiveLogGate(currentShifts, memShifts) {
        const cfg = RANKER_CONFIG.affective_activation;
        if (cfg.enabled === false) return 0;
        if (!currentShifts || !memShifts) return 0;

        const { shapeMatch, currentIntensity } = this.calcSixDimShapeMatch(currentShifts, memShifts);
        if (shapeMatch <= 0 || currentIntensity <= 0) return 0;

        const intensityGate =
            Number(cfg.intensity_floor ?? 0.85) +
            Number(cfg.intensity_scale ?? 0.35) * currentIntensity;

        const raw =
            Number(cfg.scale ?? 0.22) *
            (shapeMatch - Number(cfg.neutral_match ?? 0.45)) *
            intensityGate;

        return clampNumber(
            raw,
            Number(cfg.min_log_gate ?? -0.15),
            Number(cfg.max_log_gate ?? 0.25),
            0
        );
    }

    // 保留旧方法名，避免其他文件如果调用 calcAffectiveScore 时崩掉。
    // 返回值现在表示“心理唤醒 log gate”，不是 0-1 情感相似度。
    calcAffectiveScore(currentShifts, memShifts) {
        return this.calcAffectiveLogGate(currentShifts, memShifts);
    }

    // 记忆基础激活：综合近因效应、访问次数强化、基础重要性。
    calcBaseLogActivation(lastAccessed, accessCount = 1, baseImportance = 1.0) {
        const cfg = RANKER_CONFIG.base_activation;
        const now = Date.now();

        const last = Number(lastAccessed || now);
        const daysPassed = Math.max(0, (now - last) / (1000 * 60 * 60 * 24));

        const safeAccessCount = Math.max(1, Number(accessCount || 1));
        const importance = clampNumber(
            baseImportance || 1.0,
            Number(cfg.min_base_importance ?? 0.1),
            Number(cfg.max_base_importance ?? 10),
            1.0
        );

        return (
            Math.log(importance) +
            Number(cfg.access_count_weight ?? 0.35) * Math.log1p(safeAccessCount) -
            Number(cfg.recency_decay_weight ?? 0.65) * Math.log1p(daysPassed)
        );
    }

    // 保留旧方法名。返回值现在是 0-1 activation score。
    calcEbbinghausScore(lastAccessed, accessCount, baseImportance) {
        const baseLogActivation = this.calcBaseLogActivation(lastAccessed, accessCount, baseImportance);
        const sigCfg = RANKER_CONFIG.sigmoid;
        return sigmoid(baseLogActivation, sigCfg.temperature, sigCfg.center);
    }

    calcActivationScore(meta, currentShifts) {
        const baseLogActivation = this.calcBaseLogActivation(
            meta.last_accessed_at,
            meta.access_count,
            meta.base_importance || 1.0
        );

        const affectiveLogGate = this.calcAffectiveLogGate(currentShifts, meta.active_shifts);

        const logActivation = baseLogActivation + affectiveLogGate;
        const sigCfg = RANKER_CONFIG.sigmoid;

        const activationScore = sigmoid(logActivation, sigCfg.temperature, sigCfg.center);

        return {
            activationScore,
            timeScore: activationScore,
            affectiveScore: affectiveLogGate,
            baseLogActivation,
            affectiveLogGate,
            logActivation,
        };
    }

    search(queryVector, currentShifts, type, limit = 3) {
        if (this.records.length === 0) return [];

        let candidates = [];

        for (const record of this.records) {
            if (record.type !== type) continue;
            if (!Array.isArray(record.vector) || !Array.isArray(queryVector)) continue;
            if (record.vector.length !== queryVector.length) continue;

            const semanticScore = this.cosineSimilarity(queryVector, record.vector);
            if (semanticScore < RANKER_CONFIG.semantic_threshold) continue;

            const meta = record.metadata || {};
            const activation = this.calcActivationScore(meta, currentShifts);

            // 最终排序：语义相似度负责“像不像当前话题”，activation 负责“此刻这段记忆亮不亮”。
            // 不再把六维作为独立相似度加权项，避免把心理模型降级成普通相似度。
            const finalScore =
                semanticScore *
                (Number(RANKER_CONFIG.sigmoid.activation_multiplier_base ?? 0.5) + activation.activationScore);

            candidates.push({
                ...record,
                semanticScore,
                affectiveScore: activation.affectiveScore,
                timeScore: activation.timeScore,
                activationScore: activation.activationScore,
                baseLogActivation: activation.baseLogActivation,
                affectiveLogGate: activation.affectiveLogGate,
                logActivation: activation.logActivation,
                score: finalScore,
            });
        }

        candidates.sort((a, b) => b.score - a.score);
        return candidates.slice(0, limit);
    }
}

export const DB_PATH = path.join(BASE_DIR, 'workspace', 'vector_db.json');
export const db = new VectorStore(DB_PATH);
