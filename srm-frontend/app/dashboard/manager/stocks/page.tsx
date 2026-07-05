'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface StockLimit {
  stock_id: number;
  product_id: number;
  product_name: string;
  internal_sku: string;
  category_name: string;
  current_quantity: number;
  reorder_point: number;
  sales_volume: number;
}

export default function StockLimitsPage() {
  const [limits, setLimits] = useState<StockLimit[]>([]);
  const [days, setDays] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Стан для редагування значень
  const [editValues, setEditValues] = useState<{ [stockId: number]: string }>({});
  const [savingIds, setSavingIds] = useState<{ [stockId: number]: boolean }>({});

  const fetchLimits = async (periodDays: number) => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/business/stocks/limits?days=${periodDays}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Не вдалося завантажити ліміти залишків.');
      const data = await res.json();
      setLimits(data);
      
      // Ініціалізуємо стан редагування
      const initialEdits: { [stockId: number]: string } = {};
      data.forEach((item: StockLimit) => {
        initialEdits[item.stock_id] = Number(item.reorder_point).toString();
      });
      setEditValues(initialEdits);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLimits(days);
  }, [days]);

  // Фільтрація товарів
  const filteredLimits = useMemo(() => {
    if (!searchTerm.trim()) return limits;
    const term = searchTerm.toLowerCase();
    return limits.filter(l => 
      l.product_name.toLowerCase().includes(term) ||
      l.internal_sku.toLowerCase().includes(term)
    );
  }, [limits, searchTerm]);

  const handleLimitChange = (stockId: number, value: string) => {
    setEditValues(prev => ({ ...prev, [stockId]: value }));
  };

  const handleSaveLimit = async (stockId: number) => {
    const rawVal = editValues[stockId];
    const val = parseFloat(rawVal);
    if (isNaN(val) || val < 0) {
      alert('Будь ласка, введіть коректне числове значення (>= 0)');
      return;
    }

    setSavingIds(prev => ({ ...prev, [stockId]: true }));
    const token = localStorage.getItem('token');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/business/stocks/limits/${stockId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reorder_point: val })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Не вдалося оновити ліміт.');
      }

      const updated: StockLimit = await res.json();
      
      // Оновлюємо стейт локально
      setLimits(prev => prev.map(item => 
        item.stock_id === stockId 
          ? { ...item, reorder_point: updated.reorder_point } 
          : item
      ));

      // Показати успішний статус збереження
      alert('Мінімальний ліміт успішно оновлено!');
    } catch (err: any) {
      alert(`Помилка: ${err.message}`);
    } finally {
      setSavingIds(prev => ({ ...prev, [stockId]: false }));
    }
  };

  if (loading && limits.length === 0) return <div className="p-10 text-xl text-center">Завантаження панелі керування лімітами...</div>;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/manager" className="text-blue-600 hover:text-blue-800 transition flex items-center gap-2 w-max">
            <span>&larr;</span> Повернутися до кабінету
          </Link>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-800">📦 Керування лімітами залишків</h1>
            <p className="text-sm text-gray-500 mt-1">
              Встановіть мінімальну кількість товару на складі (`reorder_point`) на основі швидкості продажів (Sales Velocity).
            </p>
          </div>
          <div className="flex bg-white p-1 rounded-xl shadow-xs border border-gray-100 w-max self-start">
            {([7, 14, 30] as const).map(p => (
              <button
                key={p}
                onClick={() => setDays(p)}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
                  days === p ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p === 7 ? '7 днів' : p === 14 ? '14 днів' : '30 днів'}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="p-4 mb-4 text-red-800 bg-red-100 rounded-lg">{error}</div>}

        {/* Фільтрація */}
        <div className="mb-6 bg-white p-4 rounded-xl border border-gray-100 shadow-2xs flex gap-4 items-center">
          <input
            type="text"
            placeholder="Швидкий пошук за назвою або SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="p-2 border rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 w-full md:w-80 transition"
          />
          <span className="text-xs text-gray-400 font-semibold">
            Показано товарів: {filteredLimits.length}
          </span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-bold text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4">Товар</th>
                  <th className="px-6 py-4">Категорія</th>
                  <th className="px-6 py-4">Поточний залишок</th>
                  <th className="px-6 py-4">Продано за {days} дн.</th>
                  <th className="px-6 py-4">Мінімальний ліміт</th>
                  <th className="px-6 py-4 text-center">Дія</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-700 divide-y divide-gray-100">
                {filteredLimits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                      Жодних товарів на складі не знайдено.
                    </td>
                  </tr>
                ) : (
                  filteredLimits.map(l => {
                    const isSaving = savingIds[l.stock_id] || false;
                    const hasChanged = editValues[l.stock_id] !== Number(l.reorder_point).toString();
                    return (
                      <tr key={l.stock_id} className="hover:bg-gray-50/50 transition">
                        <td className="px-6 py-4">
                          <Link href={`/dashboard/manager/products/${l.product_id}`} className="font-bold text-blue-600 hover:text-blue-800 hover:underline block">
                            {l.product_name}
                          </Link>
                          <span className="text-xs text-gray-400 font-mono font-semibold">{l.internal_sku}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">
                            {l.category_name}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-gray-700">
                          {Number(l.current_quantity).toFixed(0)} шт
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-green-600 bg-green-50/20">
                          {Number(l.sales_volume).toFixed(0)} шт
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={editValues[l.stock_id] || ''}
                              onChange={(e) => handleLimitChange(l.stock_id, e.target.value)}
                              disabled={isSaving}
                              className="p-1 border rounded w-20 text-center font-mono font-bold bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-gray-400 text-xs">шт</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleSaveLimit(l.stock_id)}
                            disabled={isSaving || !hasChanged}
                            className={`px-3 py-1.5 text-xs text-white font-bold rounded-lg shadow-xs transition ${
                              hasChanged 
                                ? 'bg-blue-600 hover:bg-blue-700' 
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                            }`}
                          >
                            {isSaving ? '...' : 'Зберегти'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
