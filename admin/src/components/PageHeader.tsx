import { useAdminStore } from '../store/useAdminStore'
import { shiftDate } from '../utils/dateHelpers'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import BackButton from './BackButton'

interface Props {
  title: string
  showBack?: boolean
  children?: React.ReactNode
}

export default function PageHeader({ title, showBack = false, children }: Props) {
  const { targetDate, setTargetDate } = useAdminStore()

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {showBack && <BackButton />}
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          </div>

          <div className="flex items-center space-x-4 bg-gray-50 p-2 rounded-lg border border-gray-200 shadow-sm">
            <button
              onClick={() => setTargetDate(shiftDate(targetDate, -1))}
              className="p-1.5 hover:bg-gray-200 rounded-md transition-colors"
              title="前一天"
            >
              <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
            </button>

            <div className="flex flex-col items-center min-w-[120px]">
              <span className="text-xs text-gray-500 font-medium">訂單日期</span>
              <span className="text-base font-bold text-blue-700 tracking-wide">{targetDate}</span>
              <span className="text-[10px] text-gray-400">每天 02:00 AM 刷新</span>
            </div>

            <button
              onClick={() => setTargetDate(shiftDate(targetDate, 1))}
              className="p-1.5 hover:bg-gray-200 rounded-md transition-colors"
              title="後一天"
            >
              <ChevronRightIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
        {children && <div>{children}</div>}
      </div>
    </header>
  )
}
