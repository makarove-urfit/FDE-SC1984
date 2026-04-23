import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../data/DataProvider';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';
const Arrow = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>;
const BoxIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>;
export default function StockPage() {
  const nav = useNavigate();
  const { products, productProducts, stockQuants, loading, selectedDate, setSelectedDate } = useData();
  const stockMap = useMemo(() => {
    // variant_id -> template_id 映射
    const vtMap: Record<string, string> = {};
    for (const v of productProducts) { if (v.product_tmpl_id) vtMap[v.id] = v.product_tmpl_id; }
    const sm: Record<string, number> = {};
    for (const q of stockQuants) {
      if (!q.product_id) continue;
      const tmplId = vtMap[q.product_id] || q.product_id;
      sm[tmplId] = (sm[tmplId] || 0) + Number(q.quantity || 0);
    }
    return sm;
  }, [productProducts, stockQuants]);
  if(loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">載入中...</p></div>;
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={()=>nav('/admin/daily')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"><Arrow/></button>
          <div><h1 className="text-xl font-bold text-gray-900">庫存總表</h1><p className="text-sm text-gray-400">{products.length} 個商品</p></div>
        </div>
        <DatePickerWithCounts value={selectedDate} onChange={setSelectedDate} />
      </header>
      <div className="p-6 max-w-5xl mx-auto">
        {products.length===0?(
          <div className="text-center py-12 space-y-3"><BoxIcon /><p className="text-gray-500 font-medium">尚無商品紀錄</p><p className="text-sm text-gray-400">商品匯入後將顯示在此</p></div>
        ):(
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
              <th className="py-3 px-4 text-left font-medium">#</th>
              <th className="py-3 px-4 text-left font-medium">編號</th>
              <th className="py-3 px-4 text-left font-medium">品名</th>
              <th className="py-3 px-4 text-right font-medium">進貨價</th>
              <th className="py-3 px-4 text-right font-medium">售價</th>
              <th className="py-3 px-4 text-right font-medium">庫存數量</th>
            </tr></thead><tbody>
              {products.map((p,i)=>{
                const qty = stockMap[p.id] || 0;
                return (<tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2.5 px-4 text-gray-400">{i+1}</td>
                <td className="py-2.5 px-4 font-mono text-xs text-gray-400">{p.default_code||'—'}</td>
                <td className="py-2.5 px-4 font-medium">{p.name}</td>
                <td className="py-2.5 px-4 text-right">{Number(p.standard_price||0)>0 ? `$${Number(p.standard_price).toLocaleString()}` : '—'}</td>
                <td className="py-2.5 px-4 text-right font-bold text-primary">{Number(p.list_price||0)>0 ? `$${Number(p.list_price).toLocaleString()}` : '—'}</td>
                <td className="py-2.5 px-4 text-right"><span className={`font-bold ${qty > 0 ? 'text-green-600' : 'text-gray-400'}`}>{qty > 0 ? qty.toFixed(1) : '0'}</span></td>
              </tr>);
              })}
            </tbody></table>
          </div>
        )}
      </div>
    </div>
  );
}
