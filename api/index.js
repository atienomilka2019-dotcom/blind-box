// Vercel Serverless 入口 — 手动创建 Express 应用避免路径问题
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 静态文件
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API 路由
app.use('/api/products', require('../backend/routes/products'));
app.use('/api/steam', require('../backend/routes/steam'));
app.use('/api', require('../backend/routes/chat'));
app.use('/api', require('../backend/routes/match'));

module.exports = app;
