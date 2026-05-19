// vfs/admin/src/utils/codeHistory.ts
// 從客戶的 code_history 取出「已封存」（until 有值）的舊編碼，
// 供編輯分店表單顯示。純函式、無 DOM/React 依賴，可單元測試。

export interface SealedCode {
  code: string;
  since: string;
  until: string;
}

export function sealedCodeHistory(record: any): SealedCode[] {
  const hist = record?.custom_data?.code_history;
  if (!Array.isArray(hist)) return [];
  return hist
    .filter((e: any) => typeof e?.until === 'string' && e.until.trim() !== '')
    .map((e: any) => ({
      code: String(e?.code || ''),
      since: String(e?.since || '').slice(0, 10),
      until: String(e?.until || '').slice(0, 10),
    }));
}
