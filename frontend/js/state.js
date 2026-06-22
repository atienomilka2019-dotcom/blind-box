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
