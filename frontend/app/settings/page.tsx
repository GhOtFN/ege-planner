"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export default function SettingsPage() {
  const router = useRouter();
  const [offset, setOffset] = useState(30);
  const [telegramId, setTelegramId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const token = localStorage.getItem("access_token");
    await fetch(`${API_URL}/auth/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notification_offset: Number(offset), telegram_id: telegramId ? Number(telegramId) : null }),
    });
    alert("Настройки сохранены");
    setSaving(false);
  };

  const handleLogout = async () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    router.push("/");
    window.location.reload();
  };

  return (
    <div className="max-w-2xl mx-auto p-6 mt-10 bg-white rounded-xl shadow">
      <h1 className="text-2xl font-bold mb-6">Настройки</h1>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Ваш Telegram ID (для уведомлений)</label>
          <input 
            type="text" 
            value={telegramId} 
            onChange={e => setTelegramId(e.target.value)}
            placeholder="Например: 123456789"
            className="mt-1 w-full border p-2 rounded-lg" 
          />
          <p className="text-xs text-gray-500 mt-1">Узнать ID можно у бота @userinfobot</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">За сколько минут присылать уведомление?</label>
          <input 
            type="number" 
            value={offset} 
            onChange={e => setOffset(Number(e.target.value))}
            className="mt-1 w-full border p-2 rounded-lg" 
          />
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <button onClick={handleLogout} className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
            Выйти из аккаунта
          </button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
      
      <div className="mt-8 text-center">
        <a href="/" className="text-blue-600 hover:underline">← Вернуться в календарь</a>
      </div>
    </div>
  );
}
