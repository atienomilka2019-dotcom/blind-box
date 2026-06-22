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
