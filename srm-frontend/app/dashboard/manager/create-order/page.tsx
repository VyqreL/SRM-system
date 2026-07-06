'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// --- Типи даних ---
interface SupplierOffer {
  supplier_id: number;
  company_name: string;
  wh_price: number;
  moq_batches: number;
  batch_size: number;
  sup_article?: string;
  rating: number;
}

interface ProductWithOffers {
  product_id: number;
  name: string;
  internal_sku: string;
  unit: string;
  offers: SupplierOffer[];
}

interface CartItem {
  product_id: number;
  product_name: string;
  internal_sku: string;
  selected_offer: SupplierOffer;
  ord_batches: number;
}

export default function CreateOrderPage() {
  const router = useRouter();

  // --- Стан компонента ---
  const [products, setProducts] = useState<ProductWithOffers[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<{
    loading: boolean;
    error: string | null;
    success: string | null;
  }>({ loading: false, error: null, success: null });

  // --- Завантаження каталогу товарів з пропозиціями ---
  useEffect(() => {
    const fetchProductsAndOffers = async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/business/products/offers`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Не вдалося завантажити каталог товарів з пропозиціями.');
        const data = await res.json();
        setProducts(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProductsAndOffers();
  }, []);

  // --- Фільтрація товарів ---
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(term) || 
      p.internal_sku.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  // --- Обробники подій ---
  const handleAddProductToCart = (product: ProductWithOffers, offer: SupplierOffer) => {
    // Якщо товар вже є в кошику, не додаємо дубль
    const existing = cart.find(item => item.product_id === product.product_id);
    if (existing) {
      alert(`Товар "${product.name}" вже є в кошику. Ви можете змінити його кількість або постачальника безпосередньо у кошику.`);
      return;
    }

    const newItem: CartItem = {
      product_id: product.product_id,
      product_name: product.name,
      internal_sku: product.internal_sku,
      selected_offer: offer,
      ord_batches: offer.moq_batches // встановлюємо MOQ за замовчуванням
    };

    setCart(prev => [...prev, newItem]);
  };

  const handleRemoveFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.product_id !== productId));
  };

  const handleQtyChange = (productId: number, qtyString: string) => {
    const qty = parseInt(qtyString, 10);
    setCart(prev => prev.map(item => {
      if (item.product_id === productId) {
        const val = isNaN(qty) || qty < 0 ? 0 : qty;
        return { ...item, ord_batches: val };
      }
      return item;
    }));
  };

  const handleSupplierChangeInCart = (productId: number, newSupplierId: number, product: ProductWithOffers) => {
    const offer = product.offers.find(o => o.supplier_id === newSupplierId);
    if (!offer) return;

    setCart(prev => prev.map(item => {
      if (item.product_id === productId) {
        return {
          ...item,
          selected_offer: offer,
          ord_batches: offer.moq_batches // Зкидаємо на MOQ нового постачальника
        };
      }
      return item;
    }));
  };

  // --- Групування кошика за постачальником ---
  const groupedCart = useMemo(() => {
    const groups: { [companyName: string]: { supplier_id: number; items: CartItem[]; total: number } } = {};
    cart.forEach(item => {
      const company = item.selected_offer.company_name;
      if (!groups[company]) {
        groups[company] = {
          supplier_id: item.selected_offer.supplier_id,
          items: [],
          total: 0
        };
      }
      groups[company].items.push(item);
      groups[company].total += item.ord_batches * item.selected_offer.batch_size * item.selected_offer.wh_price;
    });
    return groups;
  }, [cart]);

  const totalSum = useMemo(() => {
    return cart.reduce((sum, item) => 
      sum + (item.ord_batches * item.selected_offer.batch_size * item.selected_offer.wh_price), 0
    );
  }, [cart]);

  // --- Відправка bulk замовлення ---
  const handleSubmitBulkOrders = async () => {
    if (cart.length === 0) {
      setSubmission({ ...submission, error: 'Додайте хоча б один товар у кошик.' });
      return;
    }

    // Валідація MOQ перед відправкою
    const moqErrors: string[] = [];
    cart.forEach(item => {
      if (item.ord_batches < item.selected_offer.moq_batches) {
        moqErrors.push(`Мінімальне замовлення для "${item.product_name}" у постачальника "${item.selected_offer.company_name}" складає ${item.selected_offer.moq_batches} уп. (Вказано: ${item.ord_batches} уп.)`);
      }
    });

    if (moqErrors.length > 0) {
      setSubmission({ ...submission, error: moqErrors.join('\n') });
      return;
    }

    setSubmission({ loading: true, error: null, success: null });
    const token = localStorage.getItem('token');

    const payload = {
      items: cart.map(item => ({
        product_id: item.product_id,
        supplier_id: item.selected_offer.supplier_id,
        ord_batches: item.ord_batches,
        batch_size: item.selected_offer.batch_size,
        price_at_ord: item.selected_offer.wh_price,
        sup_article: item.selected_offer.sup_article || null
      }))
    };

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Не вдалося створити інвойси.');
      }

      const created = await res.json();
      setSubmission({
        loading: false,
        error: null,
        success: `Успішно створено ${created.length} інвойсів для різних постачальників!`
      });
      setTimeout(() => router.push('/dashboard/manager'), 2500);
    } catch (err: any) {
      setSubmission({ loading: false, error: err.message, success: null });
    }
  };

  if (loading) return <div className="p-10 text-xl text-center">Завантаження каталогу товарів...</div>;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/manager" className="text-blue-600 hover:text-blue-800 transition flex items-center gap-2 w-max">
            <span>&larr;</span> Повернутися до кабінету
          </Link>
        </div>

        <h1 className="text-3xl font-black text-gray-800 mb-8">Групове створення інвойсів на закупівлю</h1>

        {error && <div className="p-4 mb-4 text-red-800 bg-red-100 rounded-lg shadow-sm">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* --- Ліва колонка: Каталог товарів --- */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
              <h2 className="text-xl font-bold text-gray-800">1. Оберіть товари та постачальників</h2>
              <input
                type="text"
                placeholder="Пошук за назвою або SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="p-2 border rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 w-full md:w-64"
              />
            </div>

            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {filteredProducts.length > 0 ? (
                filteredProducts.map(product => (
                  <div key={product.product_id} className="p-4 border rounded-xl hover:shadow-sm transition bg-white border-gray-100 flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                      <h3 className="font-bold text-gray-800">{product.name}</h3>
                      <p className="text-xs text-gray-500">Внутрішній SKU: <span className="font-mono">{product.internal_sku}</span> | Од: {product.unit}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {product.offers.length > 0 ? (
                        product.offers.map(offer => (
                          <button
                            key={offer.supplier_id}
                            onClick={() => handleAddProductToCart(product, offer)}
                            className="p-2 text-left border rounded-lg hover:border-blue-500 hover:bg-blue-50/50 transition flex flex-col min-w-[150px]"
                          >
                            <span className="text-xs font-bold text-gray-800 truncate block max-w-[130px]">{offer.company_name}</span>
                            <span className="text-sm font-black text-blue-600 font-mono mt-1">{Number(offer.wh_price).toFixed(2)} грн</span>
                            <span className="text-[10px] text-gray-500 mt-1">MOQ: {offer.moq_batches} уп. | ⭐ {Number(offer.rating * 10).toFixed(2)}</span>
                          </button>
                        ))
                      ) : (
                        <span className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg font-semibold">Немає пропозицій</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-10">Товарів за вашим запитом не знайдено.</p>
              )}
            </div>
          </div>

          {/* --- Права колонка: Кошик та Групування --- */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col min-h-[500px]">
            <h2 className="text-xl font-bold text-gray-800 mb-6">2. Склад замовлення (Кошик)</h2>

            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20">
                <span className="text-5xl mb-3">🛒</span>
                <p className="text-gray-400 text-sm text-center">Оберіть товари та постачальників зліва, щоб сформувати замовлення.</p>
              </div>
            ) : (
              <div className="flex-1 space-y-6 overflow-y-auto max-h-[450px] pr-1">
                {Object.entries(groupedCart).map(([companyName, group]) => (
                  <div key={companyName} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="border-b pb-2 mb-3 flex justify-between items-center">
                      <span className="font-bold text-gray-800 text-sm truncate max-w-[180px]">{companyName}</span>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                        {Number(group.total).toFixed(2)} грн
                      </span>
                    </div>

                    <div className="space-y-3">
                      {group.items.map(item => {
                        const originalProduct = products.find(p => p.product_id === item.product_id);
                        return (
                          <div key={item.product_id} className="text-xs flex flex-col gap-2 p-2 bg-white rounded-lg shadow-2xs">
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-gray-700">{item.product_name}</span>
                              <button
                                onClick={() => handleRemoveFromCart(item.product_id)}
                                className="text-gray-400 hover:text-red-500 font-bold transition text-sm"
                              >
                                &times;
                              </button>
                            </div>

                            <div className="flex items-center justify-between gap-2 mt-1">
                              <div className="flex flex-col">
                                <span className="text-[10px] text-gray-500">Ціна: {Number(item.selected_offer.wh_price).toFixed(2)} грн/уп</span>
                                <span className="text-[10px] text-gray-400">MOQ: {item.selected_offer.moq_batches} уп.</span>
                              </div>

                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={item.ord_batches}
                                  onChange={(e) => handleQtyChange(item.product_id, e.target.value)}
                                  min={item.selected_offer.moq_batches}
                                  className={`w-16 p-1 border rounded text-center font-bold ${
                                    item.ord_batches < item.selected_offer.moq_batches ? 'border-red-500 text-red-600 bg-red-50' : 'bg-gray-50'
                                  }`}
                                />
                                <span className="text-gray-500 text-[10px]">уп.</span>
                              </div>
                            </div>

                            {/* Дозволяємо перемикати постачальника для цього ж товару прямо в кошику */}
                            {originalProduct && originalProduct.offers.length > 1 && (
                              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between gap-1">
                                <span className="text-[9px] text-gray-400 uppercase font-semibold">Постачальник:</span>
                                <select
                                  value={item.selected_offer.supplier_id}
                                  onChange={(e) => handleSupplierChangeInCart(item.product_id, parseInt(e.target.value, 10), originalProduct)}
                                  className="p-1 border rounded text-[10px] bg-gray-50 max-w-[140px]"
                                >
                                  {originalProduct.offers.map(off => (
                                    <option key={off.supplier_id} value={off.supplier_id}>
                                      {off.company_name} ({Number(off.wh_price).toFixed(0)} грн)
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="pt-4 border-t flex justify-between items-center">
                  <span className="text-base font-bold text-gray-800">Загальна сума:</span>
                  <span className="text-xl font-black text-blue-600 font-mono">{totalSum.toFixed(2)} грн</span>
                </div>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-gray-100">
              {submission.success && <div className="p-3 mb-4 text-sm text-green-800 bg-green-100 rounded-lg">{submission.success}</div>}
              {submission.error && <div className="p-3 mb-4 text-sm text-red-800 bg-red-100 rounded-lg whitespace-pre-line">{submission.error}</div>}
              <button
                onClick={handleSubmitBulkOrders}
                disabled={cart.length === 0 || submission.loading || !!submission.success}
                className="w-full p-3 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
              >
                {submission.loading ? 'Створення...' : 'Сформувати інвойси'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}