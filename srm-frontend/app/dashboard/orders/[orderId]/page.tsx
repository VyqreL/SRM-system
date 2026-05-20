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
}

interface Order {
  order_id: number;
  status: string;
  total_sum: number;
  created_at: string;
  items: OrderItem[];
  supplier: SupplierShort;
}

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${orderId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 403) throw new Error('У вас немає доступу до цього замовлення.');
        if (!res.ok) throw new Error('Не вдалося завантажити дані замовлення.');
        
        const data = await res.json();
        setOrder(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

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
              <p className="text-gray-500 mt-1">Постачальник: <span className="font-semibold text-gray-700">{order.supplier.company_name}</span></p>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

