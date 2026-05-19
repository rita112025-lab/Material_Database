

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = process.cwd();
const app = express();
const port = Number(process.env.PORT || 7860);
const isProduction = process.env.NODE_ENV === 'production';
let importIdSeq = 0;

// Simple CSV line parser (handles quoted fields)
function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur.trim()); cur = '';
    } else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

// discountRate: integer percent, e.g. 75 = 75% of list price
// netPrice = listPrice * discountRate / 100 (rounded to 1 decimal)
let products = [
  // ── 百晨 PVC管 ────────────────────────────────────────
  { id: 'BC-PVC-01', code: 'BC-PVC-015', spec: '15mm (1/2")',  unit: '支', listPrice:   48, discountRate: 75, netPrice:   36.0, category: 'PVC管',  notes: '3m/支，CNS 4834 硬質' },
  { id: 'BC-PVC-02', code: 'BC-PVC-019', spec: '19mm (3/4")',  unit: '支', listPrice:   62, discountRate: 75, netPrice:   46.5, category: 'PVC管',  notes: '3m/支，CNS 4834 硬質' },
  { id: 'BC-PVC-03', code: 'BC-PVC-025', spec: '25mm (1")',    unit: '支', listPrice:   85, discountRate: 75, netPrice:   63.8, category: 'PVC管',  notes: '3m/支，CNS 4834 硬質' },
  { id: 'BC-PVC-04', code: 'BC-PVC-032', spec: '32mm (5/4")', unit: '支', listPrice:  120, discountRate: 72, netPrice:   86.4, category: 'PVC管',  notes: '3m/支，CNS 4834 硬質' },
  { id: 'BC-PVC-05', code: 'BC-PVC-038', spec: '38mm (3/2")', unit: '支', listPrice:  152, discountRate: 72, netPrice:  109.4, category: 'PVC管',  notes: '3m/支，CNS 4834 硬質' },
  { id: 'BC-PVC-06', code: 'BC-PVC-051', spec: '51mm (2")',    unit: '支', listPrice:  205, discountRate: 70, netPrice:  143.5, category: 'PVC管',  notes: '3m/支，CNS 4834 硬質' },
  { id: 'BC-PVC-07', code: 'BC-PVC-063', spec: '63mm (5/2")', unit: '支', listPrice:  298, discountRate: 70, netPrice:  208.6, category: 'PVC管',  notes: '3m/支，CNS 4834 硬質' },
  { id: 'BC-PVC-08', code: 'BC-PVC-076', spec: '76mm (3")',    unit: '支', listPrice:  358, discountRate: 68, netPrice:  243.4, category: 'PVC管',  notes: '3m/支，CNS 4834 硬質' },
  { id: 'BC-PVC-09', code: 'BC-PVC-100', spec: '100mm (4")',   unit: '支', listPrice:  535, discountRate: 68, netPrice:  363.8, category: 'PVC管',  notes: '3m/支，CNS 4834 硬質' },
  { id: 'BC-PVC-10', code: 'BC-PVC-152', spec: '152mm (6")',   unit: '支', listPrice:  920, discountRate: 65, netPrice:  598.0, category: 'PVC管',  notes: '3m/支，CNS 4834 硬質' },

  // ── 百晨 不鏽鋼管 ─────────────────────────────────────
  { id: 'BC-SS-01', code: 'BC-SS-015', spec: '15A (1/2")',  unit: '支', listPrice:   185, discountRate: 68, netPrice:   125.8, category: '不鏽鋼管', notes: '6m/支，SUS304，Sch.10S' },
  { id: 'BC-SS-02', code: 'BC-SS-020', spec: '20A (3/4")',  unit: '支', listPrice:   255, discountRate: 68, netPrice:   173.4, category: '不鏽鋼管', notes: '6m/支，SUS304，Sch.10S' },
  { id: 'BC-SS-03', code: 'BC-SS-025', spec: '25A (1")',    unit: '支', listPrice:   365, discountRate: 65, netPrice:   237.3, category: '不鏽鋼管', notes: '6m/支，SUS304，Sch.10S' },
  { id: 'BC-SS-04', code: 'BC-SS-032', spec: '32A (5/4")', unit: '支', listPrice:   495, discountRate: 65, netPrice:   321.8, category: '不鏽鋼管', notes: '6m/支，SUS304，Sch.10S' },
  { id: 'BC-SS-05', code: 'BC-SS-040', spec: '40A (3/2")', unit: '支', listPrice:   635, discountRate: 63, netPrice:   400.1, category: '不鏽鋼管', notes: '6m/支，SUS304，Sch.10S' },
  { id: 'BC-SS-06', code: 'BC-SS-050', spec: '50A (2")',    unit: '支', listPrice:   875, discountRate: 63, netPrice:   551.3, category: '不鏽鋼管', notes: '6m/支，SUS304，Sch.10S' },
  { id: 'BC-SS-07', code: 'BC-SS-065', spec: '65A (5/2")', unit: '支', listPrice:  1240, discountRate: 60, netPrice:   744.0, category: '不鏽鋼管', notes: '6m/支，SUS304，Sch.10S' },
  { id: 'BC-SS-08', code: 'BC-SS-080', spec: '80A (3")',    unit: '支', listPrice:  1690, discountRate: 60, netPrice:  1014.0, category: '不鏽鋼管', notes: '6m/支，SUS304，Sch.10S' },
  { id: 'BC-SS-09', code: 'BC-SS-100', spec: '100A (4")',   unit: '支', listPrice:  2450, discountRate: 58, netPrice:  1421.0, category: '不鏽鋼管', notes: '6m/支，SUS304，Sch.10S' },
  { id: 'BC-SS-10', code: 'BC-SS-125', spec: '125A (5")',   unit: '支', listPrice:  3650, discountRate: 58, netPrice:  2117.0, category: '不鏽鋼管', notes: '6m/支，SUS304，Sch.10S' },
  { id: 'BC-SS-11', code: 'BC-SS-150', spec: '150A (6")',   unit: '支', listPrice:  4800, discountRate: 55, netPrice:  2640.0, category: '不鏽鋼管', notes: '6m/支，SUS304，Sch.10S' },

  // ── 錦億 電線 (BV 單芯) ────────────────────────────────
  { id: 'JY-BV-01', code: 'JY-BV-125',   spec: '1.25mm²',  unit: 'M', listPrice:    13, discountRate: 80, netPrice:    10.4, category: '電線', notes: '100m/捆，CNS 6059，600V' },
  { id: 'JY-BV-02', code: 'JY-BV-200',   spec: '2.0mm²',   unit: 'M', listPrice:    19, discountRate: 80, netPrice:    15.2, category: '電線', notes: '100m/捆，CNS 6059，600V' },
  { id: 'JY-BV-03', code: 'JY-BV-350',   spec: '3.5mm²',   unit: 'M', listPrice:    32, discountRate: 78, netPrice:    25.0, category: '電線', notes: '100m/捆，CNS 6059，600V' },
  { id: 'JY-BV-04', code: 'JY-BV-550',   spec: '5.5mm²',   unit: 'M', listPrice:    50, discountRate: 78, netPrice:    39.0, category: '電線', notes: '100m/捆，CNS 6059，600V' },
  { id: 'JY-BV-05', code: 'JY-BV-800',   spec: '8mm²',     unit: 'M', listPrice:    72, discountRate: 75, netPrice:    54.0, category: '電線', notes: '100m/捆，CNS 6059，600V' },
  { id: 'JY-BV-06', code: 'JY-BV-1400',  spec: '14mm²',    unit: 'M', listPrice:   122, discountRate: 75, netPrice:    91.5, category: '電線', notes: '100m/捆，CNS 6059，600V' },
  { id: 'JY-BV-07', code: 'JY-BV-2200',  spec: '22mm²',    unit: 'M', listPrice:   190, discountRate: 72, netPrice:   136.8, category: '電線', notes: '100m/捆，CNS 6059，600V' },
  { id: 'JY-BV-08', code: 'JY-BV-3800',  spec: '38mm²',    unit: 'M', listPrice:   310, discountRate: 72, netPrice:   223.2, category: '電線', notes: '100m/捆，CNS 6059，600V' },
  { id: 'JY-BV-09', code: 'JY-BV-6000',  spec: '60mm²',    unit: 'M', listPrice:   480, discountRate: 70, netPrice:   336.0, category: '電線', notes: '100m/捆，CNS 6059，600V' },
  { id: 'JY-BV-10', code: 'JY-BV-10000', spec: '100mm²',   unit: 'M', listPrice:   780, discountRate: 70, netPrice:   546.0, category: '電線', notes: '100m/捆，CNS 6059，600V' },
  { id: 'JY-BV-11', code: 'JY-BV-15000', spec: '150mm²',   unit: 'M', listPrice:  1150, discountRate: 68, netPrice:   782.0, category: '電線', notes: '100m/捆，CNS 6059，600V' },
  { id: 'JY-BV-12', code: 'JY-BV-20000', spec: '200mm²',   unit: 'M', listPrice:  1520, discountRate: 68, netPrice:  1033.6, category: '電線', notes: '100m/捆，CNS 6059，600V' },

  // ── 錦億 電纜 (CVV PVC電力電纜) ───────────────────────
  { id: 'JY-CVV-01', code: 'JY-CVV-2C125',  spec: '2C×1.25mm²', unit: 'M', listPrice:   30, discountRate: 75, netPrice:   22.5, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
  { id: 'JY-CVV-02', code: 'JY-CVV-2C200',  spec: '2C×2.0mm²',  unit: 'M', listPrice:   44, discountRate: 75, netPrice:   33.0, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
  { id: 'JY-CVV-03', code: 'JY-CVV-3C125',  spec: '3C×1.25mm²', unit: 'M', listPrice:   40, discountRate: 75, netPrice:   30.0, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
  { id: 'JY-CVV-04', code: 'JY-CVV-3C200',  spec: '3C×2.0mm²',  unit: 'M', listPrice:   58, discountRate: 75, netPrice:   43.5, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
  { id: 'JY-CVV-05', code: 'JY-CVV-3C350',  spec: '3C×3.5mm²',  unit: 'M', listPrice:   90, discountRate: 72, netPrice:   64.8, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
  { id: 'JY-CVV-06', code: 'JY-CVV-3C550',  spec: '3C×5.5mm²',  unit: 'M', listPrice:  138, discountRate: 72, netPrice:   99.4, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
  { id: 'JY-CVV-07', code: 'JY-CVV-3C800',  spec: '3C×8mm²',    unit: 'M', listPrice:  198, discountRate: 70, netPrice:  138.6, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
  { id: 'JY-CVV-08', code: 'JY-CVV-3C1400', spec: '3C×14mm²',   unit: 'M', listPrice:  330, discountRate: 70, netPrice:  231.0, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
  { id: 'JY-CVV-09', code: 'JY-CVV-3C2200', spec: '3C×22mm²',   unit: 'M', listPrice:  520, discountRate: 68, netPrice:  353.6, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
  { id: 'JY-CVV-10', code: 'JY-CVV-4C200',  spec: '4C×2.0mm²',  unit: 'M', listPrice:   68, discountRate: 75, netPrice:   51.0, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
  { id: 'JY-CVV-11', code: 'JY-CVV-4C350',  spec: '4C×3.5mm²',  unit: 'M', listPrice:  108, discountRate: 72, netPrice:   77.8, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
  { id: 'JY-CVV-12', code: 'JY-CVV-4C550',  spec: '4C×5.5mm²',  unit: 'M', listPrice:  172, discountRate: 70, netPrice:  120.4, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
  { id: 'JY-CVV-13', code: 'JY-CVV-4C800',  spec: '4C×8mm²',    unit: 'M', listPrice:  258, discountRate: 70, netPrice:  180.6, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
  { id: 'JY-CVV-14', code: 'JY-CVV-4C1400', spec: '4C×14mm²',   unit: 'M', listPrice:  435, discountRate: 68, netPrice:  295.8, category: '電纜', notes: '100m/盤，CNS 11175，600V' },
];

// Tag built-in products with company based on id prefix
products = products.map(p => ({
  ...p,
  company: p.id.startsWith('BC-') ? 'baichen' : 'jinyi',
}));
products = [];

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', backend: 'express', mode: isProduction ? 'production' : 'development' });
});

app.get('/api/products', (_req, res) => {
  const { category } = _req.query;
  if (category) {
    return res.json(products.filter(p => p.category === category));
  }
  res.json(products);
});

// Batch delete — must be BEFORE /:id to avoid Express treating "batch" as an id
app.delete('/api/products/batch', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ error: 'ids required' });
  const before = products.length;
  products = products.filter(p => !ids.includes(p.id));
  res.json({ success: true, deleted: before - products.length, remaining: products.length });
});

// Import CSV (upsert by 品名+規格 composite key)
app.post('/api/products/import', (req, res) => {
  const { csv, company } = req.body;
  if (!csv || typeof csv !== 'string')
    return res.status(400).json({ error: 'csv text required' });

  // Strip BOM (Excel CSV saves with UTF-8 BOM) and normalise line endings
  const cleanCsv = csv.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleanCsv.trim().split('\n');
  if (lines.length < 2) return res.status(400).json({ error: 'CSV must have header + at least one row' });

  // Accept both Chinese and English headers
  const hdrMap = {
    '品名': 'code',         code:          'code',
    '品號': 'code',
    '規格': 'spec',         spec:          'spec',
    '單位': 'unit',         unit:          'unit',
    '牌價': 'listPrice',    listprice:     'listPrice',
    '折數': 'discountRate', '百分比': 'discountRate', discountrate:  'discountRate',
    '類別': 'category',     category:      'category',
    '更新日期': 'notes',    notes:         'notes',
    '備注': 'notes',
    '備註': 'notes',
  };

  const headers = parseCSVLine(lines[0]).map(h => {
    const clean = h.trim().replace(/^﻿/, '');
    return hdrMap[clean] || hdrMap[clean.toLowerCase()] || clean;
  });

  const imported = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => { row[h] = vals[j] ?? ''; });

    const listPrice    = parseFloat(row.listPrice)    || 0;
    const discountRate = parseInt(row.discountRate)   || 0;
    if (!row.code || !listPrice || !discountRate) continue;

    const netPrice = parseFloat((listPrice * discountRate / 100).toFixed(1));
    const spec = row.spec || '';
    const uniqueId = `${row.code}__${spec || i}`;
    const prod = {
      id:           uniqueId,
      code:         row.code,
      spec,
      unit:         row.unit    || '支',
      listPrice,
      discountRate,
      netPrice,
      category:     row.category || '',
      notes:        row.notes   || '',
      company:      company || undefined,
    };

    const idx = products.findIndex(p => p.id === uniqueId);
    if (idx >= 0) products[idx] = prod;
    else products.push(prod);
    imported.push(uniqueId);
  }

  res.json({ success: true, imported: imported.length, total: products.length });
});

app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

if (!isProduction) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root,
    server: { middlewareMode: 'ssr' },
    appType: 'custom',
  });
  app.use(vite.middlewares);
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const template = await vite.transformIndexHtml(url, fs.readFileSync(path.join(root, 'index.html'), 'utf-8'));
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (err) {
      vite.ssrFixStacktrace(err);
      next(err);
    }
  });
} else {
  const distPath = path.join(root, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Server running in ${isProduction ? 'production' : 'development'} mode on http://localhost:${port}`);
});
