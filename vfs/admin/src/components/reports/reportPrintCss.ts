export const REPORT_PRINT_CSS = `
.report-sheet { page-break-after: always; }
.report-sheet:last-child { page-break-after: auto; }
.report-company { text-align: center; font-size: 14pt; font-weight: bold; padding-bottom: 4pt; margin-bottom: 4pt; letter-spacing: 2pt; }
.report-header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5pt solid #000; padding-bottom: 6pt; margin-bottom: 8pt; font-size: 12pt; font-weight: bold; }
.report-header .meta { font-size: 10pt; font-weight: normal; }
.report-title { font-size: 14pt; }
.report-columns { column-count: 2; column-gap: 8mm; column-rule: 0.5pt solid #ccc; font-size: 10pt; }
.report-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; font-size: 10pt; }
.report-col { border-right: 0.5pt solid #ccc; padding-right: 4mm; }
.report-col:last-child { border-right: none; padding-right: 0; }
.purchase-flow { font-size: 10pt; }
.purchase-page-header { text-align: center; padding-bottom: 4pt; margin-bottom: 6pt; border-bottom: 1.5pt solid #000; }
.purchase-page-header .report-company { padding: 0; margin: 0; border: none; }
.purchase-page-meta { font-size: 11pt; padding-top: 2pt; }
.purchase-columns { column-count: 2; column-gap: 8mm; column-rule: 0.5pt solid #ccc; }
.supplier-section { break-inside: auto; padding-bottom: 6pt; }
.supplier-header { font-weight: bold; font-size: 11pt; padding: 4pt 0 2pt; border-top: 1pt solid #000; break-after: avoid; }
.supplier-section:first-child .supplier-header { border-top: none; padding-top: 0; }
.supplier-header + .report-table-header { break-before: avoid; }
.supplier-header .meta { font-weight: normal; font-size: 9pt; color: #666; }
.report-product-block { break-inside: avoid; margin-bottom: 4pt; }
.report-product-block + .report-product-block { border-top: 0.5pt dashed #999; padding-top: 3pt; }
.report-product-name { font-weight: bold; font-size: 10pt; margin-bottom: 2pt; }
.report-table-header { display: grid; grid-template-columns: 4em 1fr 4em 4em 1fr; gap: 4pt; padding: 3pt 0; margin-bottom: 4pt; border-bottom: 1pt solid #000; font-weight: bold; font-size: 10pt; }
.report-table-header .num { text-align: right; }
.report-row { display: grid; grid-template-columns: 4em 1fr 4em 4em 1fr; gap: 4pt; padding: 1pt 0; break-inside: avoid; }
.report-row .num { text-align: right; font-variant-numeric: tabular-nums; }
.report-row .note { color: #444; font-size: 9pt; }
.picking-table-header { display: grid; grid-template-columns: 5em 1fr 4em 4em; gap: 4pt; padding: 3pt 0; margin-bottom: 4pt; border-bottom: 1pt solid #000; font-weight: bold; font-size: 10pt; }
.picking-table-header .num { text-align: right; }
.picking-row { display: grid; grid-template-columns: 5em 1fr 4em 4em; gap: 4pt; padding: 1pt 0; break-inside: avoid; }
.picking-row .num { text-align: right; font-variant-numeric: tabular-nums; }
.report-warning { font-size: 9pt; color: #b45309; background: #fef3c7; padding: 2pt 4pt; border-radius: 2pt; display: inline-block; }
`;
