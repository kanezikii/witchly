# Witchly Daily GitHub Actions

这个项目用于把 Witchly 的每日 ritual 领取做成 GitHub Actions 定时任务。

已经确认的接口行为：

- 地址：`https://dash.witchly.host/api/earn/daily`
- 方法：`POST`
- 请求体：空
- 重复触发返回：`400 {"error":"Ritual failed"}`

## 文件

- `claim_witchly_daily.sh`
  用已确认的接口参数进行重放，适合本地执行和 GitHub Actions 执行。
- `.github/workflows/witchly-daily.yml`
  每天定时运行，也支持手动触发。
- `capture_witchly_daily.js`
  保留为备用抓包脚本，后续接口变动时可重新确认。

## 第一次配置

1. 登录 `https://dash.witchly.host/`
2. 从浏览器里取出当前账号的 Cookie。
3. 在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 里添加：
   - `DAILY_COOKIE`

可选 secrets：

- `DAILY_URL`
- `DAILY_METHOD`
- `DAILY_REFERER`
- `DAILY_USER_AGENT`
- `DAILY_EXTRA_HEADERS_JSON`
- `DAILY_BODY_JSON`

默认值已经内置：

- `DAILY_URL`: `https://dash.witchly.host/api/earn/daily`
- `DAILY_METHOD`: `POST`
- `DAILY_REFERER`: `https://dash.witchly.host/`
- `DAILY_USER_AGENT`: `Mozilla/5.0`
- `DAILY_EXTRA_HEADERS_JSON`: 空
- `DAILY_BODY_JSON`: 空

## 本地调试

复制一份示例配置：

```bash
cp .env.witchly_daily.example .env.witchly_daily
```

填好后运行：

```bash
bash ./claim_witchly_daily.sh
```

## GitHub Actions

工作流文件已经准备好：

- 手动运行：`Actions -> Witchly Daily -> Run workflow`
- 定时运行：每天 `00:10 UTC`

如果你要改成别的时间，编辑：

- `.github/workflows/witchly-daily.yml`

## Cookie 获取

最简单的方式是用浏览器扩展直接复制 `dash.witchly.host` 的 Cookie，常见会包含：

- `__Secure-next-auth.session-token`
- `cf_clearance`

把整串原样放进 `DAILY_COOKIE` 即可。

如果后续接口行为变了，再使用 `capture_witchly_daily.js` 重新抓一次。

## 注意

- `DAILY_COOKIE` 往往会过期，尤其是登录态和 `cf_clearance`。
- 如果工作流突然失败，优先重新抓一次请求并更新 secrets。
- 当前已确认这个接口不需要额外请求体。
- 如果以后站点改成需要动态请求头或请求体，再把对应字段一并放进 secrets。
