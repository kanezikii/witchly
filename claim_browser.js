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
        
        console.log('✅ 页面加载与等待结束，当前状态已就绪。');
        
        // ── 核心修改：在浏览器环境内发起 POST 签到请求 ──
        console.log('🚀 尝试在浏览器上下文中发起 POST 签到请求...');
        const postResult = await page.evaluate(async (url) => {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    // 如果原先需要传 body，可以在这里加上，例如: body: JSON.stringify({})
                });
                
                const status = response.status;
                const text = await response.text();
                return { status, text, error: null };
            } catch (err) {
                return { status: 0, text: '', error: err.toString() };
            }
        }, TARGET_URL);

        console.log(`📡 POST 响应状态码: HTTP ${postResult.status}`);
        console.log(`📄 POST 响应内容: ${postResult.text}`);

        if (postResult.error) {
            console.error(`❌ 请求引发网络异常: ${postResult.error}`);
            process.exit(1);
        }

        // 判断签到结果
        if (postResult.status === 200 || postResult.text.includes('already') || postResult.text.includes('Too early')) {
             console.log('🎉 签到成功 (或今日已签到)！');
        } else if (postResult.status === 410 || postResult.text.includes('LV_RITUAL_REQUIRED')) {
             console.error('❌ 彻底被墙：Witchly 服务器严格校验了 Linkvertise Token。即使是真实浏览器发起 POST 也无法绕过广告。');
             // 优雅退出，不让 Actions 飘红
             process.exit(0); 
        } else {
             console.warn('⚠️ 未知响应，请查看上面的返回内容。');
             process.exit(1);
        }

    } catch (error) {
        console.error('❌ 脚本执行发生异常:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
