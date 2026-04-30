import { useState, useEffect, useCallback } from "react";
import { runAction } from "../db";

interface FavRecord {
  id: string;
  product_tmpl_id: string;
  default_note?: string;
}

export function useFavorites(customerId: string) {
  const [recordMap, setRecordMap] = useState<Record<string, FavRecord>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    setLoading(true);
    runAction("manage_favorites", { op: "list", customer_id: customerId })
      .then((d: any) => {
        const map: Record<string, FavRecord> = {};
        for (const r of (d?.favorites ?? [])) {
          const tid = String(r.product_tmpl_id || "");
          if (!tid) continue;
          map[tid] = { id: String(r.id), product_tmpl_id: tid, default_note: r.default_note || "" };
        }
        setRecordMap(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId]);

  const toggleFavorite = useCallback(async (tmplId: string) => {
    const existing = recordMap[tmplId];
    if (existing) {
      const removed = existing;
      setRecordMap(prev => { const n = { ...prev }; delete n[tmplId]; return n; });
      runAction("manage_favorites", { op: "remove", record_id: existing.id })
        .catch(() => setRecordMap(prev => ({ ...prev, [tmplId]: removed })));
    } else {
      const tempId = "pending-" + tmplId;
      setRecordMap(prev => ({ ...prev, [tmplId]: { id: tempId, product_tmpl_id: tmplId, default_note: "" } }));
      runAction("manage_favorites", { op: "add", customer_id: customerId, product_tmpl_id: tmplId })
        .then((d: any) => {
          const id = String(d?.record?.id ?? "");
          if (!id) return;
          setRecordMap(prev => ({ ...prev, [tmplId]: { id, product_tmpl_id: tmplId, default_note: prev[tmplId]?.default_note || "" } }));
        })
        .catch(() => setRecordMap(prev => { const n = { ...prev }; delete n[tmplId]; return n; }));
    }
  }, [customerId, recordMap]);

  const setProductDefaultNote = useCallback(async (tmplId: string, note: string) => {
    const cleanNote = (note || "").trim();
    const existing = recordMap[tmplId];
    setRecordMap(prev => ({
      ...prev,
      [tmplId]: { id: existing?.id || ("pending-" + tmplId), product_tmpl_id: tmplId, default_note: cleanNote },
    }));
    try {
      const r = await runAction("manage_favorites", {
        op: "set_note",
        customer_id: customerId,
        product_tmpl_id: tmplId,
        record_id: existing?.id?.startsWith("pending-") ? "" : (existing?.id || ""),
        default_note: cleanNote,
      });
      const rid = String(r?.record_id || "");
      if (rid) {
        setRecordMap(prev => ({ ...prev, [tmplId]: { id: rid, product_tmpl_id: tmplId, default_note: cleanNote } }));
      }
    } catch {}
  }, [customerId, recordMap]);

  const favoriteSet = new Set(Object.keys(recordMap));
  const defaultNoteMap: Record<string, string> = {};
  for (const [tid, r] of Object.entries(recordMap)) {
    if (r.default_note) defaultNoteMap[tid] = r.default_note;
  }

  return { favoriteSet, toggleFavorite, defaultNoteMap, setProductDefaultNote, favoritesLoading: loading };
}
