const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

(async () => {
    const DASHBOARD_URL = 'https://dash.witchly.host/';
    const COOKIE_STRING = process.env.DAILY_COOKIE;

    if (!COOKIE_STRING) {
        console.error('❌ DAILY_COOKIE is missing!');
        process.exit(1);
    }

    console.log('🚀 正在启动无头浏览器 (连接 Xray 代理端口 10808)...');
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--window-size=1280,800',
            '--disable-blink-features=AutomationControlled',
            '--proxy-server=socks5://127.0.0.1:10808'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // ── 拦截垃圾广告弹窗 ──
        browser.on('targetcreated', async (target) => {
            if (target.type() === 'page') {
                const newPage = await target.page();
                const url = newPage.url();
                if (url && !url.includes('witchly') && !url.includes('linkvertise') && !url.includes('about:blank')) {
                    console.log(`🛡️ 拦截并关闭广告弹窗: ${url}`);
                    await newPage.close();
                }
            }
        });

        // ── 注入 Cookie ──
        const cookiePairs = COOKIE_STRING.split(';').map(c => c.trim()).filter(c => c);
        const cookiesToSet = cookiePairs.filter(c => c.includes('=')).map(cookie => {
            const [name, ...rest] = cookie.split('=');
            return { name: name.trim(), value: rest.join('=').trim(), url: DASHBOARD_URL };
        });
        await page.setCookie(...cookiesToSet);

        // ── 第一阶段：Witchly 面板操作 ──
        console.log(`🌐 访问 Witchly 面板...`);
        await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        console.log('⏳ 等待页面脚本加载完全...');
        await new Promise(r => setTimeout(r, 3000));

        console.log('⏳ 寻找 [MANIFEST] 按钮...');
        const manifestXPath = "//button[contains(@class, 'btn-primary') and contains(translate(., 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'MANIFEST')]";
        await page.waitForSelector(`::-p-xpath(${manifestXPath})`, { visible: true, timeout: 15000 });
        const manifestBtns = await page.$$(`::-p-xpath(${manifestXPath})`);
        
        if (manifestBtns.length > 0) {
            console.log('🖱️ 强制点击 [MANIFEST] 按钮');
            await page.evaluate(el => el.click(), manifestBtns[0]);
        } else {
            throw new Error('未能找到 MANIFEST 按钮，可能今日已签到。');
        }

        console.log('⏳ 等待 [CONTINUE] 弹窗... (最长等待 30 秒)');
        const continueXPath = "//button[contains(translate(., 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'CONTINUE')]";
        await page.waitForSelector(`::-p-xpath(${continueXPath})`, { visible: true, timeout: 30000 });
        const continueBtns = await page.$$(`::-p-xpath(${continueXPath})`);
        
        console.log('🖱️ 强制点击 [CONTINUE] 按钮，准备跳转...');
        await Promise.all([
            page.evaluate(el => el.click(), continueBtns[0]),
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
        ]);

        // ── 第二阶段：Linkvertise 操作 ──
        const currentUrl = page.url();
        console.log(`📍 成功跳转至: ${currentUrl}`);
        
        if (!currentUrl.includes('linkvertise')) {
            throw new Error('未能成功跳转到 Linkvertise，流程中断。');
        }

        console.log('⏳ 给予 Linkvertise 页面加载缓冲时间...');
        await new Promise(r => setTimeout(r, 5000)); 

        // ── 核心新增：清除隐私/Cookie 弹窗障碍 ──
        console.log('🔍 检查是否有隐私/Cookie 同意弹窗...');
        try {
            // 寻找包含 CONFIRM, ACCEPT 或 AGREE 的按钮
            const consentXPath = "//button[contains(translate(., 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'CONFIRM') or contains(translate(., 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'ACCEPT')]";
            await page.waitForSelector(`::-p-xpath(${consentXPath})`, { visible: true, timeout: 5000 });
            const consentBtns = await page.$$(`::-p-xpath(${consentXPath})`);
            
            if (consentBtns.length > 0) {
                console.log('🛡️ 发现隐私弹窗，点击 [CONFIRM] 以清除障碍...');
                await page.evaluate(el => el.click(), consentBtns[0]);
                // 给弹窗关闭动画一点时间
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (e) {
            console.log('✅ 未检测到隐私弹窗拦截，继续正常流程。');
        }

        // ── 继续寻找 Get Link 按钮 ──
        console.log('⏳ 寻找 [Get Link / Free Access] 按钮...');
        const getLinkXPath = "//button[contains(., 'Get Link')] | //span[contains(., 'Get Link')] | //div[contains(@class, 'linkvertise-btn')]";
        try {
            await page.waitForSelector(`::-p-xpath(${getLinkXPath})`, { visible: true, timeout: 15000 });
            const getLinkBtns = await page.$$(`::-p-xpath(${getLinkXPath})`);
            console.log('🖱️ 点击获取链接按钮，进入广告循环...');
            await page.evaluate(el => el.click(), getLinkBtns[0]);
        } catch (e) {
            console.log('⚠️ 未找到显式的 Get Link 按钮，尝试直接寻找广告 Skip Ad...');
        }

        // ── 第三阶段：循环处理 3 个广告 ──
        for (let i = 1; i <= 3; i++) {
            console.log(`\n⏳ 开始处理第 ${i} 个广告...`);
            let skipClicked = false;
            const startTime = Date.now();
            
            while (Date.now() - startTime < 30000) {
                try {
                    const skipXPath = "//span[contains(@class, 'lv-chip__text') and contains(., 'Skip Ad')]";
                    const skipBtns = await page.$$(`::-p-xpath(${skipXPath})`);
                    if (skipBtns.length > 0) {
                        await page.evaluate(el => el.click(), skipBtns[0]);
                        console.log(`✅ 第 ${i} 个广告 [Skip Ad] 点击成功！`);
                        skipClicked = true;
                        await new Promise(r => setTimeout(r, 3000)); 
                        break; 
                    }
                } catch (err) {}
                await new Promise(r => setTimeout(r, 1000)); 
            }
            
            if (!skipClicked) {
                console.log(`⚠️ 第 ${i} 个广告未找到 Skip Ad 按钮，可能卡在验证码或流程已结束。`);
                break;
            }
        }

        // ── 第四阶段：等待最终回跳 ──
        console.log('\n⏳ 广告处理完毕，等待重定向回 Witchly...');
        try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
            const finalUrl = page.url();
            console.log(`📍 最终落点 URL: ${finalUrl}`);
            
            if (finalUrl.includes('witchly')) {
                console.log('🎉 成功绕过 Linkvertise，签到流程完美闭环！');
                await page.screenshot({ path: 'success.png', fullPage: true });
            } else {
                throw new Error(`回跳失败，当前停留在: ${finalUrl}`);
            }
        } catch (e) {
            throw new Error(`等待回跳失败或超时: ${e.message}`);
        }

    } catch (error) {
        console.error('❌ 致命异常:', error.message);
        try {
            const pages = await browser.pages();
            if (pages.length > 0) {
                await pages[pages.length - 1].screenshot({ path: 'error.png', fullPage: true });
                console.log('📸 已保存错误现场截图至 error.png');
            }
        } catch(e) {}
        
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
