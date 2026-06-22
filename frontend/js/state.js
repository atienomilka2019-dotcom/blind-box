'use strict';

// ===== 常量 =====
var TIERS = ['稀有','欧皇','普通'];
var STORAGE_KEY = 'blindbox_state_v4';
var POOL_STORAGE_KEY = 'blindbox_pool_v1';

// ===== 全局状态 =====
var state = {
  products: [],
  totalWeight: 10000,
  tierRatios: {'稀有':1,'欧皇':3,'普通':10},
  targetMargin: 30,
  priceMode: 'auto',
  manualPrice: null,
  ratioMode: 'manual',
  theme: 'dark'
};
var nextId = 1;

// 产品池
var productPool = [];
var poolSelections = {}; // { poolIndex: true }

// ===== 持久化 =====
function loadState(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      var s = JSON.parse(raw);
      if(s.products) state.products = s.products;
      if(typeof s.totalWeight === 'number') state.totalWeight = s.totalWeight;
      if(s.tierRatios) state.tierRatios = s.tierRatios;
      if(typeof s.targetMargin === 'number') state.targetMargin = s.targetMargin;
      if(s.priceMode) state.priceMode = s.priceMode;
      if(s.manualPrice != null) state.manualPrice = s.manualPrice;
      if(s.ratioMode) state.ratioMode = s.ratioMode;
      if(s.theme) state.theme = s.theme;
      if(s.nextId) nextId = s.nextId;
    }
  }catch(e){}
}
function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      products: state.products, totalWeight: state.totalWeight,
      tierRatios: state.tierRatios, targetMargin: state.targetMargin,
      priceMode: state.priceMode, manualPrice: state.manualPrice, ratioMode: state.ratioMode,
      theme: state.theme, nextId: nextId
    }));
  }catch(e){}
}
function loadProductPool(){
  try{
    var raw = localStorage.getItem(POOL_STORAGE_KEY);
    if(raw) productPool = JSON.parse(raw);
  }catch(e){ productPool = []; }
}
function saveProductPool(){
  try{
    localStorage.setItem(POOL_STORAGE_KEY, JSON.stringify(productPool));
  }catch(e){}
}

// ===== 工具函数 =====
function el(id){ return document.getElementById(id); }
function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
var toastTimer;
function showToast(msg, isWarn){
  var t = el('toast');
  t.textContent = msg;
  t.className = 'toast' + (isWarn ? ' warn' : '') + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.className = 'toast'; }, 2200);
}
function getTierProducts(tier){ return state.products.filter(function(p){ return p.tier === tier; }); }

// Steam 查询
function querySteamApp() {
  var appId = prompt('请输入 Steam 游戏 AppID（如 CS2 是 730）：');
  if (!appId || !appId.trim()) return;

  var btn = document.querySelector('.steam-query-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 查询中...'; }

  SteamAPI.getApp(appId.trim()).then(function (res) {
    if (!res.success) throw new Error(res.error || '查询失败');
    var data = res.data;

    // 添加到产品池
    var newProduct = {
      id: data.appId,
      name: data.name,
      tier: '普通',
      cost: 10,
      marketPrice: data.marketPrice,
      steamCategory: (data.categories || []).join(', '),
      steamReviews: data.reviewCount,
      steamRating: data.rating,
      steamPlayers: data.currentPlayers,
      hotScore: data.hotScore,
      steamUpdatedAt: new Date().toISOString()
    };

    // 检查是否已存在
    var existingIdx = -1;
    for (var i = 0; i < productPool.length; i++) {
      if (productPool[i].id === data.appId) {
        existingIdx = i;
        break;
      }
    }
    if (existingIdx >= 0) {
      productPool[existingIdx] = newProduct;
      showToast('已更新「' + data.name + '」的 Steam 数据 (' + (res.source || '') + ')');
    } else {
      productPool.push(newProduct);
      showToast('已添加「' + data.name + '」到产品池 (热度分: ' + data.hotScore + ')');
    }
    saveProductPool();
    if (typeof renderPoolTable === 'function') renderPoolTable();
    if (btn) { btn.disabled = false; btn.textContent = '🔍 从 Steam 查询'; }
  }).catch(function (err) {
    showToast('Steam 查询失败: ' + err.message, true);
    if (btn) { btn.disabled = false; btn.textContent = '🔍 从 Steam 查询'; }
  });
}

// 批量刷新产品池中所有 Steam 数据
function refreshSteamData() {
  var steamIds = [];
  productPool.forEach(function (p) {
    if (p.steamUpdatedAt || /^\d+$/.test(p.id)) {
      // 尝试将 id 作为 Steam AppID
      var numId = parseInt(p.id, 10);
      if (!isNaN(numId) && numId > 0) steamIds.push(String(numId));
    }
  });

  if (steamIds.length === 0) {
    showToast('产品池中没有 Steam AppID 可刷新', true);
    return;
  }

  var btn = document.querySelector('.steam-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 刷新中...'; }

  SteamAPI.refresh(steamIds).then(function (res) {
    var updated = 0;
    res.results.forEach(function (r) {
      var poolItem = productPool.find(function (p) { return p.id === r.appId; });
      if (poolItem && r.data) {
        poolItem.steamPlayers = r.data.currentPlayers;
        poolItem.hotScore = r.data.hotScore;
        poolItem.steamUpdatedAt = new Date().toISOString();
        updated++;
      }
    });
    saveProductPool();
    if (typeof renderPoolTable === 'function') renderPoolTable();
    showToast('已刷新 ' + updated + ' / ' + steamIds.length + ' 个产品');
    if (btn) { btn.disabled = false; btn.textContent = '🔄 刷新 Steam 数据'; }
  }).catch(function (err) {
    showToast('刷新失败: ' + err.message, true);
    if (btn) { btn.disabled = false; btn.textContent = '🔄 刷新 Steam 数据'; }
  });
}
