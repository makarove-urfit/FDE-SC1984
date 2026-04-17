"""v5 CSS — 修復全部 14 項問題"""

def get_app_css() -> str:
    return r''':host, :root {
  --color-primary: #16a34a;
  --color-primary-dark: #15803d;
  --color-primary-foreground: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
  color: #111827;
}
#root {
  font-family: inherit;
  color: inherit;
  min-height: 100vh;
  background-color: #f9fafb !important;
  color-scheme: light !important;
}
html, body {
  background-color: #f9fafb !important;
  color: #111827 !important;
  color-scheme: light !important;
  overflow-y: auto;
}
/* 強制表單白底黑字與強制淺色原生元件 */
input:not([type="checkbox"]):not([type="radio"]), select, textarea {
  background-color: #ffffff !important;
  color: #111827 !important;
  border-color: #e5e7eb;
  color-scheme: light !important;
}
/* Checkbox 矯正 */
input[type="checkbox"] {
  background-color: #ffffff !important;
  accent-color: var(--color-primary);
}
/* 無背景色綁定的 Button 強制透明無框 (排除帶有 style 背景的元件) */
#root button:not([class*="bg-"]):not([style*="background"]) {
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* === Brand color: primary === */
.text-primary { color: var(--color-primary); }
.bg-primary { background-color: var(--color-primary); }
.hover\:bg-primary-dark:hover { background-color: var(--color-primary-dark); }
.accent-primary { accent-color: var(--color-primary); }
.ring-primary\/30 { --tw-ring-color: rgba(22,163,74,.3); }

/* === Gray scale === */
.min-h-screen { min-height: 100%; }
.bg-gray-50{background-color:#f9fafb}.bg-white{background-color:#fff}
.bg-gray-100{background-color:#f3f4f6}.bg-gray-200{background-color:#e5e7eb}
.bg-gray-600{background-color:#4b5563}
.bg-green-600{background-color:#16a34a}.bg-green-100{background-color:#dcfce7}
.bg-red-50{background-color:#fef2f2}.bg-red-600{background-color:#dc2626}
.bg-blue-50{background-color:#eff6ff}.bg-blue-600{background-color:#2563eb}
.bg-orange-100{background-color:#ffedd5}.bg-orange-600{background-color:#ea580c}
.bg-blue-100{background-color:#dbeafe}.bg-green-50{background-color:#f0fdf4}
.bg-black\/40{background-color:rgba(0,0,0,.4)}

/* hover bg */
.hover\:bg-gray-50:hover{background-color:#f9fafb}
.hover\:bg-gray-100:hover{background-color:#f3f4f6}
.hover\:bg-gray-200:hover{background-color:#e5e7eb}
.hover\:bg-gray-300:hover{background-color:#d1d5db}
.hover\:bg-gray-700:hover{background-color:#374151}
.hover\:bg-green-700:hover{background-color:#15803d}
.hover\:bg-blue-700:hover{background-color:#1d4ed8}
.hover\:bg-red-50:hover{background-color:#fef2f2}
.hover\:bg-red-700:hover{background-color:#b91c1c}
.hover\:bg-orange-700:hover{background-color:#c2410c}
.hover\:bg-blue-50:hover{background-color:#eff6ff}
.hover\:bg-blue-100:hover{background-color:#dbeafe}

/* text */
.text-gray-900{color:#111827}.text-gray-600{color:#4b5563}.text-gray-500{color:#6b7280}
.text-gray-400{color:#9ca3af}.text-white{color:#fff}.text-green-600{color:#16a34a}
.text-green-700{color:#15803d}.text-blue-600{color:#2563eb}.text-blue-700{color:#1d4ed8}
.text-blue-400{color:#60a5fa}
.text-orange-500{color:#f97316}.text-orange-600{color:#ea580c}.text-orange-700{color:#c2410c}
.text-red-600{color:#dc2626}.text-red-500{color:#ef4444}.text-red-700{color:#b91c1c}
.hover\:text-gray-600:hover{color:#4b5563}.hover\:underline:hover{text-decoration:underline}

/* font */
.font-bold{font-weight:700}.font-medium{font-weight:500}
.text-xs{font-size:.75rem;line-height:1rem}.text-sm{font-size:.875rem;line-height:1.25rem}
.text-lg{font-size:1.125rem;line-height:1.75rem}.text-xl{font-size:1.25rem;line-height:1.75rem}
.text-2xl{font-size:1.5rem;line-height:2rem}.text-3xl{font-size:1.875rem;line-height:2.25rem}
.text-4xl{font-size:2.25rem}.text-left{text-align:left}.text-right{text-align:right}.text-center{text-align:center}
.leading-relaxed{line-height:1.625}.leading-snug{line-height:1.375}

/* border */
.border{border-width:1px}.border-b{border-bottom-width:1px}.border-t{border-top-width:1px}
.border-gray-100{border-color:#f3f4f6}.border-gray-200{border-color:#e5e7eb}
.border-gray-300{border-color:#d1d5db}.border-gray-400{border-color:#9ca3af}
.border-green-200{border-color:#bbf7d0}.border-blue-200{border-color:#bfdbfe}
.border-transparent{border-color:transparent}

/* radius */
.rounded{border-radius:.25rem}.rounded-lg{border-radius:.5rem}
.rounded-xl{border-radius:.75rem}.rounded-2xl{border-radius:1rem}.rounded-full{border-radius:9999px}

/* spacing */
.p-2{padding:.5rem}.p-3{padding:.75rem}.p-4{padding:1rem}.p-6{padding:1.5rem}
.px-2{padding-left:.5rem;padding-right:.5rem}.px-3{padding-left:.75rem;padding-right:.75rem}
.px-4{padding-left:1rem;padding-right:1rem}.px-6{padding-left:1.5rem;padding-right:1.5rem}
.py-1{padding-top:.25rem;padding-bottom:.25rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}
.py-3{padding-top:.75rem;padding-bottom:.75rem}.py-4{padding-top:1rem;padding-bottom:1rem}
.py-12{padding-top:3rem;padding-bottom:3rem}.pt-3{padding-top:.75rem}.pt-4{padding-top:1rem}
.px-1\.5{padding-left:.375rem;padding-right:.375rem}
.py-0\.5{padding-top:.125rem;padding-bottom:.125rem}
.py-1\.5{padding-top:.375rem;padding-bottom:.375rem}
.px-2\.5{padding-left:.625rem;padding-right:.625rem}
.py-2\.5{padding-top:.625rem;padding-bottom:.625rem}
.mt-0\.5{margin-top:.125rem}.mt-1{margin-top:.25rem}.mt-1\.5{margin-top:.375rem}.mt-2{margin-top:.5rem}
.mt-3{margin-top:.75rem}.mt-4{margin-top:1rem}.mt-5{margin-top:1.25rem}.mt-6{margin-top:1.5rem}
.mb-2{margin-bottom:.5rem}.mb-3{margin-bottom:.75rem}.mb-4{margin-bottom:1rem}
.mx-auto{margin-left:auto;margin-right:auto}

/* layout */
.flex{display:flex}.inline-flex{display:inline-flex}.grid{display:grid}
.block{display:block}.hidden{display:none}
.items-center{align-items:center}.items-start{align-items:flex-start}
.justify-between{justify-content:space-between}.justify-center{justify-content:center}
.flex-1{flex:1 1 0%}.flex-wrap{flex-wrap:wrap}.flex-col{flex-direction:column}
.gap-1{gap:.25rem}.gap-1\.5{gap:.375rem}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-4{gap:1rem}
.space-y-2>*+*{margin-top:.5rem}.space-y-3>*+*{margin-top:.75rem}.space-y-6>*+*{margin-top:1.5rem}

/* sizing */
.w-full{width:100%}.w-4{width:1rem}.w-5{width:1.25rem}.w-6{width:1.5rem}.w-8{width:2rem}
.h-4{height:1rem}.h-5{height:1.25rem}.h-6{height:1.5rem}.h-8{height:2rem}
.max-w-sm{max-width:24rem}.max-w-2xl{max-width:42rem}.max-w-5xl{max-width:64rem}.max-w-6xl{max-width:72rem}
.min-w-\[200px\]{min-width:200px}
.overflow-hidden{overflow:hidden}

/* interaction */
.transition-all{transition:all .15s ease}
.transition-colors{transition-property:color,background-color,border-color;transition-duration:.15s}
.cursor-pointer{cursor:pointer}.cursor-not-allowed{cursor:not-allowed}

/* grid */
.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}

/* misc */
.font-mono{font-family:ui-monospace,SFMono-Regular,monospace}
.fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}
.inset-0{top:0;right:0;bottom:0;left:0}.z-50{z-index:50}
.border-none{border:none}.outline-none{outline:none}
.opacity-50{opacity:.5}
.backdrop-blur-sm{-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.shadow-2xl{box-shadow:0 25px 50px -12px rgba(0,0,0,.25)}
.ring-4{box-shadow:0 0 0 4px var(--tw-ring-color,transparent)}
.ring-red-100{--tw-ring-color:#fee2e2}.ring-orange-100{--tw-ring-color:#ffedd5}.ring-green-100{--tw-ring-color:#dcfce7}
table{border-collapse:collapse}

/* select 統一樣式 */
select{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right .75rem center;padding-right:2rem}

/* responsive */
@media(min-width:768px){
  .md\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}
  .md\:grid-cols-5{grid-template-columns:repeat(5,minmax(0,1fr))}
}

/* dialog animation */
@keyframes dialogIn{from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
.animate-\[dialogIn_0\.2s_ease-out\]{animation:dialogIn .2s ease-out}

/* Print — 不依賴 body，改用 print window */
@media print{
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  @page{size:A4 portrait;margin:12mm 15mm}
  .print-header{text-align:center;margin-bottom:8pt;border-bottom:2pt solid #000;padding-bottom:6pt}
  .print-header h1{font-size:16pt;font-weight:bold;margin:0}
  .print-header p{font-size:10pt;color:#666;margin:2pt 0 0}
  .print-meta{display:flex;justify-content:space-between;margin-bottom:8pt;font-size:10pt}
  .print-table{width:100%;border-collapse:collapse;font-size:10pt}
  .print-table th,.print-table td{border:.5pt solid #999;padding:4pt 6pt;text-align:left}
  .print-table th{background-color:#f0f0f0!important;font-weight:bold}
  .print-table td.num{text-align:right;font-variant-numeric:tabular-nums}
  .print-table td.bold{font-weight:bold}
  .print-footer{margin-top:12pt;border-top:1pt solid #999;padding-top:6pt;font-size:9pt}
  .print-signature{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24pt;margin-top:16pt;font-size:10pt}
  .print-signature>div{border-bottom:1pt solid #666;padding-bottom:24pt}
  .print-page-break{page-break-before:always}
  .print-page-break:first-child{page-break-before:auto}
  .print-checkbox{display:inline-block;width:12pt;height:12pt;border:1.5pt solid #666;border-radius:2pt}
}
'''


def get_confirm_dialog() -> str:
    """ConfirmDialog — 修復 bg-primary → 使用 CSS 變數"""
    return r'''import { useEffect, useRef } from 'react';
interface Props {
  open: boolean; title: string; message: string;
  confirmText?: string; cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void; onCancel: () => void;
}
export default function ConfirmDialog({
  open, title, message, confirmText = '確認', cancelText = '取消',
  variant = 'warning', onConfirm, onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);
  if (!open) return null;
  const WarningIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>;
  const DangerIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>;
  const InfoIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>;
  const variants = {
    danger:  { Icon: DangerIcon, btnBg: '#dc2626', btnHover: '#b91c1c', ringClass: 'ring-red-100' },
    warning: { Icon: WarningIcon, btnBg: '#ea580c', btnHover: '#c2410c', ringClass: 'ring-orange-100' },
    info:    { Icon: InfoIcon,  btnBg: 'var(--color-primary)', btnHover: 'var(--color-primary-dark)', ringClass: 'ring-green-100' },
  };
  const v = variants[variant];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40" style={{backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)'}} />
      <div ref={dialogRef} onClick={e => e.stopPropagation()}
        className={`relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 ring-4 ${v.ringClass} animate-[dialogIn_0.2s_ease-out]`}>
        <div className="text-center space-y-3">
          <v.Icon />
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
          <p className="text-xs text-red-500 font-medium bg-red-50 rounded-lg px-3 py-1.5">此操作無法復原</p>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onCancel}
            className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors">{cancelText}</button>
          <button onClick={onConfirm}
            style={{backgroundColor:v.btnBg}} onMouseEnter={e=>(e.target as HTMLElement).style.backgroundColor=v.btnHover}
            onMouseLeave={e=>(e.target as HTMLElement).style.backgroundColor=v.btnBg}
            className="flex-1 py-2.5 text-white rounded-xl font-bold transition-colors">{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
'''


def get_print_provider() -> str:
    """PrintProvider — 修復 Shadow DOM：改用 window.open() 列印"""
    return r'''import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';

const PRINT_CSS = `
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
@page{size:A4 portrait;margin:12mm 15mm}
body{font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;font-size:11pt;line-height:1.4;color:#000;background:#fff;margin:0;padding:20px}
table{page-break-inside:auto;border-collapse:collapse;width:100%}
tr{page-break-inside:avoid}
thead{display:table-header-group}
.print-page-break{page-break-before:always}
.print-page-break:first-child{page-break-before:auto}
.print-header{text-align:center;margin-bottom:8pt;border-bottom:2pt solid #000;padding-bottom:6pt}
.print-header h1{font-size:16pt;font-weight:bold;margin:0}
.print-header p{font-size:10pt;color:#666;margin:2pt 0 0}
.print-meta{display:flex;justify-content:space-between;margin-bottom:8pt;font-size:10pt}
.print-table{width:100%;border-collapse:collapse;font-size:10pt}
.print-table th,.print-table td{border:.5pt solid #999;padding:4pt 6pt;text-align:left;vertical-align:top}
.print-table th{background-color:#f0f0f0!important;font-weight:bold}
.print-table td.num{text-align:right;font-variant-numeric:tabular-nums}
.print-table td.bold{font-weight:bold}
.print-footer{margin-top:12pt;border-top:1pt solid #999;padding-top:6pt;font-size:9pt}
.print-signature{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24pt;margin-top:16pt;font-size:10pt}
.print-signature>div{border-bottom:1pt solid #666;padding-bottom:24pt}
.print-checkbox{display:inline-block;width:12pt;height:12pt;border:1.5pt solid #666;border-radius:2pt;vertical-align:middle}
`;

/** 透過 window.open() 列印，避免 Shadow DOM 問題 */
export function triggerPrint(contentElement: HTMLElement | null) {
  if (!contentElement) return;
  const printWin = window.open('', '_blank', 'width=800,height=600');
  if (!printWin) { alert('請允許彈出視窗以使用列印功能'); return; }
  printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>列印</title><style>${PRINT_CSS}</style></head><body>${contentElement.innerHTML}</body></html>`);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); setTimeout(() => printWin.close(), 1000); }, 300);
}

/** PrintArea — 包裹列印內容（螢幕上隱藏） */
export function PrintArea({ children, printRef }: { children: ReactNode; printRef: React.RefObject<HTMLDivElement | null> }) {
  return <div ref={printRef} style={{ display: 'none' }}>{children}</div>;
}

/** usePrint — React Hook */
export function usePrint() {
  const contentRef = useRef<HTMLDivElement>(null);
  const print = useCallback(() => { triggerPrint(contentRef.current); }, []);
  return { contentRef, print };
}
'''


# 返回按鈕 SVG（修復 ← 渲染方框問題）
BACK_BUTTON = '''<button onClick={()=>nav('/')} className="text-gray-400 hover:text-gray-600 flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors" aria-label="返回">
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
</button>'''


def get_data_provider() -> str:
    """DataProvider — 全域資料快取 Context（staleTime 60s）"""
    return r'''import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import * as db from '../db';

interface DataState {
  orders: any[];
  customers: Record<string, any>;
  orderLines: any[];
  employees: any[];
  products: any[];
  productProducts: any[];
  stockQuants: any[];
  stockLocations: any[];
  suppliers: Record<string, any>;
  supplierInfos: any[];
  uomMap: Record<string, string>;
  loading: boolean;
  refresh: (force?: boolean) => void;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
}

const STALE_TIME = 60_000; // 60 秒

const DataContext = createContext<DataState>({
  orders: [], customers: {}, orderLines: [], employees: [],
  products: [], productProducts: [], stockQuants: [], stockLocations: [],
  suppliers: {}, supplierInfos: [], uomMap: {},
  loading: true, refresh: () => {},
  selectedDate: new Date().toISOString().slice(0, 10), setSelectedDate: () => {},
});

export function useData() { return useContext(DataContext); }

export default function DataProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});
  const [orderLines, setOrderLines] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [productProducts, setProductProducts] = useState<any[]>([]);
  const [stockQuants, setStockQuants] = useState<any[]>([]);
  const [stockLocations, setStockLocations] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, any>>({});
  const [supplierInfos, setSupplierInfos] = useState<any[]>([]);
  const [uomMap, setUomMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDateState] = useState(() => searchParams.get('date') || today);
  const setSelectedDate = useCallback((d: string) => {
    setSelectedDateState(d);
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('date', d); return p; }, { replace: true });
  }, [setSearchParams]);
  const lastFetch = useRef(0);
  const fetching = useRef(false);

  const refresh = useCallback(async (force = false) => {
    if (fetching.current) return;
    if (!force && Date.now() - lastFetch.current < STALE_TIME) return;
    
    fetching.current = true;
    setLoading(true);
    try {
      // 避免 9 個 request 瞬間灌爆 proxy 導致 429，改為 3 批次
      const [so, cust, sol] = await Promise.all([
        db.query('sale_orders').catch(() => []),
        db.query('customers').catch(() => []),
        db.query('sale_order_lines').catch(() => [])
      ]);
      const [emps, prods, pp] = await Promise.all([
        db.query('hr_employees').catch(() => []),
        db.query('product_templates').catch(() => []),
        db.query('product_products').catch(() => [])
      ]);
      const [sq, sups, si, slocs, uoms] = await Promise.all([
        db.query('stock_quants').catch(() => []),
        db.query('suppliers').catch(() => []),
        db.query('product_supplierinfo').catch(() => []),
        db.query('stock_locations').catch(() => []),
        db.query('uom_uom').catch(() => []),
      ]);

      setOrders(Array.isArray(so) ? so : []);
      const cm: Record<string, any> = {};
      for (const c of (Array.isArray(cust) ? cust : [])) cm[c.id] = c;
      setCustomers(cm);
      setOrderLines(Array.isArray(sol) ? sol : []);
      setEmployees((Array.isArray(emps) ? emps : []).filter((e: any) => e.active !== false));
      setProducts(Array.isArray(prods) ? prods : []);
      setProductProducts(Array.isArray(pp) ? pp : []);
      setStockQuants(Array.isArray(sq) ? sq : []);
      setStockLocations(Array.isArray(slocs) ? slocs : []);
      const sm: Record<string, any> = {};
      for (const s of (Array.isArray(sups) ? sups : [])) sm[s.id] = s;
      setSuppliers(sm);
      setSupplierInfos(Array.isArray(si) ? si : []);
      const um: Record<string, string> = {};
      for (const u of (Array.isArray(uoms) ? uoms : [])) um[u.id] = u.name;
      setUomMap(um);

      lastFetch.current = Date.now();
    } catch (e) {
      console.error('DataProvider fetch error:', e);
    } finally {
      setLoading(false);
      fetching.current = false;
    }
  }, []);

  useEffect(() => { refresh(true); }, [refresh]);

  const value = useMemo(() => ({
    orders, customers, orderLines, employees,
    products, productProducts, stockQuants, stockLocations,
    suppliers, supplierInfos, uomMap, loading, refresh,
    selectedDate, setSelectedDate,
  }), [orders, customers, orderLines, employees, products, productProducts, stockQuants, stockLocations, suppliers, supplierInfos, uomMap, loading, refresh, selectedDate, setSelectedDate]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}
'''


def get_date_picker_with_counts() -> str:
    """DatePickerWithCounts — 帶訂單數量標示的日期選擇器（日期數字恆對齊、今日/假日底色）"""
    return r'''import { useState, useMemo } from 'react';
import { useData } from '../data/DataProvider';
import HOLIDAY_DATA from '../holiday_data.json';

interface Props {
  value: string;
  onChange: (d: string) => void;
}

const WD = ['日','一','二','三','四','五','六'];
const HOLIDAY_SET = new Set<string>(HOLIDAY_DATA as string[]);

export default function DatePickerWithCounts({ value, onChange }: Props) {
  const { orders } = useData();
  const [open, setOpen] = useState(false);
  const [vy, setVy] = useState(() => Number(value.slice(0, 4)));
  const [vm, setVm] = useState(() => Number(value.slice(5, 7)) - 1);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of orders) {
      const d = (typeof o.note === 'string' ? o.note : '').match(/配送日期：(\d{4}-\d{2}-\d{2})/)?.[1] || (o.date_order || o.created_at || '').slice(0, 10);
      if (d) c[d] = (c[d] || 0) + 1;
    }
    return c;
  }, [orders]);

  const prevM = () => {
    if (vm === 0) { setVy(y => y - 1); setVm(11); }
    else setVm(m => m - 1);
  };
  const nextM = () => {
    if (vm === 11) { setVy(y => y + 1); setVm(0); }
    else setVm(m => m + 1);
  };

  const firstDow = new Date(vy, vm, 1).getDay();
  const days = new Date(vy, vm + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const today = new Date().toISOString().slice(0, 10);
  const sy = Number(value.slice(0, 4));
  const sm = Number(value.slice(5, 7));
  const sd = Number(value.slice(8, 10));

  const pick = (day: number) => {
    const d = `${vy}-${String(vm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(d);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-sm hover:border-gray-300 transition-colors"
        style={{ cursor: 'pointer' }}
      >
        {value}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)',
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '14px', zIndex: 100,
            width: '252px',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <button onClick={prevM} style={{ padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', border: 'none', fontSize: '18px', color: '#6b7280', lineHeight: 1 }} className="hover:bg-gray-100">‹</button>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{vy} 年 {vm + 1} 月</span>
            <button onClick={nextM} style={{ padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', border: 'none', fontSize: '18px', color: '#6b7280', lineHeight: 1 }} className="hover:bg-gray-100">›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px', marginBottom: '4px' }}>
            {WD.map(w => <div key={w} style={{ textAlign: 'center', fontSize: '11px', color: '#9ca3af', padding: '2px 0' }}>{w}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px' }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} style={{ height: '40px' }} />;
              const ds = `${vy}-${String(vm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const cnt = counts[ds] || 0;
              const isSel = sy === vy && sm === vm + 1 && sd === day;
              const isTdy = ds === today;
              const isHol = HOLIDAY_SET.has(ds);
              const bg = isSel ? '#16a34a' : isTdy ? '#bbf7d0' : isHol ? '#fef08a' : 'transparent';
              return (
                <button key={i} onClick={() => pick(day)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'flex-start', paddingTop: '5px',
                  height: '40px', borderRadius: '8px', cursor: 'pointer', border: 'none',
                  background: bg,
                  color: isSel ? '#fff' : '#111827',
                }}>
                  <span style={{ display: 'block', fontSize: '13px', height: '16px', lineHeight: '16px' }}>{day}</span>
                  <span style={{
                    display: 'block', fontSize: '10px', height: '12px', lineHeight: '12px', fontWeight: 600,
                    visibility: cnt > 0 ? 'visible' : 'hidden',
                    color: isSel ? 'rgba(255,255,255,0.85)' : '#16a34a',
                  }}>{cnt}</span>
                </button>
              );
            })}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
'''

