import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
import { useData } from '../../data/DataProvider';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';

const Arrow = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>;
const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>;
const PricingIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const PackageIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>;

interface PricingItem {
  productId: string; templateId: string; productName: string; code: string;
  supplierId: string; supplierName: string;
  estimatedQty: number; actualQty: number;
  purchasePrice: number; weight: number; sellingPrice: number;
  state: 'pending' | 'priced' | 'stocked';
}

export default function ProcurementPage() {
  const nav = useNavigate();
  const { orderLines, products, suppliers, stockQuants, stockLocations, productProducts, loading, selectedDate, setSelectedDate } = useData();
  const [items, setItems] = useState<PricingItem[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [priceLogs, setPriceLogs] = useState<any[]>([]);
  const [assignModal, setAssignModal] = useState<{ productId: string; templateId: string; productName: string } | null>(null);
  const [assignSupplierId, setAssignSupplierId] = useState('');

  const PRICE_LOG_UUID = '390d4f0b-9a2b-4131-a35b-67fce21286be';

  // template UUID → product_products UUID（proxy 回傳的 product_id 是 template UUID）
  const _qn = (v: any) => Array.isArray(v) ? String(v[0]) : String(v || '');
  const tmplToPp = useMemo(() => {
    const m: Record<string, string> = {};
    for (const pp of productProducts) {
      const tmplId = _qn(pp.product_tmpl_id);
      if (tmplId && pp.id) m[tmplId] = String(pp.id);
    }
    return m;
  }, [productProducts]);

  // 載入全部 price log（不篩日期），讓 logMap 拿最新一筆當預設值
  useEffect(() => {
    db.queryCustom(PRICE_LOG_UUID).then(rows => setPriceLogs(
      (Array.isArray(rows) ? rows : [])
        .map((r: any) => r.data ? { ...r.data, id: r.id, updated_at: r.data.updated_at || r.updated_at } : r)
    )).catch(() => {});
  }, []);

  // 依選定配送日重建 PricingItem
  const olKey = orderLines.length;
  const prKey = products.length;
  useEffect(() => {
    if (loading) return;
    const prodMap: Record<string,any> = {};
    for (const p of products) prodMap[p.id] = p;
    // 主供應商 SSOT：product_templates.custom_data.default_supplier_id（ARCHITECTURE §0.8）
    const prodSup: Record<string,string> = {};
    for (const p of products) {
      const defSup = p.custom_data?.default_supplier_id;
      if (defSup) prodSup[p.id] = defSup;
    }

    // 最新一筆 log（跨所有日期）→ 定價預設值
    const logMap: Record<string, any> = {};
    // 選定日期的 log → qty_delivered 初始值（有日期語意，不同於 stock_quants 累計量）
    const todayLogMap: Record<string, any> = {};
    for (const rec of priceLogs) {
      const pid = String(rec.product_product_id || '');
      if (!pid) continue;
      if (!logMap[pid] || (rec.updated_at || '') > (logMap[pid].updated_at || '')) logMap[pid] = rec;
      if (String(rec.effective_date || '').slice(0, 10) === selectedDate) {
        if (!todayLogMap[pid] || (rec.updated_at || '') > (todayLogMap[pid].updated_at || '')) todayLogMap[pid] = rec;
      }
    }

    const itemMap = new Map<string, PricingItem>();
    for (const l of orderLines) {
      if (typeof l.delivery_date === 'string' && l.delivery_date.slice(0, 10) !== selectedDate) continue;
      const rawId = _qn(l.product_id) || _qn(l.product_template_id);
      if (!rawId) continue;
      // rawId 可能是 template UUID，轉為 product_products UUID 才能對應 price log 和 stock
      const pid = tmplToPp[rawId] || rawId;
      const prod = prodMap[rawId] || prodMap[pid];  // template UUID 查產品名
      const supId = prodSup[_qn(l.product_template_id) || rawId] || 'unknown';
      const existing = itemMap.get(pid);
      if (existing) { existing.estimatedQty += Number(l.product_uom_qty || 0); }
      else {
        const log = logMap[pid];       // 任何日期最新一筆，僅作預設值
        const todayLog = todayLogMap[pid]; // 當日定價，決定 state
        // 當日有定價就用當日，否則帶入上次定價作預設
        const srcLog = todayLog || log;
        const purchasePrice = Number(srcLog?.standard_price || 0);
        const logSelling    = Number(srcLog?.lst_price || 0);
        // 從已存的兩個價格反推加權，預設 130（即 1.3 倍）
        const weight = (purchasePrice > 0 && logSelling > 0) ? Math.round(logSelling / purchasePrice * 100) : 130;
        const sellingPrice = purchasePrice > 0 ? Math.ceil(purchasePrice * weight / 100) : logSelling;
        // 實際量：優先取當日 price log 的 qty_delivered，否則用估計量
        const actualQty = todayLog?.qty_delivered != null ? Number(todayLog.qty_delivered) : Number(l.product_uom_qty || 0);
        itemMap.set(pid, { productId: pid, templateId: rawId, productName: prod?.name || l.name || '—', code: prod?.default_code || '', supplierId: supId, supplierName: suppliers[supId]?.name || '未指定供應商', estimatedQty: Number(l.product_uom_qty || 0), actualQty, purchasePrice, weight, sellingPrice, state: todayLog ? 'priced' : 'pending' });
      }
    }
    setItems(Array.from(itemMap.values()));
    setExpanded([...new Set(Array.from(itemMap.values()).map(i => i.supplierId))]);
  }, [loading, olKey, prKey, selectedDate, priceLogs, tmplToPp]);

  // 分群
  const groups = new Map<string, PricingItem[]>();
  for (const item of items) {
    const list = groups.get(item.supplierId) || [];
    list.push(item);
    groups.set(item.supplierId, list);
  }

  const assignSupplier = async () => {
    if (!assignModal || !assignSupplierId) return;
    const prod = products.find(p => p.id === assignModal.templateId);
    const currentCd = prod?.custom_data || {};
    setSaving(true);
    try {
      await db.update('product_templates', assignModal.templateId, {
        custom_data: { ...currentCd, default_supplier_id: assignSupplierId }
      });
      const sup = suppliers[assignSupplierId];
      setItems(prev => prev.map(i =>
        i.productId === assignModal.productId
          ? { ...i, supplierId: assignSupplierId, supplierName: sup?.name || '—' }
          : i
      ));
      setExpanded(prev => prev.includes(assignSupplierId) ? prev : [...prev, assignSupplierId]);
    } catch(e: any) { console.error('指定供應商失敗:', e.message); }
    setSaving(false);
    setAssignModal(null);
    setAssignSupplierId('');
  };

  const updateItem = (pid: string, field: string, value: number) => {
    setItems(prev => prev.map(i => {
      if (i.productId !== pid) return i;
      const updated = {...i, [field]: value};
      if (field === 'purchasePrice' || field === 'weight') {
        const cost = field === 'purchasePrice' ? value : updated.purchasePrice;
        const w    = field === 'weight'         ? value : updated.weight;
        updated.sellingPrice = (cost > 0 && w > 0) ? Math.ceil(cost * w / 100) : 0;
      }
      return updated;
    }));
  };

  // order_id 可能是 [uuid, name] 或純字串
  const _oid = (val: any): string => Array.isArray(val) ? String(val[0]) : String(val ?? '');


  // 取得內部庫位 ID：先從 state 找，找不到就 fresh fetch，再找不到就自動建立
  const _getLocId = async (): Promise<string> => {
    let locId = stockLocations.find((l:any) => l.usage === 'internal')?.id || stockLocations[0]?.id;
    if (!locId) {
      const fresh: any[] = await db.query('stock_locations').catch(() => []);
      locId = fresh.find((l:any) => l.usage === 'internal')?.id || fresh[0]?.id;
    }
    if (!locId) {
      const created = await db.insert('stock_locations', { name: 'WH/Stock', usage: 'internal', active: true });
      locId = created?.id;
    }
    return locId || '';
  };

  // 累加庫存（stock_quants 是累計量，每次進貨 ADD）
  const _upsertQuant = async (pid: string, qty: number, locId: string, _qid: (v:any)=>string): Promise<void> => {
    let sq = stockQuants.find((q:any) => _qid(q.product_id) === pid);
    if (!sq) {
      const fresh: any[] = await db.queryFiltered('stock_quants', [{column:'product_id',op:'eq',value:pid}]).catch(() => []);
      sq = fresh[0];
    }
    if (sq) {
      await db.update('stock_quants', sq.id, { quantity: Number(sq.quantity||0) + qty });
    } else {
      await db.insert('stock_quants', { product_id: pid, location_id: locId, quantity: qty });
    }
  };

  const applyPricing = async (pid: string) => {
    const item = items.find(i => i.productId === pid);
    if (!item || item.sellingPrice <= 0) return;
    setSaving(true);
    const _qid = (v: any) => Array.isArray(v) ? String(v[0]) : String(v || '');
    try {
      // 寫入價格稽核 log（含當日實際進貨量）
      await db.insertCustom(PRICE_LOG_UUID, { product_product_id: pid, lst_price: item.sellingPrice, standard_price: item.purchasePrice, effective_date: selectedDate, qty_delivered: item.actualQty });
      // 同步選定日期配送的訂單明細售價（l.product_id 可能是 template UUID，需比對後轉換）
      const matchingLines = orderLines.filter((l: any) => {
        const lineRaw = _qid(l.product_id) || _qid(l.product_template_id);
        return (tmplToPp[lineRaw] || lineRaw) === pid &&
          typeof l.delivery_date === 'string' && l.delivery_date.slice(0, 10) === selectedDate;
      });
      await Promise.all(matchingLines.map((l: any) => db.update('sale_order_lines', l.id, { price_unit: item.sellingPrice })));
      // 重算受影響訂單的總金額
      await db.recalcOrderTotal(matchingLines.map((l: any) => _oid(l.order_id)));
      setItems(prev => prev.map(i => i.productId === pid ? {...i, state: 'priced'} : i));
    } catch(e: any) { console.error('定價失敗:', e.message); }
    // 庫存更新獨立 try/catch，不受定價寫入失敗影響
    try {
      if (item.actualQty > 0) {
        const locId = await _getLocId();
        if (locId) { await _upsertQuant(pid, item.actualQty, locId, _qid); }
        else { console.warn('[stock] 無法取得庫位，跳過庫存更新'); }
      }
    } catch(e: any) { console.error('庫存更新失敗:', e.message); }
    setSaving(false);
  };

  const applyAll = async () => {
    const priceable = items.filter(i => i.sellingPrice > 0);
    if (priceable.length === 0) return;
    setSaving(true);
    const allAffectedOrderIds: string[] = [];
    const _qid = (v: any) => Array.isArray(v) ? String(v[0]) : String(v || '');
    const locId = await _getLocId();
    for (const item of priceable) {
      try {
        // 寫入價格稽核 log（含當日實際進貨量）
        await db.insertCustom(PRICE_LOG_UUID, { product_product_id: item.productId, lst_price: item.sellingPrice, standard_price: item.purchasePrice, effective_date: selectedDate, qty_delivered: item.actualQty });
        // 同步選定日期配送的訂單明細售價（l.product_id 可能是 template UUID）
        const matchingLines = orderLines.filter((l: any) => {
          const lineRaw = _qid(l.product_id) || _qid(l.product_template_id);
          return (tmplToPp[lineRaw] || lineRaw) === item.productId &&
            typeof l.delivery_date === 'string' && l.delivery_date.slice(0, 10) === selectedDate;
        });
        await Promise.all(matchingLines.map((l: any) => db.update('sale_order_lines', l.id, { price_unit: item.sellingPrice })));
        allAffectedOrderIds.push(...matchingLines.map((l: any) => _oid(l.order_id)));
        if (item.actualQty > 0 && locId) { await _upsertQuant(item.productId, item.actualQty, locId, _qid); }
        setItems(prev => prev.map(i => i.productId === item.productId ? {...i, state: 'priced'} : i));
      } catch(e) { console.error(e); }
    }
    // 所有品項更新完後，一次重算所有受影響訂單的總金額
    await db.recalcOrderTotal(allAffectedOrderIds);
    setSaving(false);
  };

  const toggleGroup = (sid: string) => {
    setExpanded(prev => prev.includes(sid) ? prev.filter(id => id !== sid) : [...prev, sid]);
  };

  const pendingCount = items.filter(i => i.state === 'pending').length;
  const pricedCount = items.filter(i => i.state === 'priced').length;

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">載入中...</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={()=>nav('/admin/daily')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-gray-100 transition-colors border-none"><Arrow/></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">採購定價</h1>
            <p className="text-sm text-gray-400">{items.length} 品項 · {pendingCount} 待定價 · {pricedCount} 已定價</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DatePickerWithCounts value={selectedDate} onChange={setSelectedDate} />
          {pendingCount > 0 && (
            <button onClick={applyAll} disabled={saving}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${saving ? 'bg-gray-200 text-gray-400' : 'bg-primary text-white hover:bg-green-700'}`}>
              <PricingIcon />
              {saving ? '處理中...' : `一鍵全部定價 (${pendingCount})`}
            </button>
          )}
        </div>
      </header>

      <div className="p-6 max-w-6xl mx-auto">
        {items.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <PackageIcon />
            <p className="text-gray-500 font-medium">尚無採購品項</p>
            <p className="text-sm text-gray-400">訂單明細將在此彙總顯示</p>
            <button onClick={()=>nav('/admin/daily/purchase-list')} className="text-primary hover:underline text-sm mt-2">先去查看訂單接收 →</button>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(groups.entries()).map(([sid, groupItems]) => {
              const sup = suppliers[sid];
              const isOpen = expanded.includes(sid);
              const groupPriced = groupItems.filter(i => i.state === 'priced').length;
              const groupTotal = groupItems.reduce((s, i) => s + i.sellingPrice * i.actualQty, 0);
              return (
                <div key={sid} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div role="button" onClick={() => toggleGroup(sid)} className="w-full px-4 py-4 flex justify-between items-center bg-white hover:bg-gray-50 cursor-pointer">
                    <div className="text-left">
                      <p className="font-bold text-gray-900">{sup?.name || (sid === 'unknown' ? '未指定供應商' : sid)}</p>
                      <p className="text-sm text-gray-400">{sup?.ref ? `${sup.ref} · ` : ''}{groupItems.length} 品項 · {groupPriced}/{groupItems.length} 已定價</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {groupTotal > 0 && <span className="text-sm font-bold text-primary">${Math.round(groupTotal).toLocaleString()}</span>}
                      <span className="text-gray-400 text-xl">{isOpen ? '▾' : '▸'}</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-gray-100">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-gray-50 text-gray-500 text-xs">
                          <th className="py-2 px-3 text-left font-medium">品名</th>
                          <th className="py-2 px-3 text-right font-medium w-20">預估量</th>
                          <th className="py-2 px-3 text-right font-medium w-20">實際量</th>
                          <th className="py-2 px-3 text-right font-medium w-24">成本</th>
                          <th className="py-2 px-3 text-right font-medium w-16">加權</th>
                          <th className="py-2 px-3 text-right font-medium w-20">售價</th>
                          <th className="py-2 px-3 text-right font-medium w-24">小計</th>
                          <th className="py-2 px-3 text-center font-medium w-20">操作</th>
                        </tr></thead>
                        <tbody>
                          {groupItems.map(item => {
                            const subtotal = item.sellingPrice * item.actualQty;
                            const isPriced = item.state === 'priced';
                            return (
                              <tr key={item.productId} className={`border-b border-gray-50 ${isPriced ? 'bg-green-50' : ''}`}>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-medium">{item.productName}</p>
                                    {item.supplierId === 'unknown' && (
                                      <button
                                        onClick={() => { setAssignModal({ productId: item.productId, templateId: item.templateId, productName: item.productName }); setAssignSupplierId(''); }}
                                        className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 whitespace-nowrap"
                                      >指定供應商</button>
                                    )}
                                  </div>
                                  {item.code && <p className="text-xs text-gray-400 font-mono">{item.code}</p>}
                                </td>
                                <td className="py-2 px-3 text-right text-gray-400">{item.estimatedQty.toFixed(1)}</td>
                                <td className="py-2 px-3 text-right">
                                  <input type="number" value={item.actualQty} step="0.5" min="0"
                                    onChange={e => updateItem(item.productId, 'actualQty', Number(e.target.value))}
                                    className="w-16 text-right py-1 px-1.5 border border-gray-200 rounded text-sm" />
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <input type="number" value={item.purchasePrice || ''} step="0.5" min="0" placeholder="$"
                                    onChange={e => updateItem(item.productId, 'purchasePrice', Number(e.target.value))}
                                    className="w-20 text-right py-1 px-1.5 border border-gray-200 rounded text-sm" />
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <input type="number" value={item.weight} step="1" min="1"
                                    onChange={e => updateItem(item.productId, 'weight', Number(e.target.value))}
                                    className="w-14 text-right py-1 px-1.5 border border-gray-200 rounded text-sm" />
                                </td>
                                <td className="py-2 px-3 text-right text-gray-700 text-sm font-medium">
                                  {item.sellingPrice > 0 ? `$${item.sellingPrice}` : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-medium">
                                  {subtotal > 0 ? `$${Math.round(subtotal).toLocaleString()}` : '—'}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <button onClick={() => applyPricing(item.productId)} disabled={item.sellingPrice <= 0 || saving}
                                    className={`px-2 py-1 rounded text-xs transition-colors flex items-center justify-center gap-1 ${item.sellingPrice <= 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : isPriced ? 'bg-green-50 text-green-700 border border-green-300 hover:bg-green-100' : 'bg-primary text-white hover:bg-green-700'}`}>
                                    {isPriced ? <><CheckIcon /> 更新</> : '確認'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot><tr className="bg-gray-50 font-bold border-t border-gray-200">
                          <td className="py-2 px-3 text-right" colSpan={7}>小計</td>
                          <td className="py-2 px-3 text-right text-primary">${Math.round(groupTotal).toLocaleString()}</td>
                          <td></td>
                        </tr></tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {assignModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80">
            <h3 className="font-bold text-gray-900 mb-1">指定供應商</h3>
            <p className="text-sm text-gray-500 mb-4">{assignModal.productName}</p>
            <select
              value={assignSupplierId}
              onChange={e => setAssignSupplierId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
            >
              <option value="">請選擇供應商</option>
              {Object.values(suppliers).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAssignModal(null)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">取消</button>
              <button
                onClick={assignSupplier}
                disabled={!assignSupplierId || saving}
                className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg disabled:opacity-40 hover:bg-green-700"
              >確認</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
