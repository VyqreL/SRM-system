'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

// Типи для TypeScript
interface OrderItem {
  item_id: number;
  product_id: number;
  ord_batches: number;
  line_total: number;
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

export default function ManagerDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Завантаження замовлень з бекенду
  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      } else {
        console.error('Не вдалося завантажити замовлення');
      }
    } catch (error) {
      console.error('Помилка мережі:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Функція для зміни статусу (реальний PATCH запит на бекенд)
  const handleStatusChange = async (orderId: number, newStatus: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ new_status: newStatus })
      });
      
      if (res.ok) {
        fetchOrders(); // Оновлюємо список після успішної зміни
      } else {
        const err = await res.json();
        alert(`Помилка: ${err.detail}`);
      }
    } catch (error) {
      console.error('Помилка мережі:', error);
      alert('Помилка мережі');
    }
  };

  if (loading) return <div className="p-10 text-xl text-center">Завантаження даних...</div>;

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Кабінет Менеджера (Закупника)</h1>
          <div className="flex space-x-4">
            <Link href="/dashboard/manager/reorder-suggestions" className="px-4 py-2 text-white bg-blue-600 rounded shadow hover:bg-blue-700 transition">
              📊 Дашборд дефіциту
            </Link>
            <Link href="/dashboard/manager/create-order" className="px-4 py-2 text-white bg-green-600 rounded shadow hover:bg-green-700 transition">
              + Створити нове замовлення
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto bg-white rounded-lg shadow-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-sm text-gray-600 uppercase bg-gray-100 border-b">
                <th className="px-6 py-4">ID Замовлення</th>
                <th className="px-6 py-4">Постачальник</th>
                <th className="px-6 py-4">Сума (грн)</th>
                <th className="px-6 py-4">Статус</th>
                <th className="px-6 py-4">Дата створення</th>
                <th className="px-6 py-4 text-center">Дії</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    Замовлень ще немає. Зробіть перше замовлення!
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.order_id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">
                      <Link href={`/dashboard/orders/${order.order_id}`} className="text-blue-600 hover:underline">
                        #{order.order_id}
                      </Link>
                    </td>
                    <td className="px-6 py-4">{order.supplier.company_name}</td>
                    <td className="px-6 py-4 font-bold text-blue-600">{Number(order.total_sum).toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full 
                        ${order.status === 'Draft' ? 'bg-gray-200 text-gray-800' : 
                          order.status === 'Confirmed' ? 'bg-blue-100 text-blue-800' : 
                          order.status === 'Sent' ? 'bg-purple-100 text-purple-800' : 
                          order.status === 'Delivered' ? 'bg-green-100 text-green-800' : 
                          'bg-red-100 text-red-800'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">{new Date(order.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-center space-x-2">
                      {order.status === 'Draft' && (
                        <button 
                          onClick={() => handleStatusChange(order.order_id, 'Confirmed')}
                          className="px-3 py-1 text-white bg-blue-500 rounded hover:bg-blue-600 transition"
                        >
                          Підтвердити
                        </button>
                      )}
                      {order.status === 'Sent' && (
                        <button 
                          onClick={() => handleStatusChange(order.order_id, 'Delivered')}
                          className="px-3 py-1 text-white bg-purple-500 rounded hover:bg-purple-600 transition"
                        >
                          Прийняти на склад
                        </button>
                      )}
                      {(order.status === 'Confirmed') && (
                        <span className="text-gray-400 italic">Очікується відправка</span>
                      )}
                      {(order.status === 'Delivered') && (
                        <span className="text-green-600 font-semibold">Доставлено</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}