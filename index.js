// Vercel Serverless 入口 — 返回前端 HTML 页面
const path = require('path');
const fs = require('fs');

// 读取 HTML 内容（只在冷启动时加载一次）
const htmlPath = path.join(__dirname, 'frontend', 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

module.exports = function (req, res) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlContent);
};
