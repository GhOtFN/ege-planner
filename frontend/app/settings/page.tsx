"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Send, Link as LinkIcon, CheckCircle2 } from "lucide-react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
// Имя бота для ссылки (замените на свой, если он отличается, например, "ege_planner_bot")
const BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "вашего_бота"; 

export default function SettingsPage() {
  const router = useRouter();
  const [offset, setOffset] = useState(30);
  const [telegramId, setTelegramId] = useState<number | null>(null);
  const [linkCode, setLinkCode] = useState("");
  const [subjects, setSubjects] = useState<any[]>([]);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [linking, setLinking] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; msg: string; action: () => void } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
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
      setTelegramId(me.telegram_id || null);
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
      body: JSON.stringify({ notification_offset: Number(offset) }),
    });
    showToast("Настройки сохранены");
    setSaving(false);
  };

  const handleLinkTelegram = async () => {
    if (!linkCode) return;
    setLinking(true);
    const token = localStorage.getItem("access_token");
    const res = await fetch(`${API_URL}/auth/link-telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: linkCode })
    });
    
    if (res.ok) {
      showToast("Telegram успешно привязан!");
      setLinkCode("");
      fetchSettings();
    } else {
      const err = await res.json();
      showToast(err.detail || "Ошибка привязки", "error");
    }
    setLinking(false);
  };

  const handleTestTelegram = async () => {
    setTesting(true);
    const token = localStorage.getItem("access_token");
    const res = await fetch(`${API_URL}/auth/test-telegram`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) showToast("Тестовое уведомление отправлено!");
    else {
      const err = await res.json();
      showToast(err.detail || "Ошибка отправки", "error");
    }
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
          
          {/* Блок Telegram */}
          <div className="p-4 border rounded-xl bg-gray-50">
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <Send size={18} /> Уведомления в Telegram
            </h3>
            
            {telegramId ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 text-green-800 p-3 rounded-lg mt-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-green-600"/>
                  <span>Telegram успешно привязан (ID: {telegramId})</span>
                </div>
                <button onClick={handleTestTelegram} disabled={testing} className="px-3 py-1 bg-white border border-green-300 rounded text-sm hover:bg-green-100 transition-colors">
                  {testing ? "Отправка..." : "Тест"}
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-gray-600">
                  1. Перейдите в бота <a href={`https://t.me/${BOT_NAME}`} target="_blank" className="text-blue-600 font-medium hover:underline">{BOT_NAME}</a> и нажмите <b>/start</b>.<br/>
                  2. Скопируйте код, который пришлет бот.<br/>
                  3. Вставьте его сюда:
                </p>
                <div className="flex gap-2">
                  <input type="text" value={linkCode} onChange={e => setLinkCode(e.target.value)} placeholder="Например: 123456" className="w-full border p-2 rounded-lg" />
                  <button onClick={handleLinkTelegram} disabled={linking || !linkCode} className="flex items-center gap-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    <LinkIcon size={16} /> {linking ? "..." : "Привязать"}
                  </button>
                </div>
              </div>
            )}
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
              {saving ? "Сохранение..." : "Сохранить настройки"}
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
