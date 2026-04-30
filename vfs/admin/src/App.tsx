import { Routes, Route, Navigate } from "react-router-dom";
import DataProvider from "./data/DataProvider";
import DashboardPage from "./pages/admin/DashboardPage";
import PurchaseListPage from "./pages/admin/PurchaseListPage";
import ProcurementPage from "./pages/admin/ProcurementPage";
import StockPage from "./pages/admin/StockPage";
import SalesOrdersPage from "./pages/admin/SalesOrdersPage";
import DeliveryPage from "./pages/admin/DeliveryPage";
import ProductsPage from "./pages/admin/ProductsPage";
import ProductCategoriesPage from "./pages/admin/ProductCategoriesPage";
import CategoryBuyerPage from "./pages/admin/CategoryBuyerPage";
import SettingsPage from "./pages/admin/SettingsPage";
import SupplierMappingPage from "./pages/admin/SupplierMappingPage";
import DriverMappingPage from "./pages/admin/DriverMappingPage";
import CustomersPage from "./pages/admin/CustomersPage";
import RouteDriversPage from "./pages/admin/RouteDriversPage";
import SuppliersPage from "./pages/admin/SuppliersPage";
import EmployeesPage from "./pages/admin/EmployeesPage";

export default function App() {
  return (
    <DataProvider>
    <Routes>
      <Route path="/" element={<Navigate to="/admin/daily" replace />} />
      <Route path="/admin" element={<Navigate to="/admin/daily" replace />} />
      <Route path="/admin/daily" element={<DashboardPage />} />
      <Route path="/admin/daily/purchase-list" element={<PurchaseListPage />} />
      <Route path="/admin/daily/procurement" element={<ProcurementPage />} />
      <Route path="/admin/daily/stock" element={<StockPage />} />
      <Route path="/admin/daily/sales-orders" element={<SalesOrdersPage />} />
      <Route path="/admin/daily/delivery" element={<DeliveryPage />} />
      <Route path="/admin/settings" element={<DashboardPage />} />
      <Route path="/admin/settings/products" element={<ProductsPage />} />
      <Route path="/admin/settings/product-categories" element={<ProductCategoriesPage />} />
      <Route path="/admin/settings/category-buyer" element={<CategoryBuyerPage />} />
      <Route path="/admin/settings/supplier-mapping" element={<SupplierMappingPage />} />
      <Route path="/admin/settings/driver-mapping" element={<DriverMappingPage />} />
      <Route path="/admin/settings/customers" element={<CustomersPage />} />
      <Route path="/admin/settings/route-drivers" element={<RouteDriversPage />} />
      <Route path="/admin/settings/suppliers" element={<SuppliersPage />} />
      <Route path="/admin/settings/employees" element={<EmployeesPage />} />
      <Route path="/admin/settings/system" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/admin/daily" replace />} />
    </Routes>
    </DataProvider>
  );
}
