'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);

    try {
      // 1. Отримуємо токен
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Невірний email або пароль');
      
      const data = await res.json();
      const token = data.access_token;
      localStorage.setItem('token', token);

      // 2. Дізнаємося роль користувача для правильного редиректу
      // (Припускаємо, що у нас є такий стандартний ендпоінт)
      const userRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (userRes.ok) {
        const userData = await userRes.json();
        // Розумний редирект
        if (userData.role === 'MANAGER') {
          window.location.href = '/dashboard/manager';
        } else if (userData.role === 'SUPPLIER') {
          window.location.href = '/dashboard/supplier';
        } else {
          window.location.href = '/';
        }
      } else {
        // Якщо /users/me недоступний, пробуємо декодувати JWT або кидаємо на дефолт
        window.location.href = '/dashboard/manager'; 
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleLogin} className="w-full max-w-md p-8 bg-white shadow-lg rounded-xl">
        <h1 className="mb-2 text-2xl font-bold text-center text-gray-800">Вхід до КІС</h1>
        <p className="mb-6 text-sm text-center text-gray-500">Система управління постачанням</p>
        
        {errorMsg && <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded">{errorMsg}</div>}

        <input 
          type="email" placeholder="Email адреса" required
          className="w-full p-3 mb-4 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <input 
          type="password" placeholder="Пароль" required
          className="w-full p-3 mb-6 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        
        <button type="submit" className="w-full p-3 font-semibold text-white transition bg-blue-600 rounded hover:bg-blue-700">
          Увійти в кабінет
        </button>

        <div className="mt-6 text-sm text-center text-gray-600">
          Ще не стали нашим партнером?{' '}
          <Link href="/register" className="font-semibold text-blue-600 hover:underline">
            Зареєструватися
          </Link>
        </div>
      </form>
    </div>
  );
}