'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface ChartPoint {
  date: string;
  expenses: number;
  earnings: number;
}

interface AnalyticsData {
  total_expenses: number;
  total_earnings: number;
  total_orders: number;
  otif_rate: number;
  quality_rate: number;
  timeliness_rate: number;
  chart_data: ChartPoint[];
}

export default function AnalyticsDashboardPage() {
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('week');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/business/analytics?period=${period}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Не вдалося завантажити аналітичні дані.');
        const result = await res.json();
        setData(result);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, [period]);

  // --- Розрахунок SVG координат для графіка ---
  const graphDimensions = { width: 500, height: 180 };
  
  const svgElements = useMemo(() => {
    if (!data || data.chart_data.length === 0) return null;

    const points = data.chart_data;
    const maxVal = Math.max(
      ...points.map(p => Number(p.expenses)),
      ...points.map(p => Number(p.earnings)),
      1000 // запобігаємо діленню на 0, якщо суми порожні
    );

    // Розраховуємо крок по осі X
    const xStep = points.length > 1 ? graphDimensions.width / (points.length - 1) : graphDimensions.width;

    // Функція масштабування Y
    const getScaleY = (val: number) => {
      const parsed = Number(val);
      return graphDimensions.height - (parsed / maxVal) * (graphDimensions.height - 20) - 10;
    };

    // Генеруємо стрічку координат для ліній
    let expensesPath = '';
    let earningsPath = '';

    points.forEach((p, idx) => {
      const x = idx * xStep;
      const yExp = getScaleY(p.expenses);
      const yEarn = getScaleY(p.earnings);

      if (idx === 0) {
        expensesPath = `M ${x} ${yExp}`;
        earningsPath = `M ${x} ${yEarn}`;
      } else {
        expensesPath += ` L ${x} ${yExp}`;
        earningsPath += ` L ${x} ${yEarn}`;
      }
    });

    return {
      expensesPath,
      earningsPath,
      points: points.map((p, idx) => ({
        x: idx * xStep,
        yExp: getScaleY(p.expenses),
        yEarn: getScaleY(p.earnings),
        date: p.date,
        expenses: Number(p.expenses),
        earnings: Number(p.earnings)
      }))
    };
  }, [data]);

  if (loading) return <div className="p-10 text-xl text-center">Завантаження аналітичного дашборду...</div>;
  if (!data) return <div className="p-10 text-center text-red-500">Не вдалося завантажити дані. Спробуйте пізніше.</div>;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/manager" className="text-blue-600 hover:text-blue-800 transition flex items-center gap-2 w-max">
            <span>&larr;</span> Повернутися до кабінету
          </Link>
        </div>

        {/* Заголовок та фільтр */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-800">📊 Аналітичний дашборд</h1>
            <p className="text-sm text-gray-500 mt-1">Оцінка витрат, заробітку та ефективності (OTIF) ланцюга постачання.</p>
          </div>
          <div className="flex bg-white p-1 rounded-xl shadow-xs border border-gray-100 w-max">
            {(['week', 'month', 'quarter'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition capitalize ${
                  period === p ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p === 'week' ? 'Тиждень' : p === 'month' ? 'Місяць' : 'Квартал'}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="p-4 mb-6 text-red-800 bg-red-100 rounded-lg">{error}</div>}

        {/* Картки KPI */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-6 bg-white rounded-2xl shadow-xs border border-gray-100 flex flex-col justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Витрати закупівлі</span>
            <span className="text-3xl font-black text-gray-800 mt-2 font-mono">
              {Number(data.total_expenses).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн
            </span>
            <span className="text-[10px] text-gray-400 mt-3">Загальна вартість підтверджених/доставлених замовлень</span>
          </div>

          <div className="p-6 bg-white rounded-2xl shadow-xs border border-gray-100 flex flex-col justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Оціночний заробіток (маржа 30%)</span>
            <span className="text-3xl font-black text-green-600 mt-2 font-mono">
              {Number(data.total_earnings).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн
            </span>
            <span className="text-[10px] text-gray-400 mt-3">Чистий прибуток від перепродажу FMCG товарів</span>
          </div>

          <div className="p-6 bg-white rounded-2xl shadow-xs border border-gray-100 flex flex-col justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Кількість інвойсів</span>
            <span className="text-3xl font-black text-blue-600 mt-2 font-mono">
              {data.total_orders} замовлень
            </span>
            <span className="text-[10px] text-gray-400 mt-3">Кількість сформованих активних інвойсів за період</span>
          </div>
        </div>

        {/* Блок з графіком та логістичною аналітикою */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Карта графіка трендів */}
          <div className="lg:col-span-2 p-6 bg-white rounded-2xl shadow-xs border border-gray-100 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-gray-800 text-lg">📈 Тренд фінансів за період</h3>
              <div className="flex gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-3 h-3 bg-red-400 rounded-full inline-block"></span>
                  Витрати
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-3 h-3 bg-green-500 rounded-full inline-block"></span>
                  Заробіток
                </span>
              </div>
            </div>

            {svgElements ? (
              <div className="my-6 relative flex justify-center">
                <svg
                  viewBox={`0 0 ${graphDimensions.width} ${graphDimensions.height}`}
                  className="w-full max-w-[550px] overflow-visible"
                >
                  {/* Горизонтальні лінії сітки */}
                  {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => (
                    <line
                      key={idx}
                      x1="0"
                      y1={graphDimensions.height * p}
                      x2={graphDimensions.width}
                      y2={graphDimensions.height * p}
                      stroke="#f3f4f6"
                      strokeWidth="1.5"
                    />
                  ))}

                  {/* Лінія витрат (Expenses) */}
                  <path
                    d={svgElements.expensesPath}
                    fill="none"
                    stroke="#f87171"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Лінія заробітку (Earnings) */}
                  <path
                    d={svgElements.earningsPath}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Точки на графіку (Expenses) */}
                  {svgElements.points.map((pt, idx) => (
                    <g key={`exp-${idx}`}>
                      <circle
                        cx={pt.x}
                        cy={pt.yExp}
                        r="5"
                        fill="#f87171"
                        stroke="#fff"
                        strokeWidth="1.5"
                        className="hover:scale-150 transition cursor-pointer"
                      />
                      {/* Хвостик з датою знизу */}
                      {idx % (period === 'week' ? 1 : period === 'month' ? 2 : 3) === 0 && (
                        <text
                          x={pt.x}
                          y={graphDimensions.height + 15}
                          textAnchor="middle"
                          fill="#9ca3af"
                          fontSize="9"
                          fontWeight="bold"
                          className="font-mono"
                        >
                          {pt.date}
                        </text>
                      )}
                    </g>
                  ))}

                  {/* Точки на графіку (Earnings) */}
                  {svgElements.points.map((pt, idx) => (
                    <circle
                      key={`earn-${idx}`}
                      cx={pt.x}
                      cy={pt.yEarn}
                      r="5"
                      fill="#22c55e"
                      stroke="#fff"
                      strokeWidth="1.5"
                      className="hover:scale-150 transition cursor-pointer"
                    />
                  ))}
                </svg>
              </div>
            ) : (
              <p className="text-center text-gray-400 py-20">Недостатньо даних для побудови графіка.</p>
            )}
          </div>

          {/* Логістична аналітика (OTIF) */}
          <div className="p-6 bg-white rounded-2xl shadow-xs border border-gray-100 flex flex-col justify-between">
            <h3 className="font-bold text-gray-800 text-lg mb-6">🚚 Надійність постачальників</h3>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  <span>Рейтинг OTIF (Вчасно і в повному обсязі)</span>
                  <span className="font-mono text-blue-600 font-black">
                    {Number(data.otif_rate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${data.otif_rate * 100}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  <span>Рейтинг якості товару</span>
                  <span className="font-mono text-green-600 font-black">
                    {Number(data.quality_rate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-green-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${data.quality_rate * 100}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  <span>Вчасність доставки (без запізнень)</span>
                  <span className="font-mono text-purple-600 font-black">
                    {Number(data.timeliness_rate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-purple-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${data.timeliness_rate * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="mt-8 p-3.5 bg-blue-50/50 rounded-xl border border-blue-100/50 text-[10px] text-blue-700 leading-relaxed">
              📝 Показники розраховуються на основі прийнятих партій товарів та зафіксованих оцінок відхилення за часом (delta_time) та якістю (quality_rate).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
