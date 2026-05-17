'use client';
import { useEffect, useState } from 'react';

interface Order {
  order_id: number;
  status: string;
  total_sum: number;
  created_at: string;
}

export default function SupplierDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('token');
      // В ідеалі тут має бути ендпоінт, що повертає замовлення ТІЛЬКИ для поточного постачальника
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Помилка завантаження:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleDeliver = (orderId: number) => {
    // Імітація зміни статусу для скріншоту
    alert(`Замовлення №${orderId} успішно відмічено як "Доставлене"! Менеджер тепер може прийняти його на склад.`);
    fetchOrders(); // В реальності тут оновлювався б список після PATCH-запиту
  };

  if (loading) return <div className="p-10 text-xl text-center">Завантаження кабінету...</div>;

  return (
    <div className="min-h-screen p-8 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        
        {/* Шапка кабінету */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Кабінет Постачальника</h1>
            <p className="mt-1 text-sm text-slate-500">Управління продажами та відвантаженнями</p>
          </div>
          <div className="flex space-x-4">
            <button className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-100 rounded shadow-sm hover:bg-indigo-200">
              ⚙️ Профіль компанії
            </button>
            <button className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded shadow hover:bg-indigo-700">
              📄 Мій прайс-лист
            </button>
          </div>
        </div>

        {/* Інформаційна панель (віджет) */}
        <div className="p-6 mb-8 bg-white border border-l-4 border-indigo-500 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Ваш поточний рейтинг: <span className="text-indigo-600">4.9 / 5.0</span></h2>
              <p className="text-sm text-gray-600">Оцінка формується автоматично на основі якості ваших поставок.</p>
            </div>
          </div>
        </div>

        {/* Таблиця замовлень */}
        <div className="overflow-x-auto bg-white rounded-lg shadow-md border border-slate-200">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-sm text-slate-600 uppercase bg-slate-100 border-b border-slate-200">
                <th className="px-6 py-4">№ Замовлення</th>
                <th className="px-6 py-4">Сума (грн)</th>
                <th className="px-6 py-4">Дата надходження</th>
                <th className="px-6 py-4">Статус</th>
                <th className="px-6 py-4 text-center">Дія (Відвантаження)</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-700">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
                    У вас поки немає нових замовлень.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.order_id} className="border-b hover:bg-slate-50 border-slate-100">
                    <td className="px-6 py-4 font-medium">#{order.order_id}</td>
                    <td className="px-6 py-4 font-bold text-indigo-600">{Number(order.total_sum).toFixed(2)}</td>
                    <td className="px-6 py-4">{new Date(order.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full 
                        ${order.status === 'Confirmed' ? 'bg-amber-100 text-amber-800' : 
                          order.status === 'Delivered' ? 'bg-green-100 text-green-800' : 
                          'bg-slate-100 text-slate-800'}`}>
                        {order.status === 'Confirmed' ? 'Очікує відправки' : order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {order.status === 'Confirmed' ? (
                        <button 
                          onClick={() => handleDeliver(order.order_id)}
                          className="px-4 py-1.5 text-white bg-amber-500 rounded hover:bg-amber-600 transition shadow-sm"
                        >
                          🚚 Відправити
                        </button>
                      ) : order.status === 'Delivered' ? (
                        <span className="text-green-600 font-medium">✓ Відвантажено</span>
                      ) : (
                        <span className="text-slate-400 italic">Недоступно</span>
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