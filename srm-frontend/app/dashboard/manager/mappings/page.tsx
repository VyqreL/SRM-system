'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ProductMapping {
  price_id: number;
  product_id: number;
  product_name: string;
  internal_sku: string;
  category_name: string;
  supplier_id: number;
  company_name: string;
  sup_article: string | null;
  wh_price: number;
}

export default function NomenclatureMappingPage() {
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Стан для редагування
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchMappings = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/business/prices/mappings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Не вдалося завантажити маппінг номенклатури.');
      const data = await res.json();
      setMappings(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  const handleStartEdit = (priceId: number, currentArticle: string | null) => {
    setEditingPriceId(priceId);
    setEditValue(currentArticle || '');
  };

  const handleCancelEdit = () => {
    setEditingPriceId(null);
    setEditValue('');
  };

  const handleSaveEdit = async (priceId: number) => {
    setSaving(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/business/prices/mappings/${priceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sup_article: editValue })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Не вдалося зберегти зміни.');
      }

      const updated = await res.json();
      
      // Оновлюємо стейт локально
      setMappings(prev => prev.map(m => m.price_id === priceId ? { ...m, sup_article: updated.sup_article } : m));
      setEditingPriceId(null);
    } catch (err: any) {
      alert(`Помилка: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10 text-xl text-center">Завантаження таблиці відповідностей...</div>;

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
            <h1 className="text-3xl font-black text-gray-800">🔗 Маппінг номенклатури артиклів</h1>
            <p className="text-sm text-gray-500 mt-1">Зв'язок внутрішніх SKU застосунку із артикулами виробників та постачальників.</p>
          </div>
        </div>

        {error && <div className="p-4 mb-4 text-red-800 bg-red-100 rounded-lg">{error}</div>}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-bold text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4">Внутрішній товар</th>
                  <th className="px-6 py-4">Категорія</th>
                  <th className="px-6 py-4">Постачальник</th>
                  <th className="px-6 py-4">Ціна закупівлі</th>
                  <th className="px-6 py-4">Артикул виробника</th>
                  <th className="px-6 py-4 text-center">Дії</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-700 divide-y divide-gray-100">
                {mappings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                      Жодного зв'язку не знайдено. Спочатку заповніть прайс-листи.
                    </td>
                  </tr>
                ) : (
                  mappings.map(m => (
                    <tr key={m.price_id} className="hover:bg-gray-50/50 transition">
                      <td className="px-6 py-4">
                        <span className="font-bold text-gray-800 block">{m.product_name}</span>
                        <span className="text-xs text-gray-400 font-mono font-semibold">{m.internal_sku}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">
                          {m.category_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-700">{m.company_name}</td>
                      <td className="px-6 py-4 font-mono font-bold text-blue-600">{Number(m.wh_price).toFixed(2)} грн</td>
                      <td className="px-6 py-4">
                        {editingPriceId === m.price_id ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            disabled={saving}
                            className="p-1 border rounded bg-white text-xs font-mono w-40 focus:ring-2 focus:ring-blue-500"
                            placeholder="Артикул виробника"
                          />
                        ) : (
                          <span className={`font-mono text-xs ${m.sup_article ? 'bg-blue-50 text-blue-800 font-semibold px-2 py-1 rounded' : 'text-gray-400 italic'}`}>
                            {m.sup_article || 'Не встановлено'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {editingPriceId === m.price_id ? (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleSaveEdit(m.price_id)}
                              disabled={saving}
                              className="px-2.5 py-1 text-xs text-white bg-green-500 rounded hover:bg-green-600 transition"
                            >
                              {saving ? '...' : 'Зберегти'}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={saving}
                              className="px-2.5 py-1 text-xs text-gray-600 bg-gray-200 rounded hover:bg-gray-300 transition"
                            >
                              Скасувати
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleStartEdit(m.price_id, m.sup_article)}
                            className="px-3 py-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md font-bold transition"
                          >
                            Редагувати
                          </button>
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
    </div>
  );
}
