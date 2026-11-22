"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Send } from "lucide-react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export default function SettingsPage() {
  const router = useRouter();
  const [offset, setOffset] = useState(30);
  const [telegramId, setTelegramId] = useState("");
  const [subjects, setSubjects] = useState<any[]>([]);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; msg: string; action: () => void } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSettings = async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const [meRes, subRes] = await Promise.all([
      fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/subjects/`, { headers: { Authorization: `Bearer ${token}` } })
    ]);

    if (meRes.ok) {
      const me = await meRes.json();
      setOffset(me.notification_offset || 30);
      setTelegramId(me.telegram_id ? String(me.telegram_id) : "");
    }
    if (subRes.ok) setSubjects(await subRes.json());
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSave = async () => {
    setSaving(true);
    const token = localStorage.getItem("access_token");
    await fetch(`${API_URL}/auth/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notification_offset: Number(offset), telegram_id: telegramId ? Number(telegramId) : null }),
    });
    showToast("Настройки сохранены");
    setSaving(false);
  };

  const handleTestTelegram = async () => {
    setTesting(true);
    const token = localStorage.getItem("access_token");
    const res = await fetch(`${API_URL}/auth/test-telegram`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) showToast("Тестовое уведомление отправлено в Telegram!");
    else showToast("Ошибка отправки. Проверьте ID и бота.", "error");
    setTesting(false);
  };

  const handleAddSubject = async () => {
    if (!newSubjectName) return;
    const token = localStorage.getItem("access_token");
    const res = await fetch(`${API_URL}/subjects/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newSubjectName, color: "#6B7280" }),
    });
    
    if (res.ok) {
      setNewSubjectName("");
      fetchSettings();
      showToast("Предмет добавлен");
    } else {
      showToast("Такой предмет уже есть", "error");
    }
  };

  const handleDeleteSubject = (id: string) => {
    setConfirmModal({
      title: "Удалить предмет?",
      msg: "Задачи по нему останутся, но потеряют свой цвет.",
      action: async () => {
        const token = localStorage.getItem("access_token");
        await fetch(`${API_URL}/subjects/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        setConfirmModal(null);
        fetchSettings();
        showToast("Предмет удален");
      }
    });
  };

  const handleLogout = () => {
    setConfirmModal({
      title: "Выйти из аккаунта?",
      msg: "Вам придется ввести пароль снова.",
      action: () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/");
        window.location.reload();
      }
    });
  };

  return (
    <div className="max-w-3xl mx-auto p-6 mt-10 space-y-6 relative">
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-6 py-3 rounded-lg shadow-lg text-white font-medium transition-all ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-sm text-center shadow-xl">
            <h3 className="text-lg font-bold mb-2">{confirmModal.title}</h3>
            <p className="text-gray-500 mb-6 text-sm">{confirmModal.msg}</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setConfirmModal(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Отмена</button>
              <button onClick={confirmModal.action} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Да</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold mb-6">Настройки</h1>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Ваш Telegram ID</label>
            <div className="flex gap-2 mt-1">
              <input type="text" value={telegramId} onChange={e => setTelegramId(e.target.value)} placeholder="Например: 123456789" className="w-full border p-2 rounded-lg" />
              <button onClick={handleTestTelegram} disabled={testing || !telegramId} className="flex items-center gap-2 px-4 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 transition-colors">
                <Send size={16} /> {testing ? "Отправка..." : "Тест"}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Узнать ID можно у бота @userinfobot</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">За сколько минут присылать уведомление?</label>
            <input type="number" value={offset} onChange={e => setOffset(Number(e.target.value))} className="mt-1 w-full border p-2 rounded-lg" />
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <button onClick={handleLogout} className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              Выйти из аккаунта
            </button>
            <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors">
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-xl font-bold mb-4">Ваши предметы</h2>
        <div className="space-y-2 mb-4">
          {subjects.map(s => (
            <div key={s.id} className="flex justify-between items-center p-3 border rounded-lg bg-gray-50">
              <span className="font-medium">{s.name}</span>
              <button onClick={() => handleDeleteSubject(s.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors"><Trash2 size={16} /></button>
            </div>
          ))}
          {subjects.length === 0 && <p className="text-gray-500 text-sm">У вас пока нет предметов.</p>}
        </div>
        <div className="flex gap-2">
          <input type="text" value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} placeholder="Новый предмет" className="flex-1 border p-2 rounded-lg" />
          <button onClick={handleAddSubject} className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors">Добавить</button>
        </div>
      </div>
      
      <div className="text-center">
        <a href="/" className="text-blue-600 hover:underline">← Вернуться в календарь</a>
      </div>
    </div>
  );
}
