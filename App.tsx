import React, { useEffect, useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

/* ── Types ─────────────────────────────────────────────── */
type Company = 'baichen' | 'jinyi';

interface Product {
  id: string;
  code: string;
  spec: string;
  unit: string;
  listPrice: number;
  discountRate: number;
  netPrice: number;
  category: string;
  notes: string;
  company?: string;
  pipeType?: string;
  brand?: string;
  maker?: string;
}

/* ── Config ─────────────────────────────────────────────── */
const BC_COLOR = '#1D4ED8';
const BC_LIGHT = '#EFF6FF';
const JY_COLOR = '#B45309';
const JY_LIGHT = '#FFFBEB';

const BAICHEN_CATS: string[] = ['塑膠管', '鋼管'];
const JINYI_CATS:  string[] = ['PVC絕緣電線', 'PVC電力電纜', 'XLPE電力電纜', '耐燃耐熱電纜'];
const COMPANY_CATS: Record<Company, string[]> = {
  baichen: BAICHEN_CATS,
  jinyi: JINYI_CATS,
};
const CATEGORY_ALIASES: Record<string, string> = {
  PVC管: '塑膠管',
  不鏽鋼管: '鋼管',
  XLPE電纜: 'XLPE電力電纜',
  XLPE電力電纜: 'XLPE電力電纜',
  HR: '耐燃耐熱電纜',
  FR: '耐燃耐熱電纜',
  'HR耐熱電纜&FR耐燃電纜': '耐燃耐熱電纜',
};

const getColor = (c: Company) => c === 'baichen' ? BC_COLOR : JY_COLOR;
const getLight = (c: Company) => c === 'baichen' ? BC_LIGHT : JY_LIGHT;
const normalizeCategory = (category: string) => CATEGORY_ALIASES[category.trim()] || category.trim();
const normalizeProduct = (p: Product): Product => ({ ...p, category: normalizeCategory(p.category) });

/* ── Login Screen ──────────────────────────────────────── */
const LoginScreen: React.FC<{ onLogin: (token: string) => void }> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '登入失敗'); return; }
      localStorage.setItem('auth_token', data.token);
      onLogin(data.token);
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">🏗</div>
          <h1 className="login-title">材料牌價折數查詢系統</h1>
          <p className="login-sub">百晨管材 × 錦億線材</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-label">帳號</label>
            <input
              className="login-input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="login-field">
            <label className="login-label">密碼</label>
            <input
              className="login-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? '登入中…' : '登入'}
          </button>
        </form>
      </div>
    </div>
  );
};

/* ── Helpers ───────────────────────────────────────────── */
const DISCOUNT_MIN = 50;
const DISCOUNT_MAX = 400;
const DISCOUNT_STEP = 5;

const fmtDiscount = (d: number) => `${Number.isInteger(d) ? d : d.toFixed(1)}%`;
const shortSpec   = (spec: string) => spec.replace(/\s*\([^)]*\)/g, '').trim();

const discountBadge = (d: number): { color: string; bg: string } => {
  if (d >= 80) return { color: '#059669', bg: '#ECFDF5' };
  if (d >= 75) return { color: '#1D4ED8', bg: '#EFF6FF' };
  if (d >= 70) return { color: '#B45309', bg: '#FFFBEB' };
  return { color: '#DC2626', bg: '#FEF2F2' };
};

const formatDateLabel = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`;

const excelSerialToDate = (serial: number) => {
  const utcDays = Math.floor(serial - 25569);
  return new Date(utcDays * 86400 * 1000);
};

const parseValidityDate = (notes: string): Date | null => {
  const raw = String(notes ?? '').trim();
  if (!raw) return null;

  if (/^\d{5}(\.\d+)?$/.test(raw)) return excelSerialToDate(Number(raw));

  const dateParts = raw.split(/\s*[-~至]\s*/).filter(Boolean);
  const dateText = dateParts[dateParts.length - 1] || raw;
  const m = dateText.match(/^(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})$/);
  if (!m) return null;

  let a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  let c = parseInt(m[3], 10);

  if (a >= 1000 || a >= 100) {
    const year = a < 1911 ? a + 1911 : a;
    return new Date(year, b - 1, c);
  }

  if (c < 100) c += 2000;
  return new Date(c, a - 1, b);
};

const getValidityInfo = (notes: string) => {
  const expiry = parseValidityDate(notes);
  if (!expiry) return null;
  const now = new Date();
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const expiryStr = formatDateLabel(expiry);
  if (daysLeft < 0)  return { color: '#DC2626', bg: '#FEF2F2', label: '已過期' };
  if (daysLeft < 30) return { color: '#D97706', bg: '#FFFBEB', label: `${daysLeft}天到期` };
  return { color: '#059669', bg: '#ECFDF5', label: expiryStr };
};

const isJinyiProduct = (p: Product) =>
  p.company === 'jinyi' || (!p.company && JINYI_CATS.includes(p.category));

type ImportRow = Record<string, string | number>;

const normalizeHeader = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, '').toLowerCase();
const normalizeSheetName = (value: string) => value.trim().replace(/\s+/g, '');

const HEADER_ALIASES: Record<string, keyof ImportRow> = {
  品名: 'code',
  品號: 'code',
  型號: 'code',
  料號: 'code',
  編號: 'code',
  code: 'code',
  規格: 'spec',
  尺寸: 'spec',
  線徑: 'spec',
  spec: 'spec',
  單位: 'unit',
  unit: 'unit',
  牌價: 'listPrice',
  定價: 'listPrice',
  單價: 'listPrice',
  價格: 'listPrice',
  listprice: 'listPrice',
  折數: 'discountRate',
  百分比: 'discountRate',
  折扣: 'discountRate',
  discountrate: 'discountRate',
  類別: 'category',
  分類: 'category',
  category: 'category',
  管類型: 'pipeType',
  管型: 'pipeType',
  pipetype: 'pipeType',
  品牌: 'brand',
  brand: 'brand',
  廠牌: 'maker',
  maker: 'maker',
  有效期: 'notes',
  更新日期: 'notes',
  備注: 'notes',
  備註: 'notes',
  notes: 'notes',
};

const toCsvValue = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const rowsToCsv = (rows: ImportRow[]) => {
  const headers = ['code', 'spec', 'unit', 'listPrice', 'discountRate', 'category', 'pipeType', 'brand', 'maker', 'notes'];
  return [headers.join(','), ...rows.map(row => headers.map(h => toCsvValue(row[h])).join(','))].join('\n');
};

const workbookToImportCsv = async (file: File, company: Company) => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const allowedSheets = new Map(COMPANY_CATS[company].map(name => [normalizeSheetName(name), name]));
  const importedRows: ImportRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const category = allowedSheets.get(normalizeSheetName(sheetName));
    if (!category) continue;

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '', raw: false });
    const headerIndex = rawRows.findIndex(row =>
      row.some(cell => HEADER_ALIASES[normalizeHeader(cell)] === 'listPrice') &&
      row.some(cell => HEADER_ALIASES[normalizeHeader(cell)] === 'discountRate')
    );
    if (headerIndex < 0) continue;

    const headers = rawRows[headerIndex].map(cell => HEADER_ALIASES[normalizeHeader(cell)] || '');
    for (const row of rawRows.slice(headerIndex + 1)) {
      const item: ImportRow = {};
      headers.forEach((header, index) => {
        if (header) item[header] = row[index] ?? '';
      });
      // If the row's category column is an alias (e.g. HR/FR → 耐燃耐熱電纜),
      // preserve the original value as pipeType so rows with identical specs stay distinct.
      const origCat = String(item.category ?? '').trim();
      if (!item.pipeType && origCat && origCat !== category && normalizeCategory(origCat) === category) {
        item.pipeType = origCat;
      }
      item.category = category;
      if (String(item.listPrice ?? '').trim() && String(item.discountRate ?? '').trim()) {
        importedRows.push(item);
      }
    }
  }

  return rowsToCsv(importedRows);
};

/* ── KPI Card ──────────────────────────────────────────── */
const KPICard: React.FC<{
  icon: string; label: string; value: string; sub: string; color: string;
}> = ({ icon, label, value, sub, color }) => (
  <div className="kpi-card">
    <div className="kpi-icon" style={{ background: `${color}18`, color }}>{icon}</div>
    <div className="kpi-value">{value}</div>
    <div className="kpi-label">{label}</div>
    <div className="kpi-sub">{sub}</div>
  </div>
);

/* ── Chart Tooltip ─────────────────────────────────────── */
const ChartTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: string }> =
  ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="chart-tooltip">
        <p className="ct-label">{label}</p>
        {payload.map((item: any, i: number) => (
          <p key={i} style={{ color: item.fill }}>
            {item.name}：{item.name === '百分比'
              ? fmtDiscount(Number(item.value))
              : `NT$ ${Number(item.value).toLocaleString()}`}
          </p>
        ))}
      </div>
    );
  };

/* ── Toast ─────────────────────────────────────────────── */
const Toast: React.FC<{ msg: string; type: 'success' | 'error'; onClose: () => void }> =
  ({ msg, type, onClose }) => (
    <div className={`toast toast-${type}`} onClick={onClose}>
      <span>{type === 'success' ? '✓' : '⚠'}</span>
      <span style={{ flex: 1 }}>{msg}</span>
      <button className="toast-close">✕</button>
    </div>
  );

/* ── Compare Modal ─────────────────────────────────────── */
const CompareModal: React.FC<{
  products: Product[];
  quantities: Record<string, number>;
  color: string;
  onClose: () => void;
}> = ({ products, quantities, color, onClose }) => {
  if (!products.length) return null;

  const FIELDS = [
    ...(products.some(p => p.brand) ? [{ key: 'brand', label: '品牌' }] : []),
    ...(products.some(p => p.maker) ? [{ key: 'maker', label: '廠牌' }] : []),
    { key: 'category',    label: '類別' },
    ...(products.some(p => p.pipeType) ? [{ key: 'pipeType', label: '管類型' }] : []),
    { key: 'code',        label: '品名' },
    { key: 'unit',        label: '單位' },
    { key: 'listPrice',   label: '牌價 (NT$)' },
    { key: 'discountRate',label: '百分比' },
    { key: 'netPrice',    label: '優惠價 (NT$)' },
    { key: 'notes',       label: '有效期' },
  ];

  const fmt = (p: Product, key: string) => {
    if (key === 'listPrice')    return `NT$ ${p.listPrice.toLocaleString()}`;
    if (key === 'netPrice')     return `NT$ ${p.netPrice.toLocaleString()}`;
    if (key === 'discountRate') return fmtDiscount(p.discountRate);
    return String((p as any)[key] || '—');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">比較 {products.length} 個規格</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="compare-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th className="compare-label-col">屬性</th>
                {products.map(p => (
                  <th key={p.id} style={{ color }}>
                    <div className="compare-prod-head">{p.spec}</div>
                    <div className="compare-prod-code">{p.code}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(({ key, label }) => (
                <tr key={key}>
                  <td className="compare-label-col">{label}</td>
                  {products.map(p => (
                    <td key={p.id}>
                      {key === 'netPrice'
                        ? <span style={{ color, fontWeight: 700 }}>{fmt(p, key)}</span>
                        : fmt(p, key)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="compare-extra-row">
                <td className="compare-label-col">數量</td>
                {products.map(p => (
                  <td key={p.id}>
                    <span className="compare-qty-val">
                      {quantities[p.id] ? `${quantities[p.id]} ${p.unit}` : '—'}
                    </span>
                  </td>
                ))}
              </tr>
              <tr className="compare-extra-row">
                <td className="compare-label-col">小計</td>
                {products.map(p => (
                  <td key={p.id}>
                    {quantities[p.id]
                      ? <span style={{ color, fontWeight: 700 }}>
                          NT$ {(p.netPrice * quantities[p.id]).toLocaleString()}
                        </span>
                      : <span style={{ color: '#9CA3AF' }}>—</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ── Product Card (mobile) ─────────────────────────────── */
const ProductCard: React.FC<{
  p: Product; checked: boolean; color: string; qty: number;
  onSelect: () => void; onQtyChange: (v: string) => void;
  onDetail: () => void; showSource: boolean; showPipeType: boolean;
}> = ({ p, checked, color, qty, onSelect, onQtyChange, onDetail, showSource, showPipeType }) => {
  const dc       = discountBadge(p.discountRate);
  const validity = getValidityInfo(p.notes);
  const subtotal = qty > 0 ? p.netPrice * qty : null;
  return (
    <div className={`product-card${checked ? ' pc-selected' : ''}`} onClick={onDetail}>
      <div className="pc-top">
        <div onClick={e => e.stopPropagation()}>
          <input type="checkbox" className="row-cb" checked={checked} onChange={onSelect} />
        </div>
        <div className="pc-main">
          <div className="pc-spec">{p.spec}</div>
          <div className="pc-meta">
            <span className="unit-tag">{p.unit}</span>
            {p.brand && <span className="notes-text">{p.brand}</span>}
            {p.maker && <span className="notes-text">{p.maker}</span>}
            <span className="notes-text">{!showPipeType && p.pipeType ? p.pipeType : p.category}</span>
            {showPipeType && p.pipeType && <span className="notes-text">{p.pipeType}</span>}
            {showSource && (
              <span className="source-badge" style={{
                background: isJinyiProduct(p) ? JY_LIGHT : BC_LIGHT,
                color:      isJinyiProduct(p) ? JY_COLOR  : BC_COLOR,
              }}>{isJinyiProduct(p) ? '錦億' : '百晨'}</span>
            )}
          </div>
        </div>
        {validity && (
          <span className="validity-badge" style={{ color: validity.color, background: validity.bg }}>
            {validity.label}
          </span>
        )}
      </div>
      <div className="pc-pricing">
        <span className="list-price">NT$ {p.listPrice.toLocaleString()}</span>
        <span className="discount-badge" style={{ color: dc.color, background: dc.bg }}>
          {fmtDiscount(p.discountRate)}
        </span>
        <span className="net-price" style={{ color }}>NT$ {p.netPrice.toLocaleString()}</span>
      </div>
      <div className="pc-footer" onClick={e => e.stopPropagation()}>
        <input type="number" className="qty-input" min="0" placeholder="數量"
          value={qty || ''} onChange={e => onQtyChange(e.target.value)} />
        {subtotal !== null && (
          <span className="subtotal-val" style={{ color, marginLeft: 8 }}>
            = NT$ {subtotal.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
};

/* ── Detail Modal ──────────────────────────────────────── */
const DetailModal: React.FC<{
  product: Product; color: string; qty: number;
  onQtyChange: (v: string) => void; onClose: () => void;
}> = ({ product: p, color, qty, onQtyChange, onClose }) => {
  const dc       = discountBadge(p.discountRate);
  const validity = getValidityInfo(p.notes);
  const subtotal = qty > 0 ? p.netPrice * qty : null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel detail-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{p.spec}</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{p.category} · {p.code}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="detail-body">
          <div className="detail-pricing">
            <span className="net-price" style={{ color, fontSize: 22 }}>
              NT$ {p.netPrice.toLocaleString()}
            </span>
            <span className="discount-badge" style={{ color: dc.color, background: dc.bg, fontSize: 14 }}>
              {fmtDiscount(p.discountRate)}
            </span>
            <span className="list-price">原價 NT$ {p.listPrice.toLocaleString()}</span>
          </div>
          <div className="detail-grid">
            {p.brand && <div className="detail-row"><span>品牌</span><span className="notes-text">{p.brand}</span></div>}
            {p.maker && <div className="detail-row"><span>廠牌</span><span className="notes-text">{p.maker}</span></div>}
            {p.pipeType && <div className="detail-row"><span>管類型</span><span className="notes-text">{p.pipeType}</span></div>}
            <div className="detail-row"><span>單位</span><span className="unit-tag">{p.unit}</span></div>
            {validity && (
              <div className="detail-row">
                <span>有效期</span>
                <span className="validity-badge" style={{ color: validity.color, background: validity.bg }}>
                  {validity.label}
                </span>
              </div>
            )}
            <div className="detail-row"><span>更新日期</span><span className="notes-text">{p.notes}</span></div>
          </div>
          <div className="detail-qty" onClick={e => e.stopPropagation()}>
            <span className="filter-label">數量試算</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <input type="number" className="qty-input" min="0" placeholder="0"
                style={{ width: 80 }} value={qty || ''}
                onChange={e => onQtyChange(e.target.value)} />
              {subtotal !== null
                ? <span className="subtotal-val" style={{ color, fontSize: 16 }}>= NT$ {subtotal.toLocaleString()}</span>
                : <span className="notes-text">輸入數量以試算合計</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Main App ──────────────────────────────────────────── */
const App: React.FC = () => {
  const [token, setToken]               = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [products, setProducts]         = useState<Product[]>([]);
  const [loading, setLoading]           = useState(true);
  const [company, setCompany]           = useState<Company>('baichen');
  const [activeCat, setActiveCat]       = useState<string>(BAICHEN_CATS[0]);
  const [search, setSearch]             = useState('');
  const [globalSearch, setGlobalSearch] = useState(false);
  const [sortKey, setSortKey]           = useState<keyof Product | null>(null);
  const [sortAsc, setSortAsc]           = useState(true);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [quantities, setQuantities]     = useState<Record<string, number>>({});
  const [compareOpen, setCompareOpen]   = useState(false);
  const [discountMin, setDiscountMin]   = useState(DISCOUNT_MIN);
  const [discountMax, setDiscountMax]   = useState(DISCOUNT_MAX);
  const [detailProd, setDetailProd]     = useState<Product | null>(null);
  const [toast, setToast]               = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const logout = () => { localStorage.removeItem('auth_token'); setToken(null); };

  const authFetch = (url: string, options: RequestInit = {}) =>
    fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } })
      .then(r => { if (r.status === 401) { logout(); } return r; });

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchProducts = () =>
    authFetch('/api/products')
      .then(r => r.json())
      .then((d: Product[]) => { setProducts(d.map(normalizeProduct)); setLoading(false); })
      .catch(() => setLoading(false));

  useEffect(() => { if (token) fetchProducts(); else setLoading(false); }, [token]);

  const color   = getColor(company);
  const lightBg = getLight(company);

  const switchCompany = (c: Company) => {
    setCompany(c);
    setSearch('');
    setGlobalSearch(false);
    setSortKey(null);
    setSortAsc(true);
    setSelectedIds(new Set());
    setQuantities({});
    setDiscountMin(DISCOUNT_MIN);
    setDiscountMax(DISCOUNT_MAX);
  };

  /* ── Checkbox handlers ───────────────────────────────── */
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  /* ── Quantity ────────────────────────────────────────── */
  const setQty = useCallback((id: string, val: string) => {
    const n = parseInt(val);
    setQuantities(prev => ({ ...prev, [id]: isNaN(n) || n < 0 ? 0 : n }));
  }, []);

  /* ── Delete selected ─────────────────────────────────── */
  const handleDelete = async () => {
    const itemsToDelete = filteredProds.filter(p => selectedIds.has(p.id));
    const idsToDelete = itemsToDelete.map(p => p.id);
    if (!itemsToDelete.length) {
      showToast('請先勾選目前表格中要刪除的品項', 'error');
      return;
    }
    const coName = company === 'baichen' ? '百晨' : '錦億';
    if (!window.confirm(`確認刪除【${coName}】選取的 ${itemsToDelete.length} 筆資料？`)) return;
    try {
      const res = await authFetch('/api/products/batch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete, items: itemsToDelete }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchProducts();
        setSelectedIds(prev => {
          const deleted = new Set(idsToDelete);
          return new Set([...prev].filter(id => !deleted.has(id)));
        });
        if (data.deleted > 0) {
          showToast(`【${coName}】已刪除 ${data.deleted} 筆資料`);
        } else {
          showToast('後端找不到這些資料，請重新整理後再試一次', 'error');
        }
      } else {
        showToast(data.error || '刪除失敗，請重試', 'error');
      }
    } catch {
      showToast('刪除失敗，請重試', 'error');
    }
  };

  /* ── Import CSV ──────────────────────────────────────── */
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const text = isExcel ? await workbookToImportCsv(file, company) : await file.text();
      const res = await authFetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text, company }),
      });
      const data = await res.json();
      const coName = company === 'baichen' ? '百晨' : '錦億';
      if (data.success) {
        await fetchProducts();
        setSelectedIds(new Set());
        if (data.imported === 0) {
          showToast(`【${coName}】匯入 0 筆，請確認檔案工作表與欄位（規格/牌價/折數或百分比）`, 'error');
        } else {
          showToast(`【${coName}】匯入成功：更新 / 新增 ${data.imported} 筆，共 ${data.total} 筆`);
        }
      } else {
        showToast(data.error || '匯入失敗', 'error');
      }
    } catch {
      showToast('匯入失敗，請確認 Excel / CSV 格式', 'error');
    }
  };

  /* ── Export PDF ──────────────────────────────────────── */
  const exportPDF = () => {
    const items = filteredProds.filter(p => selectedIds.has(p.id));
    if (!items.length) { showToast('請先勾選要匯出的品項', 'error'); return; }

    const coName    = company === 'baichen' ? '百晨管材' : '錦億線材';
    const today     = new Date().toLocaleDateString('zh-TW');
    const validDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('zh-TW');

    const rows = items.map(p => {
      const qty   = quantities[p.id] || 1;
      const total = p.netPrice * qty;
      const dc    = discountBadge(p.discountRate);
      return `<tr>
        ${company === 'jinyi' ? `<td>${p.brand || ''}</td><td>${p.maker || ''}</td>` : ''}
        <td>${company === 'jinyi' && p.pipeType ? p.pipeType : p.category}</td>
        ${company === 'baichen' ? `<td>${p.pipeType || ''}</td>` : ''}
        <td style="font-family:monospace;font-size:11px">${p.code}</td>
        <td><strong>${p.spec}</strong></td>
        <td style="text-align:center">${p.unit}</td>
        <td style="text-align:right;color:#999;text-decoration:line-through">NT$&nbsp;${p.listPrice.toLocaleString()}</td>
        <td style="text-align:center"><span style="background:${dc.bg};color:${dc.color};padding:2px 8px;border-radius:100px;font-size:12px;font-weight:700">${fmtDiscount(p.discountRate)}</span></td>
        <td style="text-align:right;font-weight:700;color:#1D4ED8">NT$&nbsp;${p.netPrice.toLocaleString()}</td>
        <td style="text-align:center">${qty}</td>
        <td style="text-align:right;font-weight:700">NT$&nbsp;${total.toLocaleString()}</td>
      </tr>`;
    }).join('');

    const grandTotal = items.reduce((s, p) => s + p.netPrice * (quantities[p.id] || 1), 0);

    const html = `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>${coName} 報價單 ${today}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Noto Sans TC','PingFang TC',sans-serif;padding:32px;color:#111827;font-size:14px}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:3px solid #1D4ED8;padding-bottom:16px}
.co{font-size:22px;font-weight:800;color:#1D4ED8}.doc{font-size:15px;color:#374151;margin-top:4px}
.meta{text-align:right;font-size:13px;color:#6B7280;line-height:1.9}.meta strong{color:#111827}
.validity{display:inline-block;background:#ECFDF5;color:#059669;padding:4px 14px;border-radius:100px;font-size:12px;font-weight:700;margin-bottom:16px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
th{background:#1D4ED8;color:#fff;padding:10px 12px;text-align:left;font-size:12px;font-weight:600}
td{padding:9px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;vertical-align:middle}
tr:nth-child(even) td{background:#F9FAFB}
.total-row td{background:#EFF6FF!important;font-weight:700;font-size:14px;border-top:2px solid #1D4ED8}
.footer{margin-top:20px;font-size:11px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:12px;display:flex;justify-content:space-between}
@media print{body{padding:20px}}
</style></head><body>
<div class="header">
  <div><div class="co">${coName}</div><div class="doc">材料報價單</div></div>
  <div class="meta">
    <div>報價日期：<strong>${today}</strong></div>
    <div>有效期限：<strong>${validDate}</strong></div>
    <div>品項數量：<strong>${items.length} 項</strong></div>
  </div>
</div>
<div class="validity">✓ 本報價單有效期至 ${validDate}</div>
<table>
  <thead><tr>
    ${company === 'jinyi' ? '<th>品牌</th><th>廠牌</th>' : ''}
    <th>類別</th>${company === 'baichen' ? '<th>管類型</th>' : ''}<th>品名</th><th>規格</th>
    <th style="text-align:center">單位</th><th style="text-align:right">牌價</th>
    <th style="text-align:center">百分比</th><th style="text-align:right">優惠單價</th>
    <th style="text-align:center">數量</th><th style="text-align:right">小計</th>
  </tr></thead>
  <tbody>
    ${rows}
    <tr class="total-row">
      <td colspan="${company === 'jinyi' ? 10 : company === 'baichen' ? 9 : 8}" style="text-align:right">合計金額</td>
      <td style="text-align:right;color:#1D4ED8">NT$&nbsp;${grandTotal.toLocaleString()}</td>
    </tr>
  </tbody>
</table>
<div class="footer"><span>內部報價文件 · 請勿對外流通</span><span>百晨管材 × 錦億線材 © 2026</span></div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (!win) { URL.revokeObjectURL(url); showToast('請允許彈出視窗以匯出 PDF', 'error'); return; }
    setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 800);
  };

  /* ── Derived ─────────────────────────────────────────── */
  const companyProds = useMemo(
    () => products.filter(p => {
      if (!COMPANY_CATS[company].includes(p.category)) return false;
      return p.company ? p.company === company : true;
    }),
    [products, company]
  );

  const cats = useMemo(() => {
    return [...COMPANY_CATS[company]];
  }, [company]);

  const cat1 = cats[0] ?? '';
  const cat2 = cats[1] ?? '';

  useEffect(() => {
    if (cats.length > 0 && !cats.includes(activeCat)) setActiveCat(cats[0]);
  }, [cats]);

  const cat1Prods = useMemo(() => companyProds.filter(p => p.category === cat1), [companyProds, cat1]);
  const cat2Prods = useMemo(() => companyProds.filter(p => p.category === cat2), [companyProds, cat2]);

  const avgDiscount = (arr: Product[]) =>
    arr.length
      ? fmtDiscount(arr.reduce((s, p) => s + p.discountRate, 0) / arr.length)
      : '—';

  const isGlobal = globalSearch && search.length > 0;

  const filteredProds = useMemo(() => {
    let list = isGlobal
      ? [...products]
      : companyProds.filter(p => p.category === activeCat);

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.code.toLowerCase().includes(q) ||
        p.spec.toLowerCase().includes(q) ||
        p.notes.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.pipeType || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.maker || '').toLowerCase().includes(q)
      );
    }

    if (discountMin > DISCOUNT_MIN || discountMax < DISCOUNT_MAX) {
      list = list.filter(p => p.discountRate >= discountMin && p.discountRate <= discountMax);
    }

    if (sortKey) {
      list.sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (typeof av === 'number' && typeof bv === 'number')
          return sortAsc ? av - bv : bv - av;
        return sortAsc
          ? String(av).localeCompare(String(bv), 'zh-Hant')
          : String(bv).localeCompare(String(av), 'zh-Hant');
      });
    }
    return list;
  }, [products, companyProds, activeCat, search, sortKey, sortAsc, isGlobal, discountMin, discountMax]);

  const handleSort = (k: keyof Product) => {
    if (sortKey === k) setSortAsc(a => !a);
    else { setSortKey(k); setSortAsc(true); }
  };
  const sortIcon = (k: keyof Product) => sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : '';

  const toggleSelectAll = () => {
    const visibleIds = filteredProds.map(p => p.id);
    const selectedVisibleCount = visibleIds.filter(id => selectedIds.has(id)).length;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selectedVisibleCount === visibleIds.length) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  /* ── Chart Data ──────────────────────────────────────── */
  const chartProds = isGlobal
    ? companyProds.filter(p => p.category === activeCat)
    : filteredProds;

  const discountChartData = useMemo(
    () => chartProds.map(p => ({ spec: shortSpec(p.spec), 百分比: p.discountRate })),
    [chartProds]
  );
  const priceChartData = useMemo(
    () => chartProds.map(p => ({ spec: shortSpec(p.spec), 牌價: p.listPrice, 優惠價: p.netPrice })),
    [chartProds]
  );
  const priceFormatter  = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : String(v);
  const chartInterval   = chartProds.length <= 8 ? 0 : chartProds.length <= 16 ? 1 : Math.ceil(chartProds.length / 8) - 1;
  const chartTickFmt    = (v: string) => v.length > 7 ? v.slice(0, 6) + '…' : v;

  /* ── Computed selection values ───────────────────────── */
  const showPipeType = company === 'baichen';
  const showWireMeta = company === 'jinyi';
  const selectedProds = useMemo(
    () => filteredProds.filter(p => selectedIds.has(p.id)),
    [filteredProds, selectedIds]
  );
  const selectedVisibleCount = selectedProds.length;
  const allVisibleSelected = filteredProds.length > 0 && selectedVisibleCount === filteredProds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const grandTotal = selectedProds
    .filter(p => (quantities[p.id] ?? 0) > 0)
    .reduce((s, p) => s + p.netPrice * quantities[p.id], 0);

  /* ── Render ──────────────────────────────────────────── */
  if (!token) return <LoginScreen onLogin={setToken} />;

  return (
    <div className="app">

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {compareOpen && (
        <CompareModal
          products={selectedProds}
          quantities={quantities}
          color={color}
          onClose={() => setCompareOpen(false)}
        />
      )}

      {detailProd && (
        <DetailModal
          product={detailProd}
          color={color}
          qty={quantities[detailProd.id] || 0}
          onQtyChange={val => setQty(detailProd.id, val)}
          onClose={() => setDetailProd(null)}
        />
      )}

      {/* ── Navbar ──────────────────────────────────────── */}
      <nav className="navbar">
        <div className="container navbar-inner">

          <div className="navbar-left">
            <span className="navbar-title">材料牌價折數查詢系統</span>
            <div className="company-tabs">
              <button
                className={`company-tab${company === 'baichen' ? ' active' : ''}`}
                style={company === 'baichen' ? { background: BC_COLOR, color: '#fff', borderColor: BC_COLOR } : {}}
                onClick={() => switchCompany('baichen')}
              >🔧 百晨</button>
              <button
                className={`company-tab${company === 'jinyi' ? ' active' : ''}`}
                style={company === 'jinyi' ? { background: JY_COLOR, color: '#fff', borderColor: JY_COLOR } : {}}
                onClick={() => switchCompany('jinyi')}
              >⚡ 錦億</button>
            </div>
          </div>

          <div className="navbar-search">
            <div className={`search-wrap${isGlobal ? ' global-active' : ''}`}>
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                placeholder={globalSearch ? '跨供應商搜尋品號、規格…' : '搜尋品號、規格…'}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
            </div>
            <button
              className={`global-btn${globalSearch ? ' active' : ''}`}
              onClick={() => setGlobalSearch(v => !v)}
              title={globalSearch ? '切回單一供應商' : '跨供應商搜尋'}
            >
              🌐
            </button>
          </div>

          <div className="navbar-status">
            <span className="status-dot" style={{ background: color, boxShadow: `0 0 0 2px ${lightBg}` }} />
            <span className="status-text">{company === 'baichen' ? '百晨管材' : '錦億線材'}</span>
            <button className="logout-btn" onClick={logout} title="登出">登出</button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        <div className="container">

          {/* ── Company Hero ────────────────────────────── */}
          <section className="company-hero" style={{ borderLeftColor: color }}>
            <div className="company-hero-inner">
              <div>
                <span className="company-tag" style={{ background: lightBg, color }}>
                  {COMPANY_CATS[company].join(' · ')}
                </span>
                <h1 className="company-title">
                  {company === 'baichen' ? '百晨管材' : '錦億線材'}
                  <span className="company-subtitle">百分比報價查詢</span>
                </h1>
              </div>
              {isGlobal && (
                <div className="global-info">
                  <span className="global-badge">🌐 跨供應商</span>
                  <span className="global-count">找到 {filteredProds.length} 筆</span>
                </div>
              )}
            </div>
          </section>

          {/* ── Product Table ────────────────────────────── */}
          <section className="table-section">
            <div className="table-card">
              <div className="table-header">
                <div>
                  <h3 className="card-title">
                    {isGlobal ? '跨供應商搜尋結果' : `${activeCat} 百分比報價表`}
                  </h3>
                  <p className="card-sub" style={{ marginBottom: 0 }}>
                    {isGlobal ? '全部供應商' : (company === 'baichen' ? '百晨' : '錦億')} ·&nbsp;
                    共 {filteredProds.length} 筆
                    {selectedIds.size > 0 && ` · 已選 ${selectedIds.size} 筆`}
                    {search && ` · 搜尋 "${search}"`}
                    {grandTotal > 0 && ` · 合計 NT$ ${grandTotal.toLocaleString()}`}
                  </p>
                </div>
                <div className="table-toolbar">
                  <label className="toolbar-btn" style={{ cursor: 'pointer' }}>
                    📥 匯入
                    <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportFile} />
                  </label>
                  <button
                    className={`toolbar-btn-ghost${selectedVisibleCount < 2 ? ' is-inactive' : ''}`}
                    onClick={() => {
                      if (selectedVisibleCount < 2) {
                        showToast('請先勾選目前表格中 2 筆以上品項再比較', 'error');
                        return;
                      }
                      setCompareOpen(true);
                    }}
                    title="勾選 2 個以上品項以比較"
                  >
                    ⚖ 比較{selectedVisibleCount >= 2 ? ` (${selectedVisibleCount})` : ''}
                  </button>
                  <button
                    className={`toolbar-btn-ghost${selectedVisibleCount === 0 ? ' is-inactive' : ''}`}
                    onClick={exportPDF}
                    title="匯出選取品項為 PDF 報價單"
                  >
                    📄 報價單
                  </button>
                  <button
                    className={`toolbar-btn-danger${selectedVisibleCount === 0 ? ' is-inactive' : ''}`}
                    onClick={handleDelete}
                  >
                    🗑 刪除{selectedVisibleCount > 0 ? ` (${selectedVisibleCount})` : ''}
                  </button>
                  <span className="updated-tag">更新：2026-05-16</span>
                </div>
              </div>

              {/* ── Category tabs (hidden during global search) ── */}
              {!isGlobal && (
                <div className="cat-tabs" style={{ padding: '0 1.5rem' }}>
                  {cats.map(cat => (
                    <button
                      key={cat}
                      className={`cat-tab${activeCat === cat ? ' active' : ''}`}
                      style={activeCat === cat ? { borderColor: color, color } : {}}
                      onClick={() => { setActiveCat(cat); setSortKey(null); setSortAsc(true); }}
                    >
                      {cat}
                      <span className="cat-tab-count" style={activeCat === cat ? { background: lightBg, color } : {}}>
                        {companyProds.filter(p => p.category === cat).length}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* ── Filter Bar ──────────────────────────────── */}
              <div className="filter-bar">
                <span className="filter-label">折扣篩選</span>
                <div className="filter-range-wrap">
                  <span className="filter-val">{fmtDiscount(discountMin)}</span>
                  <input type="range" className="filter-range" min={DISCOUNT_MIN} max={DISCOUNT_MAX} step={DISCOUNT_STEP}
                    value={discountMin}
                    onChange={e => setDiscountMin(Math.min(Number(e.target.value), discountMax - DISCOUNT_STEP))} />
                  <span className="filter-sep">—</span>
                  <input type="range" className="filter-range" min={DISCOUNT_MIN} max={DISCOUNT_MAX} step={DISCOUNT_STEP}
                    value={discountMax}
                    onChange={e => setDiscountMax(Math.max(Number(e.target.value), discountMin + DISCOUNT_STEP))} />
                  <span className="filter-val">{fmtDiscount(discountMax)}</span>
                </div>
                {(discountMin > DISCOUNT_MIN || discountMax < DISCOUNT_MAX) && (
                  <button className="filter-reset"
                    onClick={() => { setDiscountMin(DISCOUNT_MIN); setDiscountMax(DISCOUNT_MAX); }}>
                    重置
                  </button>
                )}
              </div>

              {loading ? (
                <div className="skeleton-wrap">
                  {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton-row" />)}
                </div>
              ) : (
                <>
                {/* Desktop table */}
                <div className="table-scroll desktop-table">
                  <table className="mat-table">
                    <thead>
                      <tr>
                        <th className="cb-col">
                          <input
                            type="checkbox" className="row-cb"
                            checked={allVisibleSelected}
                            ref={el => { if (el) el.indeterminate = someVisibleSelected; }}
                            onChange={toggleSelectAll}
                          />
                        </th>
                        {isGlobal && <th>來源</th>}
                        {showWireMeta && <th className="sortable col-hide-sm" onClick={() => handleSort('brand')}>品牌{sortIcon('brand')}</th>}
                        {showWireMeta && <th className="sortable col-hide-sm" onClick={() => handleSort('maker')}>廠牌{sortIcon('maker')}</th>}
                        <th className="sortable col-hide-sm" onClick={() => handleSort('category')}>類別{sortIcon('category')}</th>
                        {showPipeType && <th className="sortable col-hide-sm" onClick={() => handleSort('pipeType')}>管類型{sortIcon('pipeType')}</th>}
                        <th className="sortable" onClick={() => handleSort('spec')}>規格{sortIcon('spec')}</th>
                        <th style={{ textAlign: 'center' }}>單位</th>
                        <th className="sortable col-hide-sm" style={{ textAlign: 'right' }} onClick={() => handleSort('listPrice')}>牌價{sortIcon('listPrice')}</th>
                        <th className="sortable" style={{ textAlign: 'center' }} onClick={() => handleSort('discountRate')}>百分比{sortIcon('discountRate')}</th>
                        <th className="sortable" style={{ textAlign: 'right' }} onClick={() => handleSort('netPrice')}>優惠價{sortIcon('netPrice')}</th>
                        <th className="col-hide-sm" style={{ textAlign: 'center' }}>有效期</th>
                        <th style={{ textAlign: 'center' }}>數量</th>
                        <th className="col-hide-sm" style={{ textAlign: 'right' }}>小計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProds.map((p, i) => {
                        const dc       = discountBadge(p.discountRate);
                        const checked  = selectedIds.has(p.id);
                        const validity = getValidityInfo(p.notes);
                        const qty      = quantities[p.id] || 0;
                        const subtotal = qty > 0 ? p.netPrice * qty : null;
                        return (
                          <tr
                            key={p.id}
                            className={`mat-row${i % 2 === 1 ? ' alt' : ''}${checked ? ' selected' : ''}`}
                            onClick={() => toggleSelect(p.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td className="cb-col" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" className="row-cb" checked={checked} onChange={() => toggleSelect(p.id)} />
                            </td>
                            {isGlobal && (
                              <td onClick={e => e.stopPropagation()}>
                                <span className="source-badge" style={{
                                  background: isJinyiProduct(p) ? JY_LIGHT : BC_LIGHT,
                                  color:      isJinyiProduct(p) ? JY_COLOR  : BC_COLOR,
                                }}>
                                  {isJinyiProduct(p) ? '錦億' : '百晨'}
                                </span>
                              </td>
                            )}
                            {showWireMeta && <td className="col-hide-sm"><span className="notes-text">{p.brand || '—'}</span></td>}
                            {showWireMeta && <td className="col-hide-sm"><span className="notes-text">{p.maker || '—'}</span></td>}
                            <td className="col-hide-sm"><span className="notes-text">{!showPipeType && p.pipeType ? p.pipeType : p.category}</span></td>
                            {showPipeType && <td className="col-hide-sm"><span className="notes-text">{p.pipeType || '—'}</span></td>}
                            <td><span className="mat-spec-main">{p.spec}</span></td>
                            <td style={{ textAlign: 'center' }}><span className="unit-tag">{p.unit}</span></td>
                            <td className="col-hide-sm" style={{ textAlign: 'right' }}>
                              <span className="list-price">NT$ {p.listPrice.toLocaleString()}</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="discount-badge" style={{ color: dc.color, background: dc.bg }}>
                                {fmtDiscount(p.discountRate)}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="net-price" style={{ color }}>NT$ {p.netPrice.toLocaleString()}</span>
                            </td>
                            <td className="col-hide-sm" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                              {validity
                                ? <span className="validity-badge" style={{ color: validity.color, background: validity.bg }}>{validity.label}</span>
                                : <span className="notes-text">{p.notes}</span>}
                            </td>
                            <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                              <input
                                type="number" className="qty-input"
                                min="0" placeholder="0"
                                value={qty || ''}
                                onChange={e => setQty(p.id, e.target.value)}
                              />
                            </td>
                            <td className="col-hide-sm" style={{ textAlign: 'right' }}>
                              {subtotal !== null
                                ? <span className="subtotal-val" style={{ color }}>NT$ {subtotal.toLocaleString()}</span>
                                : <span className="notes-text">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredProds.length === 0 && (
                        <tr><td colSpan={12} className="empty-row">無符合條件的品項</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="card-list mobile-cards">
                  {filteredProds.length === 0
                    ? <div className="empty-cards">無符合條件的品項</div>
                    : filteredProds.map(p => (
                        <ProductCard
                          key={p.id}
                          p={p}
                          checked={selectedIds.has(p.id)}
                          color={color}
                          qty={quantities[p.id] || 0}
                          onSelect={() => toggleSelect(p.id)}
                          onQtyChange={val => setQty(p.id, val)}
                          onDetail={() => setDetailProd(p)}
                          showSource={isGlobal}
                          showPipeType={showPipeType}
                        />
                      ))
                  }
                </div>
                </>
              )}
            </div>
          </section>

          {/* ── KPI Cards (below table) ─────────────────── */}
          <section className="kpi-section">
            <div className="kpi-grid">
              <KPICard icon="📦" label={`${cat1}品項`}     value={String(cat1Prods.length)} sub={`項 ${cat1} 規格`} color={color} />
              <KPICard icon="📦" label={`${cat2}品項`}     value={String(cat2Prods.length)} sub={`項 ${cat2} 規格`} color={color} />
              <KPICard icon="🏷️" label={`${cat1}平均百分比`} value={avgDiscount(cat1Prods)}   sub="現行優惠折扣"      color={color} />
              <KPICard icon="🏷️" label={`${cat2}平均百分比`} value={avgDiscount(cat2Prods)}   sub="現行優惠折扣"      color={color} />
            </div>
          </section>

          {/* ── Charts (hidden during global search) ────── */}
          {!isGlobal && (
            <section className="charts-section">
              <div className="chart-card">
                <h3 className="card-title">百分比分佈</h3>
                <p className="card-sub">{activeCat} 各規格優惠百分比</p>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={discountChartData} margin={{ top: 4, right: 12, left: 0, bottom: 55 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis
                        dataKey="spec" tick={{ fontSize: 10, fill: '#9CA3AF' }}
                        axisLine={false} tickLine={false}
                        angle={-40} textAnchor="end" height={60}
                        interval={chartInterval} tickFormatter={chartTickFmt}
                      />
                      <YAxis
                        domain={[DISCOUNT_MIN, DISCOUNT_MAX]} tick={{ fontSize: 11, fill: '#9CA3AF' }}
                        axisLine={false} tickLine={false} width={46}
                        tickFormatter={v => fmtDiscount(Number(v))}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: '#F9FAFB' }} />
                      <Bar dataKey="百分比" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card">
                <h3 className="card-title">牌價 vs 優惠價</h3>
                <p className="card-sub">{activeCat} 各規格價格比較（NT$ / {chartProds[0]?.unit || '單位'}）</p>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={priceChartData} margin={{ top: 4, right: 12, left: 0, bottom: 55 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis
                        dataKey="spec" tick={{ fontSize: 10, fill: '#9CA3AF' }}
                        axisLine={false} tickLine={false}
                        angle={-40} textAnchor="end" height={60}
                        interval={chartInterval} tickFormatter={chartTickFmt}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#9CA3AF' }}
                        axisLine={false} tickLine={false} width={36}
                        tickFormatter={priceFormatter}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: '#F9FAFB' }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                      <Bar dataKey="牌價"  fill="#CBD5E1" radius={[4, 4, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="優惠價" fill={color}  radius={[4, 4, 0, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          )}

        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <span>百晨管材 × 錦億線材 材料牌價折數查詢系統 © 2026</span>
          <span>內部資料 · 請勿對外流通</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
