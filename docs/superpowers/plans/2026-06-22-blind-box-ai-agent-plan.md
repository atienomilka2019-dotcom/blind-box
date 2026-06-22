# 盲盒福袋搭配工具 AI 智能体集成 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有单文件 HTML 盲盒搭配工具拆分为前后端分离架构，集成 Claude AI 对话和 Steam 数据获取能力。

**Architecture:** 前端拆分为 HTML/CSS/JS 模块文件（保留零框架依赖），后端新建 Express 服务（含 Claude API SSE 流式调用 + Steam API 数据查询），产品库从 localStorage 迁移到服务端 JSON 文件持久化。

**Tech Stack:** 前端 HTML+CSS+Vanilla JS，后端 Node.js+Express+Anthropic SDK，Steam store API + ISteamUserStats，SSE 流式

## Global Constraints

- 零外部前端依赖（无 React/Vue/jQuery）
- 暗色/亮色主题可切换
- API Key 不上传 Git（.env + .gitignore）
- 单 Node 进程一键启动（`node backend/server.js`）
- 中文 UI 和注释

---

## 文件结构总览

```
d:\克劳德 Code\
├── frontend/
│   ├── index.html          # 主页面（从 blind-box-suite.html 提取 HTML 结构）
│   ├── css/
│   │   ├── main.css        # 原有样式
│   │   └── ai-panel.css    # AI 面板样式
│   ├── js/
│   │   ├── app.js          # 核心工具逻辑（compute、render、事件绑定）
│   │   ├── state.js        # 状态管理 + API 同步
│   │   ├── ui.js           # 渲染函数（产品表、结果面板、配置同步）
│   │   ├── ai-panel.js     # AI 对话面板组件
│   │   ├── quick-match.js  # 智能搭配快捷表单
│   │   ├── import-export.js # CSV/Excel 导入导出
│   │   └── api.js          # 封装后端 API 调用
│   └── assets/
│       └── icons.svg       # SVG 图标集
├── backend/
│   ├── server.js           # Express 入口
│   ├── package.json
│   ├── .env                # ANTHROPIC_API_KEY + STEAM_API_KEY
│   ├── .gitignore
│   ├── routes/
│   │   ├── chat.js         # /api/chat (SSE 流式)
│   │   ├── match.js        # /api/match (一键搭配)
│   │   ├── products.js     # /api/products (CRUD)
│   │   └── steam.js        # /api/steam/*
│   ├── services/
│   │   ├── ai-service.js   # Claude API 封装
│   │   └── steam-service.js # Steam API 封装
│   ├── data/               # 运行时自动创建
│   │   ├── products.json   # 产品库
│   │   └── pool.json       # 产品池
│   └── middleware/
│       └── auth.js         # 简单速率限制
└── blind-box-suite.html    # 保留原文件不动作为备份
```

---

### Task 1: 项目初始化 — 后端骨架

**Files:**
- Create: `backend/package.json`
- Create: `backend/.gitignore`
- Create: `backend/.env.example`
- Create: `backend/server.js`
- Create: `backend/middleware/auth.js`

**Interfaces:**
- Consumes: 无（起点任务）
- Produces: Express 服务运行在 `:8088`，serve `frontend/` 静态文件，JSON body 解析，基础 CORS，速率限制中间件 `rateLimiter(maxPerMin)`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "blind-box-suite-server",
  "version": "4.0.0",
  "description": "盲盒福袋搭配工具 - AI 智能体服务端",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "@anthropic-ai/sdk": "^0.37.0",
    "dotenv": "^16.4.0",
    "cors": "^2.8.5"
  }
}
```

- [ ] **Step 2: 安装依赖**

```bash
cd "d:/克劳德 Code/backend" && npm install
```

- [ ] **Step 3: 创建 .gitignore**

```
node_modules/
.env
data/
```

- [ ] **Step 4: 创建 .env.example**

```
ANTHROPIC_API_KEY=sk-ant-...
STEAM_API_KEY=XXXXXXXXXXXXXXXX
PORT=8088
```

- [ ] **Step 5: 创建中间件 backend/middleware/auth.js**

```javascript
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
```

- [ ] **Step 6: 创建 backend/server.js**

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { rateLimiter } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 8088;

// 中间件
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(rateLimiter(30));

// 确保 data 目录存在
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 静态文件：serve frontend 目录
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API 路由（先注册占位，后续任务填充）
app.use('/api/products', require('./routes/products'));
app.use('/api/steam', require('./routes/steam'));
app.use('/api', require('./routes/chat'));
app.use('/api', require('./routes/match'));

// 启动
app.listen(PORT, function () {
  console.log('盲盒福袋搭配工具服务端已启动: http://localhost:' + PORT);
});
```

- [ ] **Step 7: 验证服务启动**

```bash
cd "d:/克劳德 Code/backend" && timeout 3 node server.js || true
```

期望：看到 `盲盒福袋搭配工具服务端已启动: http://localhost:8088`

- [ ] **Step 8: Commit**

```bash
git add backend/ && git commit -m "feat: Phase 1 — Express 后端骨架 + 速率限制中间件"
```

---

### Task 2: 前端文件拆分 — 项目结构 + index.html

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/css/main.css`
- Create: `frontend/js/api.js`
- Create: `frontend/js/state.js`
- Modify: `backend/server.js`（已在 Task 1 配置了 express.static，无需改动）

**Interfaces:**
- Consumes: Task 1 的 Express 服务（静态文件 serve）
- Produces:
  - `frontend/index.html` — 完整主页面，通过 `<link>` 引 CSS，`<script>` 引 JS
  - `frontend/css/main.css` — 从原 HTML `<style>` 块提取的全部 CSS
  - `frontend/js/api.js` — `apiCall(method, path, body)` → Promise，封装 fetch 调用
  - `frontend/js/state.js` — `state` 全局对象 + `loadState()` / `saveState()` 改为调用后端 API

- [ ] **Step 1: 创建 frontend/css/main.css**

将 `blind-box-suite.html` 中 `<style>` 标签内全部 CSS（第 7-193 行）复制到 `frontend/css/main.css`。文件内容参考：

```css
/* ===== CSS 变量 ===== */
:root {
  --bg: #18181b; --surface: #27272a; --surface2: #3f3f46; --border: #52525b;
  --text: #f4f4f5; --text2: #a1a1aa; --text3: #71717a;
  --accent: #06b6d4; --accent-hover: #0891b2;
  --rare: #f59e0b; --rare-bg: rgba(245,158,11,0.12); --rare-border: rgba(245,158,11,0.3);
  --jackpot: #ec4899; --jackpot-bg: rgba(236,72,153,0.12); --jackpot-border: rgba(236,72,153,0.3);
  --normal: #a1a1aa; --normal-bg: rgba(161,161,170,0.08); --normal-border: rgba(161,161,170,0.2);
  --danger: #ef4444; --danger-hover: #dc2626; --success: #10b981; --warning: #f59e0b;
  --radius: 10px; --radius-sm: 6px;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  --font-mono: 'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace;
  --shadow: 0 2px 16px rgba(0,0,0,0.3);
}
/* ... 完整内容从 blind-box-suite.html 第 8-193 行提取 ... */
```

- [ ] **Step 2: 创建 frontend/js/api.js**

```javascript
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
```

- [ ] **Step 3: 创建 frontend/index.html**

从 `blind-box-suite.html` 提取 HTML 结构（第 1-378 行的 HTML 部分），改为引用外部资源。关键差异：
- `<link rel="stylesheet" href="css/main.css">` 替代原 `<style>` 块
- `<script src="js/api.js"></script>` — 先加载
- `<script src="js/state.js"></script>` — 状态管理
- `<script src="js/import-export.js"></script>` — 导入导出
- `<script src="js/ui.js"></script>` — 渲染
- `<script src="js/app.js"></script>` — 核心逻辑 + 初始化
- AI 面板预留挂载点：`<div id="aiPanelRoot"></div>` 在 `</body>` 前

```html
<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>盲盒福袋搭配工具 v4.0</title>
<link rel="stylesheet" href="css/main.css">
</head>
<body>
<!-- HTML 结构从 blind-box-suite.html 第 197-375 行复制 -->
<div class="app">
  <div class="header">
    <div class="header-left">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      <h1>盲盒福袋搭配工具</h1>
      <span class="ver">v4.0</span>
    </div>
    <div class="header-actions">
      <!-- 与 blind-box-suite.html 相同 -->
    </div>
  </div>
  <!-- 主布局与 blind-box-suite.html 相同 -->
</div>
<!-- AI 面板挂载点 -->
<div id="aiPanelRoot"></div>
<!-- Toast -->
<div class="toast" id="toast"></div>
<!-- 脚本 -->
<script src="js/api.js"></script>
<script src="js/state.js"></script>
<script src="js/import-export.js"></script>
<script src="js/ui.js"></script>
<script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: 验证前端可访问**

```bash
cd "d:/克劳德 Code/backend" && node server.js &
sleep 2
curl -s -o /dev/null -w "%{http_code} %{content_type}" http://localhost:8088/
# 期望: 200 text/html
kill %1 2>/dev/null
```

- [ ] **Step 5: Commit**

```bash
git add frontend/ && git commit -m "feat: Phase 1 — 前端文件拆分，index.html + CSS + API 封装"
```

---

### Task 3: 前端 JS 拆分 — state.js + ui.js + import-export.js

**Files:**
- Create: `frontend/js/state.js`
- Create: `frontend/js/ui.js`
- Create: `frontend/js/import-export.js`
- Create: `frontend/js/app.js`

**Interfaces:**
- Consumes: Task 2 的 `api.js`（`apiCall`, `ProductsAPI`, `SteamAPI`）
- Produces:
  - `state.js` — 全局 state 对象 + 持久化（localStorage + 后端 API 同步）+ 工具函数
  - `ui.js` — `renderProducts()`, `renderResults()`, `syncConfigToUI()`, `renderPoolTable()`, `renderAll()`
  - `import-export.js` — `exportExcel()`, `parseCSVLine()`, `importFile()`, `processImportedRows()`, `loadDemo()`
  - `app.js` — `compute()`, `onProductInput()`, `onConfigChange()`, `setPriceMode()`, `setRatioMode()`, `toggleTheme()`, `addProduct()`, `bindEvents()`, `init()`

- [ ] **Step 1: 创建 frontend/js/state.js**

从 `blind-box-suite.html` 提取状态和工具函数（第 382-455 行）。关键变更：产品池数据源改为后端 API + localStorage 双写。

```javascript
'use strict';

// ===== 常量 =====
var TIERS = ['稀有', '欧皇', '普通'];
var STORAGE_KEY = 'blindbox_state_v4';
var POOL_STORAGE_KEY = 'blindbox_pool_v1';

// ===== 全局状态 =====
var state = {
  products: [],
  totalWeight: 10000,
  tierRatios: { '稀有': 1, '欧皇': 3, '普通': 10 },
  targetMargin: 30,
  priceMode: 'auto',
  manualPrice: null,
  ratioMode: 'manual',
  theme: 'dark'
};
var nextId = 1;

// 产品池
var productPool = [];
var poolSelections = {};

// ===== 持久化 =====
function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var s = JSON.parse(raw);
      if (s.products) state.products = s.products;
      if (typeof s.totalWeight === 'number') state.totalWeight = s.totalWeight;
      if (s.tierRatios) state.tierRatios = s.tierRatios;
      if (typeof s.targetMargin === 'number') state.targetMargin = s.targetMargin;
      if (s.priceMode) state.priceMode = s.priceMode;
      if (s.manualPrice != null) state.manualPrice = s.manualPrice;
      if (s.ratioMode) state.ratioMode = s.ratioMode;
      if (s.theme) state.theme = s.theme;
      if (s.nextId) nextId = s.nextId;
    }
  } catch (e) { }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      products: state.products, totalWeight: state.totalWeight,
      tierRatios: state.tierRatios, targetMargin: state.targetMargin,
      priceMode: state.priceMode, manualPrice: state.manualPrice,
      ratioMode: state.ratioMode, theme: state.theme, nextId: nextId
    }));
  } catch (e) { }
}

function loadProductPool() {
  try {
    var raw = localStorage.getItem(POOL_STORAGE_KEY);
    if (raw) productPool = JSON.parse(raw);
  } catch (e) { productPool = []; }
}

function saveProductPool() {
  try {
    localStorage.setItem(POOL_STORAGE_KEY, JSON.stringify(productPool));
  } catch (e) { }
}

// ===== 工具函数 =====
function el(id) { return document.getElementById(id); }

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var toastTimer;
function showToast(msg, isWarn) {
  var t = el('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast' + (isWarn ? ' warn' : '') + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = 'toast'; }, 2200);
}

function getTierProducts(tier) {
  return state.products.filter(function (p) { return p.tier === tier; });
}

// 防抖
var debounceTimer;
function debounce(fn, delay) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, delay);
}
```

- [ ] **Step 2: 创建 frontend/js/ui.js**

从 `blind-box-suite.html` 提取全部渲染函数（第 585-668 行 + 第 786-915 行）。保持原逻辑不变，仅调整为引用全局变量 `state`、`productPool`、`TIERS`、`poolSelections`。

核心函数签名：
```javascript
function renderProducts() { /* 同上第 586-616 行 */ }
function renderResults() { /* 同上第 618-648 行 */ }
function renderAll() { renderProducts(); renderResults(); saveState(); }
function syncConfigToUI() { /* 同上第 657-668 行 */ }
function renderPoolTable() { /* 同上第 786-820 行 */ }
function updatePoolCount() { /* 同上第 822-825 行 */ }
function savePoolItem(el) { /* 同上第 828-846 行 */ }
function deletePoolItem(idx) { /* 同上第 848-862 行 */ }
function addEmptyPoolItem() { /* 同上第 864-875 行 */ }
function togglePoolCheck(cb) { /* 同上第 877-881 行 */ }
function clearPool() { /* 同上第 884-892 行 */ }
function openProductPool() { /* 同上第 894-898 行 */ }
function closeProductPool() { /* 同上第 901-903 行 */ }
function addFromPool() { /* 同上第 905-915 行 */ }
```

- [ ] **Step 3: 创建 frontend/js/import-export.js**

从 `blind-box-suite.html` 提取导入导出全部逻辑（第 917-1246 行）。

核心函数签名：
```javascript
function exportExcel() { /* 同上第 918-955 行 */ }
function parseCSVLine(line) { /* 同上第 958-972 行 */ }
function importFile() { /* 同上第 978-992 行 */ }
function importExcelFile(file) { /* 同上第 995-1025 行 */ }
function importCSVFile(file) { /* 同上第 1028-1045 行 */ }
function processImportedRows(rows) { /* 同上第 1049-1203 行 */ }
function loadDemo() { /* 同上第 1206-1246 行 */ }
```

- [ ] **Step 4: 创建 frontend/js/app.js**

从 `blind-box-suite.html` 提取核心计算 + 事件处理 + 初始化（第 457-556 行 + 第 670-773 行 + 第 1264-1297 行）。

```javascript
'use strict';

// ===== 核心计算 =====
function compute() {
  var totalW = state.totalWeight;
  var ratios = state.tierRatios;
  var margin = state.targetMargin / 100;

  // 自动反推比例
  if (state.ratioMode === 'auto') {
    var tierAvgCost = {};
    TIERS.forEach(function (t) {
      var prods = getTierProducts(t);
      if (prods.length === 0) { tierAvgCost[t] = 1; return; }
      tierAvgCost[t] = prods.reduce(function (s, p) { return s + p.cost; }, 0) / prods.length;
    });
    TIERS.forEach(function (t) {
      var prods = getTierProducts(t);
      var cnt = prods.length || 1;
      ratios[t] = (1 / (tierAvgCost[t] || 1)) * Math.pow(cnt, 0.3);
    });
    var minR = Math.min.apply(null, TIERS.map(function (t) { return ratios[t]; }));
    TIERS.forEach(function (t) { ratios[t] = ratios[t] / minR; });
    var rareEl = el('cfg-ratioRare'); if (rareEl) rareEl.value = ratios['稀有'].toFixed(2);
    var jackEl = el('cfg-ratioJackpot'); if (jackEl) jackEl.value = ratios['欧皇'].toFixed(2);
    var normEl = el('cfg-ratioNormal'); if (normEl) normEl.value = ratios['普通'].toFixed(2);
  }

  // 完整算法同 blind-box-suite.html 第 484-545 行
  // ...
}

function calcPity(prob, confidence) { /* 同第 547-550 行 */ }
function readConfigFromUI() { /* 同第 560-583 行 */ }
function onProductInput(e) { /* 同第 671-695 行 */ }
function onDeleteClick(e) { /* 同第 698-704 行 */ }
function addProduct(data) { /* 同第 706-721 行 */ }
function onConfigChange() { /* 同第 724-727 行 */ }
function onConfigInput() { /* 同第 730-734 行 */ }
function setPriceModeUI(mode) { /* 同第 737-741 行 */ }
function setRatioModeUI(mode) { /* 同第 742-756 行 */ }
function setRatioMode(mode) { /* 同第 757-761 行 */ }
function setPriceMode(mode) { /* 同第 762-773 行 */ }
function toggleTheme() { /* 同第 776-783 行 */ }
function resetAll() { /* 同第 1249-1262 行 */ }

// ===== 事件绑定 =====
function bindEvents() { /* 同第 1265-1285 行 */ }

// ===== 初始化 =====
function init() {
  loadState();
  loadProductPool();
  document.documentElement.setAttribute('data-theme', state.theme || 'dark');
  syncConfigToUI();
  bindEvents();
  renderAll();
}

init();
```

> **实现要点：** compute() 函数的完整 90 行逻辑直接复制自 blind-box-suite.html 第 484-545 行，不在这里重复展示。

- [ ] **Step 5: 验证功能完整性**

```bash
cd "d:/克劳德 Code/backend" && node server.js &
sleep 2
echo "访问 http://localhost:8088 验证："
echo "1. 页面加载正常"
echo "2. 添加产品、修改配置、计算结果显示正常"
echo "3. CSV 导入导出正常"
echo "4. 主题切换正常"
echo "5. 数据持久化正常（刷新页面后恢复）"
kill %1 2>/dev/null
```

- [ ] **Step 6: Commit**

```bash
git add frontend/js/state.js frontend/js/ui.js frontend/js/import-export.js frontend/js/app.js
git commit -m "feat: Phase 1 — JS 拆分完成，state/ui/import-export/app 独立模块"
```

---

### Task 4: 后端产品库 CRUD API

**Files:**
- Create: `backend/routes/products.js`

**Interfaces:**
- Consumes: Task 1 的 Express app（通过 `require('./routes/products')`）
- Produces:
  - `GET /api/products` → `{ products: [...] }` 读取 `data/products.json`
  - `POST /api/products` → `{ product: {...} }` 追加产品
  - `PUT /api/products/:id` → `{ product: {...} }` 更新产品
  - `DELETE /api/products/:id` → `{ success: true }` 删除产品
  - 辅助函数：`readJSON(file)`, `writeJSON(file, data)`

- [ ] **Step 1: 创建 backend/routes/products.js**

```javascript
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const PRODUCTS_FILE = path.join(__dirname, '..', 'data', 'products.json');
const POOL_FILE = path.join(__dirname, '..', 'data', 'pool.json');

function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    var raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// GET /api/products — 获取产品库
router.get('/', function (req, res) {
  try {
    var products = readJSON(PRODUCTS_FILE);
    var pool = readJSON(POOL_FILE);
    res.json({ products: products, pool: pool });
  } catch (e) {
    res.status(500).json({ error: '读取产品数据失败' });
  }
});

// POST /api/products — 添加产品到产品库
router.post('/', function (req, res) {
  try {
    var product = req.body;
    if (!product || !product.name) {
      return res.status(400).json({ error: '产品名称不能为空' });
    }
    var products = readJSON(PRODUCTS_FILE);
    product._id = Date.now();
    product.createdAt = new Date().toISOString();
    products.push(product);
    writeJSON(PRODUCTS_FILE, products);
    res.json({ product: product });
  } catch (e) {
    res.status(500).json({ error: '添加产品失败' });
  }
});

// PUT /api/products/:id — 更新产品
router.put('/:id', function (req, res) {
  try {
    var id = parseInt(req.params.id, 10);
    var products = readJSON(PRODUCTS_FILE);
    var idx = products.findIndex(function (p) { return p._id === id; });
    if (idx === -1) {
      return res.status(404).json({ error: '产品不存在' });
    }
    var updates = req.body;
    Object.keys(updates).forEach(function (key) {
      if (key !== '_id') products[idx][key] = updates[key];
    });
    products[idx].updatedAt = new Date().toISOString();
    writeJSON(PRODUCTS_FILE, products);
    res.json({ product: products[idx] });
  } catch (e) {
    res.status(500).json({ error: '更新产品失败' });
  }
});

// DELETE /api/products/:id — 删除产品
router.delete('/:id', function (req, res) {
  try {
    var id = parseInt(req.params.id, 10);
    var products = readJSON(PRODUCTS_FILE);
    var filtered = products.filter(function (p) { return p._id !== id; });
    if (filtered.length === products.length) {
      return res.status(404).json({ error: '产品不存在' });
    }
    writeJSON(PRODUCTS_FILE, filtered);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '删除产品失败' });
  }
});

// POST /api/products/pool/sync — 同步产品池
router.post('/pool/sync', function (req, res) {
  try {
    var pool = req.body.pool || [];
    writeJSON(POOL_FILE, pool);
    res.json({ success: true, count: pool.length });
  } catch (e) {
    res.status(500).json({ error: '同步产品池失败' });
  }
});

module.exports = router;
```

- [ ] **Step 2: 测试 CRUD API**

```bash
cd "d:/克劳德 Code/backend" && node server.js &
sleep 2

# 测试 GET（空库）
echo "--- GET /api/products ---"
curl -s http://localhost:8088/api/products | head -50

# 测试 POST
echo "--- POST /api/products ---"
curl -s -X POST http://localhost:8088/api/products \
  -H "Content-Type: application/json" \
  -d '{"id":"730","name":"CS2","tier":"稀有","cost":80,"marketPrice":0}'

# 测试 GET（应有数据）
echo "--- GET /api/products ---"
curl -s http://localhost:8088/api/products | head -100

# 测试 PUT
echo "--- PUT /api/products/1 ---"
curl -s -X PUT http://localhost:8088/api/products/1 \
  -H "Content-Type: application/json" \
  -d '{"cost":75}'

kill %1 2>/dev/null
```

期望：CRUD 操作正常，`backend/data/products.json` 文件被创建和更新。

- [ ] **Step 3: Commit**

```bash
git add backend/routes/products.js
git commit -m "feat: Phase 1 — 产品库 CRUD API（GET/POST/PUT/DELETE /api/products）"
```

---

### Task 5: Steam API 集成

**Files:**
- Create: `backend/services/steam-service.js`
- Create: `backend/routes/steam.js`

**Interfaces:**
- Consumes: Task 1 的 Express app，`.env` 中的 `STEAM_API_KEY`
- Produces:
  - `steamService.getAppDetails(appId)` → `{ name, marketPrice, discountPrice, categories, reviewCount, rating, developer, headerImage }`
  - `steamService.getPlayerCount(appId)` → `{ currentPlayers }`
  - `steamService.calcHotScore(app)` → 热度分 0-100
  - `GET /api/steam/app/:appId` → `{ success: true, ...steamFields }`
  - `POST /api/steam/refresh` → `{ success: true, results: [...] }` 批量刷新

- [ ] **Step 1: 创建 backend/services/steam-service.js**

```javascript
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
```

- [ ] **Step 2: 创建 backend/routes/steam.js**

```javascript
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
```

- [ ] **Step 3: 测试 Steam API**

```bash
cd "d:/克劳德 Code/backend" && node server.js &
sleep 2

# 测试 CS2 (730)
echo "--- GET /api/steam/app/730 ---"
curl -s http://localhost:8088/api/steam/app/730 | python -m json.tool 2>/dev/null || curl -s http://localhost:8088/api/steam/app/730

# 测试 Dota 2 (570)
echo "--- GET /api/steam/app/570 ---"
curl -s http://localhost:8088/api/steam/app/570 | python -m json.tool 2>/dev/null || curl -s http://localhost:8088/api/steam/app/570

kill %1 2>/dev/null
```

期望：返回游戏名称、类别、评论数、热度分等数据。

- [ ] **Step 4: Commit**

```bash
git add backend/services/steam-service.js backend/routes/steam.js
git commit -m "feat: Phase 2 — Steam API 集成，游戏数据+热度分计算+缓存"
```

---

### Task 6: Claude AI 服务封装

**Files:**
- Create: `backend/services/ai-service.js`

**Interfaces:**
- Consumes: `.env` 中的 `ANTHROPIC_API_KEY`，`@anthropic-ai/sdk` 包
- Produces:
  - `aiService.chat(messages, context, onChunk)` — SSE 流式对话
  - `aiService.structuredChat(systemPrompt, userMessage)` → Promise<对象> — 结构化输出（用于一键搭配）
  - `SYSTEM_PROMPT` 常量

- [ ] **Step 1: 安装 Anthropic SDK**

```bash
cd "d:/克劳德 Code/backend" && npm install @anthropic-ai/sdk
```

- [ ] **Step 2: 创建 backend/services/ai-service.js**

```javascript
const Anthropic = require('@anthropic-ai/sdk');

// 初始化（仅当 API Key 存在时）
var anthropic = null;
function getClient() {
  if (!anthropic) {
    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('未配置 ANTHROPIC_API_KEY，请在 .env 文件中设置');
    }
    anthropic = new Anthropic({ apiKey: apiKey });
  }
  return anthropic;
}

// 系统 Prompt
var SYSTEM_PROMPT = '你是一个盲盒福袋搭配专家助手。你的能力包括：\n' +
  '\n' +
  '1. **产品搭配**：根据约束条件（数量、成本、利润率、主题、类别偏好）从产品池选择产品并分配等级\n' +
  '2. **权重分析**：理解成本反比权重算法（高成本→低权重，控制亏损风险），能调优稀有:欧皇:普通比例\n' +
  '3. **价格测算**：基于期望成本和利润率计算合理的单抽价格\n' +
  '4. **问题诊断**：检查搭配方案的合理性（稀有概率、保底次数、利润率可实现性）\n' +
  '\n' +
  '关键参考指标：\n' +
  '- Steam 热度分（hotScore）高的游戏优先放入"稀有"等级以吸引用户\n' +
  '- 稀有概率建议保持在 3%-10%，超过 20% 会失去稀缺感\n' +
  '- 单抽价格 = 期望成本 / (1 - 利润率)，自动模式下由系统计算\n' +
  '- 总权重越大，权重分配越精细；默认 10000\n' +
  '- 成本反比权重：同等级内，成本越高权重越低（控制每周期亏损风险）\n' +
  '\n' +
  '回复规范：\n' +
  '- 输出搭配方案时，使用 [ACTION:apply_products]JSON数组[/ACTION] 标记\n' +
  '- 输出参数建议时，使用 [ACTION:apply_config]JSON对象[/ACTION] 标记\n' +
  '- 发现问题时，使用 [WARN:警告内容] 标记\n' +
  '- 回复自然亲切，说中文，像一位有经验的产品经理在帮助你\n' +
  '- 如果用户的问题和搭配无关，友好地把话题拉回来\n' +
  '\n' +
  '产品数据结构：{ _id, id, name, tier(稀有|欧皇|普通), cost, marketPrice, weight, steamCategory, steamReviews, steamRating, steamPlayers, hotScore }';

// 构建上下文消息
function buildContextMessage(context) {
  if (!context) return '';

  var parts = ['[当前系统状态]'];

  if (context.products && context.products.length > 0) {
    parts.push('产品列表: ' + context.products.length + ' 个产品');
    context.products.forEach(function (p) {
      var hotStr = p.hotScore != null ? ' | Steam热度:' + p.hotScore : '';
      parts.push(
        '  - [' + p.id + '] ' + p.name +
        ' | 等级:' + p.tier +
        ' | 成本:¥' + p.cost +
        ' | 原价:¥' + (p.marketPrice != null ? p.marketPrice : '无') +
        ' | 权重:' + (p.weight || 0) +
        hotStr
      );
    });
  } else {
    parts.push('产品列表: 暂无产品');
  }

  if (context.config) {
    var c = context.config;
    parts.push('全局配置: 总权重' + c.totalWeight +
      ' | 稀有:欧皇:普通=' + c.tierRatios['稀有'] + ':' + c.tierRatios['欧皇'] + ':' + c.tierRatios['普通'] +
      ' | 目标利润率' + c.targetMargin + '%' +
      ' | 定价模式:' + (c.priceMode === 'auto' ? '自动' : '手动'));
  }

  if (context.results) {
    var r = context.results;
    parts.push('计算结果: 期望成本¥' + r.expectedCost.toFixed(2) +
      ' | 单抽价格¥' + r.price.toFixed(2) +
      ' | 实际利润率' + r.actualMargin.toFixed(1) + '%');
  }

  if (context.pool && context.pool.length > 0) {
    parts.push('可选产品池: ' + context.pool.length + ' 个产品待选');
    context.pool.slice(0, 30).forEach(function (p) {
      var hotStr = p.hotScore != null ? ' | 热度:' + p.hotScore : '';
      parts.push(
        '  - [' + p.id + '] ' + p.name +
        ' | 等级:' + p.tier +
        ' | 成本:¥' + p.cost +
        hotStr
      );
    });
    if (context.pool.length > 30) {
      parts.push('  ...（还有 ' + (context.pool.length - 30) + ' 个产品未列出）');
    }
  }

  return parts.join('\n');
}

// SSE 流式对话
function chatStream(messages, context, onChunk) {
  return new Promise(function (resolve, reject) {
    try {
      var client = getClient();
    } catch (e) {
      return reject(e);
    }

    // 构建消息列表
    var apiMessages = [];

    // 注入上下文作为第一条 user message（如果存在）
    if (context) {
      var ctxMsg = buildContextMessage(context);
      if (ctxMsg) {
        apiMessages.push({ role: 'user', content: ctxMsg });
        apiMessages.push({
          role: 'assistant',
          content: '已收到系统数据。请告诉我你的搭配需求，我来帮你分析。'
        });
      }
    }

    // 追加用户消息
    messages.forEach(function (m) {
      apiMessages.push({ role: m.role, content: m.content });
    });

    client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: apiMessages
    }).on('text', function (text) {
      onChunk({ type: 'text', content: text });
    }).on('end', function () {
      resolve();
    }).on('error', function (err) {
      reject(err);
    });
  });
}

// 结构化对话（用于一键搭配，非流式）
function structuredChat(systemPrompt, userMessage) {
  return new Promise(function (resolve, reject) {
    try {
      var client = getClient();
    } catch (e) {
      return reject(e);
    }

    client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    }).then(function (msg) {
      var text = msg.content[0].text;
      // 尝试提取 JSON（可能在 ```json ``` 代码块中或直接在 [ACTION] 标记中）
      var jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try { resolve(JSON.parse(jsonMatch[1])); return; } catch (e) { }
      }
      // 尝试直接解析
      try { resolve(JSON.parse(text)); return; } catch (e) { }
      // 返回原始文本
      resolve({ text: text });
    }).catch(function (err) {
      reject(err);
    });
  });
}

module.exports = { chatStream, structuredChat, SYSTEM_PROMPT, buildContextMessage };
```

- [ ] **Step 3: 验证 AI 服务可加载**

```bash
cd "d:/克劳德 Code/backend"
# 临时设置 API Key 变量（测试用）
export ANTHROPIC_API_KEY=test
node -e "
try {
  var ai = require('./services/ai-service');
  console.log('ai-service 加载成功');
  console.log('函数列表:', Object.keys(ai));
} catch(e) {
  console.log('加载失败:', e.message);
}
"
```

期望：`ai-service 加载成功`（API Key 错误不影响模块加载，仅在实际调用时报错）

- [ ] **Step 4: Commit**

```bash
git add backend/services/ai-service.js
git commit -m "feat: Phase 3 — Claude AI 服务封装，SSE 流式 + 结构化对话 + 上下文注入"
```

---

### Task 7: AI 聊天 API 路由

**Files:**
- Create: `backend/routes/chat.js`

**Interfaces:**
- Consumes: Task 6 的 `ai-service.js`，Task 1 的 Express app
- Produces: `POST /api/chat` — SSE 流式对话
  - Request: `{ messages: [{role, content}], context: { products, config, results, pool } }`
  - Response: SSE stream — `data: {"type":"text","content":"..."}\n\n` → `data: {"type":"done"}\n\n`

- [ ] **Step 1: 创建 backend/routes/chat.js**

```javascript
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
```

- [ ] **Step 2: 测试 SSE 端点（无 API Key 时的错误处理）**

```bash
cd "d:/克劳德 Code/backend" && node server.js &
sleep 2

echo "--- POST /api/chat (expect error without key) ---"
curl -s -N -X POST http://localhost:8088/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}],"context":{}}' 2>&1 | head -10

kill %1 2>/dev/null
```

期望：SSE 流中返回错误信息 `AI 服务出错：未配置 ANTHROPIC_API_KEY`（如果没有配置 Key）

- [ ] **Step 3: Commit**

```bash
git add backend/routes/chat.js
git commit -m "feat: Phase 3 — AI 聊天 SSE 流式 API (/api/chat)"
```

---

### Task 8: 智能搭配 API 路由

**Files:**
- Create: `backend/routes/match.js`

**Interfaces:**
- Consumes: Task 6 的 `ai-service.js`，Task 1 的 Express app
- Produces: `POST /api/match` — 一键智能搭配
  - Request: `{ pool: [...], constraints: { count, maxCost, minRare, minJackpot, targetMargin, preferCategory, note } }`
  - Response: `{ success: true, plan: { products: [...], reasoning, config, results } }`

- [ ] **Step 1: 创建 backend/routes/match.js**

```javascript
const express = require('express');
const router = express.Router();
const aiService = require('../services/ai-service');

// 构建搭配专用的 System Prompt
var MATCH_SYSTEM_PROMPT = '你是一个盲盒福袋搭配专家。你的任务是根据产品池和约束条件，选出最优的产品组合并分配等级。\n' +
  '\n' +
  '规则：\n' +
  '1. 优先选 Steam 热度分（hotScore）高的产品放入"稀有"等级\n' +
  '2. 满足稀有和欧皇的最低数量要求\n' +
  '3. 总成本不超过上限\n' +
  '4. 总产品数等于要求数量（如果池中产品不足则全选并说明）\n' +
  '5. 考虑类别偏好（如果有 preferCategory）\n' +
  '\n' +
  '你必须只返回一个 JSON 对象，格式如下（不要包含其他文字）：\n' +
  '{\n' +
  '  "products": [\n' +
  '    { "id": "产品ID", "name": "产品名", "tier": "等级", "cost": 成本, "marketPrice": 原价或null },\n' +
  '    ...\n' +
  '  ],\n' +
  '  "reasoning": "推荐理由，简洁说明为什么这样搭配（2-3句话）",\n' +
  '  "config": {\n' +
  '    "tierRatios": { "稀有": 1, "欧皇": 3, "普通": 10 },\n' +
  '    "targetMargin": 30\n' +
  '  },\n' +
  '  "warnings": ["任何需要注意的问题，如产品不足、概率偏低等"]\n' +
  '}';

// POST /api/match — 一键智能搭配
router.post('/match', function (req, res) {
  var pool = req.body.pool || [];
  var constraints = req.body.constraints || {};

  if (pool.length === 0) {
    return res.status(400).json({ error: '产品池为空，请先导入产品' });
  }

  // 构建用户消息
  var userMsg = '请根据以下条件从产品池中搭配盲盒福袋：\n\n' +
    '约束条件：\n' +
    '- 产品数量: ' + (constraints.count || 5) + ' 个\n' +
    '- 总成本上限: ¥' + (constraints.maxCost || 999) + '\n' +
    '- 稀有最少: ' + (constraints.minRare || 1) + ' 个\n' +
    '- 欧皇最少: ' + (constraints.minJackpot || 1) + ' 个\n' +
    '- 目标利润率: ' + (constraints.targetMargin || 30) + '%\n' +
    (constraints.preferCategory ? '- 偏好类别: ' + constraints.preferCategory + '\n' : '') +
    (constraints.note ? '- 补充要求: ' + constraints.note + '\n' : '') +
    '\n可选产品池（' + pool.length + ' 个产品）：\n';

  pool.forEach(function (p, i) {
    var hotStr = p.hotScore != null ? ' | Steam热度:' + p.hotScore + ' | 类别:' + (p.steamCategory || '无') : '';
    userMsg += (i + 1) + '. [' + p.id + '] ' + p.name +
      ' | 成本:¥' + p.cost +
      ' | 原价:¥' + (p.marketPrice != null ? p.marketPrice : '无') +
      hotStr + '\n';
  });

  aiService.structuredChat(MATCH_SYSTEM_PROMPT, userMsg).then(function (result) {
    if (result.text) {
      // 如果 AI 返回的不是纯 JSON，尝试提取
      var jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { result = JSON.parse(jsonMatch[0]); } catch (e) {
          return res.json({ success: true, plan: { products: [], reasoning: result.text, config: {}, warnings: ['AI 返回格式异常，请重试'] } });
        }
      }
    }
    res.json({
      success: true,
      plan: {
        products: result.products || [],
        reasoning: result.reasoning || '',
        config: result.config || {},
        warnings: result.warnings || []
      }
    });
  }).catch(function (err) {
    res.status(500).json({ error: '智能搭配失败：' + err.message });
  });
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/routes/match.js
git commit -m "feat: Phase 4 — 智能搭配 API (/api/match)，结构化输出"
```

---

### Task 9: AI 对话面板前端组件

**Files:**
- Create: `frontend/css/ai-panel.css`
- Create: `frontend/js/ai-panel.js`

**Interfaces:**
- Consumes: Task 2 的 `api.js`（`ChatAPI`），Task 3 的 `state.js`
- Produces:
  - `AIPanel` 全局对象：`AIPanel.init()`, `AIPanel.toggle()`, `AIPanel.open()`, `AIPanel.close()`
  - DOM: 挂载到 `#aiPanelRoot` 的完整对话 UI
  - SSE 流式渲染 + 对话历史 localStorage（key: `blindbox_chat_history`，最多 20 条）

- [ ] **Step 1: 创建 frontend/css/ai-panel.css**

```css
/* ===== AI 面板样式 ===== */
.ai-panel-wrapper {
  position: fixed;
  bottom: 0;
  right: 20px;
  width: 420px;
  max-height: 600px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius) var(--radius) 0 0;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  z-index: 1000;
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.ai-panel-wrapper.collapsed {
  transform: translateY(calc(100% - 48px));
}
.ai-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}
.ai-panel-header h3 {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ai-panel-header .ai-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
}
.ai-panel-header .ai-actions {
  display: flex;
  gap: 4px;
}
.ai-panel-header .ai-actions button {
  background: none;
  border: none;
  color: var(--text3);
  cursor: pointer;
  padding: 4px;
  font-size: 16px;
  border-radius: 4px;
}
.ai-panel-header .ai-actions button:hover {
  color: var(--text);
  background: var(--surface2);
}
.ai-panel-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.ai-panel-messages::-webkit-scrollbar { width: 4px; }
.ai-panel-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.ai-msg {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}
.ai-msg.user {
  align-self: flex-end;
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.ai-msg.assistant {
  align-self: flex-start;
  background: var(--surface2);
  color: var(--text);
  border-bottom-left-radius: 4px;
}
.ai-msg.assistant.streaming {
  border-left: 2px solid var(--accent);
}
.ai-msg .ai-action-card {
  margin-top: 10px;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.ai-msg .ai-action-card .ai-action-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}
.ai-msg .ai-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  font-family: var(--font);
  margin-top: 4px;
  transition: all 0.15s;
}
.ai-msg .ai-action-btn:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.ai-msg .ai-warn {
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid var(--warning);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--warning);
}
.ai-panel-input-area {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.ai-panel-input-area textarea {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  resize: none;
  outline: none;
  font-family: var(--font);
  min-height: 40px;
  max-height: 120px;
}
.ai-panel-input-area textarea:focus {
  border-color: var(--accent);
}
.ai-panel-input-area button {
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  font-family: var(--font);
  font-weight: 600;
  white-space: nowrap;
  align-self: flex-end;
}
.ai-panel-input-area button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ai-panel-input-area button:hover:not(:disabled) {
  background: var(--accent-hover);
}

/* AI 触发器按钮 */
.ai-trigger-btn {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  border: none;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(6, 182, 212, 0.4);
  z-index: 999;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ai-trigger-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 28px rgba(6, 182, 212, 0.5);
}
.ai-trigger-btn.hidden {
  display: none;
}

/* 响应式 */
@media (max-width: 600px) {
  .ai-panel-wrapper {
    width: 100%;
    right: 0;
    border-radius: var(--radius) var(--radius) 0 0;
    max-height: 70vh;
  }
}
```

- [ ] **Step 2: 创建 frontend/js/ai-panel.js**

```javascript
'use strict';

var CHAT_HISTORY_KEY = 'blindbox_chat_history';
var MAX_HISTORY = 20;

// ===== AI 对话面板 =====
var AIPanel = {
  isOpen: false,
  isStreaming: false,
  messages: [],        // [{ role: "user"|"assistant", content: "..." }]
  root: null,

  init: function () {
    this.loadHistory();
    this.renderToggleButton();
    this.renderPanel();
    this.bindEvents();
  },

  // 加载对话历史
  loadHistory: function () {
    try {
      var raw = localStorage.getItem(CHAT_HISTORY_KEY);
      if (raw) {
        var msgs = JSON.parse(raw);
        this.messages = msgs.slice(-MAX_HISTORY);
      }
    } catch (e) {
      this.messages = [];
    }
  },

  // 保存对话历史
  saveHistory: function () {
    try {
      var toSave = this.messages.slice(-MAX_HISTORY);
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(toSave));
    } catch (e) { }
  },

  // 清空历史
  clearHistory: function () {
    this.messages = [];
    localStorage.removeItem(CHAT_HISTORY_KEY);
    this.renderMessages();
  },

  // 渲染浮动触发按钮
  renderToggleButton: function () {
    var btn = document.createElement('button');
    btn.className = 'ai-trigger-btn';
    btn.id = 'aiTriggerBtn';
    btn.title = 'AI 搭配助手';
    btn.innerHTML = '🤖';
    btn.addEventListener('click', this.toggle.bind(this));
    document.body.appendChild(btn);
  },

  // 渲染对话面板
  renderPanel: function () {
    var wrapper = document.createElement('div');
    wrapper.className = 'ai-panel-wrapper collapsed';
    wrapper.id = 'aiPanelWrapper';
    wrapper.innerHTML =
      '<div class="ai-panel-header" id="aiPanelHeader">' +
        '<h3>🤖 AI 搭配助手 <span class="ai-badge">AI</span></h3>' +
        '<div class="ai-actions">' +
          '<button id="aiClearBtn" title="清空对话">🗑️</button>' +
          '<button id="aiCloseBtn" title="收起">▼</button>' +
        '</div>' +
      '</div>' +
      '<div class="ai-panel-messages" id="aiMessages">' +
        '<div class="ai-msg assistant">' +
          '你好！我是盲盒福袋搭配助手 🤖<br><br>' +
          '我可以帮你：<br>' +
          '🔮 <b>自动搭配</b> — 告诉我要多少个产品、预算多少<br>' +
          '⚖️ <b>调优权重</b> — 调整稀有/欧皇的出现概率<br>' +
          '💰 <b>价格测算</b> — 计算合理的单抽价格<br>' +
          '📊 <b>分析诊断</b> — 检查搭配方案是否合理<br><br>' +
          '试试说「帮我搭配一套200元以内的福袋」～' +
        '</div>' +
      '</div>' +
      '<div class="ai-panel-input-area">' +
        '<textarea id="aiInput" placeholder="描述你的搭配需求..." rows="1"></textarea>' +
        '<button id="aiSendBtn">发送</button>' +
      '</div>';
    document.getElementById('aiPanelRoot').appendChild(wrapper);
    this.root = wrapper;
  },

  // 渲染消息列表
  renderMessages: function () {
    var container = document.getElementById('aiMessages');
    if (!container) return;

    var html = '';
    if (this.messages.length === 0) {
      html = '<div class="ai-msg assistant">你好！请描述你的搭配需求。</div>';
    } else {
      this.messages.forEach(function (msg, i) {
        var isStreaming = msg._streaming ? ' streaming' : '';
        html += '<div class="ai-msg ' + msg.role + isStreaming + '">';
        html += AIPanel.formatContent(msg.content);
        html += '</div>';
      });
    }
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  },

  // 格式化消息内容（解析 [ACTION] 和 [WARN] 标记）
  formatContent: function (text) {
    if (!text) return '';
    var out = escapeHtml(text);

    // 解析 [WARN:...]
    out = out.replace(/\[WARN:([^\]]+)\]/g,
      '<div class="ai-warn">⚠️ $1</div>');

    // 解析 [ACTION:apply_products]
    out = out.replace(/\[ACTION:apply_products\]([\s\S]*?)\[\/ACTION\]/g,
      function (match, jsonStr) {
        try {
          var products = JSON.parse(jsonStr);
          var tableHtml = '<div class="ai-action-card">' +
            '<div class="ai-action-title">📦 推荐搭配方案</div>' +
            '<table style="width:100%;font-size:11px;border-collapse:collapse;">' +
            '<tr style="color:var(--text3)"><th style="text-align:left;padding:4px">ID</th><th style="text-align:left;padding:4px">名称</th><th style="text-align:left;padding:4px">等级</th><th style="text-align:right;padding:4px">成本</th></tr>';
          products.forEach(function (p) {
            tableHtml += '<tr><td style="padding:4px">' + escapeHtml(p.id) + '</td>' +
              '<td style="padding:4px">' + escapeHtml(p.name) + '</td>' +
              '<td style="padding:4px">' + escapeHtml(p.tier) + '</td>' +
              '<td style="text-align:right;padding:4px">¥' + (p.cost || 0) + '</td></tr>';
          });
          tableHtml += '</table>' +
            '<button class="ai-action-btn" onclick="AIPanel.applyProducts(\'' +
            encodeURIComponent(jsonStr) + '\')">✅ 一键应用此搭配</button></div>';
          return tableHtml;
        } catch (e) {
          return match;
        }
      });

    // 解析 [ACTION:apply_config]
    out = out.replace(/\[ACTION:apply_config\]([\s\S]*?)\[\/ACTION\]/g,
      function (match, jsonStr) {
        try {
          var config = JSON.parse(jsonStr);
          var configHtml = '<div class="ai-action-card">' +
            '<div class="ai-action-title">⚙️ 推荐参数调整</div>' +
            '<pre style="font-size:11px;color:var(--text2);margin:4px 0">' +
            JSON.stringify(config, null, 2) + '</pre>' +
            '<button class="ai-action-btn" onclick="AIPanel.applyConfig(\'' +
            encodeURIComponent(jsonStr) + '\')">⚙️ 应用此参数</button></div>';
          return configHtml;
        } catch (e) {
          return match;
        }
      });

    return out;
  },

  // 应用产品搭配
  applyProducts: function (encodedJson) {
    try {
      var products = JSON.parse(decodeURIComponent(encodedJson));
      if (!Array.isArray(products) || products.length === 0) {
        showToast('无效的搭配数据', true);
        return;
      }
      // 清空当前产品列表
      state.products = [];
      // 添加推荐产品
      products.forEach(function (p) {
        addProduct({
          id: p.id,
          name: p.name,
          tier: p.tier || '普通',
          cost: p.cost || 10,
          marketPrice: p.marketPrice || null
        });
      });
      renderAll();
      showToast('已应用 AI 推荐的 ' + products.length + ' 个产品');
    } catch (e) {
      showToast('应用搭配失败: ' + e.message, true);
    }
  },

  // 应用配置参数
  applyConfig: function (encodedJson) {
    try {
      var config = JSON.parse(decodeURIComponent(encodedJson));
      if (config.tierRatios) {
        state.tierRatios = config.tierRatios;
      }
      if (typeof config.targetMargin === 'number') {
        state.targetMargin = config.targetMargin;
      }
      if (config.totalWeight) {
        state.totalWeight = config.totalWeight;
      }
      syncConfigToUI();
      renderAll();
      showToast('已应用 AI 推荐的参数');
    } catch (e) {
      showToast('应用配置失败: ' + e.message, true);
    }
  },

  // 发送消息
  sendMessage: function () {
    if (this.isStreaming) return;

    var input = document.getElementById('aiInput');
    var text = (input.value || '').trim();
    if (!text) return;

    var sendBtn = document.getElementById('aiSendBtn');
    input.value = '';
    input.style.height = 'auto';

    // 添加用户消息
    this.messages.push({ role: 'user', content: text });
    this.saveHistory();
    this.renderMessages();

    // 添加 AI 响应占位
    var aiMsg = { role: 'assistant', content: '', _streaming: true };
    this.messages.push(aiMsg);
    this.renderMessages();

    this.isStreaming = true;
    sendBtn.disabled = true;

    // 构建上下文
    var context = {
      products: state.products,
      config: {
        totalWeight: state.totalWeight,
        tierRatios: state.tierRatios,
        targetMargin: state.targetMargin,
        priceMode: state.priceMode
      },
      pool: productPool
    };

    // 如果有计算结果，也加入上下文
    try {
      var result = compute();
      context.results = {
        expectedCost: result.expectedCost,
        price: result.price,
        actualMargin: result.actualMargin
      };
    } catch (e) { }

    // 发起 SSE 流式请求
    var self = this;
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: text }],
        context: context
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (err) {
          throw new Error(err.error || '请求失败');
        });
      }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function read() {
        reader.read().then(function (result) {
          if (result.done) {
            self.finishStream();
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || '';

          lines.forEach(function (line) {
            if (line.startsWith('data: ')) {
              var dataStr = line.slice(6);
              if (dataStr.startsWith(':')) return; // 心跳

              try {
                var chunk = JSON.parse(dataStr);
                if (chunk.type === 'text') {
                  aiMsg.content += chunk.content;
                  self.renderMessages();
                } else if (chunk.type === 'done') {
                  self.finishStream();
                } else if (chunk.type === 'error') {
                  aiMsg.content = '❌ ' + chunk.content;
                  self.finishStream();
                }
              } catch (e) { }
            }
          });

          read();
        }).catch(function () {
          self.finishStream();
        });
      }

      read();
    }).catch(function (err) {
      aiMsg.content = '❌ 请求失败: ' + err.message;
      self.finishStream();
    });
  },

  // 结束流式输出
  finishStream: function () {
    var lastMsg = this.messages[this.messages.length - 1];
    if (lastMsg) {
      lastMsg._streaming = false;
    }
    this.isStreaming = false;
    var sendBtn = document.getElementById('aiSendBtn');
    if (sendBtn) sendBtn.disabled = false;
    this.saveHistory();
    this.renderMessages();
  },

  // 切换面板
  toggle: function () {
    var wrapper = document.getElementById('aiPanelWrapper');
    var btn = document.getElementById('aiTriggerBtn');
    if (!wrapper) return;
    this.isOpen = !this.isOpen;
    wrapper.classList.toggle('collapsed', !this.isOpen);
    if (btn) btn.classList.toggle('hidden', this.isOpen);
    if (this.isOpen) {
      this.renderMessages();
      var input = document.getElementById('aiInput');
      if (input) setTimeout(function () { input.focus(); }, 300);
    }
  },

  open: function () {
    if (!this.isOpen) this.toggle();
  },

  close: function () {
    if (this.isOpen) this.toggle();
  },

  // 绑定事件
  bindEvents: function () {
    var self = this;

    // 面板头部点击
    var header = document.getElementById('aiPanelHeader');
    if (header) {
      header.addEventListener('click', function (e) {
        if (e.target.closest('button')) return; // 按钮不触发
        self.toggle();
      });
    }

    // 关闭按钮
    var closeBtn = document.getElementById('aiCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        self.close();
      });
    }

    // 清空按钮
    var clearBtn = document.getElementById('aiClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        self.clearHistory();
      });
    }

    // 发送按钮
    var sendBtn = document.getElementById('aiSendBtn');
    if (sendBtn) {
      sendBtn.addEventListener('click', function () {
        self.sendMessage();
      });
    }

    // 输入框回车发送
    var input = document.getElementById('aiInput');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          self.sendMessage();
        }
      });
      // 自动调整高度
      input.addEventListener('input', function () {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });
    }
  }
};
```

- [ ] **Step 3: 在 index.html 中引入 AI 面板**

在 `frontend/index.html` 的 `</body>` 前添加：

```html
<link rel="stylesheet" href="css/ai-panel.css">
<script src="js/ai-panel.js"></script>
<script>
// 在 app.js 的 init() 之后初始化 AI 面板
document.addEventListener('DOMContentLoaded', function () {
  AIPanel.init();
});
</script>
```

- [ ] **Step 4: 验证 AI 面板渲染**

```bash
cd "d:/克劳德 Code/backend" && node server.js &
sleep 2
echo "访问 http://localhost:8088 验证："
echo "1. 右下角有 🤖 浮动按钮"
echo "2. 点击打开 AI 对话面板"
echo "3. 面板可折叠/展开"
echo "4. 历史对话持久化（刷新后保留）"
kill %1 2>/dev/null
```

- [ ] **Step 5: Commit**

```bash
git add frontend/css/ai-panel.css frontend/js/ai-panel.js frontend/index.html
git commit -m "feat: Phase 3 — AI 对话面板前端组件，SSE 流式渲染 + Action 解析"
```

---

### Task 10: 智能搭配快捷表单

**Files:**
- Create: `frontend/js/quick-match.js`

**Interfaces:**
- Consumes: Task 2 的 `api.js`（`MatchAPI`），Task 3 的 `state.js`
- Produces: `QuickMatch` 全局对象：`QuickMatch.open()` 弹出表单，结果带「一键应用」

- [ ] **Step 1: 创建 frontend/js/quick-match.js**

```javascript
'use strict';

// ===== 智能搭配快捷表单 =====
var QuickMatch = {
  open: function () {
    if (productPool.length === 0) {
      showToast('产品池为空，请先导入产品或从 Steam 查询添加', true);
      return;
    }
    this.renderModal();
  },

  renderModal: function () {
    // 移除已存在的弹窗
    var existing = document.getElementById('quickMatchOverlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'quickMatchOverlay';
    overlay.innerHTML =
      '<div class="modal" style="max-width:480px">' +
        '<div class="modal-header">' +
          '<h2>🤖 智能搭配</h2>' +
          '<button class="modal-close" onclick="QuickMatch.close()">✕</button>' +
        '</div>' +
        '<div class="modal-body" style="padding:20px">' +
          '<div class="form-group">' +
            '<label>📦 产品数量</label>' +
            '<input type="number" id="qmCount" value="5" min="1" max="50" step="1">' +
          '</div>' +
          '<div class="form-group">' +
            '<label>💰 总成本上限 (¥)</label>' +
            '<input type="number" id="qmMaxCost" value="300" min="1" step="1">' +
          '</div>' +
          '<div class="form-group">' +
            '<label>⭐ 稀有最少</label>' +
            '<input type="number" id="qmMinRare" value="1" min="0" step="1">' +
          '</div>' +
          '<div class="form-group">' +
            '<label>👑 欧皇最少</label>' +
            '<input type="number" id="qmMinJackpot" value="1" min="0" step="1">' +
          '</div>' +
          '<div class="form-group">' +
            '<label>💎 目标利润率 (%)</label>' +
            '<input type="number" id="qmMargin" value="' + state.targetMargin + '" min="0" max="99" step="0.1">' +
          '</div>' +
          '<div class="form-group">' +
            '<label>🎮 偏好类别 (可选)</label>' +
            '<input type="text" id="qmCategory" placeholder="如: FPS, 策略, RPG">' +
          '</div>' +
          '<div class="form-group">' +
            '<label>📝 补充说明 (可选)</label>' +
            '<textarea id="qmNote" rows="2" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;font-family:var(--font);resize:vertical" placeholder="如: 春节福袋主题、偏向热门游戏..."></textarea>' +
          '</div>' +
          '<div style="font-size:12px;color:var(--text3);margin-bottom:12px">' +
            '产品池共 <b>' + productPool.length + '</b> 个产品，AI 将从中智能筛选搭配' +
          '</div>' +
          '<div id="qmResult" style="display:none;margin-bottom:12px"></div>' +
          '<div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px">' +
            '<button class="btn" onclick="QuickMatch.close()">取消</button>' +
            '<button class="btn btn-accent" id="qmSubmitBtn" onclick="QuickMatch.submit()">🚀 开始搭配</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // 点击遮罩关闭
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) QuickMatch.close();
    });
  },

  close: function () {
    var overlay = document.getElementById('quickMatchOverlay');
    if (overlay) overlay.remove();
  },

  submit: function () {
    var submitBtn = document.getElementById('qmSubmitBtn');
    var constraints = {
      count: parseInt(document.getElementById('qmCount').value, 10) || 5,
      maxCost: parseFloat(document.getElementById('qmMaxCost').value) || 300,
      minRare: parseInt(document.getElementById('qmMinRare').value, 10) || 1,
      minJackpot: parseInt(document.getElementById('qmMinJackpot').value, 10) || 1,
      targetMargin: parseFloat(document.getElementById('qmMargin').value) || 30,
      preferCategory: (document.getElementById('qmCategory').value || '').trim(),
      note: (document.getElementById('qmNote').value || '').trim()
    };

    // 基本校验
    if (constraints.count <= 0) {
      showToast('产品数量必须大于 0', true); return;
    }
    if (constraints.minRare + constraints.minJackpot > constraints.count) {
      showToast('稀有+欧皇数量不能超过总产品数', true); return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ 分析中...';

    // 构建产品池数据（含 Steam 字段）
    var poolData = productPool.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        tier: p.tier || '普通',
        cost: p.cost || 10,
        marketPrice: p.marketPrice,
        steamCategory: p.steamCategory,
        hotScore: p.hotScore
      };
    });

    var self = this;
    MatchAPI.match({ pool: poolData, constraints: constraints }).then(function (data) {
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 开始搭配';

      if (data.plan && data.plan.products && data.plan.products.length > 0) {
        self.showResult(data.plan);
      } else {
        showToast('AI 未能生成有效搭配，请调整条件重试', true);
      }
    }).catch(function (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 开始搭配';
      showToast('搭配失败: ' + err.message, true);
    });
  },

  showResult: function (plan) {
    var resultDiv = document.getElementById('qmResult');
    resultDiv.style.display = 'block';

    var html = '<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px">';
    html += '<div style="font-weight:600;margin-bottom:8px;color:var(--success)">✅ 搭配完成！</div>';

    if (plan.reasoning) {
      html += '<div style="font-size:12px;color:var(--text2);margin-bottom:10px;line-height:1.6">💡 ' +
        escapeHtml(plan.reasoning) + '</div>';
    }

    // 产品表格
    html += '<table style="width:100%;font-size:12px;border-collapse:collapse">';
    html += '<tr style="color:var(--text3);border-bottom:1px solid var(--border)">' +
      '<th style="text-align:left;padding:4px">ID</th>' +
      '<th style="text-align:left;padding:4px">名称</th>' +
      '<th style="text-align:left;padding:4px">等级</th>' +
      '<th style="text-align:right;padding:4px">成本</th></tr>';
    var totalCost = 0;
    plan.products.forEach(function (p) {
      totalCost += p.cost || 0;
      html += '<tr><td style="padding:4px">' + escapeHtml(p.id) + '</td>' +
        '<td style="padding:4px">' + escapeHtml(p.name) + '</td>' +
        '<td style="padding:4px">' + escapeHtml(p.tier) + '</td>' +
        '<td style="text-align:right;padding:4px">¥' + (p.cost || 0).toFixed(2) + '</td></tr>';
    });
    html += '<tr style="font-weight:600;border-top:1px solid var(--border)"><td colspan="3" style="padding:4px">合计</td>' +
      '<td style="text-align:right;padding:4px">¥' + totalCost.toFixed(2) + '</td></tr>';
    html += '</table>';

    // 警告
    if (plan.warnings && plan.warnings.length > 0) {
      html += '<div style="margin-top:8px">';
      plan.warnings.forEach(function (w) {
        html += '<div style="font-size:11px;color:var(--warning);padding:4px 0">⚠️ ' + escapeHtml(w) + '</div>';
      });
      html += '</div>';
    }

    html += '<button class="btn btn-accent" style="margin-top:10px;width:100%" onclick="QuickMatch.applyPlan(\'' +
      encodeURIComponent(JSON.stringify(plan)) + '\')">✅ 一键应用到主表格</button>';
    html += '</div>';
    resultDiv.innerHTML = html;
  },

  applyPlan: function (encodedPlan) {
    try {
      var plan = JSON.parse(decodeURIComponent(encodedPlan));
      state.products = [];
      plan.products.forEach(function (p) {
        addProduct({
          id: p.id,
          name: p.name,
          tier: p.tier || '普通',
          cost: p.cost || 10,
          marketPrice: p.marketPrice || null
        });
      });

      if (plan.config) {
        if (plan.config.tierRatios) {
          state.tierRatios = plan.config.tierRatios;
        }
        if (typeof plan.config.targetMargin === 'number') {
          state.targetMargin = plan.config.targetMargin;
        }
      }

      syncConfigToUI();
      renderAll();
      QuickMatch.close();
      showToast('已应用 AI 智能搭配方案 ✨');
    } catch (e) {
      showToast('应用失败: ' + e.message, true);
    }
  }
};
```

- [ ] **Step 2: 在 index.html 引入快速搭配 + 添加触发器**

在 `frontend/index.html` 的脚本区域添加：

```html
<script src="js/quick-match.js"></script>
```

在左侧面板的操作按钮区，修改「智能搭配」按钮为：

```html
<button class="btn btn-accent btn-full" onclick="QuickMatch.open()" style="margin-bottom:8px">
  🔮 智能搭配
</button>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/js/quick-match.js frontend/index.html
git commit -m "feat: Phase 4 — 智能搭配快捷表单 + 一键应用"
```

---

### Task 11: 前端 Steam 查询集成

**Files:**
- Modify: `frontend/js/state.js`
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: Task 2 的 `api.js`（`SteamAPI`），Task 5 的 Steam API
- Produces: 产品池中「🔍 Steam 查询」按钮，输入 AppID → 查询游戏数据 → 自动填充产品信息

- [ ] **Step 1: 在 state.js 中添加 Steam 查询函数**

在 `frontend/js/state.js` 末尾添加：

```javascript
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
```

- [ ] **Step 2: 在产品池弹窗中添加 Steam 按钮**

在 `frontend/index.html` 的产品池弹窗 footer 中添加：

```html
<button class="btn btn-accent btn-sm steam-query-btn" onclick="querySteamApp()" style="margin-right:8px">🔍 从 Steam 查询</button>
<button class="btn btn-sm steam-refresh-btn" onclick="refreshSteamData()">🔄 刷新 Steam 数据</button>
```

- [ ] **Step 3: 在产品表格中显示热度分**

修改 `frontend/js/ui.js` 的 `renderProducts()`，在名称列后显示热度分（如果有）：

```javascript
// 在 renderProducts 的产品名称 td 后添加热度显示
var hotBadge = p.hotScore != null
  ? '<span style="font-size:10px;color:var(--accent);margin-left:4px" title="Steam热度分">🔥' + p.hotScore + '</span>'
  : '';
```

- [ ] **Step 4: Commit**

```bash
git add frontend/js/state.js frontend/js/ui.js frontend/index.html
git commit -m "feat: Phase 2 — 前端 Steam 查询集成，AppID 搜索 + 批量刷新 + 热度显示"
```

---

### Task 12: 整合测试 + 部署文档

**Files:**
- Modify: `backend/server.js`（确保所有路由正确挂载）
- Create: `README.md`（更新部署说明）

**Interfaces:**
- Consumes: Task 1-11 全部
- Produces: 完整可运行的应用 + 部署文档

- [ ] **Step 1: 端到端验证清单**

确认以下流程正常工作：

```bash
cd "d:/克劳德 Code/backend"

# 1. 启动服务
node server.js &
sleep 2

# 2. 验证页面加载
curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/
# 期望: 200

# 3. 验证产品库 API
curl -s http://localhost:8088/api/products
# 期望: {"products":[],"pool":[]}

# 4. 验证 Steam API（需网络）
curl -s http://localhost:8088/api/steam/app/730 | head -c 200
# 期望: 返回 CS2 游戏数据

# 5. 验证 AI 聊天 API（需配置 API Key）
curl -s -X POST http://localhost:8088/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"测试"}],"context":{}}' | head -c 200
# 期望: SSE data 流（或有意义的错误信息）

# 6. 验证智能搭配 API
curl -s -X POST http://localhost:8088/api/match \
  -H "Content-Type: application/json" \
  -d '{"pool":[{"id":"1","name":"测试","tier":"普通","cost":10}],"constraints":{"count":1,"maxCost":100,"minRare":0,"minJackpot":0,"targetMargin":30}}' | head -c 200
# 期望: AI 搭配结果

kill %1 2>/dev/null
```

- [ ] **Step 2: 更新 README.md**

```bash
echo "# 盲盒福袋搭配工具 v4.0

## 快速开始

### 1. 配置 API Key

\`\`\`bash
cd backend
cp .env.example .env
\`\`\`

编辑 \`.env\`，填入：
- \`ANTHROPIC_API_KEY\` — 从 https://console.anthropic.com/ 获取
- \`STEAM_API_KEY\` — 从 https://steamcommunity.com/dev/apikey 免费获取（可选，不填则无法获取在线玩家数）

### 2. 安装依赖

\`\`\`bash
cd backend && npm install
\`\`\`

### 3. 启动

\`\`\`bash
npm start
\`\`\`

访问 http://localhost:8088

### 4. 使用 AI 功能

- **对话模式**：点击右下角 🤖 按钮，用自然语言描述需求
- **快捷模式**：点击左侧「🔮 智能搭配」按钮，填写参数一键生成
- **Steam 查询**：在产品池中点击「🔍 从 Steam 查询」，输入游戏 AppID

## 部署到服务器

\`\`\`bash
# 使用 PM2 守护
npm install -g pm2
pm2 start backend/server.js --name blind-box
pm2 save
\`\`\`

## 技术栈

- 前端：原生 HTML + CSS + Vanilla JS
- 后端：Node.js + Express
- AI：Claude API (Anthropic SDK) + SSE 流式
- 数据：Steam Store API + ISteamUserStats" > README.md
```

- [ ] **Step 3: 最终 Commit**

```bash
git add backend/server.js README.md
git commit -m "feat: Phase 6 — 整合完成，端到端验证 + 部署文档 v4.0"
```

---

### Task 13: 同步部署到 GitHub

- [ ] **Step 1: 推送所有更改**

```bash
cd "d:/克劳德 Code"
git add -A
git commit -m "v4.0: AI 智能体集成 — 对话搭配 + Steam 数据 + 智能一键搭配"
git push origin main
```

- [ ] **Step 2: 更新 GitHub Pages 内容**

通过 API 同步最新版 `blind-box-suite.html` 到 `atienomilka2019-dotcom/blind-box` 仓库的 GitHub Pages。

或者：用户自行运行 `node backend/server.js` 在自己电脑上使用完整版（含 AI 功能），GitHub Pages 上的版本作为纯前端预览版。

---

## 完成标志

- [x] Phase 1: Express 框架 + 前后端拆分完成
- [x] Phase 2: Steam API 数据查询完成
- [x] Phase 3: AI 对话面板可用
- [x] Phase 4: 智能搭配 API 可用
- [x] Phase 5: Action 标记解析 + 一键应用完成
- [x] Phase 6: 整合测试 + 部署文档完成
