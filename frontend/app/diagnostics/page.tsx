"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Status = "ok" | "warn" | "error" | "loading";

type CheckResult = {
  id: string;
  name: string;
  status: Status;
  summary?: string;
  latency_ms?: number;
  details?: any;
  hint?: string;
};

function explainError(msg: string): string {
  const m = msg.toLowerCase();
  if (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("aborted")
  ) {
    return "Не удалось подключиться к API. Причины: 1) Render спит (нужен cron-job.org), 2) неверный NEXT_PUBLIC_API_URL, 3) CORS блокирует домен Vercel.";
  }
  if (m.includes("cors")) {
    return "CORS блокирует запрос. На Render в FRONTEND_URL укажите точный домен Vercel (без слэша на конце).";
  }
  if (m.includes("401")) return "Неверные учётные данные или истёк токен.";
  if (m.includes("500")) return "Ошибка на сервере. Откройте Logs на Render.";
  if (m.includes("502") || m.includes("503"))
    return "Render недоступен. Возможно, сервис выключен или перезапускается.";
  return msg;
}

async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs = 60000
) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export default function DiagnosticsPage() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);

  function push(c: CheckResult) {
    setChecks((prev) => [...prev, c]);
  }

  function update(id: string, patch: Partial<CheckResult>) {
    setChecks((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  async function runAll() {
    setRunning(true);
    setChecks([]);

    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

    // 1. Frontend
    push({
      id: "frontend",
      name: "Frontend (Vercel)",
      status: "ok",
      summary: window.location.origin,
      details: {
        url: window.location.origin,
        api_url: apiUrl || "(не задан!)",
        pwa:
          typeof window !== "undefined" &&
          (window.matchMedia("(display-mode: standalone)").matches ||
            (navigator as any).standalone === true),
        user_agent: navigator.userAgent,
      },
      hint: !apiUrl ? "NEXT_PUBLIC_API_URL не задан на Vercel." : undefined,
    });

    if (!apiUrl) {
      push({
        id: "api_missing",
        name: "Backend API",
        status: "error",
        summary: "NEXT_PUBLIC_API_URL не задан — проверка невозможна",
      });
      setRunning(false);
      return;
    }

    // 2. /health
    push({ id: "health", name: "Backend /health", status: "loading" });
    try {
      const start = performance.now();
      const res = await fetchWithTimeout(`${apiUrl}/health`, {
        cache: "no-store",
      });
      const latency = Math.round(performance.now() - start);
      if (res.ok) {
        update("health", {
          status: "ok",
          latency_ms: latency,
          summary: `200 OK за ${latency}ms`,
          details: { body: await res.text() },
          hint:
            latency > 5000
              ? "Медленно — вероятно, Render только что проснулся. Нужен cron-job.org."
              : undefined,
        });
      } else {
        update("health", {
          status: "error",
          latency_ms: latency,
          summary: `HTTP ${res.status}`,
          hint: explainError(String(res.status)),
        });
      }
    } catch (e: any) {
      update("health", {
        status: "error",
        summary: "Недоступен",
        hint: explainError(e.message),
      });
    }

    // 3. /diagnostics
    push({ id: "diag", name: "Backend /diagnostics", status: "loading" });
    let diagData: any = null;
    try {
      const start = performance.now();
      const res = await fetchWithTimeout(`${apiUrl}/diagnostics/`, {
        cache: "no-store",
      });
      const latency = Math.round(performance.now() - start);
      if (res.ok) {
        diagData = await res.json();
        update("diag", {
          status: "ok",
          latency_ms: latency,
          summary: `Ответ получен за ${latency}ms`,
          details: diagData,
        });
      } else {
        update("diag", {
          status: "error",
          summary: `HTTP ${res.status}`,
          hint: explainError(String(res.status)),
        });
      }
    } catch (e: any) {
      update("diag", {
        status: "error",
        summary: "Ошибка",
        hint: explainError(e.message),
      });
    }

    // 4. Разбор подсистем из diagData
    if (diagData) {
      const db = diagData.database;
      if (db) {
        push({
          id: "db",
          name: "База данных (Supabase)",
          status: db.status === "ok" ? "ok" : "error",
          latency_ms: db.latency_ms,
          summary:
            db.status === "ok"
              ? `Ping ${db.latency_ms}ms · пользователей: ${
                  db.tables?.users ?? "?"
                }`
              : "Ошибка подключения",
          details: db,
          hint:
            db.status !== "ok"
              ? "Проверьте DATABASE_URL. Должен быть порт 6543 (Transaction pooler), префикс postgresql+asyncpg://."
              : !diagData.environment?.database_url_uses_pooler
              ? "Внимание: DATABASE_URL не содержит pooler (порт 6543). На free tier быстро исчерпается лимит соединений."
              : undefined,
        });
      }

      const tg = diagData.telegram;
      if (tg) {
        push({
          id: "telegram",
          name: "Telegram Bot",
          status:
            tg.status === "ok"
              ? "ok"
              : tg.status === "not_configured"
              ? "warn"
              : "error",
          summary:
            tg.status === "ok"
              ? `@${tg.bot_username}`
              : tg.status === "not_configured"
              ? "Не настроен"
              : "Ошибка",
          details: tg,
          hint:
            tg.status === "not_configured"
              ? "Добавьте TELEGRAM_BOT_TOKEN в Environment Variables на Render."
              : tg.status === "error"
              ? "Проверьте, что токен действителен, и что бот не запущен где-то ещё."
              : undefined,
        });
      }

      const sched = diagData.scheduler;
      if (sched) {
        push({
          id: "scheduler",
          name: "Планировщик",
          status: sched.status === "ok" ? "ok" : "error",
          summary:
            sched.status === "ok"
              ? `Задач: ${sched.jobs?.length ?? 0}`
              : "Не работает",
          details: sched,
        });
      }

      if (typeof diagData.uptime_seconds === "number") {
        push({
          id: "uptime",
          name: "Время работы backend",
          status: "ok",
          summary: `${diagData.uptime_seconds} секунд`,
          hint:
            diagData.uptime_seconds < 60
              ? "Только что запущен — это был холодный старт Render. Нужен cron-job.org каждые 10 минут."
              : undefined,
        });
      }
    }

    // 5. Аутентификация
    const refresh =
      typeof window !== "undefined"
        ? localStorage.getItem("refresh_token")
        : null;

    if (!refresh) {
      push({
        id: "auth",
        name: "Аутентификация",
        status: "warn",
        summary: "Не залогинен (нет refresh-токена)",
        hint: "Это нормально, если вы просто зашли на /diagnostics без входа.",
      });
    } else {
      push({ id: "auth", name: "Аутентификация", status: "loading" });
      try {
        const start = performance.now();
        const res = await fetchWithTimeout(`${apiUrl}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        const latency = Math.round(performance.now() - start);
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem("refresh_token", data.refresh_token);
          update("auth", {
            status: "ok",
            latency_ms: latency,
            summary: `Refresh обновлён за ${latency}ms`,
          });
        } else {
          update("auth", {
            status: "error",
            summary: `HTTP ${res.status}`,
            hint: explainError(String(res.status)),
          });
        }
      } catch (e: any) {
        update("auth", {
          status: "error",
          summary: "Ошибка",
          hint: explainError(e.message),
        });
      }
    }

    setRunning(false);
  }

  useEffect(() => {
    runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-semibold">Диагностика системы</h1>
            <p className="text-sm text-gray-500">
              Проверка всех подсистем ЕГЭ-Планера. Работает без входа в аккаунт.
            </p>
          </div>
          <button
            onClick={runAll}
            disabled={running}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            {running ? "Проверка..." : "Проверить снова"}
          </button>
        </div>

        <div className="space-y-3">
          {checks.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 flex-1">
                  <span
                    className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${
                      c.status === "ok"
                        ? "bg-green-500"
                        : c.status === "warn"
                        ? "bg-yellow-500"
                        : c.status === "error"
                        ? "bg-red-500"
                        : "bg-gray-300 animate-pulse"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900">{c.name}</div>
                    {c.summary && (
                      <div className="text-sm text-gray-600 mt-0.5">
                        {c.summary}
                      </div>
                    )}
                    {c.hint && (
                      <div className="text-xs text-amber-700 bg-amber-50 rounded p-2 mt-2">
                        💡 {c.hint}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-500 whitespace-nowrap">
                  {c.latency_ms !== undefined && `${c.latency_ms}ms`}
                </div>
              </div>
              {c.details && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-gray-500 text-xs">
                    Показать детали
                  </summary>
                  <pre className="mt-2 bg-gray-50 p-2 rounded text-xs overflow-auto max-h-64">
                    {JSON.stringify(c.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 text-xs text-gray-500 bg-white p-4 rounded-xl">
          <p className="font-medium text-gray-700 mb-2">
            Что делать, если что-то не работает:
          </p>
          <ul className="list-disc ml-5 space-y-1">
            <li>
              <strong>Backend недоступен:</strong> зайдите на Render → Logs.
              Проверьте cron-job.org (пинг /health каждые 10 мин).
            </li>
            <li>
              <strong>CORS:</strong> на Render в <code>FRONTEND_URL</code>{" "}
              должен быть точный домен Vercel без слэша на конце.
            </li>
            <li>
              <strong>База данных:</strong> в <code>DATABASE_URL</code> должен
              быть порт <strong>6543</strong> (Transaction pooler) и префикс{" "}
              <code>postgresql+asyncpg://</code>.
            </li>
            <li>
              <strong>Telegram:</strong> добавьте{" "}
              <code>TELEGRAM_BOT_TOKEN</code> в Environment Variables на Render
              и перезапустите сервис.
            </li>
            <li>
              <strong>Холодный старт:</strong> если uptime &lt; 60 сек — сервис
              только что проснулся. cron-job.org не работает.
            </li>
          </ul>
          <div className="mt-3">
            <Link href="/" className="text-blue-600 hover:underline">
              ← Вернуться на главную
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
