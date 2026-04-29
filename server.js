/**
 * 自托管：在 VPS 上同时提供静态页与 /api/submit
 * 用法：BOT_TOKEN=xxx [PORT=14439] node server.js
 */
const path = require("path");
const express = require("express");
const { submitHandler } = require("./lib/submit-handler");

const app = express();
const root = __dirname;

app.use(express.json({ limit: "256kb" }));

app.post("/api/submit", (req, res) => {
  submitHandler(req, res);
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(root, "index.html"));
});

app.use(express.static(root, { index: false }));

const port = Number(process.env.PORT || 14439);
const host = process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`telegram-mini-app listening on http://${host}:${port}`);
});
