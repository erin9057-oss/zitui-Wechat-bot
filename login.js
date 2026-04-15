/*
 * 独立扫码登录模块 (修复 UIN 刷新机制与 WAF 拦截)
 * 负责获取微信二维码、轮询扫码状态，并生成账户凭证到 accounts/ 目录
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import qrcodeTerminal from 'qrcode-terminal';
import readline from 'readline';

const FIXED_BASE_URL = "https://ilinkai.weixin.qq.com";
const BOT_TYPE = "3"; 
const ACCOUNT_DIR = path.join(process.cwd(), 'accounts');

if (!fs.existsSync(ACCOUNT_DIR)) {
    fs.mkdirSync(ACCOUNT_DIR, { recursive: true });
}

// 🌟 核心修复 1：UIN 必须全局唯一！整个登录会话期间绝不能改变，否则会触发微信服务器风控导致二维码失效。
const GLOBAL_UIN = Buffer.from(String(crypto.randomBytes(4).readUInt32BE(0)), "utf-8").toString("base64");

function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-WECHAT-UIN': GLOBAL_UIN,
        'iLink-App-Id': 'bot',
        'iLink-App-ClientVersion': '131335',
        // 🌟 核心修复 2：补充标准 UA，防止被腾讯云 WAF 当作恶意爬虫拦截
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
}

async function fetchQRCode() {
    const url = `${FIXED_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`;
    const res = await fetch(url, { method: 'GET', headers: getHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

async function pollQRStatus(qrcode, currentBaseUrl) {
    const url = `${currentBaseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;
    const res = await fetch(url, { method: 'GET', headers: getHeaders() });
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
        process.exit(1);
    }

    console.log("\n===================================================");
    console.log("📱 请用微信扫描下方二维码登录：\n");
    qrcodeTerminal.generate(qrData.qrcode_img_content, { small: true });
    console.log(`\n💡 如果二维码显示错乱，请复制此链接到浏览器中打开扫码：\n${qrData.qrcode_img_content}`);
    console.log("===================================================");
    console.log("💡 【重要提示】：如果现在不方便扫码，可以按下回车键 (Enter) 跳过扫码，继续跑完安装流程。");
    console.log("===================================================\n");

    let currentBaseUrl = FIXED_BASE_URL;
    let scanned = false;
    let timeoutCount = 0;
    let isCancelled = false;

    // 🌟 新增：监听控制台输入，允许用户随时按下回车跳过
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('line', () => {
        console.log("\n\n⏭️ 检测到回车输入，正在取消扫码并进入下一步...");
        isCancelled = true;
        rl.close();
    });

    while (!isCancelled) {
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
                console.log("\n❌ 二维码已过期。");
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

                // 写入凭证
                fs.writeFileSync(mainConfPath, JSON.stringify({ token, baseUrl, userId }, null, 2));
                if (!fs.existsSync(syncConfPath)) fs.writeFileSync(syncConfPath, JSON.stringify({}));
                if (!fs.existsSync(ctxConfPath)) fs.writeFileSync(ctxConfPath, JSON.stringify({}));

                console.log(`🎉 账号凭证已安全保存至: accounts/${accountId}-im-bot.json`);
                break;
            }
        } catch (e) {
            timeoutCount++;
            if (timeoutCount > 20) {
                console.log("\n❌ 连续网络超时，跳过扫码。");
                break;
            }
        }
        // 降低轮询频率到 2 秒，进一步降低风控概率
        await new Promise(r => setTimeout(r, 2000));
    }

    rl.close();
    // 扫码完成或跳过后，始终以正常状态退出，不要阻断 install.sh 的执行
    process.exit(0);
}

startLogin();
