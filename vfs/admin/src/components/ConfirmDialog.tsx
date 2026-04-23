import { useEffect, useRef } from 'react';
interface Props {
  open: boolean; title: string; message: string;
  confirmText?: string; cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void; onCancel: () => void;
}
export default function ConfirmDialog({
  open, title, message, confirmText = '確認', cancelText = '取消',
  variant = 'warning', onConfirm, onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);
  if (!open) return null;
  const WarningIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>;
  const DangerIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>;
  const InfoIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>;
  const variants = {
    danger:  { Icon: DangerIcon, btnBg: '#dc2626', btnHover: '#b91c1c', ringClass: 'ring-red-100' },
    warning: { Icon: WarningIcon, btnBg: '#ea580c', btnHover: '#c2410c', ringClass: 'ring-orange-100' },
    info:    { Icon: InfoIcon,  btnBg: 'var(--color-primary)', btnHover: 'var(--color-primary-dark)', ringClass: 'ring-green-100' },
  };
  const v = variants[variant];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40" style={{backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)'}} />
      <div ref={dialogRef} onClick={e => e.stopPropagation()}
        className={`relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 ring-4 ${v.ringClass} animate-[dialogIn_0.2s_ease-out]`}>
        <div className="text-center space-y-3">
          <v.Icon />
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
          <p className="text-xs text-red-500 font-medium bg-red-50 rounded-lg px-3 py-1.5">此操作無法復原</p>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onCancel}
            className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors">{cancelText}</button>
          <button onClick={onConfirm}
            style={{backgroundColor:v.btnBg}} onMouseEnter={e=>(e.target as HTMLElement).style.backgroundColor=v.btnHover}
            onMouseLeave={e=>(e.target as HTMLElement).style.backgroundColor=v.btnBg}
            className="flex-1 py-2.5 text-white rounded-xl font-bold transition-colors">{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
