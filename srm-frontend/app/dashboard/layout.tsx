'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

interface UserProfile {
  email: string;
  role: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login');
      return;
    }

    // Функція для перевірки ролей та редиректів
    const enforceRBAC = (role: string) => {
      if (pathname === '/dashboard' || pathname === '/dashboard/') {
        router.replace(role === 'SUPPLIER' ? '/dashboard/supplier' : '/dashboard/manager');
      } else if (role === 'SUPPLIER' && pathname.startsWith('/dashboard/manager')) {
        router.replace('/dashboard/supplier');
      } else if (role === 'MANAGER' && pathname.startsWith('/dashboard/supplier')) {
        router.replace('/dashboard/manager');
      }
    };

    // Якщо профіль вже є в стейті, просто перевіряємо маршрут при навігації
    if (user) {
      enforceRBAC(user.role);
      return;
    }

    // Централізовано отримуємо дані користувача для шапки
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Unauthorized');
      })
      .then(data => {
        setUser(data);
        enforceRBAC(data.role);
      })
      .catch(() => {
        localStorage.removeItem('token');
        router.replace('/login');
      });
  }, [router, pathname, user]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.replace('/login');
  };

  if (!user) return <div className="flex items-center justify-center min-h-screen bg-gray-50">Завантаження профілю...</div>;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Загальний Header */}
      <header className="flex items-center justify-between px-8 py-4 bg-white border-b shadow-sm">
        <div className="flex items-center gap-10">
          <div className="text-2xl font-black text-blue-700">
            <Link href="/dashboard">SRM System</Link>
          </div>
          {user.role === 'MANAGER' && (
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/dashboard/manager" className={`text-sm font-bold transition hover:text-blue-700 ${pathname === '/dashboard/manager' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-gray-600'}`}>
                Замовлення
              </Link>
              <Link href="/dashboard/manager/analytics" className={`text-sm font-bold transition hover:text-blue-700 ${pathname === '/dashboard/manager/analytics' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-gray-600'}`}>
                📊 Аналітика
              </Link>
              <Link href="/dashboard/manager/mappings" className={`text-sm font-bold transition hover:text-blue-700 ${pathname === '/dashboard/manager/mappings' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-gray-600'}`}>
                🔗 Маппінг
              </Link>
              <Link href="/dashboard/manager/expirations" className={`text-sm font-bold transition hover:text-blue-700 ${pathname === '/dashboard/manager/expirations' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-gray-600'}`}>
                ⚠️ Терміни придатності
              </Link>
              <Link href="/dashboard/manager/stocks" className={`text-sm font-bold transition hover:text-blue-700 ${pathname === '/dashboard/manager/stocks' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-gray-600'}`}>
                📦 Мінімуми складу
              </Link>
            </nav>
          )}
          {user.role === 'SUPPLIER' && (
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/dashboard/supplier" className={`text-sm font-bold transition hover:text-blue-700 ${pathname === '/dashboard/supplier' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-gray-600'}`}>
                Кабінет
              </Link>
              <Link href="/dashboard/supplier/prices" className={`text-sm font-bold transition hover:text-blue-700 ${pathname === '/dashboard/supplier/prices' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-gray-600'}`}>
                🏷️ Керування цінами
              </Link>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-6">
          <Link href="/dashboard/profile" className="flex flex-col text-right transition rounded hover:bg-gray-50 p-1 px-2 cursor-pointer">
            <span className="text-sm font-bold text-gray-800">{user.email}</span>
            <span className="text-xs font-semibold text-blue-600 uppercase">{user.role}</span>
          </Link>
          <button onClick={handleLogout} className="px-4 py-2 text-sm font-semibold text-red-600 transition bg-red-50 border border-red-100 rounded shadow-sm hover:bg-red-100">
            Вийти
          </button>
        </div>
      </header>

      {/* Тут будуть рендеритися специфічні сторінки (manager/page.tsx, supplier/page.tsx тощо) */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}