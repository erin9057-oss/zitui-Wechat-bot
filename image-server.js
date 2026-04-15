/*
 * Copyright (C) 2026 Tencent. All rights reserved.
 * Copyright (C) 2026 PlusXii. All rights reserved.
 *
 * openclaw-weixin is licensed under the MIT License.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

const app = express();
app.use(express.json());

const BASE_DIR = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin';
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const extConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

const ai = new GoogleGenAI({ apiKey: extConfig.image_generation.api_key }); 
const MODEL_NAME = extConfig.image_generation.model_name; 

app.post('/v1/images/generations', async (req, res) => {
    const { prompt, type } = req.body;
    console.log(`\n🎨 收到生图委托: [类型: ${type}] 描述: ${prompt}`);

    try {
        let finalContents = [];
        
        if (type === 'person') {
            const stylePrompt = `[Style: 2.5D thick paint illustration (厚涂), highly detailed artistic painting, masterpiece, beautiful lighting] ${prompt}. The character MUST look exactly like the person in the provided reference image.`;
            finalContents.push(stylePrompt);

            const refPath = extConfig.image_generation.reference_image_path;
            
            if (fs.existsSync(refPath)) {
                const refBase64 = fs.readFileSync(refPath, 'base64');
                finalContents.push({
                    inlineData: {
                        mimeType: "image/jpeg",
                        data: refBase64
                    }
                });
                console.log(`🧬 已成功注入面部参考图进行特征锁定！`);
            } else {
                console.warn(`⚠️ 严重警告: 未在 ${refPath} 找到参考图，只能依靠文本生成。请检查文件名！`);
            }
        } else {
            const stylePrompt = `[Style: Photorealistic, 8k resolution, cinematic lighting, shot on 35mm lens, highly detailed, real life] ${prompt}`;
            finalContents.push(stylePrompt);
        }

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: finalContents,
            config: {
                imageConfig: { aspectRatio: "3:4" }
            }
        });

        let base64Data = null;
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                base64Data = part.inlineData.data;
                break;
            }
        }

        if (!base64Data) throw new Error("未能提取到图片 inlineData");

        res.json({ success: true, data: [{ b64_json: base64Data }] });
        console.log(`✅ 物理显影完成！(via AI Studio Pro)`);

    } catch (err) {
        console.error(`❌ 生图失败:`, err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(7862, () => console.log(`🖼️ 生图引擎 (垫图版) 已启动 (端口: 7862)`));
