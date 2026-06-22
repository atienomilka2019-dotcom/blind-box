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
