'use client';
import { useEffect, useState, useMemo } from 'react';

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

export default function ReorderSuggestionsPage() {
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [orderQuantities, setOrderQuantities] = useState<{ [key: string]: string }>({});
  
  const [submissionStatus, setSubmissionStatus] = useState<{
    isLoading: boolean;
    error: string | null;
    success: string | null;
  }>({ isLoading: false, error: null, success: null });

  const fetchReorderSuggestions = async () => {
    // ... (код завантаження даних залишається без змін)
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Необхідна авторизація.');
        setLoading(false);
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/business/suggestions/reorder`, {
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
  };

  useEffect(() => {
    fetchReorderSuggestions();
  }, []);

  const handleSelectItem = (itemKey: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemKey)) {
        newSet.delete(itemKey);
      } else {
        newSet.add(itemKey);
      }
      return newSet;
    });
  };

  const handleQuantityChange = (itemKey: string, value: string) => {
    setOrderQuantities(prev => ({ ...prev, [itemKey]: value }));
  };

  const handleCreateOrders = async () => {
    if (selectedItems.size === 0) {
      setSubmissionStatus({ isLoading: false, error: 'Не обрано жодної позиції для замовлення.', success: null });
      return;
    }
    setSubmissionStatus({ isLoading: true, error: null, success: null });

    // Групуємо обрані товари за постачальником
    const ordersBySupplier = new Map<number, OrderItemPayload[]>();
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
      setSelectedItems(new Set()); // Очищуємо вибір
      fetchReorderSuggestions(); // Оновлюємо список
    } catch (err: any) {
      setSubmissionStatus({ isLoading: false, error: err.message, success: null });
    }
  };

  if (loading) return <div className="p-10 text-xl text-center">Завантаження пропозицій...</div>;
  if (error) return <div className="p-10 text-xl text-center text-red-600">Помилка: {error}</div>;

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
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
              <tr>
                <th className="px-4 py-4 w-12 text-center"><input type="checkbox" disabled /></th>
                <th className="px-4 py-4">Товар</th>
                <th className="px-4 py-4">На складі / Точка замовлення</th>
                <th className="px-4 py-4">Постачальник</th>
                <th className="px-4 py-4">Ціна</th>
                <th className="px-4 py-4 w-40">К-сть (упаковок)</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              {suggestions.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-gray-500">Немає товарів, що потребують замовлення.</td></tr>
              ) : (
                suggestions.map((item) => {
                  const key = `${item.product_id}-${item.supplier_id}`;
                  return (
                    <tr key={key} className={`border-b hover:bg-gray-50 ${selectedItems.has(key) ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-2 text-center"><input type="checkbox" checked={selectedItems.has(key)} onChange={() => handleSelectItem(key)} /></td>
                      <td className="px-4 py-2 font-medium">{item.name} (ID: {item.product_id})</td>
                      <td className="px-4 py-2">{item.current_stocks} / <span className="font-semibold text-red-600">{item.reorder_point}</span></td>
                      <td className="px-4 py-2">{item.company_name}</td>
                      <td className="px-4 py-2 font-bold">{Number(item.wh_price).toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <input type="number" min="1" value={orderQuantities[key] || ''} onChange={(e) => handleQuantityChange(key, e.target.value)} className="w-full p-2 border rounded" />
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
  );
}