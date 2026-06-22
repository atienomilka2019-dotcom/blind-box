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
