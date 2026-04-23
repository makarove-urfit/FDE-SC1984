import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import * as db from '../db';

interface DataState {
  orders: any[];
  customers: Record<string, any>;
  orderLines: any[];
  employees: any[];
  products: any[];
  productProducts: any[];
  stockQuants: any[];
  stockLocations: any[];
  suppliers: Record<string, any>;
  supplierInfos: any[];
  uomMap: Record<string, string>;
  holidays: Set<string>;
  loading: boolean;
  refresh: (force?: boolean) => void;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
}

const STALE_TIME = 60_000;

const DataContext = createContext<DataState>({
  orders: [], customers: {}, orderLines: [], employees: [],
  products: [], productProducts: [], stockQuants: [], stockLocations: [],
  suppliers: {}, supplierInfos: [], uomMap: {}, holidays: new Set(),
  loading: true, refresh: () => {},
  selectedDate: new Date().toISOString().slice(0, 10), setSelectedDate: () => {},
});

export function useData() { return useContext(DataContext); }

export default function DataProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});
  const [orderLines, setOrderLines] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [productProducts, setProductProducts] = useState<any[]>([]);
  const [stockQuants, setStockQuants] = useState<any[]>([]);
  const [stockLocations, setStockLocations] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, any>>({});
  const [supplierInfos, setSupplierInfos] = useState<any[]>([]);
  const [uomMap, setUomMap] = useState<Record<string, string>>({});
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDateState] = useState(() => searchParams.get('date') || today);

  const setSelectedDate = useCallback((d: string) => {
    setSelectedDateState(d);
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('date', d); return p; }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (!searchParams.get('date')) {
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('date', selectedDate); return p; }, { replace: true });
    }
  }, [searchParams, selectedDate, setSearchParams]);

  const lastFetch = useRef(0);
  const fetching = useRef(false);

  const refresh = useCallback(async (force = false) => {
    if (fetching.current) return;
    if (!force && Date.now() - lastFetch.current < STALE_TIME) return;

    fetching.current = true;
    setLoading(true);
    try {
      const [so, cust, sol] = await Promise.all([
        db.query('sale_orders').catch(() => []),
        db.query('customers').catch(() => []),
        db.query('sale_order_lines').catch(() => []),
      ]);
      const [emps, prods, pp] = await Promise.all([
        db.query('hr_employees').catch(() => []),
        db.query('product_templates').catch(() => []),
        db.query('product_products').catch(() => []),
      ]);
      const [sq, sups, si, slocs, uoms, holidayRecs] = await Promise.all([
        db.query('stock_quants').catch(() => []),
        db.query('suppliers').catch(() => []),
        db.query('product_supplierinfo').catch(() => []),
        db.query('stock_locations').catch(() => []),
        db.query('uom_uom').catch(() => []),
        db.queryCustom('x_holiday_settings').catch(() => []),
      ]);

      setOrders(Array.isArray(so) ? so : []);
      const cm: Record<string, any> = {};
      for (const c of (Array.isArray(cust) ? cust : [])) cm[c.id] = c;
      setCustomers(cm);
      setOrderLines(Array.isArray(sol) ? sol : []);
      setEmployees((Array.isArray(emps) ? emps : []).filter((e: any) => e.active !== false));
      setProducts(Array.isArray(prods) ? prods : []);
      setProductProducts(Array.isArray(pp) ? pp : []);
      setStockQuants(Array.isArray(sq) ? sq : []);
      setStockLocations(Array.isArray(slocs) ? slocs : []);
      const sm: Record<string, any> = {};
      for (const s of (Array.isArray(sups) ? sups : [])) sm[s.id] = s;
      setSuppliers(sm);
      setSupplierInfos(Array.isArray(si) ? si : []);
      const um: Record<string, string> = {};
      for (const u of (Array.isArray(uoms) ? uoms : [])) um[u.id] = u.name;
      setUomMap(um);
      const holidayDates = (Array.isArray(holidayRecs) ? holidayRecs : [])
        .map((r: any) => r?.data?.date || r?.date)
        .filter(Boolean);
      setHolidays(new Set(holidayDates));

      lastFetch.current = Date.now();
    } catch (e) {
      console.error('DataProvider fetch error:', e);
    } finally {
      setLoading(false);
      fetching.current = false;
    }
  }, []);

  useEffect(() => { refresh(true); }, [refresh]);

  const value = useMemo(() => ({
    orders, customers, orderLines, employees,
    products, productProducts, stockQuants, stockLocations,
    suppliers, supplierInfos, uomMap, holidays, loading, refresh,
    selectedDate, setSelectedDate,
  }), [orders, customers, orderLines, employees, products, productProducts, stockQuants,
    stockLocations, suppliers, supplierInfos, uomMap, holidays, loading, refresh,
    selectedDate, setSelectedDate]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}
