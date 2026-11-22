"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import { Shield, LogIn, ShieldAlert, ShieldCheck } from "lucide-react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [actionModal, setActionModal] = useState<{ type: "impersonate" | "grant" | "revoke"; userId: string; email: string } | null>(null);
  const [password, setPassword] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchUsers = async () => {
    const token = localStorage.getItem("access_token");
    const res = await fetch(`${API_URL}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      setUsers(await res.json());
    } else {
      showToast("Ошибка доступа", "error");
      router.push("/");
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAction = async () => {
    if (!actionModal || !password) return;
    setActionLoading(true);
    const token = localStorage.getItem("access_token");
    
    let endpoint = "";
    if (actionModal.type === "impersonate") endpoint = `/admin/impersonate/${actionModal.userId}`;
    if (actionModal.type === "grant") endpoint = `/admin/grant-admin/${actionModal.userId}`;
    if (actionModal.type === "revoke") endpoint = `/admin/revoke-admin/${actionModal.userId}`;

    const res = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password })
    });

    if (res.ok) {
      if (actionModal.type === "impersonate") {
        const data = await res.json();
        const originalToken = localStorage.getItem("access_token");
        if (originalToken) sessionStorage.setItem("original_admin_token", originalToken);
        
        sessionStorage.setItem("impersonation_token", data.access_token);
        showToast("Вход выполнен. Перенаправление...");
        setTimeout(() => { window.location.href = "/"; }, 1000);
      } else {
        showToast("Действие выполнено успешно");
        setActionModal(null);
        setPassword("");
        fetchUsers();
      }
    } else {
      const err = await res.json();
      showToast(err.detail || "Ошибка", "error");
    }
    setActionLoading(false);
  };

  if (loading) return <div className="p-10 text-center">Загрузка...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 mt-10 relative">
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-6 py-3 rounded-lg shadow-lg text-white font-medium ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {actionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold mb-2">
              {actionModal.type === "impersonate" ? "Войти как пользователь" : 
               actionModal.type === "grant" ? "Выдать права админа" : "Забрать права админа"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">{actionModal.email}</p>
            <p className="text-sm text-gray-700 mb-2">Подтвердите свой пароль для безопасности:</p>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="w-full border p-2 rounded-lg mb-4" 
              placeholder="Ваш пароль" 
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setActionModal(null); setPassword(""); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Отмена</button>
              <button onClick={handleAction} disabled={actionLoading || !password} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
                {actionLoading ? "..." : "Подтвердить"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Shield /> Админ-панель</h1>
        <button onClick={() => window.location.href = "/"} className="text-blue-600 hover:underline">← На главную</button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-medium text-gray-600">Email</th>
              <th className="p-4 font-medium text-gray-600">Роль</th>
              <th className="p-4 font-medium text-gray-600">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="p-4">{u.email}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    u.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                    u.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="p-4 flex gap-2">
                  {u.id !== user?.id && (
                    <button 
                      onClick={() => setActionModal({ type: "impersonate", userId: u.id, email: u.email })}
                      className="flex items-center gap-1 text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200 text-gray-700"
                    >
                      <LogIn size={14} /> Войти
                    </button>
                  )}
                  
                  {user?.role === "superadmin" && u.role === "user" && (
                    <button onClick={() => setActionModal({ type: "grant", userId: u.id, email: u.email })} className="flex items-center gap-1 text-sm bg-blue-50 px-3 py-1 rounded text-blue-700 hover:bg-blue-100">
                      <ShieldCheck size={14} /> Дать админа
                    </button>
                  )}

                  {user?.role === "superadmin" && u.role === "admin" && (
                    <button onClick={() => setActionModal({ type: "revoke", userId: u.id, email: u.email })} className="flex items-center gap-1 text-sm bg-red-50 px-3 py-1 rounded text-red-700 hover:bg-red-100">
                      <ShieldAlert size={14} /> Забрать админа
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
