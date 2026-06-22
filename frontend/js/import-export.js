'use strict';

// ===== Excel 导出 =====
function exportExcel(){
  var result = compute();
  var rows = [];
  rows.push(['产品明细表']);
  rows.push(['序号','产品ID','产品名称','原价(¥)','成本价(¥)','等级','权重']);
  state.products.forEach(function(p,i){
    rows.push([i+1, p.id, p.name, p.marketPrice!=null?p.marketPrice.toFixed(2):'', p.cost.toFixed(2), p.tier, p.weight||0]);
  });
  rows.push([]);
  rows.push(['等级汇总']);
  rows.push(['等级','等级权重','概率','期望抽数','50%保底','80%保底','95%保底','99%保底','产品数','周期成本(¥)']);
  TIERS.forEach(function(tier){
    var d = result.tierData[tier];
    rows.push([tier, d.weight, (d.prob*100).toFixed(2)+'%', d.expected===Infinity?'∞':d.expected,
      d.pity[0.5]===Infinity?'∞':d.pity[0.5], d.pity[0.8]===Infinity?'∞':d.pity[0.8],
      d.pity[0.95]===Infinity?'∞':d.pity[0.95], d.pity[0.99]===Infinity?'∞':d.pity[0.99],
      d.productCount, d.totalCost.toFixed(2)]);
  });
  rows.push([]);
  rows.push(['全局概览']);
  rows.push(['总权重', result.actualTotal]);
  rows.push(['单抽价格(¥)', result.price.toFixed(2)]);
  rows.push(['期望成本(¥)', result.expectedCost.toFixed(2)]);
  rows.push(['预期利润率', result.actualMargin.toFixed(1)+'%']);
  rows.push(['单抽毛利(¥)', result.profitPerDraw.toFixed(2)]);
  rows.push(['产品总数', state.products.length]);
  rows.push(['定价模式', state.priceMode==='auto'?'自动计算':'手动设定']);

  var csv = '﻿' + rows.map(function(r){
    return r.map(function(c){ return '"'+String(c).replace(/"/g,'""')+'"'; }).join(',');
  }).join('\n');
  var blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = '盲盒搭配_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click(); URL.revokeObjectURL(url);
  showToast('已导出 Excel 兼容格式 (CSV)');
}

// ===== CSV 解析 =====
function parseCSVLine(line){
  var result = []; var current = ''; var inQ = false;
  for(var i=0; i<line.length; i++){
    var ch = line[i];
    if(inQ){
      if(ch==='"'){ if(i+1<line.length && line[i+1]==='"'){ current+='"'; i++; } else inQ=false; }
      else current+=ch;
    } else {
      if(ch==='"') inQ=true;
      else if(ch===','){ result.push(current); current=''; }
      else current+=ch;
    }
  }
  result.push(current); return result;
}

// ===== 统一导入入口（CSV / Excel） =====
// 支持格式：
//   - .csv / .txt：文本格式，智能识别列结构
//   - .xlsx / .xls：Excel 格式（通过 SheetJS CDN 读取）
function importFile(){
  var input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv,.txt,.xlsx,.xls';
  input.onchange = function(){
    var file = input.files[0]; if(!file) return;
    var ext = (file.name || '').split('.').pop().toLowerCase();

    if(ext === 'xlsx' || ext === 'xls'){
      importExcelFile(file);
    } else {
      importCSVFile(file);
    }
  };
  input.click();
}

// ===== Excel 导入 =====
function importExcelFile(file){
  // 动态加载 SheetJS
  var existingScript = document.querySelector('script[src*="xlsx"]');
  var doRead = function(){
    var reader = new FileReader();
    reader.onload = function(e){
      try{
        var data = new Uint8Array(e.target.result);
        var workbook = XLSX.read(data, {type: 'array'});
        var firstSheet = workbook.SheetNames[0];
        var sheet = workbook.Sheets[firstSheet];
        // 转为二维数组
        var rows = XLSX.utils.sheet_to_json(sheet, {header:1, defval:''});
        if(!rows || rows.length === 0){ showToast('Excel为空', true); return; }
        processImportedRows(rows);
      } catch(err){ showToast('Excel解析失败：'+err.message, true); }
    };
    reader.readAsArrayBuffer(file);
  };

  if(existingScript){
    if(window.XLSX){ doRead(); }
    else { existingScript.addEventListener('load', doRead); }
  } else {
    var script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
    script.onload = doRead;
    script.onerror = function(){ showToast('加载Excel解析库失败，请检查网络', true); };
    document.head.appendChild(script);
  }
}

// ===== CSV 导入 =====
function importCSVFile(file){
  var reader = new FileReader();
  reader.onload = function(e){
    try{
      var text = e.target.result;
      if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      var rawLines = text.split(/[\r\n]+/);
      // 过滤空行
      var nonEmptyLines = rawLines.filter(function(l){ return l.trim().length > 0; });
      if(nonEmptyLines.length === 0){ showToast('文件为空', true); return; }
      // 使用 parseCSVLine 正确解析带引号的 CSV
      var rows = nonEmptyLines.map(function(l){ return parseCSVLine(l); });
      if(rows.length === 0){ showToast('文件为空', true); return; }
      processImportedRows(rows);
    } catch(err){ showToast('CSV解析失败：'+err.message, true); }
  };
  reader.readAsText(file, 'utf-8');
}

// ===== 统一的导入数据处理 =====
// 接收二维数组 rows[rowIdx][colIdx]
function processImportedRows(rows){
  // 过滤空行，同时 trim 每个单元格
  var lines = [];
  for(var i = 0; i < rows.length; i++){
    var row = rows[i];
    var trimmed = [];
    var hasContent = false;
    for(var j = 0; j < row.length; j++){
      var s = String(row[j] == null ? '' : row[j]).trim();
      trimmed.push(s);
      if(s.length > 0) hasContent = true;
    }
    if(hasContent) lines.push(trimmed);
  }
  if(lines.length === 0){ showToast('文件为空', true); return; }

  // 跳过标题区域
  var startIdx = 0;
  for(var si = 0; si < lines.length; si++){
    var firstCol = lines[si][0].toLowerCase();
    if(firstCol === '产品id' || firstCol === '产品编号' || firstCol === 'product_id' ||
       firstCol === 'productid' || firstCol === 'id' ||
       firstCol.indexOf('产品id') >= 0 ||
       (firstCol !== '产品明细表' && firstCol !== '等级汇总' && firstCol !== '全局概览' &&
        firstCol !== '序号' && firstCol !== '产品明细表' && si > 0)){
      startIdx = si;
      break;
    }
  }

  // 检测是否有表头
  var firstLine = lines[startIdx];
  var hasHeader = firstLine.some(function(c){
    var lc = c.toLowerCase();
    return lc.indexOf('id')>=0 || lc.indexOf('名称')>=0 || lc.indexOf('name')>=0 ||
           lc.indexOf('等级')>=0 || lc.indexOf('成本')>=0 || lc.indexOf('价格')>=0 ||
           lc.indexOf('price')>=0 || lc.indexOf('tier')>=0 || lc.indexOf('level')>=0;
  });

  var header = hasHeader ? firstLine.map(function(c){ return c.toLowerCase(); }) : [];
  var dataStart = hasHeader ? startIdx + 1 : startIdx;

  function findCol(names){
    for(var ni = 0; ni < names.length; ni++){
      for(var hi = 0; hi < header.length; hi++){
        if(header[hi].indexOf(names[ni]) >= 0) return hi;
      }
    }
    return -1;
  }

  var idIdx = findCol(['产品id','产品编号','product_id','productid','id','编号','商品id']);
  var nameIdx = findCol(['产品名称','名称','产品名','商品名','商品名称','product_name','name','品名','product']);
  var tierIdx = findCol(['等级','品质','级别','tier','level','稀有度']);
  var costIdx = findCol(['成本价','成本','cost','成本(¥)','成本价(¥)','进价','成本价格']);
  var marketPriceIdx = findCol(['原价','市场价','零售价','卖价','售价','参考价','market_price','retail','price','marketPrice','marketprice']);

  // 无表头模式
  if(!hasHeader){
    var firstRow = lines[dataStart];
    var colCount = firstRow.length;

    // 名称列取最长文本
    if(nameIdx < 0){
      var bestNameIdx = 0, bestNameLen = 0;
      for(var ni = 0; ni < colCount; ni++){
        var v = firstRow[ni];
        if(v.length > bestNameLen && isNaN(parseFloat(v))){ bestNameLen = v.length; bestNameIdx = ni; }
      }
      nameIdx = bestNameLen > 0 ? bestNameIdx : 0;
    }

    if(idIdx < 0 && colCount >= 2 && nameIdx > 0) idIdx = 0;

    // 成本列取最大数字
    if(costIdx < 0){
      var bestCostIdx = -1, bestCostVal = -Infinity;
      for(var ci = 0; ci < colCount; ci++){
        if(ci === nameIdx) continue;
        var val = parseFloat(firstRow[ci]);
        if(!isNaN(val) && val > bestCostVal){ bestCostVal = val; bestCostIdx = ci; }
      }
      costIdx = bestCostIdx >= 0 ? bestCostIdx : (nameIdx === 0 ? 1 : 0);
    }

    if(tierIdx < 0 && colCount >= 3){
      for(var ti = 0; ti < colCount; ti++){
        if(ti !== nameIdx && ti !== costIdx && ti !== idIdx){ tierIdx = ti; break; }
      }
    }
  }

  // 兜底找名称列
  if(nameIdx < 0 && dataStart < lines.length){
    var sampleRow = lines[dataStart];
    var longestCol = -1, longestLen = 0;
    for(var ci2 = 0; ci2 < sampleRow.length; ci2++){
      var v = sampleRow[ci2];
      if(v.length > longestLen && isNaN(parseFloat(v))){ longestLen = v.length; longestCol = ci2; }
    }
    if(longestCol >= 0) nameIdx = longestCol;
  }

  if(nameIdx < 0 || costIdx < 0){
    showToast('无法识别列结构。请确保包含产品名称和成本价列', true);
    return;
  }

  var autoId = (idIdx < 0);
  var imported = [];
  var autoIdCounter = 1;

  for(var j = dataStart; j < lines.length; j++){
    var cols = lines[j];
    if(cols.length <= Math.max(nameIdx, costIdx)) continue;

    var firstName = cols[0] || '';
    if(firstName === '' || firstName === '序号') continue;
    if(firstName.indexOf('等级汇总')>=0 || firstName.indexOf('全局概览')>=0 ||
       firstName.indexOf('产品明细')>=0) break;

    var name = cols[nameIdx] || '';
    if(name.length === 0) continue;

    var costStr = String(cols[costIdx] || '0').replace(/[,"]/g,'').trim();
    var cost = parseFloat(costStr);
    if(isNaN(cost) || cost <= 0) cost = 0.01;

    var tid = autoId ? ('P' + String(autoIdCounter).padStart(2,'0')) : (cols[idIdx]||'').trim();
    if(tid.length === 0) tid = 'P' + String(autoIdCounter).padStart(2,'0');

    var tier = '普通';
    if(tierIdx >= 0 && cols[tierIdx]){
      var rawTier = cols[tierIdx].trim();
      if(TIERS.indexOf(rawTier) >= 0) tier = rawTier;
      else if(rawTier.indexOf('稀有')>=0 || rawTier.toLowerCase().indexOf('rare')>=0 || rawTier.toLowerCase()==='ssr') tier = '稀有';
      else if(rawTier.indexOf('欧皇')>=0 || rawTier.indexOf('传说')>=0 || rawTier.toLowerCase().indexOf('legend')>=0 || rawTier.toLowerCase()==='sr') tier = '欧皇';
    }

    var marketPrice = null;
    if(marketPriceIdx >= 0 && cols[marketPriceIdx]){
      var mpStr = String(cols[marketPriceIdx]).replace(/[,"]/g,'').trim();
      var mp = parseFloat(mpStr);
      if(!isNaN(mp) && mp >= 0) marketPrice = mp;
    }

    imported.push({ id: tid, name: name, tier: tier, cost: cost, marketPrice: marketPrice });
    autoIdCounter++;
  }

  if(imported.length === 0){ showToast('未读取到产品数据，请检查文件内容', true); return; }
  productPool = imported;
  saveProductPool();
  showToast('已导入 ' + imported.length + ' 个产品到产品池');
}

// ===== 加载示例到产品池 =====
function loadDemo(){
  if(state.products.length > 0){
    if(!confirm('加载示例数据将覆盖现有搭配产品，确定继续？')) return;
  }
  state.products = [
    {_id:nextId++,id:'SSR-01',name:'传说之剑',tier:'稀有',cost:120,marketPrice:599,weight:0},
    {_id:nextId++,id:'SSR-02',name:'龙鳞铠甲',tier:'稀有',cost:90,marketPrice:499,weight:0},
    {_id:nextId++,id:'SR-01',name:'魔力戒指',tier:'欧皇',cost:35,marketPrice:199,weight:0},
    {_id:nextId++,id:'SR-02',name:'精灵之弓',tier:'欧皇',cost:30,marketPrice:169,weight:0},
    {_id:nextId++,id:'SR-03',name:'暗影斗篷',tier:'欧皇',cost:28,marketPrice:159,weight:0},
    {_id:nextId++,id:'R-01',name:'治疗药水',tier:'普通',cost:5,marketPrice:29,weight:0},
    {_id:nextId++,id:'R-02',name:'力量护符',tier:'普通',cost:6,marketPrice:35,weight:0},
    {_id:nextId++,id:'R-03',name:'金币袋',tier:'普通',cost:4,marketPrice:25,weight:0},
    {_id:nextId++,id:'R-04',name:'经验之书',tier:'普通',cost:5,marketPrice:29,weight:0},
    {_id:nextId++,id:'R-05',name:'传送卷轴',tier:'普通',cost:4.5,marketPrice:29,weight:0}
  ];
  // 同时填充产品池
  if(productPool.length === 0){
    productPool = [
      {id:'SSR-01',name:'传说之剑',tier:'稀有',cost:120,marketPrice:599},
      {id:'SSR-02',name:'龙鳞铠甲',tier:'稀有',cost:90,marketPrice:499},
      {id:'SR-01',name:'魔力戒指',tier:'欧皇',cost:35,marketPrice:199},
      {id:'SR-02',name:'精灵之弓',tier:'欧皇',cost:30,marketPrice:169},
      {id:'SR-03',name:'暗影斗篷',tier:'欧皇',cost:28,marketPrice:159},
      {id:'R-01',name:'治疗药水',tier:'普通',cost:5,marketPrice:29},
      {id:'R-02',name:'力量护符',tier:'普通',cost:6,marketPrice:35},
      {id:'R-03',name:'金币袋',tier:'普通',cost:4,marketPrice:25},
      {id:'R-04',name:'经验之书',tier:'普通',cost:5,marketPrice:29},
      {id:'R-05',name:'传送卷轴',tier:'普通',cost:4.5,marketPrice:29}
    ];
    saveProductPool();
  }
  state.totalWeight = 10000;
  state.tierRatios = {'稀有':1,'欧皇':3,'普通':10};
  state.targetMargin = 30;
  state.priceMode = 'auto';
  state.manualPrice = null;
  syncConfigToUI();
  renderAll();
  showToast('已加载 10 个示例产品');
}
