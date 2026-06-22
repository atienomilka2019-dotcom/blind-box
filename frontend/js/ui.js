'use strict';

// ===== 渲染 =====
function renderProducts(){
  var tbody = el('productsTbody');
  var empty = el('emptyState');
  var countEl = el('productCount');
  countEl.textContent = state.products.length + ' 个产品';

  if(state.products.length === 0){
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = state.products.map(function(p,i){
    var tierOpts = TIERS.map(function(t){
      return '<option value="'+t+'"'+(p.tier===t?' selected':'')+'>'+t+'</option>';
    }).join('');
    return '<tr>'+
      '<td class="cell-index">'+(i+1)+'</td>'+
      '<td><input type="text" value="'+escapeHtml(p.id)+'" data-id="'+p._id+'" data-field="id" placeholder="输入ID"></td>'+
      '<td><input type="text" value="'+escapeHtml(p.name)+'" data-id="'+p._id+'" data-field="name" placeholder="产品名称"></td>'+
      '<td><input type="number" value="'+(p.marketPrice!=null?p.marketPrice:'')+'" data-id="'+p._id+'" data-field="marketPrice" step="0.01" min="0" placeholder="参考价" style="font-size:12px;color:var(--text2);"></td>'+
      '<td><input type="number" value="'+p.cost+'" data-id="'+p._id+'" data-field="cost" step="0.01" min="0.01" placeholder="0.00"></td>'+
      '<td class="cell-tier"><select class="tier-select" data-id="'+p._id+'" data-field="tier">'+tierOpts+'</select></td>'+
      '<td class="cell-weight">'+(p.weight||0)+'</td>'+
      '<td><button class="btn btn-sm btn-danger btn-icon btn-del" data-id="'+p._id+'" title="删除">'+
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'+
        '</button></td>'+
      '</tr>';
  }).join('');
}

function renderResults(){
  var result = compute();
  var overviewEl = el('resultsOverview');
  var marginColor = result.actualMargin >= 0 ? 'green' : 'red';
  overviewEl.innerHTML =
    '<div class="result-card"><div class="r-label">总权重</div><div class="r-value accent">'+result.actualTotal+'</div></div>'+
    '<div class="result-card"><div class="r-label">单抽价格</div><div class="r-value accent">¥'+result.price.toFixed(2)+'</div><div class="r-sub">'+(state.priceMode==='auto'?'自动计算':'手动设定')+'</div></div>'+
    '<div class="result-card"><div class="r-label">期望成本</div><div class="r-value">¥'+result.expectedCost.toFixed(2)+'</div><div class="r-sub">单抽理论成本</div></div>'+
    '<div class="result-card"><div class="r-label">预期利润率</div><div class="r-value '+marginColor+'">'+result.actualMargin.toFixed(1)+'%</div></div>'+
    '<div class="result-card"><div class="r-label">单抽毛利</div><div class="r-value '+marginColor+'">¥'+result.profitPerDraw.toFixed(2)+'</div></div>'+
    '<div class="result-card"><div class="r-label">产品总数</div><div class="r-value">'+state.products.length+'</div></div>';

  var tierEl = el('tierResults');
  tierEl.innerHTML = TIERS.map(function(tier){
    var d = result.tierData[tier];
    var cssCls = tier==='稀有'?'rare':(tier==='欧皇'?'jackpot':'normal');
    var pityHtml = '';
    [0.5,0.8,0.95,0.99].forEach(function(conf){
      var val = d.pity[conf];
      pityHtml += '<span class="pg-label">'+Math.round(conf*100)+'%</span><span class="pg-value">'+(val===Infinity?'∞':val+' 抽')+'</span>';
    });
    return '<div class="tier-card '+cssCls+'">'+
      '<div class="tier-header"><div class="tier-dot"></div><div class="tier-name">'+tier+'</div></div>'+
      '<div class="tier-stat-row"><span class="ts-label">等级权重</span><span class="ts-value">'+d.weight+'</span></div>'+
      '<div class="tier-stat-row"><span class="ts-label">概率</span><span class="ts-value">'+(d.prob*100).toFixed(2)+'%</span></div>'+
      '<div class="tier-stat-row"><span class="ts-label">期望抽数</span><span class="ts-value">'+(d.expected===Infinity?'∞':d.expected+' 抽')+'</span></div>'+
      '<div class="tier-stat-row"><span class="ts-label">产品数</span><span class="ts-value">'+d.productCount+' 个</span></div>'+
      '<div class="tier-stat-row"><span class="ts-label">周期成本</span><span class="ts-value">¥'+d.totalCost.toFixed(2)+'</span></div>'+
      '<div class="pity-grid">'+pityHtml+'</div></div>';
  }).join('');
}

function renderAll(){
  renderProducts();
  renderResults();
  saveState();
}

// ===== 配置同步 =====
function syncConfigToUI(){
  el('cfg-totalWeight').value = state.totalWeight;
  el('cfg-ratioRare').value = state.tierRatios['稀有'];
  el('cfg-ratioJackpot').value = state.tierRatios['欧皇'];
  el('cfg-ratioNormal').value = state.tierRatios['普通'];
  el('cfg-margin').value = state.targetMargin;
  if(state.priceMode === 'manual' && state.manualPrice != null){
    el('cfg-manualPrice').value = state.manualPrice;
  }
  setPriceModeUI(state.priceMode);
  setRatioModeUI(state.ratioMode);
}

// ===== 产品池 =====
function renderPoolTable(){
  var search = (el('poolSearch').value || '').toLowerCase();
  var pool = productPool;
  if(search){
    pool = pool.filter(function(p){
      return (p.id||'').toLowerCase().indexOf(search) >= 0 || (p.name||'').toLowerCase().indexOf(search) >= 0;
    });
  }
  var tbody = el('poolTbody');
  var empty = el('poolEmptyState');
  if(pool.length === 0){
    tbody.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = pool.map(function(p,i){
      var realIdx = productPool.indexOf(p);
      var checked = poolSelections[realIdx] ? ' checked' : '';
      var rowClass = poolSelections[realIdx] ? ' class="selected"' : '';
      var tierOpts = TIERS.map(function(t){
        return '<option value="'+t+'"'+(p.tier===t?' selected':'')+'>'+t+'</option>';
      }).join('');
      return '<tr'+rowClass+'>'+
        '<td class="pool-check"><input type="checkbox"'+checked+' data-pool-idx="'+realIdx+'" onchange="togglePoolCheck(this)"></td>'+
        '<td><input type="text" value="'+escapeHtml(p.id)+'" data-pool-idx="'+realIdx+'" data-field="id" class="pool-edit" style="width:100%;background:var(--bg);border:1px solid transparent;border-radius:var(--radius-sm);color:var(--text);font-size:13px;padding:4px 6px;font-family:var(--font);" onchange="savePoolItem(this)"></td>'+
        '<td><input type="text" value="'+escapeHtml(p.name)+'" data-pool-idx="'+realIdx+'" data-field="name" class="pool-edit" style="width:100%;background:var(--bg);border:1px solid transparent;border-radius:var(--radius-sm);color:var(--text);font-size:13px;padding:4px 6px;font-family:var(--font);" onchange="savePoolItem(this)"></td>'+
        '<td><input type="number" value="'+(p.marketPrice!=null?p.marketPrice:'')+'" data-pool-idx="'+realIdx+'" data-field="marketPrice" class="pool-edit" step="0.01" min="0" placeholder="参考价" style="width:100%;background:var(--bg);border:1px solid transparent;border-radius:var(--radius-sm);color:var(--text2);font-size:12px;padding:4px 6px;font-family:var(--font-mono);text-align:right;" onchange="savePoolItem(this)"></td>'+
        '<td><input type="number" value="'+p.cost+'" data-pool-idx="'+realIdx+'" data-field="cost" class="pool-edit" step="0.01" min="0.01" style="width:100%;background:var(--bg);border:1px solid transparent;border-radius:var(--radius-sm);color:var(--text);font-size:13px;padding:4px 6px;font-family:var(--font-mono);text-align:right;" onchange="savePoolItem(this)"></td>'+
        '<td class="cell-tier"><select data-pool-idx="'+realIdx+'" data-field="tier" class="pool-edit tier-select" onchange="savePoolItem(this)">'+tierOpts+'</select></td>'+
        '<td><button class="btn btn-sm btn-danger btn-icon" onclick="deletePoolItem('+realIdx+')" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></td>'+
        '</tr>';
    }).join('');
  }
  updatePoolCount();
}

function updatePoolCount(){
  var count = Object.keys(poolSelections).filter(function(k){ return poolSelections[k]; }).length;
  var elCount = el('poolSelectedCount');
  if(elCount) elCount.textContent = '已选 ' + count + ' 个';
}

function savePoolItem(el){
  var idx = parseInt(el.getAttribute('data-pool-idx'), 10);
  var field = el.getAttribute('data-field');
  if(isNaN(idx) || !field || idx >= productPool.length) return;
  var p = productPool[idx];
  if(!p) return;
  if(field === 'id' || field === 'name'){
    p[field] = el.value;
  } else if(field === 'cost'){
    var v = parseFloat(el.value);
    p.cost = isNaN(v) || v <= 0 ? 0.01 : v;
  } else if(field === 'marketPrice'){
    var v2 = parseFloat(el.value);
    p.marketPrice = isNaN(v2) || v2 < 0 ? null : v2;
  } else if(field === 'tier'){
    p.tier = el.value;
  }
  saveProductPool();
}

function deletePoolItem(idx){
  if(!confirm('确定要从产品池删除「'+(productPool[idx].name||productPool[idx].id)+'」吗？')) return;
  productPool.splice(idx, 1);
  // 清理选中状态
  var newSelections = {};
  Object.keys(poolSelections).forEach(function(k){
    var oldIdx = parseInt(k);
    if(oldIdx < idx) newSelections[oldIdx] = poolSelections[k];
    else if(oldIdx > idx) newSelections[oldIdx-1] = poolSelections[k];
  });
  poolSelections = newSelections;
  saveProductPool();
  renderPoolTable();
  showToast('已从产品池删除');
}

function addEmptyPoolItem(){
  productPool.push({ id: '', name: '', tier: '普通', cost: 10, marketPrice: null });
  saveProductPool();
  renderPoolTable();
  showToast('已添加空白产品到产品池');
  // 聚焦新建行的名称输入
  setTimeout(function(){
    var inputs = document.querySelectorAll('.pool-edit[data-field="name"]');
    var last = inputs[inputs.length-1];
    if(last){ last.focus(); last.select(); }
  }, 100);
}

function togglePoolCheck(cb){
  var idx = parseInt(cb.getAttribute('data-pool-idx'), 10);
  poolSelections[idx] = cb.checked;
  updatePoolCount();
  renderPoolTable();
}

function clearPool(){
  if(productPool.length === 0){ showToast('产品池已为空'); return; }
  if(!confirm('确定要清空产品池全部 '+productPool.length+' 个产品吗？此操作不可恢复。')) return;
  productPool = [];
  poolSelections = {};
  saveProductPool();
  renderPoolTable();
  showToast('已清空产品池');
}

function openProductPool(){
  poolSelections = {};
  el('poolSearch').value = '';
  el('poolOverlay').classList.add('active');
  renderPoolTable();
}

function closeProductPool(){
  el('poolOverlay').classList.remove('active');
}

function addFromPool(){
  var selected = Object.keys(poolSelections).filter(function(k){ return poolSelections[k]; });
  if(selected.length === 0){ showToast('请先选择产品', true); return; }
  selected.forEach(function(idx){
    var p = productPool[parseInt(idx)];
    addProduct({ id: p.id, name: p.name, tier: p.tier, cost: p.cost, marketPrice: p.marketPrice });
  });
  showToast('已添加 ' + selected.length + ' 个产品');
  closeProductPool();
  poolSelections = {};
}
