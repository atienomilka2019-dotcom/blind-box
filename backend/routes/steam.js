const express = require('express');
const router = express.Router();
const steamService = require('../services/steam-service');

// 简单的内存缓存（1 小时过期）
var cache = {};
var CACHE_TTL = 60 * 60 * 1000; // 1 小时

function cacheGet(key) {
  var entry = cache[key];
  if (entry && Date.now() - entry.time < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

function cacheSet(key, data) {
  cache[key] = { data: data, time: Date.now() };
}

// GET /api/steam/app/:appId — 获取 Steam 应用完整信息
router.get('/app/:appId', function (req, res) {
  var appId = req.params.appId;

  // 检查缓存
  var cached = cacheGet(appId);
  if (cached) {
    return res.json({ success: true, source: 'cache', data: cached });
  }

  steamService.getFullAppInfo(appId).then(function (data) {
    cacheSet(appId, data);
    res.json({ success: true, source: 'live', data: data });
  }).catch(function (err) {
    res.status(500).json({ success: false, error: err.message });
  });
});

// POST /api/steam/refresh — 批量刷新 Steam 数据
router.post('/refresh', function (req, res) {
  var appIds = req.body.appIds || [];
  if (!Array.isArray(appIds) || appIds.length === 0) {
    return res.status(400).json({ error: '请提供 appIds 数组' });
  }

  var results = [];
  var errors = [];

  // 串行请求，间隔 1.5 秒避免 Steam API 限流
  function processNext(index) {
    if (index >= appIds.length) {
      return res.json({ success: true, results: results, errors: errors });
    }

    var appId = appIds[index];
    // 跳过缓存命中
    var cached = cacheGet(appId);
    if (cached) {
      results.push({ appId: appId, data: cached, cached: true });
      return processNext(index + 1);
    }

    steamService.getFullAppInfo(appId).then(function (data) {
      cacheSet(appId, data);
      results.push({ appId: appId, data: data, cached: false });
      setTimeout(function () { processNext(index + 1); }, 1500);
    }).catch(function (err) {
      errors.push({ appId: appId, error: err.message });
      setTimeout(function () { processNext(index + 1); }, 500);
    });
  }

  processNext(0);
});

// GET /api/steam/app/:appId/players — 仅获取在线人数
router.get('/app/:appId/players', function (req, res) {
  var appId = req.params.appId;
  steamService.getPlayerCount(appId).then(function (data) {
    res.json({ success: true, data: data });
  }).catch(function (err) {
    res.status(500).json({ success: false, error: err.message });
  });
});

module.exports = router;
