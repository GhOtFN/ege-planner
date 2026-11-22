"use client";
import { useState } from "react";

export function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      alert("Ошибка авторизации");
      return;
    }
    const data = await res.json();
    localStorage.setItem("refresh_token", data.refresh_token);
    onSuccess();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white p-6 rounded-xl shadow space-y-4">
        <h1 className="text-xl font-semibold text-center">{isRegister ? "Регистрация" : "Вход"}</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border p-2 rounded-lg"
          required
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border p-2 rounded-lg"
          required
        />
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg">
          {isRegister ? "Создать аккаунт" : "Войти"}
        </button>
        <button type="button" onClick={() => setIsRegister(!isRegister)} className="text-sm text-gray-500 w-full">
          {isRegister ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться"}
        </button>
      </form>
    </div>
  );
}
