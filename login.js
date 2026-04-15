/*
 * 独立扫码登录模块
 * 负责获取微信二维码、轮询扫码状态，并生成账户凭证到 accounts/ 目录
 */

import fs from 'fs';
import path from 'path';
import qrcodeTerminal from 'qrcode-terminal';

const FIXED_BASE_URL = "https://ilinkai.weixin.qq.com";
const BOT_TYPE = "3"; 
const ACCOUNT_DIR = path.join(process.cwd(), 'accounts');

if (!fs.existsSync(ACCOUNT_DIR)) {
    fs.mkdirSync(ACCOUNT_DIR, { recursive: true });
}

async function fetchQRCode() {
    const url = `${FIXED_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

async function pollQRStatus(qrcode, currentBaseUrl) {
    const url = `${currentBaseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

async function startLogin() {
    console.log("🚀 正在向微信官方服务器请求登录二维码...");
    let qrData;
    try {
        qrData = await fetchQRCode();
    } catch (e) {
        console.error("❌ 获取二维码失败:", e.message);
        return;
    }

    console.log("\n===================================================");
    console.log("📱 请用微信扫描下方二维码登录：\n");
    qrcodeTerminal.generate(qrData.qrcode_img_content, { small: true });
    console.log(`\n💡 如果二维码显示错乱，请复制此链接到浏览器中打开扫码：\n${qrData.qrcode_img_content}`);
    console.log("===================================================\n");

    let currentBaseUrl = FIXED_BASE_URL;
    let scanned = false;

    while (true) {
        try {
            const status = await pollQRStatus(qrData.qrcode, currentBaseUrl);
            
            if (status.status === "wait") {
                process.stdout.write(".");
            } else if (status.status === "scaned") {
                if (!scanned) {
                    console.log("\n👀 已扫码！请在手机微信上点击确认登录...");
                    scanned = true;
                }
            } else if (status.status === "scaned_but_redirect") {
                if (status.redirect_host) {
                    currentBaseUrl = `https://${status.redirect_host}`;
                }
            } else if (status.status === "expired") {
                console.log("\n❌ 二维码已过期，请重新运行 node login.js 刷新。");
                break;
            } else if (status.status === "confirmed") {
                console.log("\n✅ 登录验证成功！正在生成凭证文件...");
                
                const accountId = status.ilink_bot_id;
                const token = status.bot_token;
                const baseUrl = status.baseurl;
                const userId = status.ilink_user_id;

                const mainConfPath = path.join(ACCOUNT_DIR, `${accountId}-im-bot.json`);
                const syncConfPath = path.join(ACCOUNT_DIR, `${accountId}-im-bot.sync.json`);
                const ctxConfPath = path.join(ACCOUNT_DIR, `${accountId}-im-bot.context-tokens.json`);

                // 🌟 直接写入 bot.js 所需的三大配置文件！
                fs.writeFileSync(mainConfPath, JSON.stringify({ token, baseUrl, userId }, null, 2));
                if (!fs.existsSync(syncConfPath)) fs.writeFileSync(syncConfPath, JSON.stringify({}));
                if (!fs.existsSync(ctxConfPath)) fs.writeFileSync(ctxConfPath, JSON.stringify({}));

                console.log(`🎉 账号凭证已安全保存至: accounts/${accountId}-im-bot.json`);
                console.log(`\n🚀 万事俱备！现在你可以执行 pm2 start bot.js 启动自推大军了！`);
                break;
            }
        } catch (e) {
            // 网络波动超时，静默继续轮询
        }
        await new Promise(r => setTimeout(r, 1500));
    }
}

startLogin();
