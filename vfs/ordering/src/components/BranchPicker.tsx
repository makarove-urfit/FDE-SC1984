import React from "react";
import type { SelectedBranch } from "../utils/branchSession";

interface Props {
  branches: SelectedBranch[];
  onSelect: (b: SelectedBranch) => void;
  onDismiss?: () => void;
  canDismiss?: boolean;
  loading?: boolean;
}

export default function BranchPicker({ branches, onSelect, onDismiss, canDismiss, loading }: Props) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff", borderRadius: 12, maxWidth: 480, width: "100%",
          maxHeight: "80vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 16 }}>選擇下單分店</strong>
          {canDismiss && (
            <button onClick={onDismiss} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
          )}
        </div>

        <div style={{ overflow: "auto", flex: 1, padding: "8px 0" }}>
          {loading && <div style={{ padding: 20, textAlign: "center", color: "#888" }}>載入中…</div>}

          {!loading && branches.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: "#888" }}>
              <p>您尚未綁定任何分店。</p>
              <p style={{ fontSize: 12 }}>請使用您收到的邀請連結兌換 token。</p>
            </div>
          )}

          {!loading && branches.map(b => (
            <button
              key={b.branch_id}
              onClick={() => onSelect(b)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "12px 20px", border: "none", background: "none",
                borderBottom: "1px solid #f0f0f0", cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600 }}>{b.branch_name}</div>
              {b.hq_name && <div style={{ fontSize: 12, color: "#888" }}>{b.hq_name}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
