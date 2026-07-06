'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

interface PriceItem {
  price_id: number;
  product_id: number;
  sup_article: string;
  wh_price: number;
  moq_batches: number;
  batch_size: number;
}

interface Product {
  product_id: number;
  category_id: number;
  internal_sku: string;
  name: string;
  unit: string;
}

interface PriceHistory {
  history_id: number;
  supplier_id: number;
  product_id: number;
  old_price: number;
  new_price: number;
  change_date: string;
}

export default function SupplierPricesPage() {
  const [prices, setPrices] = useState<PriceItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Модалка оновлення ціни
  const [editingItem, setEditingItem] = useState<PriceItem | null>(null);
  const [newWhPrice, setNewWhPrice] = useState('');
  const [newMoq, setNewMoq] = useState('');
  const [newBatchSize, setNewBatchSize] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Модалка історії цін
  const [historyItem, setHistoryItem] = useState<PriceItem | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Модалка додавання нового товару в прайс
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [addArticle, setAddArticle] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [addMoq, setAddMoq] = useState('1');
  const [addBatchSize, setAddBatchSize] = useState('1.0');
  const [isAdding, setIsAdding] = useState(false);

  // Завантаження прайсів та товарів
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('token');
    try {
      // 1. Отримуємо прайс-лист постачальника
      const resPrices = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/prices/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resPrices.ok) throw new Error('Не вдалося завантажити позиції прайс-листа.');
      const dataPrices = await resPrices.json();
      setPrices(dataPrices);

      // 2. Отримуємо каталог всіх продуктів для додавання
      const resProducts = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/prices/products`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resProducts.ok) throw new Error('Не вдалося завантажити каталог товарів.');
      const dataProducts = await resProducts.json();
      setProducts(dataProducts);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Словник продуктів за ID для швидкого пошуку
  const productsMap = useMemo(() => {
    const map: { [id: number]: Product } = {};
    products.forEach(p => {
      map[p.product_id] = p;
    });
    return map;
  }, [products]);

  // Фільтрація прайсів за пошуком
  const filteredPrices = useMemo(() => {
    if (!searchTerm.trim()) return prices;
    const term = searchTerm.toLowerCase();
    return prices.filter(item => {
      const prod = productsMap[item.product_id];
      if (!prod) return false;
      return (
        prod.name.toLowerCase().includes(term) ||
        prod.internal_sku.toLowerCase().includes(term) ||
        item.sup_article.toLowerCase().includes(term)
      );
    });
  }, [prices, searchTerm, productsMap]);

  // Список товарів, яких ще немає в прайсі поточного постачальника
  const availableProductsForAdd = useMemo(() => {
    return products.filter(p => !prices.some(pr => pr.product_id === p.product_id));
  }, [products, prices]);

  // --- Відкриття модалки редагування ---
  const handleEditClick = (item: PriceItem) => {
    setEditingItem(item);
    setNewWhPrice(item.wh_price.toString());
    setNewMoq(item.moq_batches.toString());
    setNewBatchSize(item.batch_size.toString());
  };

  // --- Збереження оновленої ціни ---
  const handleSaveUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const priceVal = parseFloat(newWhPrice);
    const moqVal = parseInt(newMoq);
    const bsVal = parseFloat(newBatchSize);

    if (isNaN(priceVal) || priceVal <= 0) {
      alert('Будь ласка, введіть коректну ціну (> 0)');
      return;
    }
    if (isNaN(moqVal) || moqVal <= 0) {
      alert('Будь ласка, введіть коректний MOQ (упаковок >= 1)');
      return;
    }
    if (isNaN(bsVal) || bsVal <= 0) {
      alert('Будь ласка, введіть коректний розмір упаковки (> 0)');
      return;
    }

    setIsUpdating(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/prices/${editingItem.price_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          wh_price: priceVal,
          moq_batches: moqVal,
          batch_size: bsVal
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Не вдалося оновити прайс-лист.');
      }

      setEditingItem(null);
      await fetchData(); // перевантажуємо дані
      alert('Позицію прайсу успішно оновлено!');
    } catch (err: any) {
      alert(`Помилка: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // --- Відкриття історії зміни цін ---
  const handleHistoryClick = async (item: PriceItem) => {
    setHistoryItem(item);
    setPriceHistory([]);
    setLoadingHistory(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/prices/${item.price_id}/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Не вдалося завантажити історію цін.');
      const data = await res.json();
      setPriceHistory(data);
    } catch (err: any) {
      alert(`Помилка: ${err.message}`);
      setHistoryItem(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  // --- Додавання нового товару в прайс-лист ---
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      alert('Будь ласка, виберіть товар з каталогу');
      return;
    }

    const priceVal = parseFloat(addPrice);
    const moqVal = parseInt(addMoq);
    const bsVal = parseFloat(addBatchSize);

    if (isNaN(priceVal) || priceVal <= 0) {
      alert('Будь ласка, введіть коректну ціну (> 0)');
      return;
    }
    if (isNaN(moqVal) || moqVal <= 0) {
      alert('Будь ласка, введіть коректний MOQ (упаковок >= 1)');
      return;
    }
    if (isNaN(bsVal) || bsVal <= 0) {
      alert('Будь ласка, введіть коректний розмір упаковки (> 0)');
      return;
    }
    if (!addArticle.trim()) {
      alert('Будь ласка, введіть артикул постачальника');
      return;
    }

    setIsAdding(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/prices/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          product_id: parseInt(selectedProductId),
          sup_article: addArticle,
          wh_price: priceVal,
          moq_batches: moqVal,
          batch_size: bsVal
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Не вдалося додати товар до прайс-листа.');
      }

      setShowAddModal(false);
      // Скидаємо форму
      setSelectedProductId('');
      setAddArticle('');
      setAddPrice('');
      setAddMoq('1');
      setAddBatchSize('1.0');
      
      await fetchData();
      alert('Товар успішно додано у ваш прайс-лист!');
    } catch (err: any) {
      alert(`Помилка: ${err.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  if (loading) return <div className="p-10 text-xl text-center">Завантаження вашого прайс-листа...</div>;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/supplier" className="text-blue-600 hover:text-blue-800 transition flex items-center gap-2 w-max font-semibold">
            <span>&larr;</span> Повернутися до кабінету
          </Link>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-800">🏷️ Керування цінами постачальника</h1>
            <p className="text-sm text-gray-500 mt-1">Оновлюйте ваші відпускні ціни та MOQ, а також додавайте нові товари до каталогу.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Шукати за назвою, SKU чи артикулом..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="p-2.5 border rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 w-full sm:w-64 shadow-xs"
            />
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 transition shadow-sm flex items-center justify-center gap-2"
            >
              <span>+</span> Додати товар у прайс
            </button>
          </div>
        </div>

        {error && <div className="p-4 mb-4 text-red-800 bg-red-100 rounded-lg">{error}</div>}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-bold text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4">Товар</th>
                  <th className="px-6 py-4">Внутрішній SKU</th>
                  <th className="px-6 py-4">Артикул постачальника</th>
                  <th className="px-6 py-4 text-right">Ціна (грн)</th>
                  <th className="px-6 py-4 text-center">Розмір упаковки</th>
                  <th className="px-6 py-4 text-center">MOQ (упаковок)</th>
                  <th className="px-6 py-4 text-center">Дії</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-700 divide-y divide-gray-100">
                {filteredPrices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                      Жодних товарів у прайс-листі не знайдено.
                    </td>
                  </tr>
                ) : (
                  filteredPrices.map(item => {
                    const prod = productsMap[item.product_id] || { name: 'Невідомий товар', internal_sku: '—', unit: 'шт' };
                    return (
                      <tr key={item.price_id} className="hover:bg-gray-50/50 transition">
                        <td className="px-6 py-4">
                          <span className="font-bold text-gray-800">{prod.name}</span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-gray-500">{prod.internal_sku}</td>
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-gray-600 bg-gray-50/80 px-2 py-1 rounded w-max border">{item.sup_article}</td>
                        <td className="px-6 py-4 text-right font-bold text-blue-600">
                          {Number(item.wh_price).toFixed(2)} грн
                        </td>
                        <td className="px-6 py-4 text-center font-mono">
                          {Number(item.batch_size).toFixed(0)} {prod.unit}
                        </td>
                        <td className="px-6 py-4 text-center font-mono">
                          {item.moq_batches} уп.
                        </td>
                        <td className="px-6 py-4 text-center space-x-2">
                          <button
                            onClick={() => handleEditClick(item)}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
                          >
                            Редагувати
                          </button>
                          <button
                            onClick={() => handleHistoryClick(item)}
                            className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                          >
                            Історія цін
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

      {/* --- МОДАЛЬНЕ ВІКНО РЕДАГУВАННЯ ЦІНИ --- */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-black text-gray-800 mb-4">
              📝 Редагувати позицію: {productsMap[editingItem.product_id]?.name}
            </h3>
            <form onSubmit={handleSaveUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ціна за упаковку (грн)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newWhPrice}
                  onChange={(e) => setNewWhPrice(e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Мінімальна партія замовлення (MOQ, упаковок)</label>
                <input
                  type="number"
                  step="1"
                  required
                  value={newMoq}
                  onChange={(e) => setNewMoq(e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Кількість одиниць в упаковці (Розмір упаковки)</label>
                <input
                  type="number"
                  step="0.001"
                  required
                  value={newBatchSize}
                  onChange={(e) => setNewBatchSize(e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-sm bg-white"
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition"
                  disabled={isUpdating}
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:bg-gray-300"
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Збереження...' : 'Зберегти зміни'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- МОДАЛЬНЕ ВІКНО ІСТОРІЇ ЗМІНИ ЦІН --- */}
      {historyItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-lg font-black text-gray-800">
                📈 Історія зміни цін: {productsMap[historyItem.product_id]?.name}
              </h3>
              <button
                onClick={() => setHistoryItem(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 pr-1 space-y-2.5">
              {loadingHistory ? (
                <div className="text-center py-6 text-gray-500 text-sm">Завантаження логу цін...</div>
              ) : priceHistory.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">Ціна на цей товар ще не змінювалася.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {priceHistory.map((hist) => (
                    <div key={hist.history_id} className="py-3 flex items-center justify-between text-sm">
                      <div>
                        <span className="text-gray-400 line-through mr-2">{Number(hist.old_price).toFixed(2)} грн</span>
                        <span className="text-green-600 font-bold">{Number(hist.new_price).toFixed(2)} грн</span>
                      </div>
                      <span className="text-xs text-gray-400 font-mono">
                        {new Date(hist.change_date).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t pt-4 text-right">
              <button
                onClick={() => setHistoryItem(null)}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 transition"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- МОДАЛЬНЕ ВІКНО ДОДАВАННЯ ТОВАРУ --- */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-black text-gray-800 mb-4">
              ➕ Додати новий товар у прайс-лист
            </h3>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Товар з каталогу системи</label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-sm bg-white"
                >
                  <option value="">-- Виберіть товар --</option>
                  {availableProductsForAdd.map(p => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.name} (SKU: {p.internal_sku})
                    </option>
                  ))}
                </select>
                {availableProductsForAdd.length === 0 && (
                  <span className="text-[11px] text-red-500 mt-1 block">Усі товари системи вже додано у ваш прайс.</span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ваш внутрішній артикул</label>
                <input
                  type="text"
                  required
                  placeholder="Наприклад: GAL-MILK-11"
                  value={addArticle}
                  onChange={(e) => setAddArticle(e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-sm bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ціна за уп. (грн)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="120.00"
                    value={addPrice}
                    onChange={(e) => setAddPrice(e.target.value)}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">MOQ (упаковок)</label>
                  <input
                    type="number"
                    step="1"
                    required
                    value={addMoq}
                    onChange={(e) => setAddMoq(e.target.value)}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Одиниць в одній упаковці</label>
                <input
                  type="number"
                  step="0.001"
                  required
                  value={addBatchSize}
                  onChange={(e) => setAddBatchSize(e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-sm bg-white"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition"
                  disabled={isAdding}
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:bg-gray-300"
                  disabled={isAdding || availableProductsForAdd.length === 0}
                >
                  {isAdding ? 'Додавання...' : 'Додати товар'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
