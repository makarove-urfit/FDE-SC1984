// vfs/admin/src/utils/routeChange.ts
// 編輯分店、變更路線時，判定該走「首次發碼 / 搬路線 / 不需動作」哪一條，
// 並產生對應的確認訊息。純函式、無 DOM/React 依賴，可單元測試。
//
// 為什麼需要：saveEdit 原本只要偵測到路線變更就一律呼叫 reassign_customer_route
// （搬路線＝封舊號發新號），對「從未發過碼」的分店會產生「封存 (無)」這種無意義
// 訊息、且 reassign action 會直接拒絕無編碼客戶。無編碼分店改路線該做的是首次發碼。

export type RouteChangeAction = 'assign' | 'reassign' | 'none';

export interface RouteChangePlan {
  action: RouteChangeAction;
  confirmMessage: string;
}

export function planRouteChange(opts: {
  ref: string;
  oldRegionTagId: string;
  newRegionTagId: string;
}): RouteChangePlan {
  const ref = String(opts.ref || '').trim();
  const oldId = String(opts.oldRegionTagId || '').trim();
  const newId = String(opts.newRegionTagId || '').trim();

  // 路線沒變、或路線被清空 → 不發碼也不搬路線，交給一般 db.update 處理
  if (!newId || newId === oldId) {
    return { action: 'none', confirmMessage: '' };
  }

  // 已有編碼 → 搬路線：封存舊碼、在新路線發新號
  if (ref) {
    return {
      action: 'reassign',
      confirmMessage:
        `將為此分店搬路線：舊編碼 ${ref} 會被封存，並在新路線發放新的客戶編碼。\n確定要搬路線？`,
    };
  }

  // 尚無編碼 → 首次發碼
  return {
    action: 'assign',
    confirmMessage:
      '此分店尚未有客戶編碼，將在所選路線發放新的客戶編碼。\n確定要發碼？',
  };
}
