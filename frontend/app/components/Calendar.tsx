"use client";
import { useState, useEffect } from "react";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { Plus, Settings, Trash2, CheckCircle2, Circle, BarChart2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "../providers/AuthProvider";
import { AdminShield } from "./AdminShield";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
type Subject = { id: string; name: string; color: string };
type Task = { id: string; title: string; start_at: string; duration_min: number; status: string; subject_id: string | null };

export function Calendar() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filterSubject, setFilterSubject] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [newDuration, setNewDuration] = useState(60);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };
  const getToken = () => sessionStorage.getItem("impersonation_token") || localStorage.getItem("access_token");

  const fetchData = async () => {
    const token = getToken(); if (!token) return;
    const [tRes, sRes] = await Promise.all([
      fetch(`${API_URL}/tasks/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/subjects/`, { headers: { Authorization: `Bearer ${token}` } })
    ]);
    if (tRes.ok) setTasks(await tRes.json());
    if (sRes.ok) setSubjects(await sRes.json());
  };

  useEffect(() => { fetchData(); }, []);

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken();
    const method = editingTaskId ? "PUT" : "POST";
    const url = editingTaskId ? `${API_URL}/tasks/${editingTaskId}` : `${API_URL}/tasks/`;
    const payload = { title: subjects.find(s => s.id === newSubjectId)?.name || "Занятие", start_at: new Date(newDate).toISOString(), duration_min: newDuration, subject_id: newSubjectId };
    
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    if (res.ok) { setIsModalOpen(false); fetchData(); showToast("Сохранено"); }
  };

  const toggleStatus = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const newStatus = task.status === "done" ? "planned" : "done";
    setTasks(tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    await fetch(`${API_URL}/tasks/${task.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ status: newStatus }) });
  };

  const handleDeleteTask = async () => {
    if (!confirmDelete) return;
    await fetch(`${API_URL}/tasks/${confirmDelete}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
    setConfirmDelete(null); fetchData(); showToast("Удалено");
  };

  const getSubjectColor = (id: string | null) => subjects.find(s => s.id === id)?.color || "#ccc";

  // Мобильная адаптация: на телефоне 1 колонка, на компе 7
  const renderDays = () => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }).map((_, i) => addDays(start, i));
    
    return (
      <div className="flex flex-col md:grid md:grid-cols-7 gap-3 mt-4">
        {days.map((day, i) => {
          const dayTasks = tasks.filter(t => isSameDay(new Date(t.start_at), day) && (!filterSubject || t.subject_id === filterSubject));
          const isToday = isSameDay(day, new Date());
          
          return (
            <div key={i} className={`bg-white border rounded-xl p-3 md:p-2 min-h-[100px] md:min-h-[400px] shadow-sm flex flex-col ${isToday ? "ring-2 ring-blue-400" : ""}`}>
              <div className={`text-center mb-2 pb-2 border-b ${isToday ? "text-blue-600 font-bold" : "text-gray-600"}`}>
                <div className="text-xs uppercase">{format(day, "eee", { locale: ru })}</div>
                <div className="text-2xl">{format(day, "d")}</div>
              </div>
              <div className="space-y-2 flex-1">
                {dayTasks.map(t => (
                  <div key={t.id} onClick={() => { setEditingTaskId(t.id); setNewSubjectId(t.subject_id || ""); setNewDate(format(new Date(t.start_at), "yyyy-MM-dd'T'HH:mm")); setNewDuration(t.duration_min); setIsModalOpen(true); }} 
                       className={`cursor-pointer text-sm bg-white border border-gray-100 border-l-4 p-2 rounded-lg shadow-sm relative group ${t.status === 'done' ? 'opacity-50' : ''}`} style={{ borderLeftColor: getSubjectColor(t.subject_id) }}>
                    <div className="font-medium flex justify-between items-start">
                      <span className={t.status === 'done' ? 'line-through text-gray-500' : ''}>{format(new Date(t.start_at), "HH:mm")}</span>
                      <div className="flex gap-1">
                        <button onClick={(e) => toggleStatus(e, t)} className="text-gray-400 hover:text-green-500">
                          {t.status === 'done' ? <CheckCircle2 size={18} className="text-green-500" /> : <Circle size={18} />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(t.id); }} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                      </div>
                    </div>
                    <div className={`font-semibold truncate mt-1 text-xs md:text-sm ${t.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {subjects.find(s => s.id === t.subject_id)?.name || "Занятие"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-4 max-w-7xl mx-auto relative pb-20 md:pb-4">
      {toast && <div className={`fixed top-4 right-4 z-[100] px-4 py-2 rounded-lg shadow-lg text-white text-sm ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{toast.msg}</div>}

      {/* Кастомная модалка удаления */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-full max-w-sm text-center shadow-2xl">
            <h3 className="text-lg font-bold mb-2">Удалить занятие?</h3>
            <p className="text-gray-500 mb-6 text-sm">Это действие нельзя отменить.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border rounded-xl hover:bg-gray-50">Отмена</button>
              <button onClick={handleDeleteTask} className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700">Удалить</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">Мой план</h1>
        <div className="flex gap-2 items-center">
          <AdminShield role={user?.role} />
          <Link href="/stats" className="p-2 bg-white border rounded-xl text-gray-600 hover:bg-gray-50"><BarChart2 size={20} /></Link>
          <Link href="/settings" className="p-2 bg-white border rounded-xl text-gray-600 hover:bg-gray-50"><Settings size={20} /></Link>
          <button onClick={() => { setEditingTaskId(null); setNewSubjectId(subjects[0]?.id || ""); setNewDate(format(new Date(), "yyyy-MM-dd'T'HH:mm")); setNewDuration(60); setIsModalOpen(true); }} className="hidden md:flex items-center gap-2 bg-black text-white px-4 py-2 rounded-xl hover:bg-gray-800"><Plus size={18} /> Запланировать</button>
        </div>
      </div>

      {/* Кнопка добавления на мобилке (внизу экрана) */}
      <button onClick={() => { setEditingTaskId(null); setNewSubjectId(subjects[0]?.id || ""); setNewDate(format(new Date(), "yyyy-MM-dd'T'HH:mm")); setNewDuration(60); setIsModalOpen(true); }} className="md:hidden fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg z-40 active:scale-95 transition-transform"><Plus size={24} /></button>

      <div className="flex items-center gap-2 mb-4 bg-white p-2 rounded-xl border w-fit shadow-sm overflow-x-auto max-w-full">
        <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="px-3 py-1 hover:bg-gray-100 rounded-lg">←</button>
        <span className="font-semibold text-sm md:text-lg min-w-[120px] text-center capitalize">{format(currentDate, "LLLL yyyy", { locale: ru })}</span>
        <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="px-3 py-1 hover:bg-gray-100 rounded-lg">→</button>
        <button onClick={() => setCurrentDate(new Date())} className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg">Сегодня</button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
        <button onClick={() => setFilterSubject(null)} className={`px-3 py-1 rounded-lg text-sm border whitespace-nowrap ${!filterSubject ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600'}`}>Все</button>
        {subjects.map(s => (
          <button key={s.id} onClick={() => setFilterSubject(s.id)} className={`px-3 py-1 rounded-lg text-sm border whitespace-nowrap ${filterSubject === s.id ? 'text-white border-transparent' : 'bg-white text-gray-600'}`} style={{ backgroundColor: filterSubject === s.id ? s.color : 'transparent', borderColor: s.color }}>{s.name}</button>
        ))}
      </div>

      {renderDays()}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <form onSubmit={handleSaveTask} className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl">
            <h2 className="text-xl font-bold">{editingTaskId ? "Редактировать" : "Новое занятие"}</h2>
            <select value={newSubjectId} onChange={e => setNewSubjectId(e.target.value)} className="w-full border p-3 rounded-xl bg-gray-50">{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <input type="datetime-local" required value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full border p-3 rounded-xl bg-gray-50" />
            <input type="number" required value={newDuration} onChange={e => setNewDuration(Number(e.target.value))} className="w-full border p-3 rounded-xl bg-gray-50" placeholder="Длительность (мин)" />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl">Отмена</button>
              <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-xl shadow hover:bg-blue-700">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
