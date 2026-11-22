"use client";
import { useState } from "react";
import Link from "next/link";

export function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status}: ${txt}`);
      }
      const data = await res.json();
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("access_token", data.access_token); // Сохраняем токен
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white p-6 rounded-xl shadow space-y-4">
        <h1 className="text-xl font-semibold text-center">{isRegister ? "Регистрация" : "Вход"}</h1>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border p-2 rounded-lg" required />
        <input type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border p-2 rounded-lg" required />
        {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
        <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50">
          {loading ? "..." : isRegister ? "Создать аккаунт" : "Войти"}
        </button>
        <button type="button" onClick={() => setIsRegister(!isRegister)} className="text-sm text-gray-500 w-full">
          {isRegister ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться"}
        </button>
      </form>
      <Link href="/diagnostics" className="mt-6 text-xs text-gray-400 hover:text-gray-600">Диагностика системы →</Link>
    </div>
  );
}
