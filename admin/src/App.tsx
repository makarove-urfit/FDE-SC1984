import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AuthCallbackPage from './pages/AuthCallbackPage'
import AuthGuard from './components/AuthGuard'
import { useAdminStore } from './store/useAdminStore'

// 路由懶載入 — 非首屏頁面按需載入 JS
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const PurchaseListPage = lazy(() => import('./pages/PurchaseListPage'))
const ProcurementPage = lazy(() => import('./pages/ProcurementPage'))
const StockPage = lazy(() => import('./pages/StockPage'))
const SalesOrdersPage = lazy(() => import('./pages/SalesOrdersPage'))
const DeliveryPage = lazy(() => import('./pages/DeliveryPage'))

// 載入中 fallback
function LoadingFallback() {
  return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">載入中...</div>
}

export default function App() {
  // App 層級資料預載 — 進入 app 就立即背景載入所有資料
  useEffect(() => {
    useAdminStore.getState().loadAll()
  }, [])

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Auth Callback — 不需要 AuthGuard */}
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          {/* 受保護路由 — 需要 AuthGuard */}
          <Route path="/" element={<AuthGuard><DashboardPage /></AuthGuard>} />
          <Route path="/purchase-list" element={<AuthGuard><PurchaseListPage /></AuthGuard>} />
          <Route path="/procurement" element={<AuthGuard><ProcurementPage /></AuthGuard>} />
          <Route path="/stock" element={<AuthGuard><StockPage /></AuthGuard>} />
          <Route path="/sales-orders" element={<AuthGuard><SalesOrdersPage /></AuthGuard>} />
          <Route path="/delivery" element={<AuthGuard><DeliveryPage /></AuthGuard>} />

          {/* 未知路由 → Dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
