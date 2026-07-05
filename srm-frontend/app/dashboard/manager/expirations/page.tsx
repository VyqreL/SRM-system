'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface ExpirationWarning {
  batch_id: number;
  product_id: number;
  product_name: string;
  internal_sku: string;
  exp_date: string;
  curr_qty: number;
  days_left: number;
  status: string;
}

export default function ExpirationsControlPage() {
  const [warnings, setWarnings] = useState<ExpirationWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    const fetchExpirations = async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/business/batches/expiration-warnings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Не вдалося завантажити попередження про терміни придатності.');
        const data = await res.json();
        setWarnings(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchExpirations();
  }, []);

  const filteredWarnings = useMemo(() => {
    if (!filterText.trim()) return warnings;
    const term = filterText.toLowerCase();
    return warnings.filter(w => 
      w.product_name.toLowerCase().includes(term) ||
      w.internal_sku.toLowerCase().includes(term)
    );
  }, [warnings, filterText]);

  // Функція для визначення стилю критичності
  const getSeverityStyle = (days: number) => {
    if (days <= 7) {
      return {
        bg: 'bg-red-50 text-red-700 border-red-200',
        badge: 'bg-red-600 text-white',
        text: 'Критично (менше 7 днів)',
      };
    } else if (days <= 15) {
      return {
        bg: 'bg-orange-50 text-orange-700 border-orange-200',
        badge: 'bg-orange-500 text-white',
        text: 'Висока (менше 15 днів)',
      };
    } else {
      return {
        bg: 'bg-yellow-50 text-yellow-800 border-yellow-200',
        badge: 'bg-yellow-500 text-white',
        text: 'Увага (менше 30 днів)',
      };
    }
  };

  if (loading) return <div className="p-10 text-xl text-center">Завантаження журналу термінів придатності...</div>;

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
            <h1 className="text-3xl font-black text-gray-800">⚠️ Контроль термінів придатності</h1>
            <p className="text-sm text-gray-500 mt-1">Перелік активних партій товарів на складі, термін реалізації яких добігає кінця.</p>
          </div>
          <input
            type="text"
            placeholder="Фільтр за назвою або SKU..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="p-2.5 border rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 w-full md:w-64 shadow-xs"
          />
        </div>

        {error && <div className="p-4 mb-4 text-red-800 bg-red-100 rounded-lg">{error}</div>}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-bold text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4">Товар</th>
                  <th className="px-6 py-4">Артикул / SKU</th>
                  <th className="px-6 py-4">Залишок на складі</th>
                  <th className="px-6 py-4">Рівень загрози</th>
                  <th className="px-6 py-4">Термін придатності</th>
                  <th className="px-6 py-4 text-right">Залишилося днів</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-700 divide-y divide-gray-100">
                {filteredWarnings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                      Жодних попереджень про термін придатності. Склад знаходиться під контролем!
                    </td>
                  </tr>
                ) : (
                  filteredWarnings.map(w => {
                    const severity = getSeverityStyle(w.days_left);
                    return (
                      <tr key={w.batch_id} className={`hover:bg-gray-50/50 transition border-l-4 ${
                        w.days_left <= 7 ? 'border-l-red-500' : w.days_left <= 15 ? 'border-l-orange-500' : 'border-l-yellow-400'
                      }`}>
                        <td className="px-6 py-4">
                          <Link href={`/dashboard/manager/products/${w.product_id}`} className="font-bold text-blue-600 hover:text-blue-800 hover:underline">
                            {w.product_name}
                          </Link>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-gray-500">{w.internal_sku}</td>
                        <td className="px-6 py-4 font-mono font-bold text-gray-700">
                          {Number(w.curr_qty).toFixed(0)} шт
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${severity.bg}`}>
                            {severity.text}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-gray-700">
                          {new Date(w.exp_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`px-2.5 py-1 text-xs font-black rounded-full ${severity.badge} font-mono`}>
                            {w.days_left} дн.
                          </span>
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
