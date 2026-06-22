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
