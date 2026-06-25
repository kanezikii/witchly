const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

(async () => {
    const TARGET_URL = process.env.DAILY_URL || 'https://dash.witchly.host/api/earn/daily';
    const COOKIE_STRING = process.env.DAILY_COOKIE;
    const USE_PROXY = process.env.PROXY_NODE ? true : false;

    if (!COOKIE_STRING) {
        console.error('❌ DAILY_COOKIE is missing!');
        process.exit(1);
    }

    console.log('🚀 正在启动无头浏览器环境...');
    
    // 构建浏览器启动参数
    const browserArgs = [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
    ];

    if (USE_PROXY) {
        console.log('🌐 启用本地 gost 代理 (127.0.0.1:18080)');
        browserArgs.push('--proxy-server=http://127.0.0.1:18080');
    }

    const browser = await puppeteer.launch({ 
        headless: "new",
        args: browserArgs
    });

    try {
        const page = await browser.newPage();

        console.log('🍪 正在解析并注入 Cookie...');
        
        // ── 优化后的 Cookie 解析逻辑，增强容错能力 ──
        const cookiePairs = COOKIE_STRING.split(';').map(c => c.trim()).filter(c => c);
        const cookiesToSet = [];
        
        for (let cookie of cookiePairs) {
            // 跳过没有等号的无效片段
            if (!cookie.includes('=')) continue; 
            
            const [name, ...rest] = cookie.split('=');
            const value = rest.join('=');
            
            if (name) {
                cookiesToSet.push({
                    name: name.trim(),
                    value: value.trim(),
                    url: TARGET_URL // 使用 url 而不是 domain，Puppeteer 会自动计算合法的作用域
                });
            }
        }

        if (cookiesToSet.length > 0) {
            await page.setCookie(...cookiesToSet);
            console.log(`✅ 成功准备了 ${cookiesToSet.length} 条 Cookie`);
        } else {
            console.warn('⚠️ 未解析出任何有效的 Cookie，请检查 DAILY_COOKIE 格式。');
        }

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`🔗 正在访问: ${TARGET_URL}`);
        
        // 访问页面并等待网络请求基本完成
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('⏳ 页面已加载，准备强制执行 JavaScript 倒计时，等待 15 秒...');
        await new Promise(resolve => setTimeout(resolve, 15000));

        const currentUrl = page.url();
        const pageTitle = await page.title();
        
        console.log('✅ 等待结束！');
        console.log(`📍 当前停留 URL: ${currentUrl}`);
        console.log(`📄 页面标题: ${pageTitle}`);

        // 获取页面上的文字内容并去除换行，方便在日志中单行查看
        const contentText = await page.evaluate(() => document.body.innerText);
        console.log(`📝 页面正文片段: ${contentText.substring(0, 100).replace(/\n/g, ' ')}...`);

        if (contentText.includes('Linkvertise') || contentText.includes('LV_RITUAL_REQUIRED')) {
            console.error('❌ 依然被 Linkvertise 拦截，可能需要进一步处理验证码或点击动态按钮。');
            process.exit(1);
        }

        console.log('🎉 流程执行完毕，未检测到明显拦截信息。');

    } catch (error) {
        console.error('❌ 脚本执行发生异常:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
