'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface PriceHistoryPoint {
  history_id: number;
  company_name: string;
  old_price: number;
  new_price: number;
  change_date: string;
}

interface ProductDetails {
  product_id: number;
  name: string;
  internal_sku: string;
  unit: string;
  category_name: string;
  current_stock: number;
  total_purchased: number;
  total_sold: number;
  price_history: PriceHistoryPoint[];
}

export default function ProductDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id;

  const [details, setDetails] = useState<ProductDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    const fetchDetails = async () => {
      setLoading(true);
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/business/products/${productId}/details`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Не вдалося завантажити деталі товару.');
        setDetails(await res.json());
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [productId]);

  // --- Складання SVG графіка тренду цін ---
  const graphWidth = 500;
  const graphHeight = 200;

  const chartData = useMemo(() => {
    if (!details || details.price_history.length === 0) return null;
    const points = details.price_history;
    const prices = points.map(p => Number(p.new_price)).concat(points.map(p => Number(p.old_price)));
    const minVal = Math.min(...prices) * 0.9; // додамо 10% запасу знизу
    const maxVal = Math.max(...prices) * 1.1; // додамо 10% запасу зверху
    const valRange = maxVal - minVal || 10;

    const xStep = points.length > 1 ? graphWidth / (points.length - 1) : graphWidth;

    const getScaleY = (val: number) => {
      return graphHeight - ((val - minVal) / valRange) * (graphHeight - 40) - 20;
    };

    let pathD = '';
    const formattedPoints = points.map((p, idx) => {
      const x = idx * xStep;
      const y = getScaleY(Number(p.new_price));
      if (idx === 0) {
        pathD = `M ${x} ${y}`;
      } else {
        pathD += ` L ${x} ${y}`;
      }
      return {
        x,
        y,
        price: Number(p.new_price),
        date: new Date(p.change_date).toLocaleDateString(),
        supplier: p.company_name
      };
    });

    return { pathD, points: formattedPoints, minVal, maxVal };
  }, [details]);

  if (loading) return <div className="p-10 text-xl text-center">Завантаження інформації про товар...</div>;
  if (error) return <div className="p-10 text-xl text-center text-red-500">Помилка: {error}</div>;
  if (!details) return <div className="p-10 text-xl text-center">Товар не знайдено.</div>;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <button onClick={() => router.back()} className="text-blue-600 hover:text-blue-800 transition flex items-center gap-2 w-max">
            <span>&larr;</span> Повернутися назад
          </button>
        </div>

        {/* --- Картка товару --- */}
        <div className="bg-white rounded-2xl shadow-xs border border-gray-100 p-6 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-800 border border-blue-100">
                {details.category_name}
              </span>
              <h1 className="text-3xl font-black text-gray-800 mt-2">{details.name}</h1>
              <p className="text-sm text-gray-400 mt-1 font-mono">
                Внутрішній SKU: <span className="font-semibold">{details.internal_sku}</span> | Одиниця виміру: <span className="font-semibold">{details.unit}</span>
              </p>
            </div>
          </div>
        </div>

        {/* --- Картки KPI товарообігу --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-6 bg-white rounded-2xl shadow-xs border border-gray-100 flex flex-col justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Поточний запас</span>
            <span className="text-3xl font-black text-gray-800 mt-2 font-mono">
              {Number(details.current_stock).toFixed(0)} {details.unit}
            </span>
            <span className="text-[10px] text-gray-400 mt-3">Фактично на складі на даний момент</span>
          </div>

          <div className="p-6 bg-white rounded-2xl shadow-xs border border-gray-100 flex flex-col justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Закуплено (всього)</span>
            <span className="text-3xl font-black text-blue-600 mt-2 font-mono">
              {Number(details.total_purchased).toFixed(0)} {details.unit}
            </span>
            <span className="text-[10px] text-gray-400 mt-3">Сумарний обсяг підтверджених/доставлених поставок</span>
          </div>

          <div className="p-6 bg-white rounded-2xl shadow-xs border border-gray-100 flex flex-col justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Товарообіг (реалізовано)</span>
            <span className="text-3xl font-black text-green-600 mt-2 font-mono">
              {Number(details.total_sold).toFixed(0)} {details.unit}
            </span>
            <span className="text-[10px] text-gray-400 mt-3">Обсяг товару, який вибув зі складу (проданий)</span>
          </div>
        </div>

        {/* --- Графік та історія цін --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Графік тренду */}
          <div className="lg:col-span-2 p-6 bg-white rounded-2xl shadow-xs border border-gray-100 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-gray-800 text-lg">📈 Динаміка цін постачальників</h3>
              <p className="text-xs text-gray-400 mt-1">Графік відображає історію змін цін на основі логування price_history.</p>
            </div>

            {chartData ? (
              <div className="my-6 relative flex justify-center">
                <svg
                  viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                  className="w-full max-w-[500px] overflow-visible"
                >
                  {/* Горизонтальні лінії сітки */}
                  {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => (
                    <line
                      key={idx}
                      x1="0"
                      y1={graphHeight * p}
                      x2={graphWidth}
                      y2={graphHeight * p}
                      stroke="#f3f4f6"
                      strokeWidth="1"
                    />
                  ))}

                  {/* Тренд лінії цін */}
                  <path
                    d={chartData.pathD}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Точки на графіку */}
                  {chartData.points.map((pt, idx) => (
                    <g key={idx}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="5.5"
                        fill="#3b82f6"
                        stroke="#fff"
                        strokeWidth="2"
                        className="hover:scale-150 transition cursor-pointer"
                      />
                      {/* Спливаюча ціна над точкою */}
                      <text
                        x={pt.x}
                        y={pt.y - 12}
                        textAnchor="middle"
                        fill="#1f2937"
                        fontSize="9"
                        fontWeight="bold"
                        className="font-mono bg-white"
                      >
                        {pt.price.toFixed(2)} грн
                      </text>
                      {/* Дата та постачальник знизу */}
                      {idx % (chartData.points.length > 5 ? 2 : 1) === 0 && (
                        <text
                          x={pt.x}
                          y={graphHeight + 15}
                          textAnchor="middle"
                          fill="#9ca3af"
                          fontSize="8"
                          className="font-mono"
                        >
                          {pt.date}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>
              </div>
            ) : (
              <div className="text-center text-gray-400 py-16 flex flex-col items-center justify-center">
                <span>📊 Немає зафіксованої історії змін цін.</span>
                <span className="text-[10px] mt-1">Ціни записуються в історію автоматично тригером бази даних при оновленні прайс-листів.</span>
              </div>
            )}
          </div>

          {/* Таблиця історії */}
          <div className="p-6 bg-white rounded-2xl shadow-xs border border-gray-100 flex flex-col">
            <h3 className="font-bold text-gray-800 text-lg mb-4">📜 Журнал змін цін</h3>
            <div className="overflow-y-auto max-h-[220px] flex-1 divide-y divide-gray-100 text-xs">
              {details.price_history.length === 0 ? (
                <p className="text-gray-400 italic text-center py-10">Історія змін порожня.</p>
              ) : (
                details.price_history.map(p => (
                  <div key={p.history_id} className="py-3 flex flex-col gap-1">
                    <div className="flex justify-between font-bold text-gray-700">
                      <span>{p.company_name}</span>
                      <span className="font-mono text-blue-600">
                        {p.old_price ? `${Number(p.old_price).toFixed(2)}` : '0.00'} &rarr; {Number(p.new_price).toFixed(2)} грн
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {new Date(p.change_date).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
