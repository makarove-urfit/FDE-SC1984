import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AuthCallbackPage from './pages/AuthCallbackPage'
import AuthGuard from './components/AuthGuard'
import LoadingCover from './components/LoadingCover'
import ToastContainer from './components/ToastContainer'
import { useAdminStore } from './store/useAdminStore'
import { useUIStore } from './store/useUIStore'
import { refreshToken, getAdminToken, clearAdminToken } from './api/auth'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const OrdersPage = lazy(() => import('./pages/OrdersPage'))
const PurchasePage = lazy(() => import('./pages/PurchasePage'))
const AllocationPage = lazy(() => import('./pages/AllocationPage'))
const DeliveryPage = lazy(() => import('./pages/DeliveryPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const SupplierMappingPage = lazy(() => import('./pages/SupplierMappingPage'))
const OrderEditPage = lazy(() => import('./pages/OrderEditPage'))
const DriverMappingPage = lazy(() => import('./pages/DriverMappingPage'))
const PricePage = lazy(() => import('./pages/PricePage'))
const PurchaseListPage = lazy(() => import('./pages/PurchaseListPage'))
const ProductsPage = lazy(() => import('./pages/ProductsPage'))
const ProductCategoriesPage = lazy(() => import('./pages/ProductCategoriesPage'))
const CategoryBuyerPage = lazy(() => import('./pages/CategoryBuyerPage'))

function LoadingFallback() {
  return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">載入中...</div>
}

const REFRESH_INTERVAL_MS = 13 * 60 * 1000 // 13 分鐘，token 15 分鐘過期

export default function App() {
  useEffect(() => {
    const ui = useUIStore.getState()
    ui.showLoading('載入資料中...')
    useAdminStore.getState().loadAll()
      .then(() => ui.hideLoading())
      .catch(() => {
        ui.hideLoading()
        ui.toast('error', '資料載入失敗，請重新整理')
      })
  }, [])

  useEffect(() => {
    const timer = setInterval(async () => {
      if (!getAdminToken()) return
      try {
        await refreshToken()
      } catch {
        clearAdminToken()
        window.location.href = '/'
      }
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <BrowserRouter>
      <LoadingCover />
      <ToastContainer />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/" element={<Navigate to="/daily" replace />} />
          <Route path="/daily" element={<AuthGuard><DashboardPage /></AuthGuard>} />
          <Route path="/daily/orders" element={<AuthGuard><OrdersPage /></AuthGuard>} />
          <Route path="/daily/purchase" element={<AuthGuard><PurchasePage /></AuthGuard>} />
          <Route path="/daily/allocation" element={<AuthGuard><AllocationPage /></AuthGuard>} />
          <Route path="/daily/delivery" element={<AuthGuard><DeliveryPage /></AuthGuard>} />
          <Route path="/daily/purchase-list" element={<AuthGuard><PurchaseListPage /></AuthGuard>} />
          <Route path="/daily/price" element={<AuthGuard><PricePage /></AuthGuard>} />
          <Route path="/daily/order/:orderId/edit" element={<AuthGuard><OrderEditPage /></AuthGuard>} />
          <Route path="/settings" element={<AuthGuard><DashboardPage /></AuthGuard>} />
          <Route path="/settings/products" element={<AuthGuard><ProductsPage /></AuthGuard>} />
          <Route path="/settings/product-categories" element={<AuthGuard><ProductCategoriesPage /></AuthGuard>} />
          <Route path="/settings/category-buyer" element={<AuthGuard><CategoryBuyerPage /></AuthGuard>} />
          <Route path="/settings/supplier-mapping" element={<AuthGuard><SupplierMappingPage /></AuthGuard>} />
          <Route path="/settings/driver-mapping" element={<AuthGuard><DriverMappingPage /></AuthGuard>} />
          <Route path="/settings/system" element={<AuthGuard><SettingsPage /></AuthGuard>} />
          <Route path="*" element={<Navigate to="/daily" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
