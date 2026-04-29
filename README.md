# Telegram 用户登记小程序（Vercel / 自托管）

## 结构

```text
index.html
api/submit.js          # Vercel Serverless 入口
lib/submit-handler.js  # 共享：校验 initData + 通知管理员
server.js              # VPS 自托管（静态 + POST /api/submit）
package.json
vercel.json
.nvmrc
```

## 环境变量

必填：

- `BOT_TOKEN`：你的机器人 token（来自 @BotFather）

可选：

- `ADMIN_CHAT_ID`：管理员 chat_id（配置后会收到登记通知）
- `PORT`：自托管监听端口（默认 `14439`）
- `HOST`：监听地址（默认 `0.0.0.0`）

## Vercel 部署

与往常一样连接 GitHub 仓库后在 Vercel 导入，在面板里配置 `BOT_TOKEN` / `ADMIN_CHAT_ID`。

## VPS 自托管（例如 `https://IP:14439/`）

1. 安装 Node.js >= 20，上传本仓库到服务器。
2. 安装依赖并启动：

```bash
npm install
export BOT_TOKEN='你的token'
export ADMIN_CHAT_ID='可选'
export PORT=14439
npm start
```

3. 用 Nginx/Caddy 反代 HTTPS，或在防火墙放行 `14439`。
4. 在 @BotFather 里把 Web App URL 设为 `https://你的域名或IP:端口/`（须 HTTPS 才能在 Telegram 里正常打开，IP+自签证书可能不被接受，建议域名 + 有效证书）。

## 行为说明

- 前端会把 `Telegram.WebApp.initData` + 表单提交到 `/api/submit`
- 后端校验 initData 的 hash，校验通过才接受数据并可选通知管理员
