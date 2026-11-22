"use client";
import { useState } from "react";

export function Calendar() {
  const [view, setView] = useState<"day" | "week" | "month">("week");
  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(["day", "week", "month"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1 rounded-lg text-sm ${view === v ? "bg-blue-600 text-white" : "bg-gray-100"}`}
          >
            {v === "day" ? "День" : v === "week" ? "Неделя" : "Месяц"}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl p-4 shadow text-gray-500 text-center">
        Здесь будет календарь ({view}). Подключите date-fns и отрисуйте сетку.
      </div>
    </div>
  );
}
