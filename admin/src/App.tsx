import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AuthCallbackPage from './pages/AuthCallbackPage'
import AuthGuard from './components/AuthGuard'
import { useAdminStore } from './store/useAdminStore'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const OrdersPage = lazy(() => import('./pages/OrdersPage'))
const PurchasePage = lazy(() => import('./pages/PurchasePage'))
const DeliveryPage = lazy(() => import('./pages/DeliveryPage'))

function LoadingFallback() {
  return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">載入中...</div>
}

export default function App() {
  useEffect(() => {
    useAdminStore.getState().loadAll()
  }, [])

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/" element={<AuthGuard><DashboardPage /></AuthGuard>} />
          <Route path="/orders" element={<AuthGuard><OrdersPage /></AuthGuard>} />
          <Route path="/purchase" element={<AuthGuard><PurchasePage /></AuthGuard>} />
          <Route path="/delivery" element={<AuthGuard><DeliveryPage /></AuthGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
