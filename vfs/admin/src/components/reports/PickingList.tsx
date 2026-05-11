import type { PickingSheet } from '../../utils/reportData';

interface Props {
  sheets: PickingSheet[];
  selectedIds: Set<string>;
  onToggle: (customerId: string) => void;
  onPreview: (customerId: string) => void;
  previewingId: string | null;
}

export default function PickingList({ sheets, selectedIds, onToggle, onPreview, previewingId }: Props) {
  if (sheets.length === 0) {
    return <p className="text-sm text-gray-400 px-4 py-8 text-center">當日無點貨資料</p>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {sheets.map(s => (
        <li key={s.customerId}
            className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-50 ${previewingId === s.customerId ? 'bg-blue-50' : ''}`}>
          <input
            type="checkbox"
            checked={selectedIds.has(s.customerId)}
            onChange={() => onToggle(s.customerId)}
            className="w-4 h-4"
          />
          <div className="flex-1">
            <div className="font-medium text-gray-900 text-sm">{s.customerCode}</div>
            <div className="text-xs text-gray-400">{s.lines.length} 品項</div>
          </div>
          <button
            onClick={() => onPreview(s.customerId)}
            className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">
            預覽
          </button>
        </li>
      ))}
    </ul>
  );
}
