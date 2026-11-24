"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Send, CheckCircle2, KeyRound, Share2, Bell, ArrowLeft } from "lucide-react";
import Link from "next/link";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "вашего_бота";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) arr[i] = rawData.charCodeAt(i);
  return arr;
}

export default function SettingsPage() {
  const router = useRouter();
  const [offset, setOffset] = useState(30);
  const [timezone, setTimezone] = useState("Europe/Moscow");
  const [telegramId, setTelegramId] = useState<number | null>(null);
  const [linkCode, setLinkCode] = useState("");
  const [subjects, setSubjects] = useState<any[]>([]);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; msg: string; action: () => void } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };
  const getToken = () => sessionStorage.getItem("impersonation_token") || localStorage.getItem("access_token");

  const fetchData = async () => {
    const token = getToken(); if (!token) return;
    const [meRes, subRes] = await Promise.all([
      fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/subjects/`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (meRes.ok) {
      const me = await meRes.json();
      setOffset(me.notification_offset || 30);
      setTimezone(me.timezone || "Europe/Moscow");
      setTelegramId(me.telegram_id || null);
      if (me.share_token) setShareLink(`${window.location.origin}/share/${me.share_token}`);
    }
    if (subRes.ok) setSubjects(await subRes.json());
    
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setPushEnabled(!!sub);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    await fetch(`${API_URL}/auth/me`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ notification_offset: Number(offset), timezone }) });
    showToast("Сохранено");
  };

  const subscribePush = async () => {
    if (!VAPID_PUBLIC_KEY) return showToast("VAPID-ключ не настроен", "error");
    if (!('serviceWorker' in navigator)) return showToast("Браузер не поддерживает SW", "error");
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return showToast("Разрешение не дано", "error");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    await fetch(`${API_URL}/auth/push-subscribe`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify(sub) });
    setPushEnabled(true); showToast("Push подключен!");
  };

  const testPush = async () => {
    const res = await fetch(`${API_URL}/auth/test-push`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } });
    if (res.ok) showToast("Уведомление отправлено!");
    else { const err = await res.json(); showToast(err.detail || "Ошибка", "error"); }
  };

  const handleShare = async () => {
    const res = await fetch(`${API_URL}/auth/share-token`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } });
    if (res.ok) {
      const data = await res.json();
      const url = `${window.location.origin}/share/${data.token}`;
      setShareLink(url);
      navigator.clipboard.writeText(url);
      showToast("Ссылка скопирована!");
    }
  };

  const handleChangePassword = async () => {
    const res = await fetch(`${API_URL}/auth/change-password`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }) });
    if (res.ok) { showToast("Пароль изменен"); setOldPassword(""); setNewPassword(""); }
    else showToast("Ошибка", "error");
  };

  const handleUnlinkTelegram = () => {
    setConfirmModal({ title: "Отвязать Telegram?", msg: "Уведомления не будут приходить.", action: async () => {
      await fetch(`${API_URL}/auth/unlink-telegram`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } });
      setConfirmModal(null); fetchData();
    }});
  };

  const handleAddSubject = async () => {
    if (!newSubjectName) return;
    const res = await fetch(`${API_URL}/subjects/`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ name: newSubjectName, color: "#6B7280" }) });
    if (res.ok) { setNewSubjectName(""); fetchData(); }
    else showToast("Такой предмет уже есть", "error");
  };

  const handleDeleteSubject = (id: string) => {
    setConfirmModal({ title: "Удалить предмет?", msg: "Задачи останутся, но потеряют цвет.", action: async () => {
      await fetch(`${API_URL}/subjects/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
      setConfirmModal(null); fetchData();
    }});
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 mt-4 md:mt-10 space-y-4 pb-20">
      {/* Кнопка Назад */}
      <Link href="/" className="inline-flex items-center gap-2 text-blue-600 hover:underline mb-2">
        <ArrowLeft size={20} /> Вернуться на главный экран
      </Link>

      {toast && <div className={`fixed top-4 right-4 z-[100] px-4 py-2 rounded-lg shadow-lg text-white text-sm ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{toast.msg}</div>}
      
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-full max-w-sm text-center shadow-2xl">
            <h3 className="text-lg font-bold mb-2">{confirmModal.title}</h3>
            <p className="text-gray-500 mb-6 text-sm">{confirmModal.msg}</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setConfirmModal(null)} className="px-4 py-2 border rounded-xl">Отмена</button>
              <button onClick={confirmModal.action} className="px-4 py-2 bg-red-600 text-white rounded-xl">Да</button>
            </div>
          </div>
        </div>
      )}

      {/* Время и Часовой пояс */}
      <div className="bg-white rounded-2xl shadow-sm p-5 border space-y-3">
        <label className="text-sm font-medium">За сколько минут напоминать?</label>
        <input type="number" value={offset} onChange={e => setOffset(Number(e.target.value))} className="w-full border p-2 rounded-xl"/>
        
        <label className="text-sm font-medium">Ваш часовой пояс</label>
        <select value={timezone} onChange={e => setTimezone(e.target.value)} className="w-full border p-2 rounded-xl bg-gray-50">
          <option value="Europe/Moscow">Москва (UTC+3)</option>
          <option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option>
          <option value="Asia/Novosibirsk">Новосибирск (UTC+7)</option>
          <option value="Asia/Krasnoyarsk">Красноярск (UTC+7)</option>
          <option value="Asia/Irkutsk">Иркутск (UTC+8)</option>
          <option value="Asia/Yakutsk">Якутск (UTC+9)</option>
          <option value="Asia/Vladivostok">Владивосток (UTC+10)</option>
        </select>
        <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm mt-2">Сохранить</button>
      </div>

      {/* Push */}
      <div className="bg-white rounded-2xl shadow-sm p-5 border">
        <h3 className="font-bold mb-2 flex items-center gap-2"><Bell size={18}/> Push-уведомления</h3>
        <p className="text-xs text-gray-500 mb-3">На iPhone добавьте сайт на экран «Домой» и откройте оттуда.</p>
                {pushEnabled ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <span className="flex-1 bg-green-50 text-green-700 p-2 rounded-xl text-sm flex items-center gap-2"><CheckCircle2 size={16}/> Подключено</span>
              <button onClick={testPush} className="px-3 py-2 bg-blue-100 text-blue-700 rounded-xl text-sm">Тест</button>
            </div>
            <button onClick={async () => {
              const reg = await navigator.serviceWorker.ready;
              const sub = await reg.pushManager.getSubscription();
              if (sub) await sub.unsubscribe();
              setPushEnabled(false);
              showToast("Push отключен. Нажмите 'Подключить' заново.");
            }} className="text-xs text-red-500 hover:underline">Сбросить подписку (если не приходят)</button>
          </div>
        ) : <button onClick={subscribePush} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">Подключить Push</button>}

      {/* Telegram */}
      <div className="bg-white rounded-2xl shadow-sm p-5 border">
        <h3 className="font-bold mb-2 flex items-center gap-2"><Send size={18}/> Telegram</h3>
        {telegramId ? (
          <div className="flex justify-between items-center bg-green-50 p-3 rounded-xl">
            <span className="text-sm text-green-800 flex items-center gap-2"><CheckCircle2 size={16}/> Привязан</span>
            <button onClick={handleUnlinkTelegram} className="text-xs text-red-600 font-medium">Отвязать</button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">1. Открой <a href={`https://t.me/${BOT_NAME}`} target="_blank" className="text-blue-600">@{BOT_NAME}</a> → <b>/start</b><br/>2. Скопируй код → введи ниже</p>
            <div className="flex gap-2">
              <input value={linkCode} onChange={e => setLinkCode(e.target.value)} placeholder="123456" className="flex-1 border p-2 rounded-xl text-sm"/>
              <button onClick={async () => {
                const res = await fetch(`${API_URL}/auth/link-telegram`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ code: linkCode }) });
                if (res.ok) { setLinkCode(""); fetchData(); showToast("Привязано"); } else showToast("Неверный код", "error");
              }} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">OK</button>
            </div>
          </div>
        )}
      </div>

      {/* Поделиться */}
      <div className="bg-white rounded-2xl shadow-sm p-5 border">
        <h3 className="font-bold mb-2 flex items-center gap-2"><Share2 size={18}/> Поделиться статистикой</h3>
        {shareLink ? (
          <div className="flex gap-2">
            <input readOnly value={shareLink} className="flex-1 bg-gray-50 border p-2 rounded-xl text-xs"/>
            <button onClick={() => { navigator.clipboard.writeText(shareLink); showToast("Скопировано"); }} className="px-3 py-2 bg-blue-100 text-blue-700 rounded-xl text-sm">Копировать</button>
          </div>
        ) : <button onClick={handleShare} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">Создать ссылку</button>}
      </div>

      {/* Предметы */}
      <div className="bg-white rounded-2xl shadow-sm p-5 border">
        <h3 className="font-bold mb-3">Ваши предметы</h3>
        <div className="space-y-2 mb-3">
          {subjects.map(s => (
            <div key={s.id} className="flex justify-between items-center p-2 border rounded-xl bg-gray-50 text-sm">
              <span>{s.name}</span>
              <button onClick={() => handleDeleteSubject(s.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14}/></button>
            </div>
          ))}
          {subjects.length === 0 && <p className="text-gray-500 text-sm">Нет предметов.</p>}
        </div>
        <div className="flex gap-2">
          <input value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} placeholder="Новый предмет" className="flex-1 border p-2 rounded-xl text-sm"/>
          <button onClick={handleAddSubject} className="px-4 py-2 bg-black text-white rounded-xl text-sm">Добавить</button>
        </div>
      </div>

      {/* Пароль */}
      <div className="bg-white rounded-2xl shadow-sm p-5 border space-y-3">
        <h3 className="font-bold flex items-center gap-2"><KeyRound size={18}/> Смена пароля</h3>
        <input type="password" placeholder="Текущий пароль" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="w-full border p-2 rounded-xl text-sm"/>
        <input type="password" placeholder="Новый пароль" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full border p-2 rounded-xl text-sm"/>
        <button onClick={handleChangePassword} className="px-4 py-2 bg-gray-800 text-white rounded-xl text-sm">Изменить пароль</button>
      </div>

      <div className="pt-4 flex justify-center pb-10">
        <button onClick={() => { localStorage.clear(); sessionStorage.clear(); router.push("/"); window.location.reload(); }} className="text-red-600 font-medium hover:underline">Выйти из аккаунта</button>
      </div>
    </div>
  );
}
