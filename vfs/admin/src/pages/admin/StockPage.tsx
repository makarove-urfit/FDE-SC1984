import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../data/DataProvider';
import * as db from '../../db';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';
import { fmtQty } from '../../utils/displayHelpers';

const Arrow = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>;
const BoxIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>;

function _qn(v: any): string { return Array.isArray(v) ? String(v[0]) : String(v || ''); }

interface Row {
  key: string;
  supplierId: string;
  supplierName: string;
  productName: string;
  productCode: string;
  customerName: string;
  orderedQty: number;
  uomName: string;
  note: string;
}

export default function StockPage() {
  const nav = useNavigate();
  const { orders, customers, orderLines, products, suppliers, uomMap, loading, selectedDate, setSelectedDate } = useData();
  const [actualQtys, setActualQtys] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date|null>(null);

  const prodMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  const orderMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const o of orders) m[String(o.id)] = o;
    return m;
  }, [orders]);

  const prodUomMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of products) if (p.uom_id) m[p.id] = uomMap[_qn(p.uom_id)] || '';
    return m;
  }, [products, uomMap]);

  const tmplSupplierMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of products) {
      const defSup = p.custom_data?.default_supplier_id;
      if (defSup) m[p.id] = String(defSup);
    }
    return m;
  }, [products]);

  const supplierGroups = useMemo(() => {
    const rows: Row[] = [];
    for (const l of orderLines) {
      const delivDate = String(l.delivery_date || '').slice(0, 10);
      if (delivDate !== selectedDate) continue;

      const orderId = _qn(l.order_id);
      const order = orderMap[orderId];
      const customerName = order ? (customers[String(order.customer_id)]?.name || '未知客戶') : '未知客戶';

      const tmplId = _qn(l.product_id) || _qn(l.product_template_id);
      const prod = prodMap[tmplId];
      const productName = prod?.name || l.name || '—';
      const productCode = prod?.default_code || '';

      const supplierId = tmplSupplierMap[tmplId] || '__none__';
      const sup = suppliers[supplierId];
      const supplierName = sup?.name || '未指定供應商';

      rows.push({
        key: String(l.id),
        supplierId,
        supplierName,
        productName,
        productCode,
        customerName,
        orderedQty: Number(l.product_uom_qty || 0),
        uomName: prodUomMap[tmplId] || '',
        note: ((l.custom_data && typeof l.custom_data === 'object') ? l.custom_data.note : '') || '',
      });
    }

    rows.sort((a, b) => {
      const p = a.productName.localeCompare(b.productName, 'zh-TW');
      if (p !== 0) return p;
      return a.customerName.localeCompare(b.customerName, 'zh-TW');
    });

    const groupMap = new Map<string, { supplierId: string; supplierName: string; rows: Row[] }>();
    for (const r of rows) {
      if (!groupMap.has(r.supplierId)) groupMap.set(r.supplierId, { supplierId: r.supplierId, supplierName: r.supplierName, rows: [] });
      groupMap.get(r.supplierId)!.rows.push(r);
    }

    return Array.from(groupMap.values()).sort((a, b) => {
      if (a.supplierId === '__none__') return 1;
      if (b.supplierId === '__none__') return -1;
      return a.supplierName.localeCompare(b.supplierName, 'zh-TW');
    });
  }, [orderLines, selectedDate, orderMap, customers, prodMap, prodUomMap, tmplSupplierMap, suppliers]);

  const isOpen = (sid: string) => allExpanded ? !expanded.has(sid) : expanded.has(sid);
  const toggleGroup = (sid: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(sid)) next.delete(sid); else next.add(sid);
    return next;
  });

  useEffect(() => {
    const init: Record<string, number> = {};
    for (const l of orderLines) {
      if (String(l.delivery_date || '').slice(0, 10) !== selectedDate) continue;
      if (l.qty_delivered != null) init[String(l.id)] = Number(l.qty_delivered);
    }
    setActualQtys(init);
    setSavedAt(null);
  }, [orderLines, selectedDate]);

  const getActual = (key: string, orderedQty: number) => actualQtys[key] ?? orderedQty;

  const handleBatchSave = async () => {
    setSaving(true);
    try {
      const allRows = supplierGroups.flatMap(g => g.rows);
      await Promise.all(allRows.map(row =>
        db.update('sale_order_lines', row.key, { qty_delivered: getActual(row.key, row.orderedQty) })
      ));
      setSavedAt(new Date());
    } catch (e: any) {
      alert('儲存失敗：' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const totalRows = supplierGroups.reduce((s, g) => s + g.rows.length, 0);

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">載入中...</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/admin/daily')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-gray-100 transition-colors border-none"><Arrow /></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">採購單</h1>
            <p className="text-sm text-gray-400">{supplierGroups.length} 家供應商 · {totalRows} 筆明細</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DatePickerWithCounts value={selectedDate} onChange={setSelectedDate} />
          {supplierGroups.length > 0 && (
            <button
              onClick={() => { setAllExpanded(v => !v); setExpanded(new Set()); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              {allExpanded ? '全部收合' : '全部展開'}
            </button>
          )}
          {totalRows > 0 && (
            <button
              onClick={handleBatchSave}
              disabled={saving}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? '儲存中...' : savedAt ? `已儲存 ${savedAt.toLocaleTimeString('zh-TW', {hour:'2-digit',minute:'2-digit'})}` : '批次儲存'}
            </button>
          )}
        </div>
      </header>

      <div className="p-3 sm:p-6 max-w-5xl mx-auto">
        {totalRows === 0 ? (
          <div className="text-center py-16 space-y-3">
            <BoxIcon />
            <p className="text-gray-500 font-medium">此日期無訂單明細</p>
            <p className="text-sm text-gray-400">請選擇有訂單的日期</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs border-b border-gray-100">
                  <th className="py-2 px-2 sm:px-4 text-left font-medium w-[22%]">客戶</th>
                  <th className="py-2 px-2 sm:px-4 text-left font-medium">品項</th>
                  <th className="py-2 px-2 sm:px-4 text-right font-medium w-[16%]">訂購量</th>
                  <th style={{ width: '6ch' }} className="py-2 px-2 sm:px-4 text-right font-medium">實際量</th>
                  <th className="py-2 px-2 sm:px-4 text-left font-medium w-[14%]">備註</th>
                </tr>
              </thead>
              <tbody>
                {supplierGroups.map(group => {
                  const open = isOpen(group.supplierId);
                  const groupTotal = group.rows.reduce((s, r) => s + getActual(r.key, r.orderedQty), 0);
                  return (
                    <>
                      <tr
                        key={`hd-${group.supplierId}`}
                        onClick={() => toggleGroup(group.supplierId)}
                        className="bg-gray-50 border-t border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                      >
                        <td colSpan={5} className="py-3 px-2 sm:px-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400">{open ? '▾' : '▸'}</span>
                              <span className="font-bold text-gray-900">{group.supplierName}</span>
                              <span className="text-xs text-gray-400">{group.rows.length} 筆</span>
                            </div>
                            <span className="text-sm text-gray-500">共 {fmtQty(groupTotal)} 件</span>
                          </div>
                        </td>
                      </tr>
                      {open && group.rows.map(row => (
                        <tr key={row.key} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="py-2 px-2 sm:px-4 max-w-0 overflow-hidden text-gray-700 truncate">{row.customerName}</td>
                          <td className="py-2 px-2 sm:px-4 max-w-0 overflow-hidden">
                            <p className="font-medium text-gray-900 truncate">{row.productName}</p>
                            {row.productCode && <p className="text-xs text-gray-400 font-mono truncate">{row.productCode}</p>}
                          </td>
                          <td className="py-2 px-2 sm:px-4 text-right text-gray-400 whitespace-nowrap">
                            {fmtQty(row.orderedQty)}{row.uomName && <span className="ml-1">{row.uomName}</span>}
                          </td>
                          <td className="py-2 px-2 sm:px-4 text-right whitespace-nowrap">
                            <input
                              type="number"
                              value={getActual(row.key, row.orderedQty)}
                              step="0.5"
                              min="0"
                              onChange={e => setActualQtys(prev => ({ ...prev, [row.key]: Number(e.target.value) }))}
                              style={{ width: '4ch' }}
                              className="text-right py-1 px-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </td>
                          <td className="py-2 px-2 sm:px-4 max-w-0 overflow-hidden text-gray-500 text-xs truncate">{row.note || '—'}</td>
                        </tr>
                      ))}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
