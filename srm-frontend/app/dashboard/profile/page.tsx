'use client';
import { useEffect, useState } from 'react';

interface UserProfile {
  user_id: number;
  email: string;
  role: string;
  is_active: boolean;
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setError('Немає токена авторизації');
          setLoading(false);
          return;
        }

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          setError('Не вдалося завантажити профіль');
        }
      } catch (err) {
        setError('Помилка мережі');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) return <div className="p-10 text-xl text-center">Завантаження профілю...</div>;
  if (error) return <div className="p-10 text-xl text-center text-red-600">Помилка: {error}</div>;
  if (!user) return <div className="p-10 text-xl text-center">Користувача не знайдено</div>;

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Мій профіль</h1>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-500">ID Користувача</label>
              <div className="mt-1 text-lg text-gray-900">#{user.user_id}</div>
            </div>
            
            <div className="border-t pt-6">
              <label className="block text-sm font-medium text-gray-500">Електронна пошта</label>
              <div className="mt-1 text-lg text-gray-900">{user.email}</div>
            </div>

            <div className="border-t pt-6">
              <label className="block text-sm font-medium text-gray-500">Роль у системі</label>
              <div className="mt-2">
                <span className="px-3 py-1 text-sm font-bold text-blue-800 uppercase bg-blue-100 rounded-full">
                  {user.role}
                </span>
              </div>
            </div>

            <div className="border-t pt-6">
              <label className="block text-sm font-medium text-gray-500">Статус акаунта</label>
              <div className="mt-2">
                {user.is_active ? (
                  <span className="inline-flex items-center gap-2 px-3 py-1 text-sm font-semibold text-green-700 bg-green-100 rounded-full">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span> Активний
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 px-3 py-1 text-sm font-semibold text-red-700 bg-red-100 rounded-full">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span> Заблокований
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Блоки з додатковою інформацією залежно від ролі */}
        {user.role === 'SUPPLIER' && (
          <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-6">
            <h2 className="text-xl font-bold text-blue-800 mb-2">Юридичний профіль компанії</h2>
            <p className="text-blue-900 mb-4">
              Тут ви можете керувати реквізитами своєї компанії (ЄДРПОУ, адреса, умови оплати), які необхідні для укладання замовлень.
            </p>
            <button className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded shadow hover:bg-blue-700 transition">
              Керувати даними компанії
            </button>
          </div>
        )}

        {user.role === 'MANAGER' && (
          <div className="mt-8 bg-green-50 border border-green-100 rounded-lg p-6">
            <h2 className="text-xl font-bold text-green-800 mb-2">Зона відповідальності</h2>
            <p className="text-green-900">
              Ви маєте розширений доступ до створення замовлень, контролю постачань та роботи з дашбордом дефіциту товарів (Reorder Suggestions).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
