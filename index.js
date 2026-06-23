// Vercel Serverless 入口 — 完整前端 + API
const path = require('path');
const fs = require('fs');

// 预加载 HTML 页面
const htmlPath = path.join(__dirname, 'frontend', 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

// MIME 类型映射
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

module.exports = function (req, res) {
  const url = req.url || '/';

  // API 路由转发
  if (url.startsWith('/api/')) {
    try {
      const app = require('./backend/server');
      return app(req, res);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('API Error: ' + e.message);
    }
  }

  // 静态文件服务
  const ext = path.extname(url).toLowerCase();
  if (ext && mimeTypes[ext]) {
    const filePath = path.join(__dirname, 'frontend', url);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // 默认返回 HTML
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlContent);
};
