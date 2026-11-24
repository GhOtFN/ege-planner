"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Send, CheckCircle2, KeyRound, Share2, Bell, ArrowLeft } from "lucide-react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "вашего_бота";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

// Функция для конвертации ключа VAPID из Base64 в Uint8Array (требуется для браузера)
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
  
  // Состояния настроек
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

  // UI состояния
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; msg: string; action: () => void } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => { 
    setToast({ msg, type }); 
    setTimeout(() => setToast(null), 3000); 
  };
  
  const getToken = () => sessionStorage.getItem("impersonation_token") || localStorage.getItem("access_token");

  // Загрузка данных
  const fetchData = async () => {
    const token = getToken(); 
    if (!token) return;
    
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
    
    // Проверяем статус Push-подписки в браузере
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setPushEnabled(!!sub);
      } catch (e) {
        console.error("SW error", e);
      }
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Сохранение основных настроек (время и часовой пояс)
  const handleSave = async () => {
    await fetch(`${API_URL}/auth/me`, { 
      method: "PATCH", 
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, 
      body: JSON.stringify({ notification_offset: Number(offset), timezone }) 
    });
    showToast("Настройки сохранены");
  };

  // Подписка на Push
  const subscribePush = async () => {
    if (!VAPID_PUBLIC_KEY) return showToast("VAPID-ключ не настроен на сервере", "error");
    if (!('serviceWorker' in navigator)) return showToast("Браузер не поддерживает Push", "error");
    
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return showToast("Вы запретили уведомления в настройках iOS", "error");
      
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ 
        userVisibleOnly: true, 
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) 
      });
      
      const res = await fetch(`${API_URL}/auth/push-subscribe`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, 
        body: JSON.stringify(sub) 
      });
      
      if (res.ok) {
        setPushEnabled(true); 
        showToast("Push успешно подключен!");
      } else {
        showToast("Ошибка сервера при подписке", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Ошибка подписки", "error");
    }
  };

  // Сброс (отписка) от Push
  const unsubscribePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      setPushEnabled(false);
      showToast("Подписка сброшена. Нажмите 'Подключить' заново.");
    } catch (e) {
      showToast("Ошибка при сбросе", "error");
    }
  };

  // Тест Push
  const testPush = async () => {
    showToast("Отправка...");
    const res = await fetch(`${API_URL}/auth/test-push`, { 
      method: "POST", 
      headers: { Authorization: `Bearer ${getToken()}` } 
    });
    if (res.ok) showToast("Тест отправлен!");
    else { 
      const err = await res.json(); 
      showToast(err.detail || "Ошибка отправки", "error"); 
    }
  };

  // Генерация ссылки на статистику
  const handleShare = async () => {
    const res = await fetch(`${API_URL}/auth/share-token`, { 
      method: "POST", 
      headers: { Authorization: `Bearer ${getToken()}` } 
    });
    if (res.ok) {
      const data = await res.json();
      const url = `${window.location.origin}/share/${data.token}`;
      setShareLink(url);
      navigator.clipboard.writeText(url);
      showToast("Ссылка скопирована в буфер обмена!");
    }
  };

  // Смена пароля
  const handleChangePassword = async () => {
    if (newPassword.length < 6) return showToast("Пароль должен быть больше 5 символов", "error");
    const res = await fetch(`${API_URL}/auth/change-password`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, 
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }) 
    });
    if (res.ok) { 
      showToast("Пароль успешно изменен"); 
      setOldPassword(""); setNewPassword(""); 
    } else {
      const err = await res.json();
      showToast(err.detail || "Ошибка", "error");
    }
  };

  // Отвязка Telegram
  const handleUnlinkTelegram = () => {
    setConfirmModal({ 
      title: "Отвязать Telegram?", 
      msg: "Вы больше не будете получать уведомления в бота.", 
      action: async () => {
        await fetch(`${API_URL}/auth/unlink-telegram`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } });
        setConfirmModal(null); 
        fetchData();
        showToast("Telegram отвязан");
      }
    });
  };

  // Добавление предмета
  const handleAddSubject = async () => {
    if (!newSubjectName.trim()) return;
    const res = await fetch(`${API_URL}/subjects/`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, 
      body: JSON.stringify({ name: newSubjectName, color: "#6B7280" }) 
    });
    if (res.ok) { 
      setNewSubjectName(""); 
      fetchData(); 
      showToast("Предмет добавлен");
    } else {
      showToast("Такой предмет уже есть", "error");
    }
  };

  // Удаление предмета
  const handleDeleteSubject = (id: string) => {
    setConfirmModal({ 
      title: "Удалить предмет?", 
      msg: "Занятия по нему останутся в календаре, но потеряют свой цвет.", 
      action: async () => {
        await fetch(`${API_URL}/subjects/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
        setConfirmModal(null); 
        fetchData();
        showToast("Предмет удален");
      }
    });
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 mt-4 md:mt-10 space-y-4 pb-20">
      
      {/* Кнопка Назад */}
      <Link href="/" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium mb-2 transition-colors">
        <ArrowLeft size={20} /> Вернуться на главный экран
      </Link>

      {/* Уведомления (Тосты) */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}
      
      {/* Модалка подтверждения */}
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

      <h1 className="text-2xl font-bold text-gray-800 mb-4">Настройки</h1>

      {/* Блок: Время и Часовой пояс */}
      <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-4">
        <div>
          <label className="text-sm font-semibold text-gray-700">Часовой пояс</label>
          <p className="text-xs text-gray-500 mb-2">Необходим для правильного отображения времени из Telegram-бота.</p>
          <select value={timezone} onChange={e => setTimezone(e.target.value)} className="w-full border p-3 rounded-xl bg-gray-50 text-sm font-medium">
            <option value="Europe/Kaliningrad">Калининград (UTC+2)</option>
            <option value="Europe/Moscow">Москва (UTC+3)</option>
            <option value="Europe/Samara">Самара (UTC+4)</option>
            <option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option>
            <option value="Asia/Omsk">Омск (UTC+6)</option>
            <option value="Asia/Novosibirsk">Новосибирск (UTC+7)</option>
            <option value="Asia/Krasnoyarsk">Красноярск (UTC+7)</option>
            <option value="Asia/Irkutsk">Иркутск (UTC+8)</option>
            <option value="Asia/Yakutsk">Якутск (UTC+9)</option>
            <option value="Asia/Vladivostok">Владивосток (UTC+10)</option>
          </select>
        </div>
        
        <div>
          <label className="text-sm font-semibold text-gray-700">За сколько минут напоминать?</label>
          <input type="number" value={offset} onChange={e => setOffset(Number(e.target.value))} className="w-full border p-3 rounded-xl bg-gray-50 mt-1"/>
        </div>
        
        <button onClick={handleSave} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
          Сохранить настройки
        </button>
      </div>

      {/* Блок: Push-уведомления */}
      <div className="bg-white rounded-2xl shadow-sm border p-5">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Bell size={20} className="text-blue-600"/> Push-уведомления</h3>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          На iPhone: откройте сайт в <b>Safari</b> → нажмите «Поделиться» → <b>«На экран "Домой"»</b>. Откройте приложение с рабочего стола и нажмите кнопку ниже.
        </p>
        
        {pushEnabled ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <span className="flex-1 bg-green-50 text-green-700 p-3 rounded-xl text-sm flex items-center gap-2 font-medium">
                <CheckCircle2 size={18}/> Уведомления подключены
              </span>
              <button onClick={testPush} className="px-5 py-3 bg-blue-100 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-200 transition-colors">
                Отправить тест
              </button>
            </div>
            <button onClick={unsubscribePush} className="text-xs text-red-500 hover:underline">
              Сбросить подписку (если уведомления перестали приходить)
            </button>
          </div>
        ) : (
          <button onClick={subscribePush} className="w-full sm:w-auto px-5 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
            Подключить Push
          </button>
        )}
      </div>

      {/* Блок: Telegram */}
      <div className="bg-white rounded-2xl shadow-sm border p-5">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Send size={20} className="text-blue-500"/> Telegram-бот</h3>
        {telegramId ? (
          <div className="flex justify-between items-center bg-green-50 p-3 rounded-xl border border-green-100">
            <span className="text-sm text-green-800 flex items-center gap-2 font-medium"><CheckCircle2 size={18}/> Привязан</span>
            <button onClick={handleUnlinkTelegram} className="text-xs text-red-600 font-medium hover:underline">Отвязать</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 leading-relaxed">
              1. Перейдите в бота <a href={`https://t.me/${BOT_NAME}`} target="_blank" className="text-blue-600 font-semibold">@{BOT_NAME}</a> и нажмите <b>/start</b>.<br/>
              2. Скопируйте код, который пришлет бот, и вставьте его сюда:
            </p>
            <div className="flex gap-2">
              <input value={linkCode} onChange={e => setLinkCode(e.target.value)} placeholder="Например: 123456" className="flex-1 border p-3 rounded-xl text-sm bg-gray-50"/>
              <button onClick={async () => {
                const res = await fetch(`${API_URL}/auth/link-telegram`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ code: linkCode }) });
                if (res.ok) { setLinkCode(""); fetchData(); showToast("Telegram привязан!"); } 
                else showToast("Неверный или устаревший код", "error");
              }} className="px-5 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">Привязать</button>
            </div>
          </div>
        )}
      </div>

      {/* Блок: Поделиться статистикой */}
      <div className="bg-white rounded-2xl shadow-sm border p-5">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Share2 size={20} className="text-purple-500"/> Поделиться успехами</h3>
        <p className="text-xs text-gray-500 mb-3">Создайте ссылку на публичную статистику (никто не увидит ваши задачи, только часы по предметам).</p>
        {shareLink ? (
          <div className="flex gap-2">
            <input readOnly value={shareLink} className="flex-1 bg-gray-50 border p-3 rounded-xl text-xs text-gray-600"/>
            <button onClick={() => { navigator.clipboard.writeText(shareLink); showToast("Скопировано"); }} className="px-4 py-2 bg-purple-100 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-200">Копировать</button>
          </div>
        ) : (
          <button onClick={handleShare} className="px-5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors">Создать ссылку</button>
        )}
      </div>

      {/* Блок: Предметы */}
      <div className="bg-white rounded-2xl shadow-sm border p-5">
        <h3 className="font-bold text-lg mb-3">Ваши предметы</h3>
        <div className="space-y-2 mb-4">
          {subjects.map(s => (
            <div key={s.id} className="flex justify-between items-center p-3 border rounded-xl bg-gray-50 text-sm font-medium">
              <span>{s.name}</span>
              <button onClick={() => handleDeleteSubject(s.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16}/></button>
            </div>
          ))}
          {subjects.length === 0 && <p className="text-gray-500 text-sm">У вас пока нет предметов.</p>}
        </div>
        <div className="flex gap-2">
          <input value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} placeholder="Название предмета" className="flex-1 border p-3 rounded-xl text-sm bg-gray-50"/>
          <button onClick={handleAddSubject} className="px-5 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">Добавить</button>
        </div>
      </div>

      {/* Блок: Смена пароля и выход */}
      <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2"><KeyRound size={20} className="text-gray-600"/> Безопасность</h3>
        <div className="space-y-2">
          <input type="password" placeholder="Текущий пароль" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="w-full border p-3 rounded-xl text-sm bg-gray-50"/>
          <input type="password" placeholder="Новый пароль" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full border p-3 rounded-xl text-sm bg-gray-50"/>
        </div>
        <button onClick={handleChangePassword} className="px-5 py-2.5 bg-gray-800 text-white rounded-xl text-sm font-medium hover:bg-gray-900 transition-colors">
          Изменить пароль
        </button>
        
        <div className="pt-5 border-t flex justify-center mt-2">
          <button onClick={() => { localStorage.clear(); sessionStorage.clear(); router.push("/"); window.location.reload(); }} className="text-red-600 text-sm font-medium hover:underline">
            Выйти из аккаунта
          </button>
        </div>
      </div>
      
    </div>
  );
}
