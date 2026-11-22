"use client";
import { useState, useEffect } from "react";
import { format, startOfWeek, addDays, isSameDay, startOfMonth, endOfMonth, endOfWeek, eachDayOfInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { Plus } from "lucide-react";

type Task = {
  id: string;
  title: string;
  start_at: string;
  status: string;
};

export function Calendar() {
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Состояние для новой задачи
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));

  const fetchTasks = async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    try {
      const res = await fetch("/api/tasks/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (e) {
      console.error("Ошибка загрузки задач", e);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    if (!token) return;

    try {
      const res = await fetch("/api/tasks/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newTitle,
          start_at: new Date(newDate).toISOString(),
          duration_min: 60,
          priority: 2,
        }),
      });
      if (res.ok) {
        setIsModalOpen(false);
        setNewTitle("");
        fetchTasks(); // Обновляем список
      } else {
        alert("Ошибка при создании задачи");
      }
    } catch (e) {
      alert("Ошибка сети");
    }
  };

  // --- Отрисовка сеток ---
  const renderMonth = () => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });

    return (
      <div className="grid grid-cols-7 gap-1 mt-4">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(d => (
          <div key={d} className="text-center font-medium text-gray-500 text-sm py-2">{d}</div>
        ))}
        {days.map((day, i) => {
          const dayTasks = tasks.filter(t => isSameDay(new Date(t.start_at), day));
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          return (
            <div key={i} className={`min-h-[100px] border rounded-lg p-1 ${isCurrentMonth ? "bg-white" : "bg-gray-50 opacity-50"}`}>
              <div className="text-right text-sm text-gray-500 mb-1">{format(day, "d")}</div>
              {dayTasks.map(t => (
                <div key={t.id} className="text-xs bg-blue-100 text-blue-800 p-1 rounded mb-1 truncate">{t.title}</div>
              ))}
            </div>
          );
        })}
      </div>
    );
  };

  const renderWeek = () => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }).map((_, i) => addDays(start, i));

    return (
      <div className="grid grid-cols-7 gap-2 mt-4">
        {days.map((day, i) => {
          const dayTasks = tasks.filter(t => isSameDay(new Date(t.start_at), day));
          return (
            <div key={i} className="bg-white border rounded-lg p-2 min-h-[400px]">
              <div className={`text-center mb-2 pb-2 border-b ${isSameDay(day, new Date()) ? "text-blue-600 font-bold" : ""}`}>
                <div className="text-xs text-gray-500 uppercase">{format(day, "eee", { locale: ru })}</div>
                <div className="text-xl">{format(day, "d")}</div>
              </div>
              <div className="space-y-2">
                {dayTasks.map(t => (
                  <div key={t.id} className="text-sm bg-blue-50 border-l-4 border-blue-500 p-2 rounded shadow-sm">
                    <div className="font-medium">{format(new Date(t.start_at), "HH:mm")}</div>
                    <div className="truncate">{t.title}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDay = () => {
    const dayTasks = tasks.filter(t => isSameDay(new Date(t.start_at), currentDate)).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    return (
      <div className="mt-4 bg-white border rounded-xl p-6 min-h-[400px]">
        <h2 className="text-2xl font-bold mb-6">{format(currentDate, "d MMMM yyyy", { locale: ru })}</h2>
        {dayTasks.length === 0 ? (
          <p className="text-gray-500 text-center mt-10">На этот день задач нет</p>
        ) : (
          <div className="space-y-3">
            {dayTasks.map(t => (
              <div key={t.id} className="flex gap-4 p-4 border rounded-lg bg-gray-50">
                <div className="font-semibold text-blue-600">{format(new Date(t.start_at), "HH:mm")}</div>
                <div>{t.title}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          {(["day", "week", "month"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === v ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100 border"}`}
            >
              {v === "day" ? "День" : v === "week" ? "Неделя" : "Месяц"}
            </button>
          ))}
        </div>
        
        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800">
          <Plus size={16} /> Новая задача
        </button>
      </div>

      {/* Навигация по датам */}
      <div className="flex items-center gap-4 mb-4">
        <button onClick={() => setCurrentDate(addDays(currentDate, view === "day" ? -1 : view === "week" ? -7 : -30))} className="px-3 py-1 border rounded hover:bg-gray-50">←</button>
        <span className="font-semibold text-lg">{format(currentDate, "LLLL yyyy", { locale: ru })}</span>
        <button onClick={() => setCurrentDate(addDays(currentDate, view === "day" ? 1 : view === "week" ? 7 : 30))} className="px-3 py-1 border rounded hover:bg-gray-50">→</button>
        <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm text-blue-600 hover:underline">Сегодня</button>
      </div>

      {view === "month" && renderMonth()}
      {view === "week" && renderWeek()}
      {view === "day" && renderDay()}

      {/* Модалка добавления задачи */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddTask} className="bg-white p-6 rounded-xl w-full max-w-sm space-y-4 shadow-xl">
            <h2 className="text-xl font-bold">Новая задача</h2>
            <div>
              <label className="text-sm text-gray-600">Название</label>
              <input type="text" required value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full border p-2 rounded-lg mt-1" placeholder="Например: Решить вариант ЕГЭ" />
            </div>
            <div>
              <label className="text-sm text-gray-600">Дата и время</label>
              <input type="datetime-local" required value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full border p-2 rounded-lg mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Отмена</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Создать</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
