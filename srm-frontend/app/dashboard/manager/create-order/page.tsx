'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// --- Типи даних ---
interface Supplier {
  supplier_id: number;
  company_name: string;
}

interface Product {
  product_id: number;
  name: string;
  wh_price: number;
  batch_size: number;
  moq_batches: number;
}

interface OrderItem extends Product {
  ord_batches: number;
}

// --- Компонент ---
export default function CreateOrderPage() {
  const router = useRouter();
  
  // --- Стан компонента ---
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  
  const [loading, setLoading] = useState({ suppliers: true, products: false });
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<{loading: boolean, error: string | null, success: string | null}>({ loading: false, error: null, success: null });

  // --- Завантаження даних ---
  useEffect(() => {
    const fetchSuppliers = async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/suppliers/`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Не вдалося завантажити постачальників.');
        const data = await res.json();
        setSuppliers(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(prev => ({ ...prev, suppliers: false }));
      }
    };
    fetchSuppliers();
  }, []);

  useEffect(() => {
    if (!selectedSupplierId) {
      setProducts([]);
      setOrderItems([]); // Очищуємо кошик при зміні постачальника
      return;
    }
    
    const fetchProducts = async () => {
      setLoading(prev => ({ ...prev, products: true }));
      setError(null);
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/suppliers/${selectedSupplierId}/products`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Не вдалося завантажити товари для цього постачальника.');
        const data = await res.json();
        setProducts(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(prev => ({ ...prev, products: false }));
      }
    };
    
    fetchProducts();
  }, [selectedSupplierId]);

  // --- Обробники подій ---
  const handleAddProduct = (product: Product) => {
    if (orderItems.find(item => item.product_id === product.product_id)) return;
    setOrderItems(prev => [...prev, { ...product, ord_batches: product.moq_batches }]);
  };

  const handleRemoveItem = (productId: number) => {
    setOrderItems(prev => prev.filter(item => item.product_id !== productId));
  };

  const handleQuantityChange = (productId: number, newQuantity: string) => {
    const qty = parseInt(newQuantity, 10);
    setOrderItems(prev => prev.map(item => 
      item.product_id === productId ? { ...item, ord_batches: isNaN(qty) || qty < 0 ? 0 : qty } : item
    ));
  };

  const handleSubmitOrder = async () => {
    if (!selectedSupplierId || orderItems.length === 0) {
      setSubmission({ ...submission, error: 'Оберіть постачальника та додайте товари до замовлення.' });
      return;
    }
    
    setSubmission({ loading: true, error: null, success: null });
    const token = localStorage.getItem('token');
    
    const payload = {
      supplier_id: parseInt(selectedSupplierId, 10),
      items: orderItems.map(item => ({
        product_id: item.product_id,
        ord_batches: item.ord_batches,
        batch_size: item.batch_size,
        price_at_ord: item.wh_price,
      })),
    };

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Не вдалося створити замовлення.');
      }
      
      setSubmission({ loading: false, error: null, success: 'Замовлення успішно створено!' });
      setTimeout(() => router.push('/dashboard/manager'), 2000);
    } catch (err: any) {
      setSubmission({ loading: false, error: err.message, success: null });
    }
  };

  // --- Розрахунки ---
  const totalSum = useMemo(() => {
    return orderItems.reduce((sum, item) => sum + (item.ord_batches * item.batch_size * item.wh_price), 0);
  }, [orderItems]);

  // --- Рендер ---
  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/manager" className="text-blue-600 hover:text-blue-800 transition flex items-center gap-2 w-max">
            <span>&larr;</span> Повернутися до кабінету
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Створення нового замовлення</h1>
        
        {error && <div className="p-4 mb-4 text-red-800 bg-red-100 rounded-lg">{error}</div>}
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* --- Ліва колонка: Вибір товарів --- */}
          <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">1. Оберіть постачальника та товари</h2>
            <div className="mb-6">
              <label className="block mb-2 text-sm font-medium text-gray-700">Постачальник</label>
              <select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)} disabled={loading.suppliers} className="w-full p-2 border rounded-md bg-gray-50 disabled:bg-gray-200">
                <option value="">{loading.suppliers ? 'Завантаження...' : '-- Оберіть постачальника --'}</option>
                {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.company_name}</option>)}
              </select>
            </div>
            {selectedSupplierId && (
              <div>
                <h3 className="text-lg font-semibold mb-2">Доступні товари</h3>
                {loading.products ? <p>Завантаження товарів...</p> : (
                  <div className="max-h-96 overflow-y-auto border rounded-md">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-100 sticky top-0"><tr><th className="p-3">Товар</th><th className="p-3">Ціна за од.</th><th className="p-3"></th></tr></thead>
                      <tbody>
                        {products.length > 0 ? products.map(p => (
                          <tr key={p.product_id} className="border-b">
                            <td className="p-3">{p.name}</td>
                            <td className="p-3 font-mono">{Number(p.wh_price).toFixed(2)}</td>
                            <td className="p-3 text-right"><button onClick={() => handleAddProduct(p)} disabled={!!orderItems.find(i => i.product_id === p.product_id)} className="px-3 py-1 text-xs text-white bg-blue-500 rounded hover:bg-blue-600 disabled:bg-gray-300">Додати</button></td>
                          </tr>
                        )) : <tr><td colSpan={3} className="p-4 text-center text-gray-500">У цього постачальника немає товарів у прайсі.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* --- Права колонка: Кошик --- */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">2. Склад замовлення</h2>
            {orderItems.length === 0 ? <p className="text-gray-500 text-center mt-10">Кошик порожній.</p> : (
              <div className="space-y-4">
                {orderItems.map(item => (
                  <div key={item.product_id} className="flex items-center gap-4 p-2 border-b">
                    <div className="flex-1"><p className="font-semibold">{item.name}</p><p className="text-xs text-gray-500">MOQ: {item.moq_batches} уп. | В уп: {item.batch_size}</p></div>
                    <input type="number" value={item.ord_batches} onChange={(e) => handleQuantityChange(item.product_id, e.target.value)} min={item.moq_batches} className="w-20 p-2 border rounded-md text-center" />
                    <button onClick={() => handleRemoveItem(item.product_id)} className="text-red-500 hover:text-red-700 text-2xl font-bold">&times;</button>
                  </div>
                ))}
                <div className="pt-4 mt-4 border-t text-right"><p className="text-lg font-bold">Всього: {totalSum.toFixed(2)} грн</p></div>
              </div>
            )}
            <div className="mt-6">
              {submission.success && <div className="p-3 mb-4 text-green-800 bg-green-100 rounded">{submission.success}</div>}
              {submission.error && <div className="p-3 mb-4 text-red-800 bg-red-100 rounded">{submission.error}</div>}
              <button onClick={handleSubmitOrder} disabled={orderItems.length === 0 || submission.loading || !!submission.success} className="w-full p-3 font-bold text-white bg-green-600 rounded-lg shadow hover:bg-green-700 disabled:bg-gray-400">
                {submission.loading ? 'Створення...' : 'Створити замовлення'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}