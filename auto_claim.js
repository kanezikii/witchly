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
        let page = await browser.newPage();
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
        await page.evaluate(el => el.click(), continueBtns[0]);

        // ── 动态雷达扫描：寻找 Linkvertise 标签页 ──
        console.log('📡 启动多标签页扫描，等待进入 Linkvertise...');
        let foundLinkvertise = false;
        for (let i = 0; i < 30; i++) { 
            const allPages = await browser.pages();
            for (const p of allPages) {
                if (p.url().includes('linkvertise')) {
                    page = p; // 将控制权移交给这个新标签页
                    await page.bringToFront();
                    foundLinkvertise = true;
                    break;
                }
            }
            if (foundLinkvertise) break;
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!foundLinkvertise) {
            throw new Error('跳转 Linkvertise 失败或超时，未能捕捉到新页面。');
        }

        const currentUrl = page.url();
        console.log(`📍 成功锁定 Linkvertise 页面: ${currentUrl}`);

        // ── 第二阶段：注入全局弹窗杀手 ──
        console.log('🛡️ 注入全局隐私弹窗粉碎机 (后台每秒自动扫描清除)...');
        await page.evaluate(() => {
            window.popupKiller = setInterval(() => {
                const elements = Array.from(document.querySelectorAll('button, div, span, a'));
                const target = elements.find(el => {
                    if (el.offsetWidth === 0 || el.offsetHeight === 0) return false; // 必须是肉眼可见的
                    const text = (el.textContent || '').trim().toUpperCase();
                    return text === 'CONFIRM' || text === 'ACCEPT' || text === 'AGREE';
                });
                if (target) {
                    target.click();
                    console.log('🤖 拦截并自动粉碎了隐私协议弹窗！');
                }
            }, 1000);
        });

        console.log('⏳ 给予 Linkvertise 页面加载缓冲时间...');
        await new Promise(r => setTimeout(r, 6000)); 

        // ── 寻找 Get Link 按钮 ──
        console.log('⏳ 寻找 [Get Link / Free Access] 按钮...');
        let getLinkClicked = false;
        for (let i = 0; i < 15; i++) {
            getLinkClicked = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('button, div, span, a'));
                const target = elements.find(el => {
                    if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
                    const text = (el.textContent || '').trim();
                    return text === 'Get Link' || text === 'Free Access';
                });
                if (target) {
                    target.click();
                    return true;
                }
                return false;
            });
            
            if (getLinkClicked) {
                console.log('🖱️ 点击获取链接按钮，准备进入广告循环...');
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!getLinkClicked) {
            console.log('⚠️ 未找到显式的 Get Link 按钮，尝试直接扫描 Skip Ad 按钮...');
        }

        // ── 第三阶段：循环处理 3 个广告 ──
        for (let i = 1; i <= 3; i++) {
            console.log(`\n⏳ 开始处理第 ${i} 个广告...`);
            let skipClicked = false;
            const startTime = Date.now();
            
            while (Date.now() - startTime < 30000) {
                skipClicked = await page.evaluate(() => {
                    const elements = Array.from(document.querySelectorAll('span, div, button'));
                    const target = elements.find(el => {
                        if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
                        const text = (el.textContent || '').trim();
                        // 兼容多种跳过提示
                        return text.includes('Skip Ad') || text.includes('Skip ad') || text === 'Skip';
                    });
                    if (target) {
                        target.click();
                        return true;
                    }
                    return false;
                });
                
                if (skipClicked) {
                    console.log(`✅ 第 ${i} 个广告 [Skip Ad] 点击成功！`);
                    await new Promise(r => setTimeout(r, 4000)); 
                    break; 
                }
                await new Promise(r => setTimeout(r, 1000)); 
            }
            
            if (!skipClicked) {
                console.log(`⚠️ 第 ${i} 个广告未找到 Skip Ad 按钮，可能提前结束或卡在了验证码。`);
                break;
            }
        }

        // ── 第四阶段：等待最终回跳 ──
        console.log('\n⏳ 广告处理完毕，等待重定向回 Witchly...');
        try {
            // 使用原生的 JS 判断代替 Puppeteer 的等待，防挂死
            await page.waitForFunction(() => window.location.href.includes('witchly.host'), { timeout: 40000 });
            console.log('🎉 成功绕过 Linkvertise，签到流程完美闭环！');
            await page.screenshot({ path: 'success.png', fullPage: true });
        } catch (e) {
            // 兜底方案：如果页面没跳，检查一下是不是 Witchly 的旧标签页被激活了
            const allPages = await browser.pages();
            let safeLanded = false;
            for (const p of allPages) {
                if (p.url().includes('witchly.host')) {
                    safeLanded = true;
                    await p.bringToFront();
                    console.log('🎉 发现 Witchly 主标签页存活，签到流程似乎已完成！');
                    await p.screenshot({ path: 'success.png', fullPage: true });
                    break;
                }
            }
            if (!safeLanded) {
                throw new Error(`回跳等待失败或超时，可能被终极人机验证拦截。`);
            }
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
