"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import { Shield, LogIn, ShieldAlert, ShieldCheck, Users, Activity } from "lucide-react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [tab, setTab] = useState<"users" | "logs">("users");
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [actionModal, setActionModal] = useState<{ type: "impersonate" | "grant" | "revoke"; userId: string; email: string } | null>(null);
  const [password, setPassword] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    const token = localStorage.getItem("access_token");
    const headers = { Authorization: `Bearer ${token}` };

    const [usersRes, logsRes] = await Promise.all([
      fetch(`${API_URL}/admin/users`, { headers }),
      fetch(`${API_URL}/admin/logs`, { headers })
    ]);

    if (usersRes.ok && logsRes.ok) {
      setUsers(await usersRes.json());
      setLogs(await logsRes.json());
    } else {
      showToast("Ошибка доступа", "error");
      router.push("/");
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

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
        setActionModal(null); setPassword(""); fetchData();
      }
    } else {
      const err = await res.json();
      showToast(err.detail || "Ошибка", "error");
    }
    setActionLoading(false);
  };

  if (loading && users.length === 0) return <div className="p-10 text-center">Загрузка...</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 mt-10 relative">
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-6 py-3 rounded-lg shadow-lg text-white font-medium ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {actionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold mb-2">
              {actionModal.type === "impersonate" ? "Войти как пользователь" : actionModal.type === "grant" ? "Выдать права админа" : "Забрать права админа"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">{actionModal.email}</p>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border p-2 rounded-lg mb-4" placeholder="Ваш пароль" autoFocus />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setActionModal(null); setPassword(""); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Отмена</button>
              <button onClick={handleAction} disabled={actionLoading || !password} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">Подтвердить</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Shield /> Админ-панель</h1>
        <button onClick={() => window.location.href = "/"} className="text-blue-600 hover:underline">← На главную</button>
      </div>

      {/* Табы */}
      <div className="flex gap-4 mb-6 border-b">
        <button onClick={() => setTab("users")} className={`pb-2 px-2 flex items-center gap-2 font-medium ${tab === "users" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>
          <Users size={18} /> Пользователи
        </button>
        <button onClick={() => setTab("logs")} className={`pb-2 px-2 flex items-center gap-2 font-medium ${tab === "logs" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>
          <Activity size={18} /> Журнал действий
        </button>
      </div>

      {tab === "users" && (
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
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${u.role === 'superadmin' ? 'bg-purple-100 text-purple-700' : u.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-4 flex gap-2">
                    {u.id !== user?.id && (
                      <button onClick={() => setActionModal({ type: "impersonate", userId: u.id, email: u.email })} className="flex items-center gap-1 text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200 text-gray-700">
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
      )}

      {tab === "logs" && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 font-medium text-gray-600">Время</th>
                <th className="p-4 font-medium text-gray-600">Кто</th>
                <th className="p-4 font-medium text-gray-600">Действие</th>
                <th className="p-4 font-medium text-gray-600">IP / Устройство</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-4 whitespace-nowrap">{new Date(log.created_at).toLocaleString('ru-RU')}</td>
                  <td className="p-4">
                    {log.is_impersonation ? (
                      <div className="flex flex-col">
                        <span className="text-amber-600 font-semibold">Админ: {log.actor_email}</span>
                        <span className="text-gray-500">от имени: {log.effective_email}</span>
                      </div>
                    ) : (
                      <span className="font-medium text-gray-800">{log.actor_email}</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-800`}>
                      {log.action}
                    </span>
                    {log.entity_type && <span className="ml-2 text-gray-500">({log.entity_type})</span>}
                  </td>
                  <td className="p-4 text-xs text-gray-500 truncate max-w-xs" title={log.user_agent}>
                    {log.ip_address || "IP не определен"}<br/>
                    <span className="text-gray-400">{log.user_agent?.substring(0, 40)}...</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
