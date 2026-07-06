'use client';
import { useEffect, useState, useMemo } from 'react';
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
  rating: number;
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
  const [warnings, setWarnings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Стани для фільтрації та сортування
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<'order_id' | 'supplier' | 'total_sum' | 'rating' | 'created_at'>('order_id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

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

  // Завантаження попереджень про терміни придатності
  const fetchWarnings = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/business/batches/expiration-warnings`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setWarnings(data.slice(0, 5)); // Беремо топ-5 критичних
      }
    } catch (error) {
      console.error('Помилка завантаження попереджень:', error);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchWarnings();
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

  const handleCancelOrder = async (orderId: number) => {
    const isConfirmed = confirm(
      `Ви впевнені, що хочете СКАСУВАТИ замовлення #${orderId}?\n\n` +
      `Це замовлення буде переведено в статус Cancelled.`
    );
    if (isConfirmed) {
      await handleStatusChange(orderId, 'Cancelled');
    }
  };

  // Логіка фільтрації та сортування замовлень менеджера
  const processedOrders = useMemo(() => {
    let result = [...orders];

    // 1. Фільтрація за статусом
    if (statusFilter) {
      result = result.filter(o => o.status === statusFilter);
    }

    // 2. Текстовий пошук за назвою постачальника або ID замовлення
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(o => 
        o.supplier.company_name.toLowerCase().includes(query) ||
        o.order_id.toString().includes(query)
      );
    }

    // 3. Сортування
    result.sort((a, b) => {
      let valA: any = a[sortColumn];
      let valB: any = b[sortColumn];

      if (sortColumn === 'supplier') {
        valA = a.supplier.company_name;
        valB = b.supplier.company_name;
      } else if (sortColumn === 'rating') {
        valA = Number(a.supplier.rating) || 0;
        valB = Number(b.supplier.rating) || 0;
      } else if (sortColumn === 'created_at') {
        valA = new Date(a.created_at).getTime();
        valB = new Date(b.created_at).getTime();
      } else if (sortColumn === 'total_sum') {
        valA = Number(a.total_sum);
        valB = Number(b.total_sum);
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [orders, statusFilter, searchQuery, sortColumn, sortDirection]);

  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const renderSortIndicator = (column: typeof sortColumn) => {
    if (sortColumn !== column) return <span className="text-gray-300 opacity-40"> ⇅</span>;
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  if (loading) return <div className="p-10 text-xl text-center">Завантаження даних...</div>;

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Віджет попередження про терміни придатності */}
        {warnings.length > 0 && (
          <div className="mb-6 p-4 bg-orange-50 border-l-4 border-orange-500 rounded-r-lg shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-orange-800 font-bold">
                <span>⚠️ Попередження:</span>
                <span>Виявлено товари на складі, термін придатності яких спливає!</span>
              </div>
              <Link href="/dashboard/manager/expirations" className="text-sm font-bold text-orange-600 hover:text-orange-800 underline transition">
                Детальний контроль &rarr;
              </Link>
            </div>
            <div className="text-xs text-orange-700 space-y-1">
              {warnings.map(w => (
                <div key={w.batch_id} className="flex justify-between max-w-2xl">
                  <span>{w.product_name} ({w.internal_sku}) - Залишок: {Number(w.curr_qty).toFixed(0)} шт</span>
                  <span className="font-bold text-red-600">Залишилося днів: {w.days_left} (до {new Date(w.exp_date).toLocaleDateString()})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
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

        {/* Панель фільтрів */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-100">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Пошук замовлення</label>
            <input
              type="text"
              placeholder="Шукати за назвою постачальника або ID замовлення..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
            />
          </div>
          <div className="w-full sm:w-48">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Статус</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
            >
              <option value="">Усі статуси</option>
              <option value="Draft">Draft</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Sent">Sent</option>
              <option value="Delivered">Delivered</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto bg-white rounded-lg shadow-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-sm text-gray-600 uppercase bg-gray-100 border-b select-none">
                <th onClick={() => handleSort('order_id')} className="px-6 py-4 cursor-pointer hover:bg-gray-200 transition">
                  ID Замовлення{renderSortIndicator('order_id')}
                </th>
                <th onClick={() => handleSort('supplier')} className="px-6 py-4 cursor-pointer hover:bg-gray-200 transition">
                  Постачальник{renderSortIndicator('supplier')}
                </th>
                <th onClick={() => handleSort('total_sum')} className="px-6 py-4 cursor-pointer hover:bg-gray-200 transition">
                  Сума (грн){renderSortIndicator('total_sum')}
                </th>
                <th className="px-6 py-4">
                  Статус
                </th>
                <th onClick={() => handleSort('created_at')} className="px-6 py-4 cursor-pointer hover:bg-gray-200 transition">
                  Дата створення{renderSortIndicator('created_at')}
                </th>
                <th className="px-6 py-4 text-center">Дії</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              {processedOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    Замовлень за вказаними фільтрами не знайдено.
                  </td>
                </tr>
              ) : (
                processedOrders.map((order) => (
                  <tr key={order.order_id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">#{order.order_id}</td>
                    <td className="px-6 py-4">
                      {order.supplier.company_name}
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800" title="Рейтинг постачальника">
                        ⭐ {Number(order.supplier.rating).toFixed(2)}
                      </span>
                    </td>
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
                      <Link href={`/dashboard/orders/${order.order_id}`} className="inline-block p-2 text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition" title="Переглянути замовлення">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      </Link>
                      {order.status === 'Draft' && (
                        <>
                          <button 
                            onClick={() => handleStatusChange(order.order_id, 'Confirmed')}
                            className="px-3 py-1 text-white bg-blue-500 rounded hover:bg-blue-600 transition"
                          >
                            Підтвердити
                          </button>
                          <button 
                            onClick={() => handleCancelOrder(order.order_id)}
                            className="px-3 py-1 text-white bg-red-500 rounded hover:bg-red-600 transition"
                          >
                            Скасувати
                          </button>
                        </>
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
                      {(order.status === 'Cancelled') && (
                        <span className="text-red-500 font-semibold">Скасовано</span>
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