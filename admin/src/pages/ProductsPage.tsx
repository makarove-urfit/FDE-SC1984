/**
 * 產品管理 — 列出 product_templates，可修改分類（categ_id）
 */
import { useState, useEffect, useMemo } from 'react'
import PageHeader from '../components/PageHeader'
import SearchInput from '../components/SearchInput'
import { useUIStore } from '../store/useUIStore'
import {
  listProductTemplates,
  updateProductTemplateCategory,
  updateProductTemplateSaleOk,
  type ProductTemplate,
} from '../api/productTemplates'
import { listProductCategories, type ProductCategory } from '../api/productCategories'

export default function ProductsPage() {
  const { withLoading, toast } = useUIStore()
  const [products, setProducts] = useState<ProductTemplate[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState('')

  const load = async () => {
    const [prods, cats] = await Promise.all([
      listProductTemplates(),
      listProductCategories(),
    ])
    setProducts(prods.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')))
    setCategories(cats)
  }

  useEffect(() => {
    withLoading(load, '載入產品中...').catch(() => toast('error', '載入失敗'))
  }, [])

  useEffect(() => {
    if (!editingId) return
    const p = products.find(x => x.id === editingId)
    setEditingCategoryId(p?.categoryId || '')
  }, [editingId, products])

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    if (!kw) return products
    return products.filter(p =>
      p.name.toLowerCase().includes(kw) ||
      p.defaultCode.toLowerCase().includes(kw) ||
      categoryNameOf(p).toLowerCase().includes(kw)
    )
  }, [products, search, categories])

  const startEdit = (p: ProductTemplate) => {
    setEditingId(p.id)
    setEditingCategoryId(p.categoryId)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingCategoryId('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    await withLoading(async () => {
      await updateProductTemplateCategory(editingId, editingCategoryId)
      await load()
      cancelEdit()
    }, '儲存中...', '已更新分類')
  }

  const togglePublish = async (p: ProductTemplate) => {
    const next = !p.saleOk
    const msg = next
      ? `將「${p.name}」上架？客戶訂購頁會顯示此商品。`
      : `將「${p.name}」下架？客戶訂購頁將不再顯示。`
    if (!confirm(msg)) return
    await withLoading(async () => {
      await updateProductTemplateSaleOk(p.id, next)
      await load()
    }, '切換中...', next ? '已上架' : '已下架')
  }

  const categoryNameOf = (p: ProductTemplate): string => {
    if (!p.categoryId) return ''
    return categories.find(c => c.id === p.categoryId)?.name || p.categoryName || ''
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PageHeader title="產品管理" showBack />

      <div className="p-6 max-w-[1400px] mx-auto w-full space-y-4">
        <SearchInput value={search} onChange={setSearch} placeholder="搜尋品名、編碼或分類" />

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center text-gray-400 py-12">無產品</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">編碼</th>
                  <th className="px-4 py-3 text-left">品名</th>
                  <th className="px-4 py-3 text-left">分類</th>
                  <th className="px-4 py-3 text-left">狀態</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className={`border-t border-gray-50 hover:bg-gray-50 ${p.saleOk ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.defaultCode || '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                    <td className="px-4 py-3">
                      {editingId === p.id ? (
                        <select
                          value={editingCategoryId}
                          onChange={e => setEditingCategoryId(e.target.value)}
                          className="border border-gray-200 rounded px-2 py-1 text-sm bg-white"
                        >
                          <option value="">（不設定）</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                          {editingCategoryId && !categories.some(c => c.id === editingCategoryId) && (
                            <option value={editingCategoryId}>
                              （原值 #{editingCategoryId.slice(0, 8)}：{categoryNameOf(p) || '未知分類'}）
                            </option>
                          )}
                        </select>
                      ) : (
                        <span className="text-gray-700">{categoryNameOf(p) || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.saleOk ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {p.saleOk ? '上架' : '下架'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {editingId === p.id ? (
                        <>
                          <button onClick={saveEdit} className="px-2 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded">儲存</button>
                          <button onClick={cancelEdit} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">取消</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(p)} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">編輯分類</button>
                          <button
                            onClick={() => togglePublish(p)}
                            className={`px-2 py-1 text-xs rounded ${p.saleOk ? 'text-red-600 hover:bg-red-50' : 'text-green-700 hover:bg-green-50'}`}
                          >
                            {p.saleOk ? '下架' : '上架'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
