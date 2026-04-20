/*
 * Copyright (C) 2026 Tencent. All rights reserved.
 * Copyright (C) 2026 PlusXii. All rights reserved.
 *
 * openclaw-weixin is licensed under the MIT License.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

const BASE_DIR = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin';
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');

let taskQueue = [];
let waitingWorkers = [];
let pendingJobs = {};

app.post('/v1/images/generations', async (req, res) => {
    const { prompt, type } = req.body;
    
    const extConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    const imgConf = extConfig.image_generation || {};
    const MODE = imgConf.mode || "bridge";
    const MODEL_NAME = imgConf.model_name || 'gemini-3-pro-image-preview';
    
    console.log(`\n🎨 收到生图委托: [模式: ${MODE.toUpperCase()}] [类型: ${type}] 描述: ${prompt}`);

    let finalContents = []; 
    let stylePrompt = prompt; 
    let refBase64 = null;
    
    if (type === 'person') {
        stylePrompt = `[Style: 2.5D thick paint illustration (厚涂), highly detailed artistic painting, masterpiece, beautiful lighting] ${prompt}. The character MUST look exactly like the person in the provided reference image.`;
        finalContents.push(stylePrompt);
        
        const refPath = imgConf.reference_image_path;
        if (fs.existsSync(refPath)) {
            refBase64 = fs.readFileSync(refPath, 'base64');
            finalContents.push({ inlineData: { mimeType: "image/jpeg", data: refBase64 } });
            console.log(`🧬 已注入面部参考图`);
        }
    } else {
        stylePrompt = `[Style: Photorealistic, 8k resolution, cinematic lighting, shot on 35mm lens, highly detailed, real life] ${prompt}`;
        finalContents.push(stylePrompt);
    }

    // ==========================================
    // 模式 A：API 直连 (智能双模：Google 官方 / OpenAI 中转)
    // ==========================================
    if (MODE === "api") {
        try {
            if (!imgConf.api_key) throw new Error("API 模式未配置 api_key！");
            let baseUrl = (imgConf.api_base_url || "").trim();
            const isGoogleNative = baseUrl.includes("generativelanguage.googleapis.com");

            if (isGoogleNative) {
                // ------------------------------------------
                // 🅰️ 谷歌原生 API 敲门方式
                // ------------------------------------------
                console.log(`🚀 检测到谷歌官方域名，正在使用 Native 格式请求...`);
                // 自动组装官方 URL
                const targetUrl = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${MODEL_NAME}:generateContent?key=${imgConf.api_key}`;
                
                let parts = [{ text: stylePrompt }];
                if (refBase64) parts.push({ inlineData: { mimeType: "image/jpeg", data: refBase64 } });

                const response = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: "user", parts: parts }],
                        generationConfig: { responseModalities: ["IMAGE"] }
                    })
                });

                if (!response.ok) throw new Error(`官方 API 拒绝: ${await response.text()}`);
                
                const data = await response.json();
                const base64Data = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                if (!base64Data) throw new Error("官方 API 返回成功，但未找到图片 Base64 节点！");
                
                console.log(`✅ 物理显影完成！(via Google Native API)`);
                return res.json({ success: true, data: [{ b64_json: base64Data }] });

            } else {
                // ------------------------------------------
                // 🅱️ 公益站/中转站 OpenAI 敲门方式
                // ------------------------------------------
                if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
                if (baseUrl.endsWith('/v1')) baseUrl += '/chat/completions';
                else if (!baseUrl.endsWith('/chat/completions')) baseUrl += '/v1/chat/completions';

                console.log(`🚀 检测到中转站域名，正在使用 OpenAI 格式请求...`);
                let openAiContent = [{ type: "text", text: stylePrompt }];
                if (refBase64) openAiContent.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${refBase64}` } });

                const response = await fetch(baseUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${imgConf.api_key}` },
                    body: JSON.stringify({ model: MODEL_NAME, messages: [{ role: "user", content: openAiContent }], stream: false })
                });

                if (!response.ok) throw new Error(`中转站 API 拒绝: ${await response.text()}`);
                const data = await response.json();
                const replyText = data.choices?.[0]?.message?.content || "";
                
                console.log(`\n🔍 [DEBUG] 收到中转站回复摘要: ${replyText.substring(0, 150)}...`);

                let base64Data = null;
                const mdBase64Match = replyText.match(/!\[.*?\]\(data:image\/.*?;base64,([^)]+)\)/);
                const mdUrlMatch = replyText.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);

                if (mdBase64Match) {
                    base64Data = mdBase64Match[1];
                } else if (mdUrlMatch) {
                    console.log(`📥 正在下载图床 URL... (${mdUrlMatch[1]})`);
                    const imgRes = await fetch(mdUrlMatch[1]);
                    base64Data = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
                } else if (replyText.startsWith("http")) {
                    console.log(`📥 正在下载裸链 URL... (${replyText.trim()})`);
                    const imgRes = await fetch(replyText.trim());
                    base64Data = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
                } else if (replyText.length > 2000 && !replyText.includes("http")) {
                    base64Data = replyText;
                } else {
                    throw new Error(`智能解析器失败，返回内容无法识别为图片。`);
                }

                console.log(`✅ 物理显影完成！(via OpenAI Proxy)`);
                return res.json({ success: true, data: [{ b64_json: base64Data }] });
            }
        } catch (err) {
            console.error(`❌ API 生图失败:`, err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    } 
    // ==========================================
    // 模式 B：Luma 本地反代引擎
    // ==========================================
    else if (MODE === "luma") {
        try {
            const lumaUrl = imgConf.luma_endpoint || "http://127.0.0.1:8188/v1/chat/completions";
            console.log(`🚀 正在呼叫本地 Luma 引擎 (${MODEL_NAME})...`);
            
            let openAiContent = [{ type: "text", text: stylePrompt }];
            if (refBase64) openAiContent.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${refBase64}` } });

            const response = await fetch(lumaUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: MODEL_NAME,
                    messages: [{ role: "user", content: openAiContent }],
                    stream: false
                })
            });

            if (!response.ok) throw new Error(`Luma 引擎报错: ${await response.text()}`);
            const data = await response.json();
            const replyText = data.choices?.[0]?.message?.content || "";
            
            // Luma 引擎返回的是 Markdown 包装的 CDN 链接，复用你的绝佳正则提取！
            const mdUrlMatch = replyText.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
            if (!mdUrlMatch) throw new Error("未能从 Luma 引擎提取到图片 URL");

            console.log(`📥 正在从 Luma CDN 下载图片...`);
            const imgRes = await fetch(mdUrlMatch[1]);
            const base64Data = Buffer.from(await imgRes.arrayBuffer()).toString('base64');

            console.log(`✅ 物理显影完成！(via Luma Engine)`);
            return res.json({ success: true, data: [{ b64_json: base64Data }] });

        } catch (err) {
            console.error(`❌ Luma 生图失败:`, err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    }
    // ==========================================
    // 模式 C：AI Studio 网页轮询桥接
    // ==========================================
    else {
        const jobId = crypto.randomUUID();
        const task = { jobId, model: MODEL_NAME, contents: finalContents };

        pendingJobs[jobId] = { res, timeout: setTimeout(() => {
            if (pendingJobs[jobId]) {
                pendingJobs[jobId].res.status(504).json({ success: false, error: 'AI Studio 网页节点超时未交稿' });
                delete pendingJobs[jobId];
            }
        }, 120000) }; 

        if (waitingWorkers.length > 0) {
            waitingWorkers.shift().json(task);
        } else {
            taskQueue.push(task);
        }
    }
});

// AI Studio Polling APIs
app.get('/api/get-task', (req, res) => {
    if (taskQueue.length > 0) res.json(taskQueue.shift());
    else {
        waitingWorkers.push(res);
        req.on('close', () => { waitingWorkers = waitingWorkers.filter(w => w !== res); });
    }
});

app.post('/api/submit-task', (req, res) => {
    const { jobId, result, error } = req.body;
    if (pendingJobs[jobId]) {
        clearTimeout(pendingJobs[jobId].timeout);
        if (error) {
            console.error(`❌ 网页节点生图失败:`, error.message);
            pendingJobs[jobId].res.status(500).json({ success: false, error: error.message });
        } else {
            console.log(`✅ 网页节点完稿！交付微信...`);
            const b64Data = result.imageUrl.split(',')[1];
            pendingJobs[jobId].res.json({ success: true, data: [{ b64_json: b64Data }] });
        }
        delete pendingJobs[jobId];
    }
    res.json({ received: true });
});

app.listen(7862, '0.0.0.0', () => console.log(`🖼️ 生图引擎 (双轨智能+Luma版) 已启动 (端口: 7862)`));
