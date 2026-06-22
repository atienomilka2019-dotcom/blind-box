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
    // structuredChat 如果成功解析 JSON 会直接返回对象，否则返回 { text: rawText }
    if (result.text) {
      // AI 返回的不是纯 JSON，尝试提取
      var jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (e) {
          return res.json({
            success: true,
            plan: {
              products: [],
              reasoning: result.text,
              config: {},
              warnings: ['AI 返回格式异常，请重试']
            }
          });
        }
      } else {
        return res.json({
          success: true,
          plan: {
            products: [],
            reasoning: result.text,
            config: {},
            warnings: ['AI 返回格式异常，未找到 JSON，请重试']
          }
        });
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
