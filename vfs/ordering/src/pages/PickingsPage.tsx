import React, { useState, useEffect } from "react";
import * as db from "../db";
import { AppUser } from "../App";
import { RefreshCw } from "lucide-react";

const fmtQty = (v: number): string => v % 1 === 0 ? String(v) : v.toFixed(1);
const STATE_LABELS: Record<string, string> = { draft: "草稿", waiting: "等待", confirmed: "已確認", assigned: "備貨中", done: "完成", cancel: "已取消" };
const STATE_COLORS: Record<string, string> = { draft: "#9ca3af", waiting: "#9ca3af", confirmed: "#3b82f6", assigned: "#f59e0b", done: "#10b981", cancel: "#ef4444" };

interface PickingWithMoves { picking: any; moves: any[]; }

export default function PickingsPage({ user }: { user: AppUser }) {
  const [items, setItems] = useState<PickingWithMoves[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorInfo, setErrorInfo] = useState("");

  const load = async () => {
    setLoading(true); setErrorInfo("");
    try {
      const result = await db.runAction("get_pickings", {});
      const pickings: PickingWithMoves[] = (result?.pickings ?? []).sort((a: any, b: any) => {
        const da = a.picking.scheduled_date || a.picking.created_at || "";
        const dbv = b.picking.scheduled_date || b.picking.created_at || "";
        return String(dbv).localeCompare(String(da));
      });
      setItems(pickings);
    } catch (err: any) {
      setErrorInfo(err.message || "載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const renderPicking = (p: any, moves: any[]) => {
    const s = typeof p.state === "string" ? p.state : "";
    const sched = (p.scheduled_date || "").slice(0, 10);
    const done = (p.date_done || "").slice(0, 10);
    const total = moves.reduce((sum: number, m: any) => sum + Number(m.price_unit || 0) * Number(m.quantity || 0), 0);
    return (
      <div key={p.id} className="order-card">
        <div className="order-top">
          <span className="order-name">{String(p.name || `銷貨單 ${String(p.id).slice(0, 8)}`)}</span>
          <span className="order-state" style={{ background: STATE_COLORS[s] || "#999" }}>{STATE_LABELS[s] || s || "—"}</span>
        </div>
        <div className="order-meta">
          <span>📅 預計：{sched || "—"}</span>
          {done && <span>✅ 完成：{done}</span>}
          {total > 0 && <span>💰 ${Math.round(total).toLocaleString()}</span>}
        </div>
        {p.note && <div className="order-remark">📝 {p.note}</div>}
        {moves.length > 0 && (
          <table className="order-lines">
            <thead><tr><th>品項</th><th>實送量</th><th>單價</th><th>備註</th></tr></thead>
            <tbody>
              {moves.map((m: any) => {
                const note = ((m.custom_data && typeof m.custom_data === "object") ? m.custom_data.note : "") || "";
                return (
                  <tr key={m.id}>
                    <td>{String(m.name || m.id || "")}</td>
                    <td>{Number(m.quantity) > 0 ? fmtQty(Number(m.quantity)) : "—"}</td>
                    <td>{Number(m.price_unit) > 0 ? `$${Number(m.price_unit).toLocaleString()}` : "—"}</td>
                    <td style={{ color: "#6b7280", fontSize: 12 }}>{note || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <div className="orders-page">
      <div className="orders-header">
        <h2>銷貨單</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}><RefreshCw size={16} /></button>
      </div>
      {errorInfo && <div className="error-box">無法讀取銷貨單：{errorInfo}</div>}
      {loading ? <div className="page-loading"><div className="spinner" /></div>
        : !errorInfo && items.length === 0 ? <p className="empty-msg">尚無銷貨單</p>
        : <div className="order-list">{items.map(({ picking, moves }) => renderPicking(picking, moves))}</div>}
    </div>
  );
}
