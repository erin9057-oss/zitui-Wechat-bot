/*
 * Copyright (C) 2026 Tencent. All rights reserved.
 * Copyright (C) 2026 PlusXii. All rights reserved.
 *
 * openclaw-weixin is licensed under the MIT License.
 */

import { sendMessage as sendMessageApi, getUploadUrl } from "../api/api.js";
import type { WeixinApiOptions } from "../api/api.js";
import { logger } from "../util/logger.js";
import { generateId } from "../util/random.js";
import type { MessageItem, SendMessageReq } from "../api/types.js";
import { MessageItemType, MessageState, MessageType } from "../api/types.js";
import type { UploadedFileInfo } from "../cdn/upload.js";
import { StreamingMarkdownFilter } from "./markdown-filter.js";
export { StreamingMarkdownFilter };

import { uploadFileToWeixin, uploadVideoToWeixin, downloadRemoteImageToTemp } from "../cdn/upload.js";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";

const BASE_DIR = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin';
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
let extConfig: any = {};
try {
  if (fs.existsSync(CONFIG_PATH)) {
    extConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  }
} catch (e) {}

function generateClientId(): string { return generateId("openclaw-weixin"); }

function buildTextMessageReq(params: { to: string; text: string; contextToken?: string; clientId: string; }): SendMessageReq {
  const { to, text, contextToken, clientId } = params;
  const item_list: MessageItem[] = text ? [{ type: MessageItemType.TEXT, text_item: { text } }] : [];
  return {
    msg: {
      from_user_id: "", to_user_id: to, client_id: clientId,
      message_type: MessageType.BOT, message_state: MessageState.FINISH,
      item_list: item_list.length ? item_list : undefined, context_token: contextToken ?? undefined,
    },
  };
}

function buildSendMessageReq(params: { to: string; contextToken?: string; payload: { text?: string }; clientId: string; }): SendMessageReq {
  const { to, contextToken, payload, clientId } = params;
  return buildTextMessageReq({ to, text: payload.text ?? "", contextToken, clientId });
}

export async function sendMessageWeixin(params: {
  to: string; text: string; opts: WeixinApiOptions & { contextToken?: string };
}): Promise<{ messageId: string }> {
  const { to, text: rawText, opts } = params;

  if (rawText.includes('[物理:开灯]') || rawText.includes('<开灯>')) {
      const ip = extConfig?.miio?.ip;
      const token = extConfig?.miio?.token;
      if (ip && !ip.includes('YOUR_') && token && !token.includes('YOUR_')) {
          exec(`python3 /data/data/com.termux/files/usr/bin/miiocli yeelight --ip ${ip} --token ${token} on`);
      }
  }
  if (rawText.includes('[物理:关灯]') || rawText.includes('<关灯>')) {
      const ip = extConfig?.miio?.ip;
      const token = extConfig?.miio?.token;
      if (ip && !ip.includes('YOUR_') && token && !token.includes('YOUR_')) {
          exec(`python3 /data/data/com.termux/files/usr/bin/miiocli yeelight --ip ${ip} --token ${token} off`);
      }
  }

  let replyContent = rawText;
  const replyMatches = [...rawText.matchAll(/<reply>([\s\S]*?)<\/reply>/gi)];
  if (replyMatches.length > 0) {
      replyContent = replyMatches[replyMatches.length - 1][1].trim();
  } else {
      replyContent = replyContent.replace(/<(thought|think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "");
  }

  replyContent = replyContent.replace(/(<pic[\s\S]*?<\/pic>)/gi, '\n$1\n');
  replyContent = replyContent.replace(/(<pic prompt[\s\S]*?<\/pic prompt>)/gi, '\n$1\n');
  replyContent = replyContent.replace(/(<voice>[\s\S]*?<\/voice>)/gi, '\n$1\n');

  const chunks = replyContent.split(/\n+/).map(t => t.trim()).filter(t => t !== '');
  if (chunks.length === 0) return { messageId: generateClientId() };

  let lastId = generateClientId();

  for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];

      chunk = chunk.replace(/\[物理:开灯\]|\[物理:关灯\]|<开灯>|<关灯>|打开了床头灯|关上了床头灯/g, '').trim();
      if (!chunk) continue;

      const picMatch = chunk.match(/<pic type="(person|scene)">([\s\S]*?)<\/pic>/i) || chunk.match(/<pic prompt>([\s\S]*?)<\/pic prompt>/i);
      if (picMatch) {
          const imgType = picMatch[1]?.toLowerCase() === 'scene' ? 'scene' : 'person';
          const imgPrompt = (picMatch[2] || picMatch[1]).trim();
          try {
              const imageApiUrl = extConfig?.services?.image_server_url || 'http://127.0.0.1:7862/v1/images/generations';
              const imgRes = await fetch(imageApiUrl, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: imgPrompt, type: imgType }),
                  signal: AbortSignal.timeout(45000) 
              });
              if (!imgRes.ok) throw new Error(await imgRes.text());
              
              const imgData = await imgRes.json() as any;
              if (imgData.success && imgData.data[0].b64_json) {
                  const tmpPath = path.join(os.tmpdir(), `gen_${Date.now()}.png`);
                  fs.writeFileSync(tmpPath, Buffer.from(imgData.data[0].b64_json, 'base64'));
                  const uploaded = await uploadFileToWeixin({ filePath: tmpPath, toUserId: to, opts, cdnBaseUrl: opts.baseUrl });
                  const res = await sendImageMessageWeixin({ to, text: "", uploaded, opts });
                  lastId = res.messageId;
              }
          } catch (err) {}
          continue; 
      }

      const voiceMatch = chunk.match(/<voice>([\s\S]*?)<\/voice>/i);
      if (voiceMatch) {
          const speakText = voiceMatch[1].trim();
          let voiceSuccess = false;
          
          try {
              const voiceApiUrl = extConfig?.services?.voice_server_url || 'http://127.0.0.1:7863/v1/voice/generations';
              const voiceRes = await fetch(voiceApiUrl, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: speakText }),
                  signal: AbortSignal.timeout(30000) 
              });
              if (!voiceRes.ok) throw new Error(await voiceRes.text());
              
              const voiceData = await voiceRes.json() as any;
              if (voiceData.success && voiceData.data.b64_mp4) {
                  const mp4Buf = Buffer.from(voiceData.data.b64_mp4, 'base64');
                  const tmpPath = path.join(os.tmpdir(), `voice_${Date.now()}.mp4`);
                  fs.writeFileSync(tmpPath, mp4Buf);

                  const uploadOpts = { baseUrl: opts.baseUrl, token: opts.token };
                  const uploaded = await uploadVideoToWeixin({
                      filePath: tmpPath,
                      toUserId: to,
                      opts: uploadOpts,
                      cdnBaseUrl: opts.baseUrl
                  });
                  const res = await sendVideoMessageWeixin({ to, text: "", uploaded, opts });
                  lastId = res.messageId;
                  voiceSuccess = true;
              }
          } catch (err) {}

          if (!voiceSuccess && speakText) {
              const clientId = generateClientId();
              const req = buildSendMessageReq({ to, contextToken: opts.contextToken, payload: { text: speakText }, clientId });
              console.log(`\n💬 [发往微信的纯文本] -> \n${speakText}`);
              await sendMessageApi({ baseUrl: opts.baseUrl, token: opts.token, body: req });
              lastId = clientId;
              await new Promise(r => setTimeout(r, 1000));
          }
          continue; 
      }

      if (/^https?:\/\//.test(chunk)) {
          try {
              const filePath = await downloadRemoteImageToTemp(chunk, os.tmpdir());
              const uploaded = await uploadFileToWeixin({ filePath, toUserId: to, opts, cdnBaseUrl: opts.baseUrl });
              const res = await sendImageMessageWeixin({ to, text: "", uploaded, opts });
              lastId = res.messageId;
          } catch (err) {}
          continue;
      }

      const f = new StreamingMarkdownFilter();
      let cleanText = f.feed(chunk) + f.flush(); 
      cleanText = cleanText.trim();
      
      if (cleanText) {
          const clientId = generateClientId();
          const req = buildSendMessageReq({ to, contextToken: opts.contextToken, payload: { text: cleanText }, clientId });
          
          console.log(`\n💬 [发往微信的纯文本] -> \n${cleanText}`);
          
          await sendMessageApi({ baseUrl: opts.baseUrl, token: opts.token, body: req });
          lastId = clientId;
          await new Promise(r => setTimeout(r, 1500 + (cleanText.length * 50) + (Math.random() * 500)));
      }
  }
  return { messageId: lastId };
}

async function sendMediaItems(params: {
  to: string; text: string; mediaItem: MessageItem; opts: WeixinApiOptions & { contextToken?: string };
}): Promise<{ messageId: string }> {
  const { to, text, mediaItem, opts } = params;
  const items: MessageItem[] = text ? [{ type: MessageItemType.TEXT, text_item: { text } }, mediaItem] : [mediaItem];

  let lastClientId = "";
  for (const item of items) {
    lastClientId = generateClientId();
    const req: SendMessageReq = {
      msg: {
        from_user_id: "", to_user_id: to, client_id: lastClientId,
        message_type: MessageType.BOT, message_state: MessageState.FINISH,
        item_list: [item], context_token: opts.contextToken ?? undefined,
      },
    };

    const logItem = JSON.parse(JSON.stringify(item));
    ['image_item', 'voice_item', 'video_item', 'file_item'].forEach(key => {
        if (logItem[key]?.media?.encrypt_query_param) {
            logItem[key].media.encrypt_query_param = "[已隐藏 CDN 超长密文参数]";
        }
    });
    console.log(`\n📤 [发往微信的多媒体包裹] ->\n${JSON.stringify(logItem, null, 2)}`);

    try {
      await sendMessageApi({ baseUrl: opts.baseUrl, token: opts.token, body: req });
    } catch (err) {}
  }
  return { messageId: lastClientId };
}

export async function sendVoiceMessageWeixin(params: {
  to: string; text: string; uploaded: any; opts: WeixinApiOptions & { contextToken?: string }; playtimeMs: number;
}): Promise<{ messageId: string }> {
  const { to, text, uploaded, opts, playtimeMs } = params;
  const voiceItem: MessageItem = {
    type: MessageItemType.VOICE,
    voice_item: {
      media: { 
          encrypt_query_param: uploaded.downloadEncryptedQueryParam, 
          aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
          encrypt_type: 1 
      },
      encode_type: 6,               
      bits_per_sample: 16,          
      sample_rate: 24000,
      playtime: playtimeMs,
      text: ""                      
    },
  };
  return sendMediaItems({ to, text, mediaItem: voiceItem, opts });
}

export async function sendImageMessageWeixin(params: {
  to: string; text: string; uploaded: UploadedFileInfo; opts: WeixinApiOptions & { contextToken?: string };
}): Promise<{ messageId: string }> {
  const { to, text, uploaded, opts } = params;
  const imageItem: MessageItem = {
    type: MessageItemType.IMAGE,
    image_item: { media: { encrypt_query_param: uploaded.downloadEncryptedQueryParam, aes_key: Buffer.from(uploaded.aeskey).toString("base64"), encrypt_type: 1 }, mid_size: uploaded.fileSizeCiphertext },
  };
  return sendMediaItems({ to, text, mediaItem: imageItem, opts });
}

export async function sendVideoMessageWeixin(params: {
  to: string; text: string; uploaded: UploadedFileInfo; opts: WeixinApiOptions & { contextToken?: string };
}): Promise<{ messageId: string }> {
  const { to, text, uploaded, opts } = params;
  const videoItem: MessageItem = {
    type: MessageItemType.VIDEO,
    video_item: { media: { encrypt_query_param: uploaded.downloadEncryptedQueryParam, aes_key: Buffer.from(uploaded.aeskey).toString("base64"), encrypt_type: 1 }, video_size: uploaded.fileSizeCiphertext },
  };
  return sendMediaItems({ to, text, mediaItem: videoItem, opts });
}

export async function sendFileMessageWeixin(params: {
  to: string; text: string; fileName: string; uploaded: UploadedFileInfo; opts: WeixinApiOptions & { contextToken?: string };
}): Promise<{ messageId: string }> {
  const { to, text, fileName, uploaded, opts } = params;
  const fileItem: MessageItem = {
    type: MessageItemType.FILE,
    file_item: { media: { encrypt_query_param: uploaded.downloadEncryptedQueryParam, aes_key: Buffer.from(uploaded.aeskey).toString("base64"), encrypt_type: 1 }, file_name: fileName, len: String(uploaded.fileSize) },
  };
  return sendMediaItems({ to, text, mediaItem: fileItem, opts });
}
