'use client';
import { useEffect, useState } from 'react';

interface UserProfile {
  user_id: number;
  email: string;
  role: string;
  is_active: boolean;
}

interface SupplierProfile {
  company_name: string;
  edrpou: string;
  address: string;
  default_payment_terms: string;
  payment_deadline: number;
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [supplierProfile, setSupplierProfile] = useState<SupplierProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Стани для редагування
  const [isEditingPwd, setIsEditingPwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '' });
  const [isEditingSupplier, setIsEditingSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState<SupplierProfile>({ company_name: '', edrpou: '', address: '', default_payment_terms: 'Deferred', payment_deadline: 0 });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setError('Немає токена авторизації');
          setLoading(false);
          return;
        }

        const resUser = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/me`, { headers: { 'Authorization': `Bearer ${token}` } });

        if (resUser.ok) {
          const userData = await resUser.json();
          setUser(userData);
          
          if (userData.role === 'SUPPLIER') {
            const resSupplier = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/suppliers/profile`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (resSupplier.ok) {
              const suppData = await resSupplier.json();
              setSupplierProfile(suppData);
              setSupplierForm(suppData);
            }
          }
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

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/me/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(pwdForm)
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Помилка при зміні пароля');
      }
      alert('Пароль успішно змінено!');
      setIsEditingPwd(false);
      setPwdForm({ current_password: '', new_password: '' });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSupplierUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/suppliers/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(supplierForm)
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Помилка при оновленні профілю');
      }
      const updatedData = await res.json();
      setSupplierProfile(updatedData);
      setSupplierForm(updatedData);
      setIsEditingSupplier(false);
      alert('Профіль успішно оновлено!');
    } catch (err: any) {
      alert(err.message);
    }
  };

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

        {/* Блок зміни пароля */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">Безпека</h2>
            {!isEditingPwd && (
              <button onClick={() => setIsEditingPwd(true)} className="text-sm font-semibold text-blue-600 hover:underline">
                Змінити пароль
              </button>
            )}
          </div>
          {isEditingPwd && (
            <form onSubmit={handlePasswordUpdate} className="space-y-4 border-t pt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Поточний пароль</label>
                <input type="password" required value={pwdForm.current_password} onChange={e => setPwdForm({...pwdForm, current_password: e.target.value})} className="mt-1 w-full p-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Новий пароль</label>
                <input type="password" required minLength={6} value={pwdForm.new_password} onChange={e => setPwdForm({...pwdForm, new_password: e.target.value})} className="mt-1 w-full p-2 border rounded-md" />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700">Зберегти</button>
                <button type="button" onClick={() => setIsEditingPwd(false)} className="px-4 py-2 text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300">Скасувати</button>
              </div>
            </form>
          )}
        </div>

        {/* Блоки з додатковою інформацією залежно від ролі */}
        {user.role === 'SUPPLIER' && (
          <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-blue-800">Юридичний профіль компанії</h2>
              {!isEditingSupplier && (
                <button onClick={() => setIsEditingSupplier(true)} className="px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded shadow hover:bg-blue-700 transition">
                  Редагувати профіль
                </button>
              )}
            </div>
            
            {isEditingSupplier ? (
              <form onSubmit={handleSupplierUpdate} className="space-y-4 bg-white p-4 rounded-lg shadow-sm border border-blue-100">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold text-gray-500">Назва компанії</label><input required value={supplierForm.company_name} onChange={e => setSupplierForm({...supplierForm, company_name: e.target.value})} className="mt-1 w-full p-2 border rounded text-sm" /></div>
                  <div><label className="block text-xs font-bold text-gray-500">ЄДРПОУ</label><input required value={supplierForm.edrpou} onChange={e => setSupplierForm({...supplierForm, edrpou: e.target.value})} className="mt-1 w-full p-2 border rounded text-sm" /></div>
                  <div className="col-span-2"><label className="block text-xs font-bold text-gray-500">Юридична адреса</label><input value={supplierForm.address || ''} onChange={e => setSupplierForm({...supplierForm, address: e.target.value})} className="mt-1 w-full p-2 border rounded text-sm" /></div>
                  <div><label className="block text-xs font-bold text-gray-500">Умови оплати</label><input value={supplierForm.default_payment_terms || ''} onChange={e => setSupplierForm({...supplierForm, default_payment_terms: e.target.value})} className="mt-1 w-full p-2 border rounded text-sm" /></div>
                  <div><label className="block text-xs font-bold text-gray-500">Відстрочка (днів)</label><input type="number" value={supplierForm.payment_deadline} onChange={e => setSupplierForm({...supplierForm, payment_deadline: Number(e.target.value)})} className="mt-1 w-full p-2 border rounded text-sm" /></div>
                </div>
                <div className="flex gap-2 pt-2 border-t">
                  <button type="submit" className="px-4 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700">Зберегти зміни</button>
                  <button type="button" onClick={() => {setIsEditingSupplier(false); if(supplierProfile) setSupplierForm(supplierProfile);}} className="px-4 py-2 text-sm text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300">Скасувати</button>
                </div>
              </form>
            ) : supplierProfile ? (
              <div className="grid grid-cols-2 gap-4 mt-4 text-sm text-blue-900 bg-white p-4 rounded-lg shadow-sm">
                <div><span className="font-bold text-blue-700 block">Назва:</span> {supplierProfile.company_name}</div>
                <div><span className="font-bold text-blue-700 block">ЄДРПОУ:</span> {supplierProfile.edrpou || '—'}</div>
                <div className="col-span-2"><span className="font-bold text-blue-700 block">Адреса:</span> {supplierProfile.address || '—'}</div>
                <div><span className="font-bold text-blue-700 block">Умови оплати:</span> {supplierProfile.default_payment_terms || '—'}</div>
                <div><span className="font-bold text-blue-700 block">Відстрочка:</span> {supplierProfile.payment_deadline} днів</div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic mt-4">Профіль компанії не знайдено.</p>
            )}
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
