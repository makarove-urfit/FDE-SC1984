import React, { useEffect, useState } from "react";
import { Users, TrendingUp, Activity, FileText } from "lucide-react";
import { listRecords } from "../api";
import dataJson from "../data.json";

export const pageTitle = "範例儀錶板";

function findLeadsTable(data: any): any {
  if (!data || typeof data !== "object") return null;
  const entries = Array.isArray(data) ? data : Object.values(data);
  return entries.find((t: any) => t?.slug?.startsWith("leads")) || null;
}

export default function DashboardPage() {
  const [leadCount, setLeadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const leadsTable = findLeadsTable(dataJson);
        if (leadsTable?.id) {
          const records = await listRecords(leadsTable.id);
          setLeadCount(Array.isArray(records) ? records.length : 0);
        }
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, []);

  const stats = [
    { label: "潛在客戶總數", value: loading ? "..." : String(leadCount), icon: Users, color: "var(--primary)" },
    { label: "本月新增", value: "0", icon: TrendingUp, color: "var(--success)" },
    { label: "待跟進", value: "0", icon: Activity, color: "var(--warning)" },
    { label: "已轉換", value: "0", icon: FileText, color: "var(--muted-foreground)" },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">範例儀錶板</h1>
        <p className="page-description">可隨時移除或自由修改</p>
      </div>

      <div className="grid grid-4 mb-6">
        {stats.map((s, i) => (
          <div key={i} className="card">
            <div className="card-header">
              <div className="flex items-center justify-between">
                <span className="stat-label">{s.label}</span>
                <s.icon size={18} style={{ color: s.color }} />
              </div>
              <span className="stat-value">{s.value}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">快速操作</h3>
            <p className="card-description">常用功能入口</p>
          </div>
          <div className="card-content">
            <div className="flex flex-col gap-2">
              <button className="btn btn-primary w-full">新增潛在客戶</button>
              <button className="btn btn-ghost w-full">系統設定</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">功能展示說明</h3>
            <p className="card-description">此模板整合了以下 SDK</p>
          </div>
          <div className="card-content">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <span className="badge badge-primary">api.ts</span>
                <span className="text-sm">自訂資料表 CRUD（潛在客戶）</span>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <span className="badge badge-success">db.ts</span>
                <span className="text-sm">引用 SaaS 表（CRM 標籤）</span>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <span className="badge badge-warning">action.ts</span>
                <span className="text-sm">後端 Action（資料摘要）</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
