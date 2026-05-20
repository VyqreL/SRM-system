'use client';
import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

// Типи для TypeScript
interface ReorderSuggestion {
  product_id: number;
  name: string;
  current_stocks: number;
  reorder_point: number;
  supplier_id: number;
  company_name: string;
  wh_price: number;
  batch_size: number; 
  moq_batches: number;
}

interface OrderItemPayload {
  product_id: number;
  ord_batches: number;
  batch_size: number;
  price_at_ord: number;
}

interface GroupedSuggestions {
  [productId: number]: ReorderSuggestion[];
}

export default function ReorderSuggestionsPage() {
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Змінюємо Set на Map, щоб для кожного товару можна було обрати ЛИШЕ ОДНОГО постачальника
  const [selectedItems, setSelectedItems] = useState<Map<number, string>>(new Map());
  const [orderQuantities, setOrderQuantities] = useState<{ [key: string]: string }>({});
  
  const [submissionStatus, setSubmissionStatus] = useState<{
    isLoading: boolean;
    error: string | null;
    success: string | null;
  }>({ isLoading: false, error: null, success: null });

  useEffect(() => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Необхідна авторизація.');
        setLoading(false);
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/suggestions/reorder`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data: ReorderSuggestion[] = await res.json();
        setSuggestions(data);
        // Ініціалізуємо рекомендовану кількість для замовлення
        const initialQuantities: { [key: string]: string } = {};
        data.forEach(item => {
          const key = `${item.product_id}-${item.supplier_id}`;
          const quantityToOrder = Math.max(0, item.reorder_point - item.current_stocks);
          const batchSize = item.batch_size; 
          initialQuantities[key] = String(Math.ceil(quantityToOrder / batchSize));
        });
        setOrderQuantities(initialQuantities);
      } else {
        const errorData = await res.json();
        setError(errorData.detail || 'Не вдалося завантажити пропозиції.');
      }
    } catch (err) {
      setError('Помилка мережі або сервера.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectItem = (productId: number, itemKey: string) => {
    setSelectedItems(prev => {
      const newMap = new Map(prev);
      // Якщо вже обрано цього постачальника для цього товару, знімаємо вибір
      if (newMap.get(productId) === itemKey) {
        newMap.delete(productId);
      } else {
        // Інакше, встановлюємо його як обраного для цього товару
        newMap.set(productId, itemKey);
      }
      return newMap;
    });
  };

  const handleQuantityChange = (itemKey: string, value: string) => {
    setOrderQuantities(prev => ({ ...prev, [itemKey]: value }));
  };

  const handleQuantityBlur = (itemKey: string, moq: number) => {
    const currentQty = parseInt(orderQuantities[itemKey] || '0', 10);
    
    // Якщо значення некоректне або менше за MOQ, автоматично встановлюємо MOQ
    if (isNaN(currentQty) || currentQty < moq) {
      setOrderQuantities(prev => ({ ...prev, [itemKey]: String(moq) }));
    }
  };

  const handleCreateOrders = async () => {
    if (selectedItems.size === 0) {
      setSubmissionStatus({ isLoading: false, error: 'Не обрано жодної позиції для замовлення.', success: null });
      return;
    }
    setSubmissionStatus({ isLoading: true, error: null, success: null });

    // Додаткова валідація перед відправкою
    for (const key of selectedItems.values()) {
      const suggestion = suggestions.find(s => `${s.product_id}-${s.supplier_id}` === key);
      const quantity = parseInt(orderQuantities[key] || '0', 10);
      if (suggestion && quantity < suggestion.moq_batches) {
        setSubmissionStatus({ isLoading: false, error: `Кількість для товару "${suggestion.name}" (${quantity}) менша за MOQ (${suggestion.moq_batches}). Будь ласка, виправте.`, success: null });
        return;
      }
    }

    // Групуємо обрані товари за постачальником
    const ordersBySupplier = new Map<number, OrderItemPayload[]>();
    // Ітеруємо по значеннях Map (обраних ключах "product-supplier")
    selectedItems.forEach(key => {
      const [productId, supplierId] = key.split('-').map(Number);
      const suggestion = suggestions.find(s => s.product_id === productId && s.supplier_id === supplierId);
      const quantity = parseInt(orderQuantities[key] || '0', 10);

      if (suggestion && quantity > 0) {
        if (!ordersBySupplier.has(supplierId)) {
          ordersBySupplier.set(supplierId, []);
        }
        const orderItems = ordersBySupplier.get(supplierId)!;
        orderItems.push({
          product_id: suggestion.product_id,
          ord_batches: quantity,
          batch_size: suggestion.batch_size,
          price_at_ord: suggestion.wh_price,
        });
      }
    });

    // Відправляємо запити на створення замовлень
    const token = localStorage.getItem('token');
    const creationPromises = Array.from(ordersBySupplier.entries()).map(([supplierId, items]) => {
      return fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ supplier_id: supplierId, items })
      });
    });

    try {
      const responses = await Promise.all(creationPromises);
      const failed = responses.filter(res => !res.ok);
      if (failed.length > 0) {
        throw new Error(`Не вдалося створити ${failed.length} з ${responses.length} замовлень.`);
      }
      setSubmissionStatus({ isLoading: false, error: null, success: `Успішно створено ${responses.length} замовлень.` });
      setSelectedItems(new Map()); // Очищуємо вибір
      // Перезавантаження даних не потрібне, бо вони вже в state
    } catch (err: any) {
      setSubmissionStatus({ isLoading: false, error: err.message, success: null });
    }
  };
  
  // Групуємо пропозиції за товаром для зручного відображення
  const groupedSuggestions = useMemo(() => {
    return suggestions.reduce((acc, item) => {
      if (!acc[item.product_id]) {
        acc[item.product_id] = [];
      }
      acc[item.product_id].push(item);
      return acc;
    }, {} as GroupedSuggestions);
  }, [suggestions]);

  if (loading) return <div className="p-10 text-xl text-center">Завантаження пропозицій...</div>;
  if (error) return <div className="p-10 text-xl text-center text-red-600">Помилка: {error}</div>;

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <Link href="/dashboard/manager" className="text-blue-600 hover:text-blue-800 transition flex items-center gap-2 w-max">
            <span>&larr;</span> Повернутися до кабінету
          </Link>
        </div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Дефіцит товарів</h1>
          <button 
            onClick={handleCreateOrders}
            disabled={selectedItems.size === 0 || submissionStatus.isLoading}
            className="px-4 py-2 text-white bg-blue-600 rounded shadow hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {submissionStatus.isLoading ? 'Створення...' : `Створити замовлення (${selectedItems.size})`}
          </button>
        </div>
        {submissionStatus.error && <div className="mb-4 p-3 text-red-800 bg-red-100 rounded">{submissionStatus.error}</div>}
        {submissionStatus.success && <div className="mb-4 p-3 text-green-800 bg-green-100 rounded">{submissionStatus.success}</div>}

        <div className="overflow-x-auto bg-white rounded-lg shadow-md">
          <table className="w-full text-left border-collapse">
            <thead className="text-sm text-gray-600 uppercase bg-gray-100 border-b">
              {/* Заголовок таблиці залишається для загальної структури, але основний рендер буде в tbody */}
            </thead>
            <tbody className="text-sm">
              {Object.keys(groupedSuggestions).length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-500">Немає товарів, що потребують замовлення.</td></tr>
              ) : (
                Object.values(groupedSuggestions).map((productGroup) => {
                  const product = productGroup[0];
                  return (
                    <React.Fragment key={product.product_id}>
                      <tr className="bg-gray-100 border-b-2 border-gray-200">
                        <td colSpan={4} className="px-4 py-3 font-bold text-gray-800">
                          {product.name} (На складі: {product.current_stocks} / Точка замовлення: {product.reorder_point})
                        </td>
                      </tr>
                      <tr className="text-xs text-gray-500 uppercase">
                        <th className="px-4 py-2 w-12"></th>
                        <th className="px-4 py-2">Постачальник</th>
                        <th className="px-4 py-2">Ціна за од.</th>
                        <th className="px-4 py-2 w-40">К-сть (упаковок)</th>
                      </tr>
                      {productGroup.map(offer => {
                        const key = `${offer.product_id}-${offer.supplier_id}`;
                        const isSelected = selectedItems.get(offer.product_id) === key;
                        return (
                          <tr key={key} className={`border-b hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                            <td className="px-4 py-2 text-center"><input type="radio" name={`product-${offer.product_id}`} checked={isSelected} onChange={() => handleSelectItem(offer.product_id, key)} /></td>
                            <td className="px-4 py-2 font-medium text-gray-800">{offer.company_name}</td>
                            <td className="px-4 py-2 font-bold text-gray-900">{Number(offer.wh_price).toFixed(2)}</td>
                            <td className="px-4 py-2">
                              <input 
                                type="number" 
                                min={offer.moq_batches} 
                                value={orderQuantities[key] || ''} 
                                onChange={(e) => handleQuantityChange(key, e.target.value)} 
                                onBlur={() => handleQuantityBlur(key, offer.moq_batches)}
                                className="w-full p-2 border rounded disabled:bg-gray-100" disabled={!isSelected} />
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}