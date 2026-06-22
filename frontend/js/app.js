'use strict';

// ===== 核心计算 =====
function compute(){
  var totalW = state.totalWeight;
  var ratios = state.tierRatios;
  var margin = state.targetMargin / 100;

  // 自动反推比例：根据成本结构和产品分布，自动算最优等级比例
  if(state.ratioMode === 'auto'){
    var tierAvgCost = {};
    TIERS.forEach(function(t){
      var prods = getTierProducts(t);
      if(prods.length === 0){ tierAvgCost[t] = 1; return; }
      tierAvgCost[t] = prods.reduce(function(s,p){ return s + p.cost; },0) / prods.length;
    });
    TIERS.forEach(function(t){
      var prods = getTierProducts(t);
      var cnt = prods.length || 1;
      ratios[t] = (1 / (tierAvgCost[t] || 1)) * Math.pow(cnt, 0.3);
    });
    var minR = Math.min.apply(null, TIERS.map(function(t){ return ratios[t]; }));
    TIERS.forEach(function(t){ ratios[t] = ratios[t] / minR; });
    // 同步回 UI
    var rareEl = el('cfg-ratioRare'); if(rareEl) rareEl.value = ratios['稀有'].toFixed(2);
    var jackEl = el('cfg-ratioJackpot'); if(jackEl) jackEl.value = ratios['欧皇'].toFixed(2);
    var normEl = el('cfg-ratioNormal'); if(normEl) normEl.value = ratios['普通'].toFixed(2);
  }

  // 1. 计算等级总权重
  var ratioSum = TIERS.reduce(function(s,t){ return s + (ratios[t]||1); },0);
  var tierWeights = {};
  TIERS.forEach(function(t){ tierWeights[t] = totalW * (ratios[t]||1) / ratioSum; });

  var allAllocated = [];
  TIERS.forEach(function(tier){
    var prods = getTierProducts(tier);
    var tw = tierWeights[tier];
    if(prods.length === 0 || tw <= 0) return;
    var costs = prods.map(function(p){ return p.cost > 0 ? p.cost : 0.01; });
    var invSum = costs.reduce(function(s,c){ return s + 1/c; },0);
    var floats = costs.map(function(c){ return (1/c)/invSum * tw; });
    var ints = floats.map(function(f){ return Math.max(1, Math.floor(f)); });
    var remainders = floats.map(function(f,i){ return f - ints[i]; });
    var allocated = ints.reduce(function(a,b){ return a+b; },0);
    var remaining = Math.round(tw) - allocated;
    var indices = remainders.map(function(r,i){ return i; });
    indices.sort(function(a,b){ return remainders[b] - remainders[a]; });
    for(var j=0; j<Math.min(Math.abs(remaining), indices.length); j++){
      if(remaining > 0) ints[indices[j]]++;
      else if(remaining < 0 && ints[indices[j]] > 1) ints[indices[j]]--;
    }
    prods.forEach(function(p,i){ p.weight = ints[i]; });
    allAllocated = allAllocated.concat(prods);
  });

  var actualTotal = allAllocated.reduce(function(s,p){ return s + (p.weight||0); },0) || 1;
  var expectedCost = allAllocated.reduce(function(s,p){ return s + (p.weight||0)*(p.cost||0); },0) / actualTotal;

  var price, actualMargin;
  if(state.priceMode === 'manual' && state.manualPrice != null){
    price = state.manualPrice;
    actualMargin = price > 0 ? (actualTotal * price - allAllocated.reduce(function(s,p){ return s + (p.weight||0)*(p.cost||0); },0)) / (actualTotal*price)*100 : 0;
  } else {
    if(margin >= 1) price = expectedCost * 100;
    else price = expectedCost / (1 - margin);
    actualMargin = state.targetMargin;
    state.manualPrice = null;
  }

  var tierData = {};
  TIERS.forEach(function(tier){
    var prods = getTierProducts(tier);
    var tw = prods.reduce(function(s,p){ return s + (p.weight||0); },0);
    var prob = actualTotal > 0 ? tw / actualTotal : 0;
    var pity = {};
    [0.5,0.8,0.95,0.99].forEach(function(c){ pity[c] = calcPity(prob, c); });
    tierData[tier] = {
      weight: tw, prob: prob,
      expected: prob > 0 ? Math.round(1/prob) : Infinity,
      productCount: prods.length, pity: pity,
      totalCost: prods.reduce(function(s,p){ return s + (p.weight||0)*(p.cost||0); },0)
    };
  });

  return {
    actualTotal: actualTotal, expectedCost: expectedCost,
    price: price, actualMargin: actualMargin,
    tierData: tierData, profitPerDraw: price - expectedCost
  };
}

function calcPity(prob, confidence){
  if(prob >= 1) return 1; if(prob <= 0) return Infinity;
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - prob));
}

// ===== 防抖函数 =====
var debounceTimer;
function debounce(fn, delay){
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, delay);
}

// ===== 读取配置输入（不触发 renderAll，只读不写） =====
function readConfigFromUI(){
  // 直接用 parseInt/parseFloat 支持大数
  var tw = parseInt(el('cfg-totalWeight').value, 10);
  if(isNaN(tw) || tw < 1) tw = 10000;
  state.totalWeight = tw;

  state.tierRatios['稀有'] = parseFloat(el('cfg-ratioRare').value) || 1;
  if(state.tierRatios['稀有'] < 0.1) state.tierRatios['稀有'] = 0.1;
  state.tierRatios['欧皇'] = parseFloat(el('cfg-ratioJackpot').value) || 1;
  if(state.tierRatios['欧皇'] < 0.1) state.tierRatios['欧皇'] = 0.1;
  state.tierRatios['普通'] = parseFloat(el('cfg-ratioNormal').value) || 1;
  if(state.tierRatios['普通'] < 0.1) state.tierRatios['普通'] = 0.1;

  var m = parseFloat(el('cfg-margin').value);
  if(isNaN(m) || m < 0) m = 0; if(m > 99) m = 99;
  state.targetMargin = m;

  if(state.priceMode === 'manual'){
    var mp = parseFloat(el('cfg-manualPrice').value);
    state.manualPrice = (!isNaN(mp) && mp > 0) ? mp : null;
  } else {
    state.manualPrice = null;
  }
}

// ===== 产品输入事件（使用 change + 防抖，不阻塞打字） =====
function onProductInput(e){
  var input = e.target;
  var id = parseInt(input.dataset.id, 10);
  if(isNaN(id)) return;
  var field = input.dataset.field;
  if(!field) return;
  var prod = state.products.find(function(p){ return p._id === id; });
  if(!prod) return;

  if(field === 'id' || field === 'name'){
    prod[field] = input.value;
  } else if(field === 'cost'){
    var v = parseFloat(input.value);
    prod.cost = isNaN(v) || v <= 0 ? 0.01 : v;
  } else if(field === 'marketPrice'){
    var v2 = parseFloat(input.value);
    prod.marketPrice = isNaN(v2) || v2 < 0 ? null : v2;
  } else if(field === 'tier'){
    prod.tier = input.value;
  }
  if(state.priceMode === 'auto'){ state.manualPrice = null; }
  // 使用防抖延迟更新，避免打字卡顿
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(function(){ renderAll(); }, 400);
}

function onDeleteClick(e){
  var btn = e.target.closest('.btn-del');
  if(!btn) return;
  var id = parseInt(btn.dataset.id, 10);
  state.products = state.products.filter(function(p){ return p._id !== id; });
  renderAll();
  showToast('已删除产品');
}

function addProduct(data){
  data = data || {};
  var prod = {
    _id: nextId++,
    id: data.id || ('P' + String(nextId-1).padStart(2,'0')),
    name: data.name || '',
    tier: data.tier || (state.products.length > 0 ? state.products[state.products.length-1].tier : '普通'),
    cost: data.cost || 10,
    marketPrice: data.marketPrice != null ? data.marketPrice : null,
    weight: 0
  };
  state.products.push(prod);
  if(state.priceMode === 'auto'){ state.manualPrice = null; }
  renderAll();
  return prod;
}

// ===== 配置变更 =====
function onConfigChange(){
  readConfigFromUI();
  renderAll();
}

// ===== 配置变更防抖版（oninput用） =====
function onConfigInput(){
  readConfigFromUI();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(function(){ renderAll(); }, 350);
}

// ===== 定价模式 =====
function setPriceModeUI(mode){
  var btns = document.querySelectorAll('#modeToggle button');
  btns.forEach(function(b){ b.classList.toggle('active', b.dataset.mode === mode); });
  el('manualPriceGroup').style.display = mode==='manual' ? 'block' : 'none';
}
function setRatioModeUI(mode){
  var btns = document.querySelectorAll('#ratioModeToggle button');
  if(btns.length === 0) return;
  btns.forEach(function(b){ b.classList.toggle('active', b.dataset.mode === mode); });
  var hint = el('ratioModeHint');
  if(!hint) return;
  var ratioInputs = document.querySelectorAll('#cfg-ratioRare, #cfg-ratioJackpot, #cfg-ratioNormal');
  if(mode === 'auto'){
    hint.textContent = '系统根据成本结构自动计算最优等级比例';
    ratioInputs.forEach(function(inp){ inp.disabled = true; inp.style.opacity = '0.5'; });
  } else {
    hint.textContent = '数值越大=权重越高=越容易抽中';
    ratioInputs.forEach(function(inp){ inp.disabled = false; inp.style.opacity = '1'; });
  }
}
function setRatioMode(mode){
  state.ratioMode = mode;
  setRatioModeUI(mode);
  renderAll();
}
function setPriceMode(mode){
  state.priceMode = mode;
  setPriceModeUI(mode);
  if(mode === 'manual'){
    var val = parseFloat(el('cfg-manualPrice').value);
    state.manualPrice = (!isNaN(val) && val > 0) ? val : null;
  } else {
    state.manualPrice = null;
    el('cfg-manualPrice').value = '';
  }
  renderAll();
}

// ===== 主题切换 =====
function toggleTheme(){
  var doc = document.documentElement;
  var current = doc.getAttribute('data-theme');
  var next = current === 'dark' ? 'light' : 'dark';
  doc.setAttribute('data-theme', next);
  state.theme = next;
  saveState();
}

// ===== 重置 =====
function resetAll(){
  if(!confirm('确定要清空全部数据吗？此操作不可恢复。')) return;
  state.products = [];
  state.totalWeight = 10000;
  state.tierRatios = {'稀有':1,'欧皇':3,'普通':10};
  state.targetMargin = 30;
  state.priceMode = 'auto';
  state.manualPrice = null;
  state.ratioMode = 'manual';
  nextId = 1;
  syncConfigToUI();
  renderAll();
  showToast('已重置全部数据');
}

// ===== 事件绑定 =====
function bindEvents(){
  var tbody = el('productsTbody');
  // 使用 input 事件 + 防抖，比 change 更快响应但不会打字卡顿
  tbody.addEventListener('input', onProductInput);
  tbody.addEventListener('change', onProductInput);
  tbody.addEventListener('click', onDeleteClick);

  // 配置输入使用 change 事件（失去焦点时更新），避免输入时卡顿
  var cfgInputs = ['cfg-totalWeight','cfg-ratioRare','cfg-ratioJackpot','cfg-ratioNormal','cfg-margin','cfg-manualPrice'];
  cfgInputs.forEach(function(id){
    el(id).addEventListener('input', function(){
      // 输入时静默更新 state（不触发渲染），仅失去焦点时渲染
    });
    el(id).addEventListener('change', function(){ onConfigChange(); });
  });

  // 点击弹窗遮罩关闭
  el('poolOverlay').addEventListener('click', function(e){
    if(e.target === el('poolOverlay')) closeProductPool();
  });
}

// ===== 初始化 =====
function init(){
  loadState();
  loadProductPool();
  document.documentElement.setAttribute('data-theme', state.theme || 'dark');
  syncConfigToUI();
  bindEvents();
  renderAll();
}

init();
