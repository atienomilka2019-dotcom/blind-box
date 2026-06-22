const https = require('https');

// 简单的 HTTP GET 封装（不引入第三方依赖）
function httpGet(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: { 'User-Agent': 'blind-box-suite/4.0' } }, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON 解析失败: ' + e.message));
        }
      });
    }).on('error', function (e) {
      reject(new Error('请求失败: ' + e.message));
    });
  });
}

// 获取 Steam 商店应用详情（公开接口，无需 Key）
function getAppDetails(appId) {
  var url = 'https://store.steampowered.com/api/appdetails?appids=' + appId + '&cc=cn';
  return httpGet(url).then(function (result) {
    var appData = result[String(appId)];
    if (!appData || !appData.success) {
      throw new Error('Steam 应用 ' + appId + ' 数据获取失败');
    }
    var data = appData.data;
    var categories = [];
    if (data.genres) {
      categories = data.genres.map(function (g) { return g.description; });
    }
    if (data.categories) {
      data.categories.forEach(function (c) { categories.push(c.description); });
    }

    // 价格处理（Steam 返回的是分）
    var marketPrice = null;
    var discountPrice = null;
    if (data.price_overview) {
      marketPrice = data.price_overview.initial / 100;
      if (data.price_overview.discount_percent > 0) {
        discountPrice = data.price_overview.final / 100;
      }
    } else if (data.is_free) {
      marketPrice = 0;
    }

    // 评论数据
    var reviewCount = 0;
    var rating = 0;
    if (data.recommendations) {
      reviewCount = data.recommendations.total || 0;
    }

    return {
      name: data.name,
      marketPrice: marketPrice,
      discountPrice: discountPrice,
      categories: categories.slice(0, 5),
      reviewCount: reviewCount,
      rating: rating,
      developer: data.developers ? data.developers[0] : null,
      publishers: data.publishers || [],
      headerImage: data.header_image || '',
      shortDescription: data.short_description || '',
      isFree: data.is_free || false,
      releaseDate: data.release_date ? data.release_date.date : null
    };
  });
}

// 获取当前在线玩家数（需要 Steam API Key）
function getPlayerCount(appId) {
  var key = process.env.STEAM_API_KEY;
  if (!key) {
    return Promise.resolve({ currentPlayers: null, note: '未配置 STEAM_API_KEY' });
  }
  var url = 'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/'
    + '?appid=' + appId + '&key=' + key;
  return httpGet(url).then(function (result) {
    var playerCount = result.response ? result.response.player_count : null;
    return { currentPlayers: playerCount };
  });
}

// 热度分计算
function calcHotScore(reviewCount, rating, currentPlayers) {
  var c1 = reviewCount || 0;
  var c2 = currentPlayers || 0;
  var maxReviews = 10000000;
  var maxPlayers = 1000000;

  var reviewScore = Math.min(Math.log10(c1 + 1) / Math.log10(maxReviews), 1) * 100;
  var ratingScore = rating || 0;
  var playerScore = Math.min(Math.log10(c2 + 1) / Math.log10(maxPlayers), 1) * 100;

  return Math.round(reviewScore * 0.3 + ratingScore * 0.3 + playerScore * 0.4);
}

// 完整获取：商店数据 + 在线人数 + 热度分
function getFullAppInfo(appId) {
  var details = null;
  return getAppDetails(appId).then(function (d) {
    details = d;
    return getPlayerCount(appId);
  }).then(function (players) {
    var hotScore = calcHotScore(details.reviewCount, details.rating, players.currentPlayers);
    return {
      appId: String(appId),
      name: details.name,
      marketPrice: details.marketPrice,
      discountPrice: details.discountPrice,
      categories: details.categories,
      reviewCount: details.reviewCount,
      rating: details.rating,
      currentPlayers: players.currentPlayers,
      hotScore: hotScore,
      developer: details.developer,
      publishers: details.publishers,
      headerImage: details.headerImage,
      shortDescription: details.shortDescription,
      isFree: details.isFree,
      releaseDate: details.releaseDate
    };
  });
}

module.exports = { getAppDetails, getPlayerCount, calcHotScore, getFullAppInfo };
