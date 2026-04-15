/*
 * Copyright (C) 2026 Tencent. All rights reserved.
 * Copyright (C) 2026 PlusXii. All rights reserved.
 *
 * openclaw-weixin is licensed under the MIT License.
 */

import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const app = express();
app.use(express.json());

const BASE_DIR = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin';
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const extConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

// 🌟 核心：动态加载任意数量的 TTS 凭据，告别写死！
const TTS_CREDENTIALS = extConfig.tts.credentials;
let ttsIndex = 0;

// 物理拼接 WAV 头
function createWavHeader(dataLength, sampleRate) {
    const buffer = Buffer.alloc(44);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); 
    buffer.writeUInt16LE(1, 20);  
    buffer.writeUInt16LE(1, 22);  
    buffer.writeUInt32LE(sampleRate, 24); 
    buffer.writeUInt32LE(sampleRate * 2, 28); 
    buffer.writeUInt16LE(2, 32);  
    buffer.writeUInt16LE(16, 34); 
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
}

app.post('/v1/voice/generations', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, error: "未提供文本" });

    // 🌟 动态池无缝轮询安全检查
    if (!TTS_CREDENTIALS || TTS_CREDENTIALS.length === 0) {
        return res.status(500).json({ success: false, error: "config.json 中未配置 TTS 凭据" });
    }

    const cred = TTS_CREDENTIALS[ttsIndex];
    ttsIndex = (ttsIndex + 1) % TTS_CREDENTIALS.length; 
    
    const cleanText = text.replace(/[\[\]\{\}\<\>~_*]/g, '').trim();
    console.log(`\n🎙️ 收到 TTS 委托 [节点 ${ttsIndex}]: ${cleanText}`);

    try {
        const requestBody = {
            user: { uid: "bot_" + crypto.randomUUID().substring(0, 8) },
            req_params: {
                text: cleanText,
                speaker: cred.voiceId,
                audio_params: { format: "pcm", sample_rate: 24000 }
            }
        };

        const response = await fetch(extConfig.tts.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-AppId': cred.appid,
                'X-Api-Access-Key': cred.token,
                'X-Api-Resource-Id': 'seed-icl-2.0',
                'X-Api-RequestId': crypto.randomUUID()
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        const lines = (await response.text()).split('\n').filter(line => line.trim() !== '');
        let pcmBuffers = [];
        for (const line of lines) {
            try {
                const json = JSON.parse(line);
                if (json.code === 20000000) break;
                if (json.data) pcmBuffers.push(Buffer.from(json.data, 'base64'));
            } catch (e) {}
        }

        if (pcmBuffers.length === 0) throw new Error("未获取到音频");
        
        const pcmData = Buffer.concat(pcmBuffers);
        const playtimeMs = Math.floor((pcmData.length / 48000) * 1000); 
        const durationSec = Math.ceil(playtimeMs / 1000);
        
        const tmpDir = os.tmpdir();
        const timestamp = Date.now();
        const wavPath = path.join(tmpDir, `temp_${timestamp}.wav`);
        const mp4Path = path.join(tmpDir, `temp_${timestamp}.mp4`);

        const wavData = Buffer.concat([createWavHeader(pcmData.length, 24000), pcmData]);
        fs.writeFileSync(wavPath, wavData);

        const coverPath = extConfig.voice_generation.cover_image_path;
        const fontPath = extConfig.voice_generation.font_path; 
        const displayText = `${durationSec}`;

        let ffmpegCmd = '';
        if (fs.existsSync(coverPath)) {
            ffmpegCmd = `ffmpeg -y -loop 1 -framerate 1 -i "${coverPath}" -i "${wavPath}" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,drawtext=fontfile=${fontPath}:text='${displayText}':x=w*0.25:y=130:fontsize=420:fontcolor=black" -c:v libx264 -preset ultrafast -tune stillimage -c:a aac -b:a 128k -pix_fmt yuv420p -shortest "${mp4Path}"`;
        } else {
            ffmpegCmd = `ffmpeg -y -f lavfi -i color=c=black:s=640x640:r=1 -i "${wavPath}" -c:v libx264 -preset ultrafast -tune stillimage -c:a aac -b:a 128k -pix_fmt yuv420p -shortest "${mp4Path}"`;
        }
        
        console.log(`[TTS] 正在压制带【${durationSec}秒】时长水印的语音气泡视频...`);
        try {
            execSync(ffmpegCmd, { stdio: 'pipe' }); 
        } catch (ffErr) {
            console.error(`\n🔥 [FFmpeg 压制错误]:\n`, ffErr.stderr ? ffErr.stderr.toString() : ffErr.message);
            throw new Error("视频压制失败，请检查字体路径或图片底图是否正确。");
        }

        const mp4Buf = fs.readFileSync(mp4Path);
        const mp4Base64 = mp4Buf.toString('base64');

        fs.unlinkSync(wavPath);
        fs.unlinkSync(mp4Path);

        res.json({ success: true, data: { b64_mp4: mp4Base64 } });
        console.log(`✅ 可视化语音压制成功 (MP4 形态, 附带时长戳)`);

    } catch (err) {
        console.error(`❌ TTS 失败:`, err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(7863, () => console.log('🎙️ TTS 引擎启动 (动态水印气泡版)'));
