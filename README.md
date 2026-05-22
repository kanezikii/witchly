# Witchly Daily GitHub Actions

自动领取 Witchly 每日 ritual，基于 GitHub Actions 定时执行，支持 Telegram 结果通知。

已确认的接口行为：

- 地址：`https://dash.witchly.host/api/earn/daily`
- 方法：`POST`
- 请求体：空
- 重复触发返回：`400 {"error":"Ritual failed"}`（视为正常，不报错）

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `claim_witchly_daily.sh` | 核心签到脚本，本地和 Actions 均可执行 |
| `.github/workflows/witchly-daily.yml` | 定时工作流，含 Telegram 通知和失败日志上传 |
| `capture_witchly_daily.js` | 备用抓包脚本，接口变动时重新确认参数用 |

---

## 第一次配置

### 1. 获取 Cookie

登录 `https://dash.witchly.host/`，然后用以下任一方式获取 Cookie：

- **浏览器扩展**（推荐）：安装 [Cookie-Editor](https://cookie-editor.com/)，一键复制当前站点全部 Cookie。
- **DevTools 手动复制**：F12 → Network → 任意请求 → Request Headers → 找到 `Cookie` 字段，复制整行值。

Cookie 里通常包含：
- `__Secure-next-auth.session-token`
- `cf_clearance`

### 2. 准备 Telegram Bot

> 如果不需要 TG 通知，跳过此步，删除 workflow 里的两个通知 step 即可。

1. 和 [@BotFather](https://t.me/BotFather) 对话，发 `/newbot` 创建一个 Bot，拿到 `Bot Token`。
2. 给 Bot 发一条任意消息，然后访问：
   ```
   https://api.telegram.org/bot<你的TOKEN>/getUpdates
   ```
   在返回 JSON 里找 `result[0].message.chat.id`，即为 `Chat ID`。

### 3. 添加 GitHub Secrets

进入仓库 **Settings → Secrets and variables → Actions → New repository secret**：

**必填：**

| Secret 名 | 说明 |
|-----------|------|
| `DAILY_COOKIE` | 第 1 步获取的完整 Cookie 字符串 |
| `TG_BOT_TOKEN` | Telegram Bot Token，格式 `123456:ABCdef...` |
| `TG_CHAT_ID` | 接收通知的会话 ID，个人或群组均可 |

**可选（已有内置默认值，一般无需填写）：**

| Secret 名 | 默认值 |
|-----------|--------|
| `DAILY_URL` | `https://dash.witchly.host/api/earn/daily` |
| `DAILY_METHOD` | `POST` |
| `DAILY_REFERER` | `https://dash.witchly.host/` |
| `DAILY_USER_AGENT` | `Mozilla/5.0` |
| `DAILY_EXTRA_HEADERS_JSON` | 空 |
| `DAILY_BODY_JSON` | 空 |

---

## GitHub Actions

工作流触发方式：

- **定时运行**：每天 UTC `00:10`（北京时间 `08:10`）自动执行
- **手动运行**：Actions → Witchly Daily → Run workflow

修改执行时间，编辑 `.github/workflows/witchly-daily.yml` 里的 `cron` 表达式：

```yaml
- cron: '10 0 * * *'   # UTC 时间，改成你想要的时间
```

### 通知效果

**成功时：**
```
✅ Witchly 每日签到成功
📅 时间：2026-05-22 08:10:05 CST
📋 输出：
HTTP 200
{"success":true}
🔗 查看本次运行
```

**失败时：**
- 一条包含退出码、输出内容和运行链接的文字消息
- 一个 `.log` 文件作为附件发送（完整执行日志）
- 同时上传日志到 Actions Artifacts，保留 7 天

---

## 本地调试

复制示例配置文件：

```bash
cp .env.witchly_daily.example .env.witchly_daily
```

编辑 `.env.witchly_daily`，填入 `DAILY_COOKIE` 等变量，然后运行：

```bash
bash ./claim_witchly_daily.sh
```

---

## 常见问题

**Q：工作流突然开始失败？**
Cookie 过期是最常见原因，尤其是 `cf_clearance` 有效期很短。重新从浏览器抓取并更新 `DAILY_COOKIE` Secret 即可。

**Q：接口参数变了怎么办？**
运行 `capture_witchly_daily.js` 重新抓一次请求，确认新的接口行为后更新对应 Secrets。

**Q：不需要 TG 通知？**
删除 workflow 文件里 `Notify Telegram (success)` 和 `Notify Telegram (failure)` 两个 step，同时无需添加 `TG_BOT_TOKEN` 和 `TG_CHAT_ID`。

**Q：想同时签到多个账号？**
复制一份 workflow 文件，使用不同的 Secret 名（如 `DAILY_COOKIE_2`）和不同的 job 名即可。

---

## 注意

- `DAILY_COOKIE` 会定期过期，建议工作流失败时第一时间更新。
- 不要把 Cookie、Bot Token 等敏感信息直接提交到代码里，统一放 Secrets 管理。
- 当前接口无需额外请求体；如站点后续有变动，通过 `capture_witchly_daily.js` 重新确认参数。
