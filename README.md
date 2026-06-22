# 盲盒福袋搭配工具 v4.0

## 快速开始

### 1. 配置 API Key
```bash
cd backend
cp .env.example .env
```
编辑 `.env`，填入：
- `ANTHROPIC_API_KEY` — 从 https://console.anthropic.com/ 获取
- `STEAM_API_KEY` — 从 https://steamcommunity.com/dev/apikey 免费获取（可选）

### 2. 安装依赖
```bash
cd backend && npm install
```

### 3. 启动
```bash
npm start
```
访问 http://localhost:8088

### 4. 使用 AI 功能
- **对话模式**：点击右下角 🤖 按钮，用自然语言描述需求
- **快捷模式**：点击左侧「🔮 智能搭配」按钮，填写参数一键生成
- **Steam 查询**：在产品池中点击「🔍 从 Steam 查询」，输入游戏 AppID

## 部署到服务器
```bash
npm install -g pm2
pm2 start backend/server.js --name blind-box
pm2 save
```

## 技术栈
- 前端：原生 HTML + CSS + Vanilla JS
- 后端：Node.js + Express
- AI：Claude API (Anthropic SDK) + SSE 流式
- 数据：Steam Store API + ISteamUserStats
