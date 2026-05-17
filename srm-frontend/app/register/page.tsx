'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function RegisterPage() {
  const [role, setRole] = useState('SUPPLIER');
  
  // Поля форм
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regToken, setRegToken] = useState('');
  
  const [msg, setMsg] = useState({ type: '', text: '' });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });

    // Динамічно визначаємо URL та тіло запиту залежно від ролі
    let url = '';
    let payload = {};

    if (role === 'SUPPLIER') {
      url = `${process.env.NEXT_PUBLIC_API_URL}/auth/register/supplier`;
      payload = { email, password };
    } else {
      url = `${process.env.NEXT_PUBLIC_API_URL}/auth/register/manager`;
      payload = { token: regToken, password };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setMsg({ type: 'success', text: 'Реєстрація успішна! Тепер ви можете увійти.' });
        // Очищаємо форму
        setEmail(''); setPassword(''); setRegToken('');
      } else {
        const errorData = await res.json();
        setMsg({ type: 'error', text: errorData.detail || 'Помилка реєстрації' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: 'Помилка з\'єднання з сервером' });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleRegister} className="w-full max-w-md p-8 bg-white shadow-lg rounded-xl">
        <h1 className="mb-6 text-2xl font-bold text-center text-gray-800">Реєстрація в КІС</h1>
        
        {msg.text && (
          <div className={`p-3 mb-4 text-sm rounded ${msg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {msg.text}
          </div>
        )}

        {/* Перемикач ролей */}
        <div className="mb-6">
          <label className="block mb-2 text-sm font-semibold text-gray-600">Оберіть вашу роль</label>
          <select 
            className="w-full p-3 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            value={role} onChange={(e) => {
              setRole(e.target.value);
              setMsg({ type: '', text: '' }); // Очищаємо помилки при зміні ролі
            }}
          >
            <option value="SUPPLIER">Постачальник (Партнер)</option>
            <option value="MANAGER">Менеджер (Співробітник)</option>
          </select>
        </div>

        {/* Поле Email показуємо ТІЛЬКИ для Постачальника */}
        {role === 'SUPPLIER' && (
          <div className="mb-4">
            <label className="block mb-1 text-sm text-gray-600">Email адреса</label>
            <input 
              type="email" placeholder="company@example.com" required
              className="w-full p-3 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        )}

        {/* Поле Токена показуємо ТІЛЬКИ для Менеджера */}
        {role === 'MANAGER' && (
          <div className="p-4 mb-4 bg-blue-50 rounded-lg border border-blue-100">
            <label className="block mb-1 text-sm font-semibold text-blue-800">Секретний токен співробітника</label>
            <input 
              type="text" placeholder="Введіть отриманий токен" required
              className="w-full p-3 border rounded border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={regToken} onChange={(e) => setRegToken(e.target.value)}
            />
            <p className="mt-1 text-xs text-blue-600">Email буде прив'язано автоматично на основі токена.</p>
          </div>
        )}

        {/* Пароль потрібен усім */}
        <div className="mb-6">
          <label className="block mb-1 text-sm text-gray-600">Придумайте пароль</label>
          <input 
            type="password" placeholder="Пароль" required
            className="w-full p-3 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="w-full p-3 font-semibold text-white transition bg-green-600 rounded hover:bg-green-700">
          Зареєструватися
        </button>

        <div className="mt-6 text-sm text-center text-gray-600">
          Вже маєте акаунт?{' '}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Увійти
          </Link>
        </div>
      </form>
    </div>
  );
}