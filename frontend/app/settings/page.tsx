"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Send, Link as LinkIcon, CheckCircle2, KeyRound, Smartphone, Bell, Share2 } from "lucide-react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "вашего_бота"; 
const VAPID_PUBLIC_KEY = "BEl62ip9X8V4X4X4X4X4X4X4X4X4X4X4X4X4X4X4X4X4X4X4X4X4X4X4X4X"; // Заглушка, лучше сгенерировать свою

export default function SettingsPage() {
  const router = useRouter();
  const [offset, setOffset] = useState(30);
  const [telegramId, setTelegramId] = useState<number | null>(null);
  const [linkCode, setLinkCode] = useState("");
  const [subjects, setSubjects] = useState<any[]>([]);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [shareLink, setShareLink] = useState("");
  
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; msg: string; action: () => void } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };
  const getToken = () => sessionStorage.getItem("impersonation_token") || localStorage.getItem("access_token");

  const fetchData = async () => {
    const token = getToken(); if (!token) return;
    const [meRes, subRes, sesRes] = await Promise.all([
      fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/subjects/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/sessions/`, { headers: { Authorization: `Bearer ${token}` } })
    ]);
    if (meRes.ok) { const me = await meRes.json(); setOffset(me.notification_offset || 30); setTelegramId(me.telegram_id || null); if(me.share_token) setShareLink(`${window.location.origin}/share/${me.share_token}`); }
    if (subRes.ok) setSubjects(await subRes.json());
    if (sesRes.ok) setSessions(await sesRes.json());
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    await fetch(`${API_URL}/auth/me`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ notification_offset: Number(offset) }) });
    showToast("Настройки сохранены");
  };

  const handleShare = async () => {
    const res = await fetch(`${API_URL}/auth/share-token`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } });
    if (res.ok) {
      const data = await res.json();
      const url = `${window.location.origin}/share/${data.token}`;
      setShareLink(url);
      navigator.clipboard.writeText(url);
      showToast("Ссылка скопирована в буфер обмена!");
    }
  };

  const handleTestPush = async () => {
    if (!('serviceWorker' in navigator)) return showToast("Ваш браузер не поддерживает Push", "error");
    try {
      const reg = await navigator.serviceWorker.ready;
      // В реальном проекте здесь нужно запросить разрешение и подписаться через PushManager
      // Для теста просто дергаем бэкенд
      await fetch(`${API_URL}/auth/test-push`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } });
      showToast("Тестовый Push отправлен (если настроен VAPID)");
    } catch (e) { showToast("Ошибка Push", "error"); }
  };

  const handleChangePassword = async () => {
    const res = await fetch(`${API_URL}/auth/change-password`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }) });
    if (res.ok) { showToast("Пароль изменен"); setOldPassword(""); setNewPassword(""); } else showToast("Ошибка", "error");
  };

  const handleUnlinkTelegram = () => {
    setConfirmModal({ title: "Отвязать Telegram?", msg: "Вы не будете получать уведомления.", action: async () => {
      await fetch(`${API_URL}/auth/unlink-telegram`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } });
      setConfirmModal(null); fetchData();
    }});
  };

  const handleRevokeDevice = (id: string) => {
    setConfirmModal({ title: "Выйти на этом устройстве?", msg: "Сессия будет завершена.", action: async () => {
      await fetch(`${API_URL}/sessions/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
      setConfirmModal(null); fetchData(); showToast("Вы вышли с устройства");
    }});
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 mt-4 md:mt-10 space-y-4 md:space-y-6 relative pb-20">
      {toast && <div className={`fixed top-4 right-4 z-[100] px-4 py-2 rounded-lg shadow-lg text-white text-sm ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{toast.msg}</div>}
      
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-full max-w-sm text-center shadow-2xl">
            <h3 className="text-lg font-bold mb-2">{confirmModal.title}</h3>
            <p className="text-gray-500 mb-6 text-sm">{confirmModal.msg}</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setConfirmModal(null)} className="px-4 py-2 border rounded-xl hover:bg-gray-50">Отмена</button>
              <button onClick={confirmModal.action} className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700">Да</button>
            </div>
          </div>
        </div>
      )}

      {/* Блок статистики */}
      <div className="bg-white rounded-2xl shadow-sm p-5 border">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Share2 size={18} /> Поделиться успехами</h3>
        <p className="text-sm text-gray-500 mb-3">Создайте публичную ссылку на вашу статистику (никто не увидит ваши задачи, только часы).</p>
        {shareLink ? (
           <div className="flex gap-2">
             <input type="text" readOnly value={shareLink} className="flex-1 bg-gray-50 border p-2 rounded-xl text-sm" />
             <button onClick={() => { navigator.clipboard.writeText(shareLink); showToast("Скопировано"); }} className="px-4 py-2 bg-blue-100 text-blue-700 rounded-xl">Копировать</button>
           </div>
        ) : <button onClick={handleShare} className="px-4 py-2 bg-blue-600 text-white rounded-xl">Создать ссылку</button>}
      </div>

      {/* Push и Telegram */}
      <div className="bg-white rounded-2xl shadow-sm p-5 border space-y-4">
        <div className="flex justify-between items-center">
           <div>
             <h3 className="font-bold flex items-center gap-2"><Bell size={18} /> Push-уведомления (PWA)</h3>
             <p className="text-xs text-gray-500">Работают на iPhone, если сайт добавлен на экран "Домой".</p>
           </div>
           <button onClick={handleTestPush} className="px-3 py-1 bg-gray-100 rounded-lg text-sm">Тест</button>
        </div>
        <div className="border-t pt-4">
          <h3 className="font-bold flex items-center gap-2"><Send size={18} /> Telegram</h3>
          {telegramId ? (
            <div className="flex justify-between items-center mt-2 bg-green-50 p-3 rounded-xl">
              <span className="text-sm text-green-800">Привязан</span>
              <button onClick={handleUnlinkTelegram} className="text-xs text-red-600 font-medium">Отвязать</button>
            </div>
          ) : (
            <div className="flex gap-2 mt-2">
              <input type="text" value={linkCode} onChange={e => setLinkCode(e.target.value)} placeholder="Код из бота" className="flex-1 border p-2 rounded-xl text-sm" />
              <button onClick={async () => { await fetch(`${API_URL}/auth/link-telegram`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ code: linkCode }) }); fetchData(); }} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">OK</button>
            </div>
          )}
        </div>
      </div>

      {/* Устройства */}
      <div className="bg-white rounded-2xl shadow-sm p-5 border">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><Smartphone size={18} /> Ваши устройства</h3>
        <div className="space-y-2">
          {sessions.map(s => (
            <div key={s.id} className="flex justify-between items-center p-3 border rounded-xl bg-gray-50 text-sm">
              <div>
                <p className="font-medium text-gray-800">{s.device_name || "Неизвестное устройство"}</p>
                <p className="text-xs text-gray-500">{s.ip_address || "IP скрыт"} • {new Date(s.last_active_at).toLocaleDateString()}</p>
              </div>
              <button onClick={() => handleRevokeDevice(s.id)} className="text-red-500 hover:bg-red-100 p-2 rounded-lg"><Trash2 size={16}/></button>
            </div>
          ))}
        </div>
      </div>

      {/* Пароль и выход */}
      <div className="bg-white rounded-2xl shadow-sm p-5 border space-y-4">
        <h3 className="font-bold flex items-center gap-2"><KeyRound size={18} /> Смена пароля</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input type="password" placeholder="Старый пароль" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="border p-2 rounded-xl text-sm" />
          <input type="password" placeholder="Новый пароль" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="border p-2 rounded-xl text-sm" />
        </div>
        <button onClick={handleChangePassword} className="px-4 py-2 bg-gray-800 text-white rounded-xl text-sm">Изменить</button>
        
        <div className="pt-4 border-t flex justify-between items-center">
          <button onClick={() => { localStorage.clear(); sessionStorage.clear(); router.push("/"); window.location.reload(); }} className="text-red-600 text-sm font-medium hover:underline">Выйти из аккаунта</button>
          <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm">Сохранить настройки</button>
        </div>
      </div>
      
      <div className="text-center">
        <a href="/" className="text-blue-600 hover:underline text-sm">← На главную</a>
      </div>
    </div>
  );
}
