'use client';
import { useEffect, useState } from 'react';

// Типи для TypeScript
interface OrderItem {
  item_id: number;
  product_id: number;
  ord_batches: number;
  line_total: number;
}

interface Order {
  order_id: number;
  supplier_id: number;
  status: string;
  total_sum: number;
  created_at: string;
  items: OrderItem[];
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

  // Функція для зміни статусу (для скріншотів можна просто оновлювати UI або слати реальний запит)
  const handleConfirm = async (orderId: number) => {
    // В реальному житті тут був би PATCH запит
    alert(`Замовлення №${orderId} підтверджено! Спрацювала процедура proc_confirm_order.`);
    fetchOrders(); // Оновлюємо список
  };

  const handleReceive = (orderId: number) => {
    alert(`Відкрито форму прийомки на склад для замовлення №${orderId}. Після цього можна буде виставити оцінку!`);
  };

  if (loading) return <div className="p-10 text-xl text-center">Завантаження даних...</div>;

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Кабінет Менеджера (Закупника)</h1>
          <button className="px-4 py-2 text-white bg-green-600 rounded shadow hover:bg-green-700">
            + Створити нове замовлення
          </button>
        </div>

        <div className="overflow-x-auto bg-white rounded-lg shadow-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-sm text-gray-600 uppercase bg-gray-100 border-b">
                <th className="px-6 py-4">ID Замовлення</th>
                <th className="px-6 py-4">ID Постачальника</th>
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
                    <td className="px-6 py-4 font-medium">#{order.order_id}</td>
                    <td className="px-6 py-4">{order.supplier_id}</td>
                    <td className="px-6 py-4 font-bold text-blue-600">{Number(order.total_sum).toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full 
                        ${order.status === 'Draft' ? 'bg-gray-200 text-gray-800' : 
                          order.status === 'Confirmed' ? 'bg-blue-100 text-blue-800' : 
                          order.status === 'Delivered' ? 'bg-green-100 text-green-800' : 
                          'bg-red-100 text-red-800'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">{new Date(order.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-center space-x-2">
                      {order.status === 'Draft' && (
                        <button 
                          onClick={() => handleConfirm(order.order_id)}
                          className="px-3 py-1 text-white bg-blue-500 rounded hover:bg-blue-600 transition"
                        >
                          Підтвердити
                        </button>
                      )}
                      {order.status === 'Delivered' && (
                        <button 
                          onClick={() => handleReceive(order.order_id)}
                          className="px-3 py-1 text-white bg-purple-500 rounded hover:bg-purple-600 transition"
                        >
                          Прийняти на склад
                        </button>
                      )}
                      {(order.status === 'Confirmed') && (
                        <span className="text-gray-400 italic">Очікується доставка</span>
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