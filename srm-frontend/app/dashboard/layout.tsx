'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface UserProfile {
  email: string;
  role: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
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
      .then(data => setUser(data))
      .catch(() => {
        localStorage.removeItem('token');
        router.push('/login');
      });
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  if (!user) return <div className="flex items-center justify-center min-h-screen bg-gray-50">Завантаження профілю...</div>;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Загальний Header */}
      <header className="flex items-center justify-between px-8 py-4 bg-white border-b shadow-sm">
        <div className="text-2xl font-black text-blue-700">
          <Link href="/dashboard/manager">SRM System</Link>
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