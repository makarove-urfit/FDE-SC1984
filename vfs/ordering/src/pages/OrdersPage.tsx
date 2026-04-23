import React, { useState, useEffect, useMemo } from "react";
import * as db from "../db";
import { AppUser } from "../App";
import { RefreshCw } from "lucide-react";

const STATE_LABELS: Record<string, string> = {
  draft: "已送出", sent: "已送出", sale: "已確認", done: "完成", cancel: "已取消",
};
const STATE_COLORS: Record<string, string> = {
  draft: "#3b82f6", sent: "#3b82f6", sale: "#10b981", done: "#6b7280", cancel: "#ef4444",
};

const DAY_NAMES_O = ["日","一","二","三","四","五","六"];
function fmtDateHeader(ymd: string): string {
  if (!ymd || ymd === "未排程") return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  return `${ymd}（週${DAY_NAMES_O[dt.getDay()]}）`;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function parseDeliveryDate(note: string, lines: any[]): string {
  // 優先從 lines 取
  const fromLine = lines.find((l: any) => l.delivery_date)?.delivery_date;
  if (fromLine) return String(fromLine).slice(0, 10);
  // fallback 解析 note
  const m = note?.match(/配送日期：(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}
function parseNote(note: string): string {
  return (note || "").replace(/配送日期：\d{4}-\d{2}-\d{2}\n?/, "").trim();
}
function canEditOrder(order: any, cutoffTime: string, lines: any[]): boolean {
  if (order.state !== "draft") return false;
  const delivery = parseDeliveryDate(order.note || "", lines);
  if (!delivery) return true;
  const now = new Date();
  const todayYMD = toYMD(now);
  if (cutoffTime) {
    const [cutH, cutM] = cutoffTime.split(":").map(Number);
    const isPastCutoff = now.getHours() * 60 + now.getMinutes() >= cutH * 60 + cutM;
    if (isPastCutoff) return delivery > todayYMD;
  }
  return delivery >= todayYMD;
}

interface OrderWithLines { order: any; lines: any[]; }

export default function OrdersPage({ user, cutoffTime }: { user: AppUser; cutoffTime: string }) {
  const [items, setItems] = useState<OrderWithLines[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorInfo, setErrorInfo] = useState("");
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [editQtys, setEditQtys] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [sortBy, setSortBy] = useState<"delivery_date" | "order_date">("delivery_date");

  const load = async () => {
    setLoading(true);
    setErrorInfo("");
    setEditOrderId(null);
    try {
      const custs = await db.query("customers", {
        filters: [{ column: "email", op: "eq", value: user.email }],
      });
      const cust = Array.isArray(custs) ? custs[0] : null;
      if (!cust) { setItems([]); return; }

      const orders = await db.query("sale_orders", {
        filters: [{ column: "customer_id", op: "eq", value: cust.id }],
      });
      const list: any[] = Array.isArray(orders) ? orders : [];
      // 先依下單日期降冪排序（作為次排序依據）
      list.sort((a, b) =>
        new Date(b.date_order || 0).getTime() - new Date(a.date_order || 0).getTime()
      );


      const results = await Promise.all(list.map(async o => {
        const lines = await db.query("sale_order_lines", {
          filters: [{ column: "order_id", op: "eq", value: o.id }],
        });
        return { order: o, lines: Array.isArray(lines) ? lines : [] };
      }));
      setItems(results);
    } catch (err: any) {
      setErrorInfo(err.message || "載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (o: any, lines: any[]) => {
    const qtys: Record<string, number> = {};
    for (const l of lines) qtys[l.id] = Number(l.product_uom_qty || 0);
    setEditQtys(qtys);
    setEditOrderId(o.id);
  };

  const saveEdit = async (orderId: string, lines: any[]) => {
    setSaving(true);
    try {
      await db.runAction("update_order_lines", {
        order_id: orderId,
        lines: lines.map(l => ({ id: l.id, qty: editQtys[l.id] ?? Number(l.product_uom_qty || 0) })),
      });
      const [newOrders, newLines] = await Promise.all([
        db.query("sale_orders", { filters: [{ column: "id", op: "eq", value: orderId }] }),
        db.query("sale_order_lines", { filters: [{ column: "order_id", op: "eq", value: orderId }] }),
      ]);
      const newOrder = Array.isArray(newOrders) ? newOrders[0] : null;
      setItems(prev => prev.map(item =>
        item.order.id === orderId
          ? {
              order: newOrder ?? item.order,
              lines: Array.isArray(newLines) ? newLines : item.lines,
            }
          : item
      ));
      setEditOrderId(null);
    } catch (err: any) {
      alert("儲存失敗：" + (err.message || "未知錯誤"));
    } finally {
      setSaving(false);
    }
  };

  const todayYMD = toYMD(new Date());

  // 依所選模式分組；配送日期模式下分為 upcoming / past 兩段
  const { upcoming, past } = useMemo(() => {
    if (sortBy !== "delivery_date") return { upcoming: [] as { date: string; orders: OrderWithLines[] }[], past: [] };

    const groups: Record<string, OrderWithLines[]> = {};
    for (const item of items) {
      const key = parseDeliveryDate(item.order.note || "", item.lines) || "未排程";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    const upcomingKeys: string[] = [];
    const pastKeys: string[] = [];
    for (const k of Object.keys(groups)) {
      if (k === "未排程" || k >= todayYMD) upcomingKeys.push(k);
      else pastKeys.push(k);
    }
    upcomingKeys.sort((a, b) => a === "未排程" ? 1 : b === "未排程" ? -1 : a.localeCompare(b));
    pastKeys.sort((a, b) => b.localeCompare(a)); // 最近的過期在上
    return {
      upcoming: upcomingKeys.map(k => ({ date: k, orders: groups[k] })),
      past: pastKeys.map(k => ({ date: k, orders: groups[k] })),
    };
  }, [items, sortBy, todayYMD]);

  const dateGroups = useMemo(() => {
    if (sortBy === "delivery_date") return [];
    const groups: Record<string, OrderWithLines[]> = {};
    for (const item of items) {
      const key = (item.order.date_order || "").slice(0, 10) || "未知";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.keys(groups)
      .sort((a, b) => a === "未知" ? 1 : b === "未知" ? -1 : b.localeCompare(a))
      .map(k => ({ date: k, orders: groups[k] }));
  }, [items, sortBy]);

  const renderOrderCard = (o: any, lines: any[]) => {
    const s = typeof o.state === "string" ? o.state : "";
    const delivery = parseDeliveryDate(o.note || "", lines);
    const orderDate = (o.date_order || "").slice(0, 10);
    const remark = parseNote(o.note || "");
    const rawTotal = typeof o.amount_total === "number" && o.amount_total > 0
      ? o.amount_total
      : lines.reduce((sum, l) => sum + (Number(l.price_unit) || 0) * (Number(l.product_uom_qty) || 0), 0);
    const total = rawTotal > 0 ? rawTotal.toLocaleString("zh-TW", { minimumFractionDigits: 0 }) : null;
    const isEditing = editOrderId === o.id;
    const editable = canEditOrder(o, cutoffTime, lines);
    return (
      <div key={o.id} className="order-card">
        <div className="order-top">
          <span className="order-name">{String(o.name || `訂單 ${String(o.id).slice(0, 8)}`)}</span>
          <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
            {editable && !isEditing && (
              <button onClick={() => startEdit(o, lines)} title="修改訂單"
                style={{ background:"none", border:"none", padding:"2px", cursor:"pointer", color:"#9ca3af", display:"flex", alignItems:"center" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            )}
            <span className="order-state" style={{ background: STATE_COLORS[s] || "#999" }}>
              {STATE_LABELS[s] || s || "—"}
            </span>
          </div>
        </div>
        <div className="order-meta">
          <span>🗓 下單：{orderDate || "—"}</span>
          <span>📅 配送：{delivery || "未排程"}</span>
          {total && <span>💰 ${total}</span>}
        </div>
        {remark && <div className="order-remark">📝 {remark}</div>}
        {lines.length > 0 && (
          <table className="order-lines">
            <thead>
              <tr><th>品項</th><th>數量</th><th>單價</th></tr>
            </thead>
            <tbody>
              {lines.map((l: any) => (
                <tr key={l.id}>
                  <td>{String(l.name || l.id || "")}</td>
                  <td>
                    {isEditing ? (
                      <input
                        type="text" inputMode="decimal"
                        value={editQtys[l.id] ?? Number(l.product_uom_qty || 0)}
                        onChange={e => {
                          const v = e.target.value;
                          if (/^\d*\.?\d*$/.test(v)) setEditQtys(prev => ({ ...prev, [l.id]: v as any }));
                        }}
                        onBlur={e => setEditQtys(prev => ({ ...prev, [l.id]: parseFloat(e.target.value) || 0 }))}
                        style={{ width: "64px", padding: "2px 6px", border: "1px solid #d1d5db", borderRadius: "4px", fontSize: "14px", textAlign: "right" }}
                      />
                    ) : (l.product_uom_qty ?? "—")}
                  </td>
                  <td>{typeof l.price_unit === "number" ? `$${l.price_unit.toLocaleString()}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isEditing && (
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button onClick={() => saveEdit(o.id, lines)} disabled={saving}
              style={{ flex: 1, padding: "8px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}
            >{saving ? "儲存中..." : "儲存"}</button>
            <button onClick={() => setEditOrderId(null)} disabled={saving}
              style={{ flex: 1, padding: "8px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", cursor: "pointer", color: "#374151" }}
            >取消</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="orders-page">
      {/* 懸浮排序按鈕 */}
      <div className="sort-fab">
        <button className={`sort-fab-btn${sortBy === "delivery_date" ? " active" : ""}`}
          onClick={() => setSortBy("delivery_date")}>📅 配送日期</button>
        <button className={`sort-fab-btn${sortBy === "order_date" ? " active" : ""}`}
          onClick={() => setSortBy("order_date")}>🗓 下單日期</button>
      </div>

      <div className="orders-header">
        <h2>訂單紀錄</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}><RefreshCw size={16} /></button>
      </div>
      {errorInfo && <div className="error-box">無法讀取訂單：{errorInfo}</div>}
      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : !errorInfo && items.length === 0 ? (
        <p className="empty-msg">尚無訂單</p>
      ) : (
        <div>
          {sortBy === "delivery_date" ? (
            <>
              {upcoming.map(({ date, orders: groupOrders }) => (
                <div key={date} style={{ marginBottom: "16px" }}>
                  <div className="order-group-header">
                    <span>📅 {fmtDateHeader(date)}</span>
                    <span style={{ fontSize: "12px" }}>{groupOrders.length} 筆</span>
                    <div className="order-group-divider" />
                  </div>
                  <div className="order-list">
                    {groupOrders.map(({ order: o, lines }) => renderOrderCard(o, lines))}
                  </div>
                </div>
              ))}
              {past.length > 0 && (
                <>
                  <div className="past-orders-divider">
                    <div className="past-orders-divider-line" />
                    <span>以上為過去訂單</span>
                    <div className="past-orders-divider-line" />
                  </div>
                  {past.map(({ date, orders: groupOrders }) => (
                    <div key={date} style={{ marginBottom: "16px", opacity: 0.6 }}>
                      <div className="order-group-header">
                        <span>📅 {fmtDateHeader(date)}</span>
                        <span style={{ fontSize: "12px" }}>{groupOrders.length} 筆</span>
                        <div className="order-group-divider" />
                      </div>
                      <div className="order-list">
                        {groupOrders.map(({ order: o, lines }) => renderOrderCard(o, lines))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            dateGroups.map(({ date, orders: groupOrders }) => (
              <div key={date} style={{ marginBottom: "16px" }}>
                <div className="order-group-header">
                  <span>🗓 {fmtDateHeader(date)}</span>
                  <span style={{ fontSize: "12px" }}>{groupOrders.length} 筆</span>
                  <div className="order-group-divider" />
                </div>
                <div className="order-list">
                  {groupOrders.map(({ order: o, lines }) => renderOrderCard(o, lines))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
