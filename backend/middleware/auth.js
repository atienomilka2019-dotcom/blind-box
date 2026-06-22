// 简易 IP 速率限制
const requestCounts = new Map();

function rateLimiter(maxPerMin = 30) {
  return function (req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 60 * 1000;

    if (!requestCounts.has(ip)) {
      requestCounts.set(ip, []);
    }
    const timestamps = requestCounts.get(ip);
    // 清理过期记录
    while (timestamps.length > 0 && timestamps[0] < now - windowMs) {
      timestamps.shift();
    }

    if (timestamps.length >= maxPerMin) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }

    timestamps.push(now);
    next();
  };
}

// 每 5 分钟清理一次过期 IP 记录
setInterval(function () {
  const now = Date.now();
  const windowMs = 60 * 1000;
  requestCounts.forEach(function (timestamps, ip) {
    while (timestamps.length > 0 && timestamps[0] < now - windowMs) {
      timestamps.shift();
    }
    if (timestamps.length === 0) requestCounts.delete(ip);
  });
}, 5 * 60 * 1000);

module.exports = { rateLimiter };
