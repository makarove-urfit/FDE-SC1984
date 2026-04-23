import { useCallback, useRef } from 'react';
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
