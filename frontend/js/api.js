// API 调用封装
var API_BASE = '';

function apiCall(method, path, body) {
  var opts = {
    method: method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return fetch(API_BASE + path, opts).then(function (res) {
    if (!res.ok) {
      return res.json().then(function (err) {
        throw new Error(err.error || '请求失败: ' + res.status);
      });
    }
    return res.json();
  });
}

// 封装常用调用
var ProductsAPI = {
  list: function () { return apiCall('GET', '/api/products'); },
  create: function (product) { return apiCall('POST', '/api/products', product); },
  update: function (id, product) { return apiCall('PUT', '/api/products/' + id, product); },
  delete: function (id) { return apiCall('DELETE', '/api/products/' + id); }
};

var SteamAPI = {
  getApp: function (appId) { return apiCall('GET', '/api/steam/app/' + appId); },
  refresh: function (appIds) { return apiCall('POST', '/api/steam/refresh', { appIds: appIds }); }
};

var ChatAPI = {
  send: function (messages, context) {
    return apiCall('POST', '/api/chat', { messages: messages, context: context });
  }
};

var MatchAPI = {
  match: function (constraints) {
    return apiCall('POST', '/api/match', constraints);
  }
};
