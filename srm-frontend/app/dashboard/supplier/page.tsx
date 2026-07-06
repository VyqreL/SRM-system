'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

// --- Типи даних ---
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

export default function SupplierDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  // Стани для фільтрації та сортування
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<'order_id' | 'total_sum' | 'created_at'>('order_id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      } else {
        console.error('Не вдалося завантажити замовлення');
      }
    } catch (err: any) {
      console.error('Помилка мережі:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/suppliers/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (err) {
      console.error('Помилка завантаження профілю:', err);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchProfile();
  }, []);

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
        fetchOrders();
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
      `Зверніть увагу: це скасує поставку, і замовлення перейде в статус Cancelled.`
    );
    if (isConfirmed) {
      await handleStatusChange(orderId, 'Cancelled');
    }
  };

  // Логіка фільтрації та сортування замовлень постачальника
  const processedOrders = useMemo(() => {
    let result = [...orders];

    // 1. Фільтрація за статусом
    if (statusFilter) {
      result = result.filter(o => o.status === statusFilter);
    }

    // 2. Текстовий пошук за ID замовлення
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(o => 
        o.order_id.toString().includes(query)
      );
    }

    // 3. Сортування
    result.sort((a, b) => {
      let valA: any = a[sortColumn];
      let valB: any = b[sortColumn];

      if (sortColumn === 'created_at') {
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4 border-b pb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Кабінет Постачальника</h1>
            {profile && (
              <p className="text-sm text-gray-500 mt-1">
                Компанія: <span className="font-semibold text-gray-700">{profile.company_name}</span> (ЄДРПОУ: {profile.edrpou})
              </p>
            )}
          </div>
          {profile && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 flex items-center gap-3 shadow-xs">
              <span className="text-2xl">⭐</span>
              <div>
                <div className="text-[10px] font-bold text-yellow-800 uppercase tracking-wider">Ваш рейтинг</div>
                <div className="text-lg font-black text-yellow-900 leading-none mt-0.5">
                  {Number(profile.rating * 10).toFixed(2)} <span className="text-xs font-semibold text-yellow-700">/ 10</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Панель фільтрів */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-100">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Пошук за номером замовлення</label>
            <input
              type="text"
              placeholder="Введіть номер замовлення (ID)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
            />
          </div>
          <div className="w-full sm:w-48">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Статус замовлення</label>
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
                <th onClick={() => handleSort('total_sum')} className="px-6 py-4 cursor-pointer hover:bg-gray-200 transition">
                  Сума (грн){renderSortIndicator('total_sum')}
                </th>
                <th className="px-6 py-4">
                  Статус
                </th>
                <th onClick={() => handleSort('created_at')} className="px-6 py-4 cursor-pointer hover:bg-gray-200 transition">
                  Дата створення{renderSortIndicator('created_at')}
                </th>
                <th className="px-6 py-4">Дії</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              {processedOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    Замовлень за вказаними фільтрами не знайдено.
                  </td>
                </tr>
              ) : (
                processedOrders.map((order) => (
                  <tr key={order.order_id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">#{order.order_id}</td>
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
                    <td className="px-6 py-4 space-x-2">
                      <Link href={`/dashboard/orders/${order.order_id}`} className="inline-block p-2 text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition" title="Переглянути замовлення">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      </Link>
                      {order.status === 'Confirmed' && (
                        <>
                          <button 
                            onClick={() => handleStatusChange(order.order_id, 'Sent')}
                            className="px-3 py-1 text-white bg-purple-500 rounded hover:bg-purple-600 transition"
                          >
                            Відправити замовлення
                          </button>
                          <button 
                            onClick={() => handleCancelOrder(order.order_id)}
                            className="px-3 py-1 text-white bg-red-500 rounded hover:bg-red-600 transition"
                          >
                            Скасувати замовлення
                          </button>
                        </>
                      )}
                      {order.status === 'Sent' && (
                        <span className="text-gray-400 italic">В дорозі</span>
                      )}
                      {order.status === 'Delivered' && (
                        <span className="text-green-600 font-semibold">Доставлено</span>
                      )}
                      {order.status === 'Cancelled' && (
                        <span className="text-red-500 font-semibold">Скасовано</span>
                      )}
                      {order.status === 'Draft' && (
                        <span className="text-gray-400 italic">На етапі створення</span>
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