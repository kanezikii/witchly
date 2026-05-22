# Witchly GitHub Actions

自动完成 Witchly 的每日签到和服务器续期，基于 GitHub Actions 定时执行，支持 Telegram 结果通知。

---

## 项目结构

| 文件 | 说明 |
|------|------|
| `claim_witchly_daily.sh` | 每日签到核心脚本 |
| `renew_witchlyhost.sh` | 服务器续期核心脚本 |
| `capture_witchly_daily.js` | 备用抓包脚本，接口变动时重新确认参数用 |
| `.github/workflows/witchly-daily.yml` | 每日签到工作流 |
| `.github/workflows/witchly-renew.yml` | 服务器续期工作流 |

---

## 两个工作流

### 每日签到 `witchly-daily.yml`

- **触发时间**：每天 UTC 00:10（北京时间 08:10）
- **接口**：`POST https://dash.witchly.host/api/earn/daily`
- **逻辑**：领取每日 ritual，重复领取返回 `400 {"error":"Ritual failed"}` 视为正常成功

### 服务器续期 `witchly-renew.yml`

- **触发时间**：每 3 天 UTC 01:20（北京时间 09:20）
- **接口**：`POST https://dash.witchly.host/api/servers/{server_id}/renew`
- **逻辑**：续期服务器，返回 `400 Too early` 表示未到期，视为正常跳过

两个工作流均支持在 Actions 页面手动触发。

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

> 如果不需要 TG 通知，跳过此步，删除 workflow 里的通知 step 即可。

1. 和 [@BotFather](https://t.me/BotFather) 对话，发 `/newbot` 创建一个 Bot，拿到 `Bot Token`。
2. 给 Bot 发一条任意消息，然后访问：
   ```
   https://api.telegram.org/bot<你的TOKEN>/getUpdates
   ```
   在返回 JSON 里找 `result[0].message.chat.id`，即为 `Chat ID`。

### 3. 添加 GitHub Secrets

进入仓库 **Settings → Secrets and variables → Actions → New repository secret**：

| Secret 名 | 说明 | 用于 |
|-----------|------|------|
| `DAILY_COOKIE` | 从浏览器复制的完整 Cookie 字符串 | 签到 + 续期 |
| `TG_BOT_TOKEN` | Telegram Bot Token，格式 `123456:ABCdef...` | 签到 + 续期 |
| `TG_CHAT_ID` | 接收通知的会话 ID，个人或群组均可 | 签到 + 续期 |
| `RENEW_URL` | 服务器续期接口地址 | 仅续期 |

> `RENEW_URL` 格式：`https://dash.witchly.host/api/servers/{server_id}/renew`，在 Witchly 控制台的服务器详情页可以找到对应的 server_id。

**可选 Secrets（有内置默认值，一般无需填写）：**

| Secret 名 | 默认值 |
|-----------|--------|
| `DAILY_URL` | `https://dash.witchly.host/api/earn/daily` |
| `DAILY_METHOD` | `POST` |
| `DAILY_REFERER` | `https://dash.witchly.host/` |
| `DAILY_USER_AGENT` | `Mozilla/5.0` |
| `DAILY_EXTRA_HEADERS_JSON` | 空 |
| `DAILY_BODY_JSON` | 空 |

---

## Telegram 通知效果

**每日签到成功：**
```
✅ Witchly 每日签到成功
📅 时间：2026-05-22 08:10:05 CST
📋 输出：HTTP 200 {"success":true}
🔗 查看本次运行
```

**服务器续期成功：**
```
✅ Witchly 服务器续期成功
📅 时间：2026-05-22 09:20:10 CST
📋 输出：Renewal request succeeded.
🔗 查看本次运行
```

**服务器未到期（正常跳过）：**
```
⏭️ Witchly 服务器未到期，跳过续期
📅 时间：2026-05-22 09:20:10 CST
📋 输出：Renewal skipped: Too early
🔗 查看本次运行
```

**任意失败时：**
- 一条包含退出码、输出内容和运行链接的文字消息
- 一个 `.log` 文件作为附件（完整执行日志）
- 同时上传日志到 Actions Artifacts，保留 7 天

---

## 本地调试

**签到脚本：**
```bash
cp .env.witchly_daily.example .env.witchly_daily
# 编辑 .env.witchly_daily，填入 DAILY_COOKIE 等变量
bash ./claim_witchly_daily.sh
```

**续期脚本：**
```bash
# 创建 .env.witchlyhost，填入以下内容：
# RENEW_URL=https://dash.witchly.host/api/servers/{server_id}/renew
# RENEW_COOKIE=你的Cookie
zsh ./renew_witchlyhost.sh
```

---

## 常见问题

**Q：工作流突然开始失败？**
Cookie 过期是最常见原因，尤其是 `cf_clearance` 有效期很短。重新从浏览器抓取并更新 `DAILY_COOKIE` Secret，签到和续期同时生效。

**Q：签到返回 400 Ritual failed 是失败吗？**
不是，表示今天已经领取过了，脚本会正常退出 0，TG 也会收到成功通知。

**Q：续期返回 400 Too early 是失败吗？**
不是，表示服务器还未到期，脚本跳过续期正常退出，TG 会收到"跳过"通知。

**Q：接口参数变了怎么办？**
运行 `capture_witchly_daily.js` 重新抓一次请求，确认新的接口行为后更新对应 Secrets。

**Q：不需要 TG 通知？**
删除对应 workflow 里 `Notify Telegram (success)` 和 `Notify Telegram (failure)` 两个 step，同时无需添加 `TG_BOT_TOKEN` 和 `TG_CHAT_ID`。

---

## 注意

- `DAILY_COOKIE` 会定期过期，工作流失败时第一时间更新。
- 不要把 Cookie、Bot Token 等敏感信息直接提交到代码里，统一放 Secrets 管理。
- Cookie 含有特殊字符属于正常现象，工作流已做转义处理，无需手动处理。
