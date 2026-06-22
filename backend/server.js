require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { rateLimiter } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 8088;

// 中间件
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(rateLimiter(30));

// 确保 data 目录存在
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 静态文件：serve frontend 目录
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API 路由（先注册占位，后续任务填充）
app.use('/api/products', require('./routes/products'));
app.use('/api/steam', require('./routes/steam'));
app.use('/api', require('./routes/chat'));
app.use('/api', require('./routes/match'));

// 启动
app.listen(PORT, function () {
  console.log('盲盒福袋搭配工具服务端已启动: http://localhost:' + PORT);
});
