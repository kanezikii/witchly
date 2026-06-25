const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// 启用 Stealth 插件，降低被识别为机器人的概率
puppeteer.use(StealthPlugin());

(async () => {
    // ── 配置区域 ────────────────────────────────────────────────────────
    const DASHBOARD_URL = 'https://dash.witchly.host/';
    
    // 强烈建议通过环境变量传入，不要把 Cookie 明文写在代码里
    const COOKIE_STRING = process.env.DAILY_COOKIE; 
    
    // 👉 替换为真实的 CSS 选择器 (Selector)
    // 你需要在网页上右键那个 "MANIFEST" 黄色按钮，选择"检查"，获取它的完整选择器
    const SEL_MANIFEST_BTN = '.btn-primary'; 
    // ────────────────────────────────────────────────────────────────────

    if (!COOKIE_STRING) {
        console.error('❌ 未找到 DAILY_COOKIE 环境变量，请检查 GitHub Secrets 配置！');
        process.exit(1);
    }

    console.log('🚀 正在启动自动化浏览器...');
    const browser = await puppeteer.launch({ 
        // GitHub Actions 中必须保持 "new"，本地调试时可以改为 false 以观察运行画面
        headless: "new", 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--window-size=1280,800',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // ── 1. 健壮的 Cookie 解析与注入 ──
        console.log('🍪 正在解析并注入 Cookie...');
        const cookiePairs = COOKIE_STRING.split(';').map(c => c.trim()).filter(c => c);
        const cookiesToSet = [];
        
        for (let cookie of cookiePairs) {
            if (!cookie.includes('=')) continue; 
            const [name, ...rest] = cookie.split('=');
            const value = rest.join('=');
            
            if (name) {
                cookiesToSet.push({
                    name: name.trim(),
                    value: value.trim(),
                    url: DASHBOARD_URL // 使用 url 让 Puppeteer 自动推断作用域，避免 Invalid cookie 报错
                });
            }
        }

        if (cookiesToSet.length > 0) {
            await page.setCookie(...cookiesToSet);
            console.log(`✅ 成功准备了 ${cookiesToSet.length} 条 Cookie，实现免密登录状态。`);
        } else {
            throw new Error('未解析出任何有效的 Cookie，请检查格式。');
        }

        // ── 2. 直接访问主面板 ──
        console.log(`🌐 带着 Cookie 访问面板页面: ${DASHBOARD_URL}`);
        await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // (可选) 截图确认是否真的登录进去了
        // await page.screenshot({ path: 'dashboard_loaded.png' });

        // ── 3. 寻找并点击签到按钮 ──
        console.log('⏳ 页面已加载，正在寻找 MANIFEST 签到按钮...');
        
        try {
            // 等待黄色按钮出现，超时时间设为 15 秒
            await page.waitForSelector(SEL_MANIFEST_BTN, { visible: true, timeout: 15000 });
            console.log('🖱️ 找到签到按钮，正在点击...');
            await page.click(SEL_MANIFEST_BTN);
            
            // 点击后等待页面发生变化或跳转到 Linkvertise
            console.log('⏳ 按钮已点击，等待后续页面响应 (等待 10 秒)...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
        } catch (selectorError) {
            console.error('❌ 未能在页面上找到签到按钮，可能原因：');
            console.error('  1. Cookie 已过期，被跳转到了登录页。');
            console.error('  2. 按钮的 CSS 选择器 (SEL_MANIFEST_BTN) 填写错误。');
            console.error('  3. 页面加载太慢或网络卡顿。');
            throw selectorError; // 抛出错误以阻断后续流程
        }

        // ── 4. 验证执行结果 ──
        const currentUrl = page.url();
        console.log(`📍 当前停留 URL: ${currentUrl}`);
        
        // 截图留存（GitHub Actions 中如果没有上传 Artifact，这步主要是防崩溃）
        await page.screenshot({ path: 'claim_result.png', fullPage: true });
        console.log('📸 已保存最终执行结果截图 (claim_result.png)。');
        console.log('🎉 自动化点击流程执行完毕！');

    } catch (error) {
        console.error('❌ 脚本执行发生致命异常:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
