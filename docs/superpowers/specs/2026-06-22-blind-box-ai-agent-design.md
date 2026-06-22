# 盲盒福袋搭配工具 — AI 智能体集成设计规格书

## 概述

在现有盲盒福袋搭配工具（v3.2）基础上，集成 AI 智能体能力。用户输入产品库和约束条件后，AI 自动完成产品搭配、等级分配、权重设定、价格测算。同时对接 Steam 平台，通过游戏 AppID 自动获取实时价格、热门程度、类别标签，为搭配决策提供数据支撑。

## 技术方案

### 整体架构：前后端分离 + 云端 AI API

```
┌─────────────────────────────────────────────────────┐
│                    浏览器                            │
│  ┌──────────────────────────────────────────────┐   │
│  │              frontend/                        │   │
│  │  index.html    — 主页面（原有搭配工具）        │   │
│  │  css/          — 样式文件                     │   │
│  │  js/                                           │   │
│  │    ├─ app.js       — 原有工具核心逻辑          │   │
│  │    ├─ ai-panel.js  — AI 对话面板组件           │   │
│  │    └─ quick-match.js — 智能搭配快捷表单        │   │
│  └──────────────────────────────────────────────┘   │
│         │  HTTP REST + SSE (流式)                    │
│         ▼                                           │
│  ┌──────────────────────────────────────────────┐   │
│  │              backend/                         │   │
│  │  server.js       — Express 服务入口           │   │
│  │  routes/                                     │   │
│  │    ├─ chat.js        — /api/chat (SSE 流式)  │   │
│  │    ├─ match.js       — /api/match (一键搭配) │   │
│  │    ├─ products.js    — /api/products (CRUD)  │   │
│  │    └─ steam.js       — /api/steam (查询)     │   │
│  │  services/                                   │   │
│  │    ├─ ai-service.js  — Claude API 封装       │   │
│  │    └─ steam-service.js — Steam API 封装      │   │
│  │  data/                                        │   │
│  │    ├─ products.json  — 产品库持久化           │   │
│  │    └─ pool.json      — 产品池数据            │   │
│  │  package.json                                │   │
│  │  .env             — API Key (不上传 Git)      │   │
│  │  .gitignore                                   │   │
│  └──────────────────────────────────────────────┘   │
│         │  HTTPS                                    │
│         ▼                                           │
│  ┌──────────┐    ┌──────────┐                      │
│  │ Claude   │    │ Steam    │                      │
│  │ API      │    │ API      │                      │
│  └──────────┘    └──────────┘                      │
└─────────────────────────────────────────────────────┘
```

### 技术栈

| 层 | 技术选型 | 说明 |
|----|---------|------|
| 前端 | 原生 HTML + CSS + Vanilla JS | 在现有单文件基础上拆分，保持零框架依赖 |
| 后端 | Node.js + Express | 轻量、已有 server.js 基础 |
| AI | Claude API (Anthropic SDK) | 流式 SSE 输出，支持 tool use |
| Steam 数据 | store.steampowered.com API + ISteamUserStats | 前者免费公开，后者需免费 Key |
| 持久化 | JSON 文件 + localStorage | 服务端存产品库，前端存对话历史 |
| 部署 | 单 Node 进程 | `node backend/server.js` 一键启动 |

---

## 数据结构

### 产品（含 Steam 字段）

```javascript
{
  _id: 1,                    // 内部自增 ID
  id: "730",                 // 产品ID / Steam AppID
  name: "Counter-Strike 2",  // 产品名称（Steam 自动获取或手动填写）
  tier: "稀有",              // 等级：稀有/欧皇/普通
  cost: 80,                  // 成本价（手动填写，盲盒采购成本）
  weight: 25,                // 权重（系统计算，只读）
  marketPrice: 0,            // 原价（Steam 自动获取）
  // --- Steam 扩展字段 ---
  steamCategory: "FPS",      // Steam 类别标签
  steamReviews: 10000000,    // Steam 总评论数
  steamRating: 96,           // Steam 好评率 (%)
  steamPlayers: 850000,      // Steam 当前在线玩家数
  steamUpdatedAt: "2026-06-22T11:00:00Z"  // Steam 数据最后更新时间
}
```

### 热度分计算

```
评论分 = min(log10(评论数+1) / log10(10000000), 1) × 100   // 对数归一化
好评分 = 好评率                                               // 0-100
在线分 = min(log10(在线+1) / log10(1000000), 1) × 100       // 对数归一化

热度分 = round(评论分 × 0.3 + 好评分 × 0.3 + 在线分 × 0.4)
```

热度分满分为 100，在 AI 搭配时作为等级分配的重要参考。

---

## 功能模块

### 1. Steam 数据获取

#### 使用的接口

| 接口 | 数据 | 鉴权 |
|------|------|------|
| `https://store.steampowered.com/api/appdetails?appids={appid}&cc=cn` | 游戏名、原价、折扣价、类别标签、总评论数、好评率、开发商 | 公开免费 |
| `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid={appid}` | 当前在线玩家数 | Steam API Key（免费） |

#### 数据流

```
用户输入 Steam AppID → 前端调用 GET /api/steam/app/{appid}
  → 后端并行查询两个 Steam 接口
  → 汇总数据返回前端
  → 自动填充：name, marketPrice, steamCategory, steamReviews, steamRating, steamPlayers
```

#### 价格字段说明

- `marketPrice` = Steam 商店当前价格（原价），如果正在打折则同时显示折扣价供参考
- `cost` = 用户手动填写，代表盲盒的实际采购成本（与 Steam 价格无关）
- Steam 价格仅作参考，不参与权重计算

#### 批量刷新

- 产品池页面新增「🔄 刷新 Steam 数据」按钮
- 遍历所有含 Steam AppID 的产品，批量更新在线人数和价格
- 频率限制：单次请求间隔 ≥1.5 秒（Steam API 要求）

---

### 2. AI 对话面板

#### 布局位置

- 默认：页面右下角可折叠面板
- 展开后占右侧主区域宽度的 40%
- 可与产品表格并排显示，也可全屏展开

#### 交互功能

| 功能 | 描述 |
|------|------|
| 消息流 | SSE 流式逐字输出，打字机效果 |
| 搭配方案 | AI 回复中的搭配方案渲染为表格，附带「✅ 一键应用」按钮 |
| 参数调整 | AI 推荐的参数变更附带「⚙️ 应用参数」按钮 |
| 警告提醒 | 如概率过低、利润为负等，黄色警告卡片 |
| 对话历史 | localStorage 保存最近 20 条，支持清空 |
| 上下文注入 | 每次请求自动附带当前产品列表 + 配置参数 + 计算结果 |

#### 发送给 AI 的上下文格式

```javascript
{
  role: "user",
  content: `[当前系统状态]
产品列表: 5 个产品
  - [P01] CS2 | 等级:稀有 | 成本:80 | 权重:12 | 原价:0 | Steam热度:95
  - [P02] Dota2 | 等级:欧皇 | 成本:50 | 权重:45 | 原价:0 | Steam热度:88
  ...
全局配置: 总权重10000 | 稀有:欧皇:普通=1:3:10 | 目标利润率30%
计算结果: 期望成本¥47.52 | 单抽价格¥67.89 | 实际利润率30.0%

[用户需求]
帮我搭配5个FPS游戏，总成本不超300，利润30%`
}
```

#### AI 回复中的可执行操作

AI 可以在回复中嵌入特殊标记，前端解析为可操作按钮：

```
[ACTION:apply_products][{...产品JSON...}][/ACTION]  → 「一键应用」按钮
[ACTION:apply_config][{...配置JSON...}][/ACTION]     → 「应用参数」按钮
[WARN:稀有概率低于3%]                                 → 黄色警告框
```

---

### 3. 智能搭配快捷模式

#### 触达方式

左侧面板「🔮 智能搭配」按钮（独立于 AI 对话面板）

#### 表单字段

```
┌────────────────────────────────────┐
│ 🤖 智能搭配                         │
│                                    │
│ 产品数量:      [  5  ]  个         │
│ 总成本上限:    [ 300 ]  ¥          │
│ 稀有最少:      [  1  ]  个         │
│ 欧皇最少:      [  1  ]  个         │
│ 目标利润率:    [ 30  ]  %          │
│ 偏好类别:      [FPS,策略] (可选)    │
│ 自然语言补充:  [春节福袋主题...]     │
│                                    │
│         [ 取消 ]  [ 🚀 开始搭配 ]   │
└────────────────────────────────────┘
```

#### 执行流程

1. 前端收集表单 → `POST /api/match`（含当前产品池数据）
2. 后端构建 System Prompt + 产品池数据 + 约束条件 → 发送给 Claude
3. Claude 分析产品池 → 选择最优组合 → 返回搭配方案（JSON 结构化输出）
4. 前端展示结果表格 + 「✅ 一键应用到主表格」按钮
5. 用户点击应用 → 清空当前产品列表 → 填入 AI 推荐的产品和等级 → 自动触发权重计算

---

### 4. API 设计

#### 后端 API 路由一览

| 方法 | 路由 | 说明 |
|------|------|------|
| `POST` | `/api/chat` | AI 对话（SSE 流式响应） |
| `POST` | `/api/match` | 一键智能搭配（返回 JSON） |
| `GET` | `/api/products` | 获取产品库所有产品 |
| `POST` | `/api/products` | 添加产品到产品库 |
| `PUT` | `/api/products/:id` | 更新产品库中产品 |
| `DELETE` | `/api/products/:id` | 删除产品库中产品 |
| `GET` | `/api/steam/app/:appid` | 查询 Steam 游戏信息 |
| `POST` | `/api/steam/refresh` | 批量刷新已存产品的 Steam 数据 |

#### POST /api/chat

```
Request:
{
  "messages": [{ "role": "user", "content": "帮我搭配..." }],
  "context": {
    "products": [...],       // 当前产品列表
    "config": {...},         // 当前配置
    "results": {...}         // 当前计算结果
  },
  "pool": [...]              // 产品池数据
}

Response: SSE stream
data: {"type":"text","content":"我来分析"}
data: {"type":"text","content":"你的产品池..."}
data: {"type":"action","action":"apply_products","data":[...]}
data: {"type":"done"}
```

#### POST /api/match

```
Request:
{
  "pool": [...],            // 产品池
  "constraints": {
    "count": 5,
    "maxCost": 300,
    "minRare": 1,
    "minJackpot": 1,
    "targetMargin": 30,
    "preferCategory": "FPS",
    "note": "春节福袋主题"
  }
}

Response:
{
  "success": true,
  "plan": {
    "products": [...],       // 推荐的产品列表（含等级分配）
    "reasoning": "...",      // AI 的推荐理由
    "config": {...},         // 推荐的全局配置
    "results": {...}         // 预估的计算结果
  }
}
```

#### GET /api/steam/app/:appid

```
Response:
{
  "success": true,
  "appId": "730",
  "name": "Counter-Strike 2",
  "marketPrice": 0,            // 免费游戏
  "discountPrice": null,       // 如有折扣则显示
  "categories": ["FPS", "射击", "多人", "竞技"],
  "reviewCount": 10000000,
  "rating": 96,
  "currentPlayers": 850000,
  "developer": "Valve",
  "publishers": ["Valve"],
  "headerImage": "https://cdn.akamai.steamstatic.com/..."
}
```

---

### 5. 上下文注入策略

AI 对话的 System Prompt 核心指令：

```
你是一个盲盒福袋搭配专家助手。你的能力包括：

1. 产品搭配：根据约束条件（数量、成本、利润率、主题）从产品池选择产品并分配等级
2. 权重分析：理解成本反比权重算法，能调优稀有:欧皇:普通比例
3. 价格测算：基于期望成本和利润率计算合理的单抽价格
4. 问题诊断：检查搭配方案的合理性（稀有概率、保底次数、利润率可实现性）

关键参考指标：
- Steam 热度分高的游戏优先放入"稀有"等级（吸引用户）
- 稀有概率建议保持在 3%-10%，超过 20% 失去稀缺感
- 单抽价格 = 期望成本 / (1 - 利润率)，自动模式下由系统计算
- 总权重越大，权重分配越精细；默认 10000

回复规范：
- 输出搭配方案时，使用 [ACTION:apply_products] 标记
- 输出参数建议时，使用 [ACTION:apply_config] 标记
- 发现问题时，使用 [WARN:...] 标记
- 回复自然亲切，说中文
```

---

### 6. 前端文件结构

```
frontend/
├── index.html          # 主页面（从 blind-box-suite.html 拆分）
├── css/
│   ├── main.css        # 原有样式
│   └── ai-panel.css    # AI 面板样式
├── js/
│   ├── app.js          # 核心工具逻辑（从原有 HTML 提取）
│   ├── state.js        # 状态管理 + localStorage
│   ├── ui.js           # 渲染函数
│   ├── ai-panel.js     # AI 对话面板
│   ├── quick-match.js  # 智能搭配快捷表单
│   └── api.js          # 封装后端 API 调用
└── assets/
    └── icons.svg       # SVG 图标集
```

### 后端文件结构

```
backend/
├── server.js           # Express 入口
├── package.json
├── .env                # ANTHROPIC_API_KEY + STEAM_API_KEY
├── .gitignore
├── routes/
│   ├── chat.js         # /api/chat
│   ├── match.js        # /api/match
│   ├── products.js     # /api/products CRUD
│   └── steam.js        # /api/steam/*
├── services/
│   ├── ai-service.js   # Claude API 封装
│   └── steam-service.js # Steam API 封装
├── data/
│   ├── products.json   # 产品库
│   └── pool.json       # 产品池
└── middleware/
    └── auth.js         # 简单 API Key 验证（可选）
```

---

### 7. 部署

#### 本地运行

```bash
cd backend
npm install
# 编辑 .env 填入 ANTHROPIC_API_KEY 和 STEAM_API_KEY
npm start
# 访问 http://localhost:8088
```

#### 环境变量

```
ANTHROPIC_API_KEY=sk-ant-...
STEAM_API_KEY=XXXXXXXXXXXXXXXX
PORT=8088
```

#### 部署到服务器

- 单进程 Node.js，无需数据库
- 推荐使用 PM2 守护进程
- .env 不提交到 Git
- 前端静态文件由 Express 直接 serve

---

### 8. 安全考虑

| 风险 | 措施 |
|------|------|
| API Key 泄露 | 存在 .env，加入 .gitignore；前端不接触 Key |
| 对话内容泄露 | 对话仅存 localStorage，不上传第三方 |
| Steam API 频率限制 | 批量刷新间隔 ≥1.5 秒；数据缓存 1 小时 |
| Claude API 滥用 | 服务端可加简易速率限制（每用户每分钟最多 5 次） |

---

## 开发阶段划分

| 阶段 | 内容 | 预估复杂度 |
|------|------|-----------|
| Phase 1 | 前后端拆分 + Express 基础框架 | 中 |
| Phase 2 | Steam API 集成 + 热度分计算 | 小 |
| Phase 3 | AI 对话面板（前端 UI + SSE 流式） | 中 |
| Phase 4 | 智能搭配 API（/api/match） | 中 |
| Phase 5 | 一键应用 + Action 标记解析 | 小 |
| Phase 6 | UI 整合 + 测试 + 部署文档 | 小 |

---

## 版本号

当前工具 v3.2 → AI 集成后升级为 **v4.0**
