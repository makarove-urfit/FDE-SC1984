import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../db';
import { useData } from '../../data/DataProvider';
import { fmtQty } from '../../utils/displayHelpers';
import ConfirmDialog from '../../components/ConfirmDialog';
import DatePickerWithCounts from '../../components/DatePickerWithCounts';
const Arrow = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>;
const TruckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>;
const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>;
const MapPinIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>;
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>;
const SaveIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>;
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const stCfg: Record<string,{label:string;color:string}> = {sale:{label:'待出貨',color:'bg-orange-100 text-orange-700'},done:{label:'已完成',color:'bg-green-100 text-green-700'}};
export default function DeliveryPage() {
  const nav = useNavigate();
  const { orders: allOrders, customers, orderLines: lines, employees, loading, refresh, selectedDate, setSelectedDate } = useData();
  const [orders, setOrders] = useState<any[]>([]);
  const [localCusts, setLocalCusts] = useState<Record<string,any>>({});
  const [expanded, setExpanded] = useState<string|null>(null);
  const [confirm, setConfirm] = useState<{id:string;action:string;driverIdToSave?:string}|null>(null);
  const [editingAddr, setEditingAddr] = useState<string|null>(null);
  const [addrDraft, setAddrDraft] = useState('');
  const [savingAddr, setSavingAddr] = useState(false);
  const [driverFilter, setDriverFilter] = useState('all');
  const [savingDriver, setSavingDriver] = useState<string|null>(null);
  const [custToDriver, setCustToDriver] = useState<Record<string,string>>({});
  const [localDrivers, setLocalDrivers] = useState<Record<string,string>>({});

  // #6 empMap 用 useMemo 避免每次 render 重建
  const empMap = useMemo(() => Object.fromEntries(employees.map(e=>[e.id, e])), [employees]);

  // 從 customer_tags (路線) 建立 customerid → empId 對應
  // 路線: customer_tag.custom_data.default_driver_id = user_id
  // 客戶: customer.custom_data.region_tag_id → customer_tag
  // 員工: user_id → emp.id (AIGO UUID)
  useEffect(() => {
    if (employees.length === 0) return;
    db.query('customer_tags').then((rawTags: any[]) => {
      const userIdToEmpId: Record<string, string> = {};
      for (const e of employees) {
        if (e.user_id) userIdToEmpId[String(e.user_id)] = String(e.id);
      }
      const tagToDriver: Record<string, string> = {};
      for (const t of (rawTags || [])) {
        const cd = t.custom_data || {};
        if (cd.category === 'region' && cd.default_driver_id) {
          const empId = userIdToEmpId[String(cd.default_driver_id)];
          if (empId) tagToDriver[String(t.id)] = empId;
        }
      }
      const map: Record<string, string> = {};
      for (const [cid, cust] of Object.entries(customers)) {
        const tagId = String((cust as any)?.custom_data?.region_tag_id || '');
        if (tagId && tagToDriver[tagId]) map[cid] = tagToDriver[tagId];
      }
      setCustToDriver(map);
    }).catch((e: any) => console.error('路線司機載入失敗:', e.message));
  }, [employees, customers]);

  // #1 用 useEffect 同步 allOrders → 本地 state（修復 render body setState 無限迴圈）
  useEffect(() => {
    if (!loading) {
      const dateIds = new Set(lines.filter((l:any) => String(l.delivery_date||'').slice(0,10) === selectedDate).map((l:any) => { const v = l.order_id; return Array.isArray(v) ? String(v[0]) : String(v||''); }));
      setOrders(allOrders.filter((x:any)=>['sale','done'].includes(x.state) && dateIds.has(String(x.id))));
    }
  }, [allOrders, lines, loading, selectedDate]);

  // #3 同步全域 customers → 本地 custs（用於地址寫入後更新 UI）
  const custs = useMemo(() => ({...customers, ...localCusts}), [customers, localCusts]);

  const doAction=async()=>{
    if(!confirm)return;
    try{
      if(confirm.driverIdToSave) await assignDriver(confirm.id, confirm.driverIdToSave);
      await db.update('sale_orders',confirm.id,{state:confirm.action});
      setOrders(prev=>prev.map(o=>o.id===confirm.id?{...o,state:confirm.action}:o));
    }catch(e:any){console.error('失敗:',e.message)}
    setConfirm(null);
  };

  // 地址 — #3 修復：用 setLocalCusts 取代不存在的 setCusts
  const saveAddress=async(cid:string)=>{
    setSavingAddr(true);
    try{ await db.update('customers',cid,{contact_address:addrDraft}); setLocalCusts(prev=>({...prev,[cid]:{...(customers[cid]||prev[cid]||{}),contact_address:addrDraft}})); setEditingAddr(null); }
    catch(e:any){console.error('地址儲存失敗:',e.message)} setSavingAddr(false);
  };
  const startEditAddr=(cid:string)=>{ setEditingAddr(cid); setAddrDraft(custs[cid]?.contact_address||''); };

  // 配送負責人（存員工 ID 到 client_order_ref）
  const assignDriver=async(oid:string,empId:string)=>{
    setSavingDriver(oid);
    try{
      await db.update('sale_orders',oid,{client_order_ref:empId||null});
      setOrders(prev=>prev.map(o=>o.id===oid?{...o,client_order_ref:empId||null}:o));
    }catch(e:any){console.error('指派失敗:',e.message)} setSavingDriver(null);
  };


  // 批次指派：把所有有路線預設但尚未指派司機的訂單全部存起來
  const [batchAssigning, setBatchAssigning] = useState(false);
  const batchAssign = async () => {
    const pending = orders.filter(o => !o.client_order_ref && custToDriver[String(o.customer_id||'')]);
    if (pending.length === 0) return;
    setBatchAssigning(true);
    await Promise.all(pending.map(o => assignDriver(o.id, custToDriver[String(o.customer_id)])));
    setBatchAssigning(false);
  };
  const pendingBatchCount = orders.filter(o => !o.client_order_ref && custToDriver[String(o.customer_id||'')]).length;

  // 過濾
  const filteredOrders=driverFilter==='all'?orders:driverFilter==='unassigned'?orders.filter(o=>!o.client_order_ref):orders.filter(o=>o.client_order_ref===driverFilter);
  const assignedEmpIds=[...new Set(orders.map(o=>o.client_order_ref).filter(Boolean))];

  const custGroups=new Map<string,any[]>();
  for(const o of filteredOrders){const l=custGroups.get(o.customer_id)||[];l.push(o);custGroups.set(o.customer_id,l);}
  const co=confirm?orders.find(o=>o.id===confirm.id):null;

  // 統計（按員工 ID）
  const driverStats=new Map<string,number>();
  for(const o of orders){const d=o.client_order_ref||'_unassigned';driverStats.set(d,(driverStats.get(d)||0)+1);}

  if(loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">載入中...</p></div>;
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={()=>nav('/admin/daily')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-gray-100 transition-colors border-none"><Arrow/></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">配送管理</h1>
            <p className="text-sm text-gray-400">{filteredOrders.length} 筆訂單{driverFilter!=='all'?` · ${driverFilter==='unassigned'?'未指派':empMap[driverFilter]?.name||driverFilter}`:''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DatePickerWithCounts value={selectedDate} onChange={setSelectedDate} />
          {pendingBatchCount > 0 && (
            <button onClick={batchAssign} disabled={batchAssigning}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium disabled:opacity-50">
              {batchAssigning ? '指派中...' : `批次指派路線司機 (${pendingBatchCount})`}
            </button>
          )}
          <UserIcon />
          <select className="px-3 pr-8 py-2 border border-gray-200 rounded-lg bg-white text-sm" value={driverFilter} onChange={e=>setDriverFilter(e.target.value)}>
            <option value="all">全部負責人 ({orders.length})</option>
            <option value="unassigned">未指派 ({driverStats.get('_unassigned')||0})</option>
            {assignedEmpIds.map(eid=>{const emp=empMap[eid]; return(<option key={eid} value={eid}>{emp?.name||eid} ({driverStats.get(eid)||0})</option>);})}
          </select>
        </div>
      </header>

      {/* 負責人摘要卡片 */}
      {assignedEmpIds.length>0 && driverFilter==='all' && (
        <div className="px-6 pt-4 flex gap-2 flex-wrap">
          <button onClick={()=>setDriverFilter('unassigned')}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium hover:bg-gray-50 transition-colors flex items-center gap-1.5">
            <UserIcon /><span>未指派</span><span className="bg-gray-100 px-1.5 py-0.5 rounded-full text-gray-500">{driverStats.get('_unassigned')||0}</span>
          </button>
          {assignedEmpIds.map(eid=>{const emp=empMap[eid]; return(
            <button key={eid} onClick={()=>setDriverFilter(eid)}
              className="px-3 py-1.5 bg-white border border-blue-200 rounded-full text-xs font-medium hover:bg-blue-50 transition-colors flex items-center gap-1.5 text-blue-700">
              <UserIcon /><span>{emp?.name||eid}</span>{emp?.job_title&&<span className="text-blue-400">({emp.job_title})</span>}<span className="bg-blue-50 px-1.5 py-0.5 rounded-full">{driverStats.get(eid)||0}</span>
            </button>
          );})}
        </div>
      )}

      <div className="p-6 max-w-5xl mx-auto">
        {custGroups.size===0?(
          <div className="text-center py-12 space-y-3"><TruckIcon /><p className="text-gray-500 font-medium">尚無待配送訂單</p><p className="text-sm text-gray-400">確認銷貨單後訂單將出現在此</p></div>
        ):(
          <div className="space-y-3">{Array.from(custGroups.entries()).map(([cid,cos])=>{
            const cust=custs[cid]; const exp=expanded===cid;
            const addr=cust?.contact_address;
            const isEditingThis=editingAddr===cid;
            return(<div key={cid} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div role="button" onClick={()=>setExpanded(exp?null:cid)} className="w-full px-4 py-4 flex justify-between items-center bg-white hover:bg-gray-50 cursor-pointer">
                <div className="text-left">
                  <p className="font-bold text-gray-900">{cust?.name||cid}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPinIcon />
                    <p className="text-xs text-gray-400">{addr || '地址未設定'}</p>
                  </div>
                  <p className="text-sm text-gray-400 mt-0.5">{cos.length} 筆</p>
                </div>
                <span className="text-gray-400 text-xl">{exp?'▾':'▸'}</span>
              </div>
              {exp&&<div className="border-t border-gray-100">
                {/* 地址區塊 */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  {isEditingThis ? (
                    <div className="flex gap-2 items-center">
                      <MapPinIcon />
                      <input type="text" value={addrDraft} onChange={e=>setAddrDraft(e.target.value)} placeholder="請輸入送貨地址..."
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" autoFocus
                        onKeyDown={e=>{if(e.key==='Enter')saveAddress(cid);if(e.key==='Escape')setEditingAddr(null);}} />
                      <button onClick={()=>saveAddress(cid)} disabled={savingAddr}
                        className="px-3 py-1 bg-primary text-white rounded text-xs hover:bg-green-700 transition-colors flex items-center gap-1">
                        <SaveIcon /> {savingAddr?'儲存中...':'儲存'}
                      </button>
                      <button onClick={()=>setEditingAddr(null)} className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300 transition-colors">取消</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <MapPinIcon />
                      <span className={`text-sm ${addr ? 'text-gray-700' : 'text-gray-400'}`}>{addr || '地址未設定'}</span>
                      <button onClick={e=>{e.stopPropagation();startEditAddr(cid);}}
                        className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300 transition-colors flex items-center gap-1">
                        <EditIcon /> {addr ? '編輯' : '設定地址'}
                      </button>
                    </div>
                  )}
                </div>
                {/* 訂單列表 */}
                {cos.map(o=>{const cfg=stCfg[o.state]||stCfg.sale;const ol=lines.filter(l=>l.order_id===o.id);
                  const savedDriverId=o.client_order_ref||'';
                  const routeDriverId=custToDriver[String(o.customer_id||'')]||'';
                  // 優先順序：手動選擇 > 已儲存 > 路線預設
                  const displayDriverId=localDrivers[o.id]??savedDriverId||routeDriverId;
                  const driverEmp=displayDriverId?empMap[displayDriverId]:null;
                  const isSavingThis=savingDriver===o.id;
                  const isUnsaved=displayDriverId&&displayDriverId!==savedDriverId;
                  return(<div key={o.id} className="border-t border-gray-200">
                    <div className="px-4 py-3 flex justify-between items-center">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{o.name||o.id}</p>
                        <p className="text-xs text-gray-400">{ol.length} 品項</p>
                        {/* 配送負責人 */}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <UserIcon />
                          {o.state==='done' ? (
                            <span className={`text-xs px-2 py-1 rounded ${driverEmp ? 'text-blue-700 bg-blue-50' : 'text-gray-400'}`}>{driverEmp?.name||'未指派'}</span>
                          ) : (
                            <select value={displayDriverId}
                              onChange={e=>setLocalDrivers(prev=>({...prev,[o.id]:e.target.value}))}
                              disabled={isSavingThis}
                              className={`text-xs px-2 pr-8 py-1 border rounded transition-colors ${driverEmp ? (isUnsaved?'border-amber-200 bg-amber-50 text-amber-700':'border-blue-200 bg-blue-50 text-blue-700') : 'border-gray-200 bg-white text-gray-400'}`}>
                              <option value="">-- 選擇負責人 --</option>
                              {employees.map(emp=>(<option key={emp.id} value={emp.id}>{emp.name}{emp.job_title?` (${emp.job_title})`:''}</option>))}
                            </select>
                          )}
                          {isUnsaved && !isSavingThis && <span className="text-xs text-amber-500">未儲存</span>}
                          {isSavingThis && <span className="text-xs text-gray-400">儲存中...</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                        {o.state==='sale'&&(()=>{
                          const canDone = !!displayDriverId && !!addr;
                          const tip = !displayDriverId ? '請先選擇配送負責人' : !addr ? '請先設定送貨地址' : '';
                          return (
                            <button onClick={()=>canDone?setConfirm({id:o.id,action:'done',driverIdToSave:isUnsaved?displayDriverId:undefined}):null}
                              disabled={!canDone} title={tip}
                              className={`px-3 py-1 rounded text-xs transition-colors flex items-center gap-1 ${canDone?'bg-primary text-white hover:bg-green-700 cursor-pointer':'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                              <CheckCircleIcon /> 完成配送
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="px-4 py-2"><div className="flex flex-wrap gap-1.5">
                      {ol.map((l:any)=>(<span key={l.id} className="px-2 py-0.5 bg-gray-50 rounded text-xs text-gray-500">{l.name} x{fmtQty(Number(l.product_uom_qty||0))}</span>))}
                    </div></div>
                  </div>);
                })}
              </div>}
            </div>);
          })}</div>
        )}
      </div>
      <ConfirmDialog open={!!confirm} title={`確認完成配送 ${co?.name||''}？`}
        message="標記為已完成後無法復原。" confirmText="確認完成" variant="info"
        onConfirm={doAction} onCancel={()=>setConfirm(null)} />
    </div>
  );
}
