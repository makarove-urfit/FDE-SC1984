// vfs/admin/src/pages/admin/ReportsPage.tsx
import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../../data/DataProvider';
import * as db from '../../db';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';
import { PrintArea, usePrint } from '../../components/PrintProvider';
import { buildPurchaseSheets, buildPickingSheets } from '../../utils/reportData';
import { buildCsv, downloadCsv } from '../../utils/csvExport';
import { REPORT_PRINT_CSS } from '../../components/reports/reportPrintCss';
import PurchaseSheetPair from '../../components/reports/PurchaseSheetPair';
import PickingSheet from '../../components/reports/PickingSheet';
import PickingList from '../../components/reports/PickingList';

const Arrow = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>;

type Tab = 'purchase' | 'picking' | 'csv';
type CompanyInfo = { name: string; phone: string; fax: string };

const KEY_COMPANY = 'company_info';

export default function ReportsPage() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { orders, orderLines, customers, products, suppliers, uomMap, loading, selectedDate, setSelectedDate } = useData();

  const [tab, setTabState] = useState<Tab>(() => (searchParams.get('tab') as Tab) || 'purchase');
  const setTab = (t: Tab) => {
    setTabState(t);
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('tab', t); return p; }, { replace: true });
  };

  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [customerTags, setCustomerTags] = useState<any[]>([]);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [selectedPicks, setSelectedPicks] = useState<Set<string>>(new Set());
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  // 載入 customer_tags
  useEffect(() => {
    db.query('customer_tags').then(rows => setCustomerTags(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, []);

  // 載入公司資訊（x_app_settings.company_info）
  useEffect(() => {
    db.queryCustom('x_app_settings').then(rows => {
      const rec = (rows || []).find((r: any) => (r.data?.key || r.key) === KEY_COMPANY);
      if (!rec) { setCompany(null); return; }
      const raw = (rec.data?.value || rec.value || '').toString();
      try {
        const parsed = JSON.parse(raw);
        setCompany({ name: parsed.name || '', phone: parsed.phone || '', fax: parsed.fax || '' });
      } catch { setCompany(null); }
    }).catch(() => {});
  }, []);

  // 過濾 draft 訂單（與 PurchaseListPage 一致）
  const draftOrders = useMemo(
    () => orders.filter((o: any) => !o.state || o.state === 'draft'),
    [orders]
  );

  // 共用 input
  const reportInput = useMemo(() => ({
    orders: draftOrders,
    orderLines,
    customers,
    customerTags,
    products,
    suppliers,
    uomMap,
    selectedDate,
  }), [draftOrders, orderLines, customers, customerTags, products, suppliers, uomMap, selectedDate]);

  const purchaseSheets = useMemo(() => buildPurchaseSheets(reportInput), [reportInput]);
  const pickingSheets = useMemo(() => buildPickingSheets(reportInput), [reportInput]);

  // 套供應商篩選到 purchase + csv
  const filteredPurchaseSheets = useMemo(() => {
    if (supplierFilter === 'all') return purchaseSheets;
    return purchaseSheets.filter(s => s.supplierId === supplierFilter);
  }, [purchaseSheets, supplierFilter]);


  // 列印 hook
  const purchasePrint = usePrint(REPORT_PRINT_CSS);
  const pickingAllPrint = usePrint(REPORT_PRINT_CSS);
  const pickingSinglePrint = usePrint(REPORT_PRINT_CSS);

  // 勾選 helpers
  const toggleSelect = (cid: string) => {
    setSelectedPicks(prev => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid); else next.add(cid);
      return next;
    });
  };
  const previewingSheet = previewingId ? pickingSheets.find(s => s.customerId === previewingId) : null;

  // 哪些 PickingSheet 進 PrintArea：依「全部/選取/單張」三種模式
  const [printMode, setPrintMode] = useState<'all' | 'selected' | 'single'>('all');
  const sheetsToPrint = useMemo(() => {
    if (printMode === 'single' && previewingId) return pickingSheets.filter(s => s.customerId === previewingId);
    if (printMode === 'selected') return pickingSheets.filter(s => selectedPicks.has(s.customerId));
    return pickingSheets;
  }, [printMode, previewingId, selectedPicks, pickingSheets]);

  // CSV 下載
  const downloadCurrentCsv = () => {
    const csv = buildCsv(filteredPurchaseSheets);
    const supName = supplierFilter === 'all' ? '全部'
      : (suppliers[supplierFilter]?.name || supplierFilter).replace(/[\\/:*?"<>|]/g, '_');
    const dateStr = selectedDate.replace(/-/g, '');
    downloadCsv(`報表_${dateStr}_${supName}.csv`, csv);
  };

  if (loading) return <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'#f9fafb'}}><p className="text-gray-400">載入中...</p></div>;

  // 供應商選項：用當日 purchaseSheets 出現過的（含 __none__）
  const supplierOptions = purchaseSheets.map(s => ({ id: s.supplierId, name: s.supplierName }));

  return (
    <div style={{height:'100%',display:'flex',flexDirection:'column',background:'#f9fafb'}}>
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={()=>nav('/admin/daily')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-gray-100 transition-colors border-none"><Arrow/></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">報表列印</h1>
            <p className="text-sm text-gray-400">採購單／點貨單／CSV 匯出</p>
          </div>
        </div>
        <DatePickerWithCounts value={selectedDate} onChange={setSelectedDate} />
      </header>

      <div className="px-6 pt-4 flex gap-2">
        {([['purchase', '採購單'], ['picking', '點貨單'], ['csv', 'CSV 匯出']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors ${tab === k ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
            {lbl}
          </button>
        ))}
      </div>

      <style>{REPORT_PRINT_CSS}</style>

      <div style={{flex:1,overflowY:'auto'}}>
        <div className="p-6 max-w-5xl mx-auto">
          {/* ── 採購單 tab ── */}
          {tab === 'purchase' && (
            <>
              <div className="mb-4 flex items-center gap-3 flex-wrap">
                <label className="text-sm text-gray-600">供應商篩選：</label>
                <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
                  <option value="all">全部</option>
                  {supplierOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button onClick={purchasePrint.print}
                  disabled={filteredPurchaseSheets.length === 0}
                  className="px-4 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50">
                  列印
                </button>
              </div>
              {filteredPurchaseSheets.length === 0 && (
                <p className="text-center text-gray-400 py-12">{supplierFilter === 'all' ? '當日無待處理訂單' : '此供應商當日無訂單'}</p>
              )}
              {/* 螢幕預覽：所有廠商雙欄流式排版，同廠商過長自動接續 */}
              <PurchaseSheetPair sheets={filteredPurchaseSheets} date={selectedDate} company={company} />
              {/* 列印區（隱藏） */}
              <PrintArea printRef={purchasePrint.contentRef}>
                <PurchaseSheetPair sheets={filteredPurchaseSheets} date={selectedDate} company={company} />
              </PrintArea>
            </>
          )}

          {/* ── 點貨單 tab ── */}
          {tab === 'picking' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-100">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="font-bold text-gray-800 text-sm">當日客戶（{pickingSheets.length}）</span>
                </div>
                <PickingList
                  sheets={pickingSheets}
                  selectedIds={selectedPicks}
                  onToggle={toggleSelect}
                  onPreview={setPreviewingId}
                  previewingId={previewingId}
                />
                <div className="px-4 py-3 border-t border-gray-100 flex flex-col gap-2">
                  <button
                    disabled={pickingSheets.length === 0}
                    onClick={() => { setPrintMode('all'); setTimeout(pickingAllPrint.print, 0); }}
                    className="px-3 py-1.5 bg-primary text-white text-sm rounded-lg disabled:opacity-50">
                    全部列印（{pickingSheets.length}）
                  </button>
                  <button
                    disabled={selectedPicks.size === 0}
                    onClick={() => { setPrintMode('selected'); setTimeout(pickingAllPrint.print, 0); }}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">
                    列印選取（{selectedPicks.size}）
                  </button>
                </div>
              </div>
              <div className="md:col-span-2">
                {previewingSheet ? (
                  <div>
                    <div className="mb-2 flex justify-end">
                      <button
                        onClick={() => { setPrintMode('single'); setTimeout(pickingSinglePrint.print, 0); }}
                        className="px-3 py-1.5 bg-primary text-white text-sm rounded-lg">
                        列印此張
                      </button>
                    </div>
                    <PickingSheet sheet={previewingSheet} date={selectedDate} company={company} />
                    <PrintArea printRef={pickingSinglePrint.contentRef}>
                      <PickingSheet sheet={previewingSheet} date={selectedDate} company={company} />
                    </PrintArea>
                  </div>
                ) : (
                  <p className="text-center text-gray-400 py-12">點左側「預覽」查看單張點貨單</p>
                )}
              </div>
              {/* 全部 / 選取列印區（依 printMode 決定渲染哪些 sheet） */}
              <PrintArea printRef={pickingAllPrint.contentRef}>
                {sheetsToPrint.map(s => <PickingSheet key={s.customerId} sheet={s} date={selectedDate} company={company} />)}
              </PrintArea>
            </div>
          )}

          {/* ── CSV tab ── */}
          {tab === 'csv' && (
            <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-bold text-gray-900">CSV 匯出</h2>
              <p className="text-sm text-gray-500">將當日訂單明細匯出為對接系統用 CSV（UTF-8 with BOM、CRLF）。</p>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm text-gray-600">供應商篩選：</label>
                <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
                  <option value="all">全部</option>
                  {supplierOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button
                  disabled={filteredPurchaseSheets.length === 0}
                  onClick={downloadCurrentCsv}
                  className="px-4 py-1.5 bg-primary text-white text-sm rounded-lg disabled:opacity-50">
                  下載 CSV
                </button>
              </div>
              <div className="text-xs text-gray-400">
                預估列數：{filteredPurchaseSheets.reduce((s, sh) => s + sh.products.reduce((p, b) => p + b.rows.length, 0), 0)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
