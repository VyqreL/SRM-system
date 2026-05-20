'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

// --- Типи даних ---
interface ProductShort {
  product_id: number;
  name: string;
  internal_sku: string;
}

interface OrderItem {
  item_id: number;
  ord_batches: number;
  batch_size: number;
  price_at_ord: number;
  line_total: number;
  product: ProductShort;
}

interface SupplierShort {
  supplier_id: number;
  company_name: string;
  rating: number;
}

interface Batch {
  batch_id: number;
  product_id: number;
  curr_qty: number;
  status: string;
}

interface Order {
  order_id: number;
  status: string;
  total_sum: number;
  created_at: string;
  items: OrderItem[];
  supplier: SupplierShort;
  batches: Batch[];
}

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId;

  const [order, setOrder] = useState<Order | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Стан для модального вікна оцінки
  const [evalItem, setEvalItem] = useState<OrderItem | null>(null);
  const [evalForm, setEvalForm] = useState({ prod_date: '', exp_date: '', curr_qty: '', delta_days: 0, quality_rate: 1.0, total_score: 1.0 });
  const [submittingEval, setSubmittingEval] = useState(false);

  useEffect(() => {
    if (!orderId) return;

    const fetchOrderAndUser = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const [orderRes, userRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${orderId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/me`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (orderRes.status === 403) throw new Error('У вас немає доступу до цього замовлення.');
        if (!orderRes.ok) throw new Error('Не вдалося завантажити дані замовлення.');
        
        setOrder(await orderRes.json());
        if (userRes.ok) {
          const userData = await userRes.json();
          setUserRole(userData.role);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderAndUser();
  }, [orderId]);

  const handleEvalSubmit = async () => {
    if (!evalForm.prod_date || !evalForm.exp_date || !evalForm.curr_qty) {
      alert('Будь ласка, заповніть усі поля дат та кількості.');
      return;
    }
    setSubmittingEval(true);
    try {
      const token = localStorage.getItem('token');
      // 1. Створюємо партію (Прийомка на склад)
      const batchRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/batches/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          product_id: evalItem!.product_id,
          order_id: order!.order_id,
          prod_date: evalForm.prod_date,
          exp_date: evalForm.exp_date,
          curr_qty: parseFloat(evalForm.curr_qty)
        })
      });
      if (!batchRes.ok) {
        const errData = await batchRes.json();
        throw new Error(errData.detail || 'Помилка при створенні партії (перевірте дати)');
      }
      const batchData = await batchRes.json();

      // 2. Зберігаємо оцінку ефективності
      const perfRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/performance/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          batch_id: batchData.batch_id,
          delta_days: evalForm.delta_days,
          quality_rate: evalForm.quality_rate,
          total_score: evalForm.total_score
        })
      });
      if (!perfRes.ok) {
         const errData = await perfRes.json();
         throw new Error(errData.detail || 'Помилка при збереженні оцінки');
      }

      // Тихо оновлюємо дані замовлення, щоб з'явилась галочка
      const orderRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${orderId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (orderRes.ok) setOrder(await orderRes.json());
      
      setEvalItem(null);
    } catch(err: any) {
      alert(err.message);
    } finally {
      setSubmittingEval(false);
    }
  };

  if (loading) return <div className="p-10 text-xl text-center">Завантаження замовлення...</div>;
  if (error) return <div className="p-10 text-xl text-center text-red-600">Помилка: {error}</div>;
  if (!order) return <div className="p-10 text-xl text-center">Замовлення не знайдено.</div>;

  const statusStyles: { [key: string]: string } = {
    'Draft': 'bg-gray-200 text-gray-800',
    'Confirmed': 'bg-blue-100 text-blue-800',
    'Sent': 'bg-purple-100 text-purple-800',
    'Delivered': 'bg-green-100 text-green-800',
    'Cancelled': 'bg-red-100 text-red-800',
  };

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <button onClick={() => router.back()} className="text-blue-600 hover:text-blue-800 transition flex items-center gap-2 w-max">
            <span>&larr;</span> Повернутися назад
          </button>
        </div>

        {/* --- Шапка замовлення --- */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Замовлення #{order.order_id}</h1>
              <p className="text-gray-500 mt-1 flex items-center gap-2">
                Постачальник: <span className="font-semibold text-gray-700">{order.supplier.company_name}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800" title="Рейтинг постачальника">
                  ⭐ {Number(order.supplier.rating).toFixed(2)}
                </span>
              </p>
            </div>
            <div className="text-right">
              <span className={`px-3 py-1.5 text-sm font-bold rounded-full ${statusStyles[order.status] || 'bg-gray-100'}`}>
                {order.status}
              </span>
              <p className="text-sm text-gray-500 mt-2">Створено: {new Date(order.created_at).toLocaleString()}</p>
            </div>
          </div>
          <div className="border-t mt-6 pt-4">
            <p className="text-2xl font-bold text-right">Всього: {Number(order.total_sum).toFixed(2)} грн</p>
          </div>
        </div>

        {/* --- Склад замовлення --- */}
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Склад замовлення</h2>
        <div className="overflow-x-auto bg-white rounded-lg shadow-md">
          <table className="w-full text-left border-collapse">
            <thead className="text-sm text-gray-600 uppercase bg-gray-100 border-b">
              <tr>
                <th className="px-6 py-4">Артикул</th>
                <th className="px-6 py-4">Назва товару</th>
                <th className="px-6 py-4 text-right">Ціна за од.</th>
                <th className="px-6 py-4 text-right">К-сть (уп.)</th>
                <th className="px-6 py-4 text-right">Всього од.</th>
                <th className="px-6 py-4 text-right">Сума</th>
                {(order.status === 'Delivered' && userRole === 'MANAGER') && <th className="px-6 py-4 text-center">Прийомка</th>}
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              {order.items.map(item => (
                <tr key={item.item_id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono text-gray-500">{item.product.internal_sku}</td>
                  <td className="px-6 py-4 font-medium">{item.product.name}</td>
                  <td className="px-6 py-4 text-right font-mono">{Number(item.price_at_ord).toFixed(2)}</td>
                  <td className="px-6 py-4 text-right font-semibold">{item.ord_batches}</td>
                  <td className="px-6 py-4 text-right">{item.ord_batches * item.batch_size}</td>
                  <td className="px-6 py-4 text-right font-bold">{Number(item.line_total).toFixed(2)}</td>
                  {(order.status === 'Delivered' && userRole === 'MANAGER') && (
                    <td className="px-6 py-4 text-center">
                      {order.batches.find(b => b.product_id === item.product_id) ? (
                        <span className="text-green-600 font-semibold text-sm">✓ Прийнято</span>
                      ) : (
                        <button onClick={() => {
                          setEvalItem(item);
                          setEvalForm(prev => ({ ...prev, curr_qty: String(item.ord_batches * item.batch_size), prod_date: '', exp_date: '' }));
                        }} className="px-3 py-1 text-xs text-white bg-blue-500 rounded hover:bg-blue-600 shadow-sm transition">
                          Оцінити
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модальне вікно прийомки та оцінки */}
      {evalItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">Прийомка: {evalItem.product.name}</h3>
            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Фактична кількість (од.)</label>
                <input type="number" value={evalForm.curr_qty} onChange={e => setEvalForm({...evalForm, curr_qty: e.target.value})} className="w-full p-2.5 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Дата вир-ва</label>
                  <input type="date" value={evalForm.prod_date} onChange={e => setEvalForm({...evalForm, prod_date: e.target.value})} className="w-full p-2.5 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" />
                </div>
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Придатний до</label>
                  <input type="date" value={evalForm.exp_date} onChange={e => setEvalForm({...evalForm, exp_date: e.target.value})} className="w-full p-2.5 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" />
                </div>
              </div>
              <div className="border-t pt-4 mt-2">
                <h4 className="font-bold text-gray-800 mb-3 text-base">Оцінка постачання</h4>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-gray-700 font-bold mb-1" title="0 якщо вчасно">Запізнення (днів)</label>
                    <input type="number" min="0" value={evalForm.delta_days} onChange={e => setEvalForm({...evalForm, delta_days: Number(e.target.value)})} className="w-full p-2.5 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-bold mb-1">Якість (0-1)</label>
                    <input type="number" step="0.01" min="0" max="1" value={evalForm.quality_rate} onChange={e => setEvalForm({...evalForm, quality_rate: Number(e.target.value)})} className="w-full p-2.5 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" />
                  </div>
                </div>
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Загальний бал (0-1)</label>
                  <input type="number" step="0.01" min="0" max="1" value={evalForm.total_score} onChange={e => setEvalForm({...evalForm, total_score: Number(e.target.value)})} className="w-full p-2.5 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setEvalItem(null)} className="px-4 py-2 font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Скасувати</button>
              <button onClick={handleEvalSubmit} disabled={submittingEval} className="px-4 py-2 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-400 shadow transition">
                {submittingEval ? 'Збереження...' : 'Зберегти оцінку'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
