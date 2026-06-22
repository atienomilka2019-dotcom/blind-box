const express = require('express');
const router = express.Router();
const aiService = require('../services/ai-service');

// POST /api/chat — SSE 流式对话
router.post('/chat', function (req, res) {
  var messages = req.body.messages || [];
  var context = req.body.context || {};

  if (messages.length === 0) {
    return res.status(400).json({ error: '请提供消息内容' });
  }

  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // 发送心跳防止超时
  var heartbeat = setInterval(function () {
    res.write(': heartbeat\n\n');
  }, 15000);

  aiService.chatStream(messages, context, function (chunk) {
    res.write('data: ' + JSON.stringify(chunk) + '\n\n');
  }).then(function () {
    clearInterval(heartbeat);
    res.write('data: {"type":"done"}\n\n');
    res.end();
  }).catch(function (err) {
    clearInterval(heartbeat);
    res.write('data: {"type":"error","content":"AI 服务出错：' + err.message + '"}\n\n');
    res.end();
  });

  // 客户端断开时清理
  req.on('close', function () {
    clearInterval(heartbeat);
  });
});

module.exports = router;
