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

const EGE_SUBJECTS = [
  { name: "Математика", color: "#3B82F6" },
  { name: "Русский язык", color: "#10B981" },
  { name: "Физика", color: "#8B5CF6" },
  { name: "Информатика", color: "#F59E0B" },
  { name: "Химия", color: "#EF4444" },
  { name: "Биология", color: "#84CC16" },
  { name: "История", color: "#6366F1" },
  { name: "Обществознание", color: "#EC4899" },
  { name: "Английский", color: "#06B6D4" },
];

export function Calendar() {
  const { user } = useAuth();
  const [view, setView] = useState<"week">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filterSubject, setFilterSubject] = useState<string | null>(null);
  
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedOnboarding, setSelectedOnboarding] = useState<string[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [newDuration, setNewDuration] = useState(60);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const getToken = () => sessionStorage.getItem("impersonation_token") || localStorage.getItem("access_token");

  const fetchData = async () => {
    const token = getToken();
    if (!token) return;
    const [tasksRes, subjectsRes] = await Promise.all([
      fetch(`${API_URL}/tasks/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/subjects/`, { headers: { Authorization: `Bearer ${token}` } })
    ]);
    if (tasksRes.ok) setTasks(await tasksRes.json());
    if (subjectsRes.ok) {
      const subs = await subjectsRes.json();
      setSubjects(subs);
      if (subs.length === 0) setShowOnboarding(true);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleOnboardingSubmit = async () => {
    if (selectedOnboarding.length === 0) return showToast("Выберите хотя бы один предмет", "error");
    const token = getToken();
    const toCreate = EGE_SUBJECTS.filter(s => selectedOnboarding.includes(s.name));
    await fetch(`${API_URL}/subjects/bulk`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(toCreate)
    });
    setShowOnboarding(false); fetchData();
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken();
    const method = editingTaskId ? "PUT" : "POST";
    const url = editingTaskId ? `${API_URL}/tasks/${editingTaskId}` : `${API_URL}/tasks/`;
    const payload = {
      title: subjects.find(s => s.id === newSubjectId)?.name || "Занятие",
      start_at: new Date(newDate).toISOString(),
      duration_min: newDuration,
      subject_id: newSubjectId || null
    };
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    if (res.ok) { setIsModalOpen(false); fetchData(); showToast("Сохранено"); }
  };

  const toggleStatus = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const token = getToken();
    const newStatus = task.status === "done" ? "planned" : "done";
    
    // Оптимистичное обновление UI
    setTasks(tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    
    await fetch(`${API_URL}/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: newStatus })
    });
  };

  const handleDeleteTask = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Удалить?")) return;
    await fetch(`${API_URL}/tasks/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
    fetchData();
  };

  const openEditModal = (task: Task) => {
    setEditingTaskId(task.id);
    setNewSubjectId(task.subject_id || "");
    setNewDate(format(new Date(task.start_at), "yyyy-MM-dd'T'HH:mm"));
    setNewDuration(task.duration_min);
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingTaskId(null);
    setNewSubjectId(subjects[0]?.id || "");
    setNewDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setNewDuration(60);
    setIsModalOpen(true);
  };

  const getSubjectColor = (subId: string | null) => subjects.find(s => s.id === subId)?.color || "#6B7280";

  const renderWeek = () => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }).map((_, i) => addDays(start, i));
    
    return (
      <div className="grid grid-cols-7 gap-2 mt-4">
        {days.map((day, i) => {
          const dayTasks = tasks.filter(t => 
            isSameDay(new Date(t.start_at), day) && 
            (!filterSubject || t.subject_id === filterSubject)
          );
          return (
            <div key={i} className={`bg-white border rounded-xl p-2 min-h-[400px] shadow-sm ${isSameDay(day, new Date()) ? "ring-2 ring-blue-400" : ""}`}>
              <div className={`text-center mb-3 pb-2 border-b ${isSameDay(day, new Date()) ? "text-blue-600 font-bold" : "text-gray-600"}`}>
                <div className="text-xs uppercase">{format(day, "eee", { locale: ru })}</div>
                <div className="text-2xl">{format(day, "d")}</div>
              </div>
              <div className="space-y-2">
                {dayTasks.map(t => (
                  <div key={t.id} onClick={() => openEditModal(t)} className={`cursor-pointer text-sm bg-white border border-gray-100 border-l-4 p-2 rounded-lg shadow-sm hover:shadow-md transition-all relative group ${t.status === 'done' ? 'opacity-50' : ''}`} style={{ borderLeftColor: getSubjectColor(t.subject_id) }}>
                    <div className="font-medium flex justify-between items-start">
                      <span className={t.status === 'done' ? 'line-through text-gray-500' : ''}>{format(new Date(t.start_at), "HH:mm")}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => toggleStatus(e, t)} className="text-gray-400 hover:text-green-500">
                          {t.status === 'done' ? <CheckCircle2 size={16} className="text-green-500" /> : <Circle size={16} />}
                        </button>
                        <button onClick={(e) => handleDeleteTask(e, t.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                      </div>
                    </div>
                    <div className={`font-semibold truncate mt-1 ${t.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {subjects.find(s => s.id === t.subject_id)?.name || "Предмет"}
                    </div>
                    <div className="text-xs text-gray-400">{t.duration_min} мин</div>
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
    <div className="p-4 max-w-7xl mx-auto relative">
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-6 py-3 rounded-lg shadow-lg text-white font-medium ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {showOnboarding && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl">
            <h2 className="text-2xl font-bold mb-2 text-center">Какие предметы вы сдаете?</h2>
            <p className="text-gray-500 mb-6 text-center">Выберите предметы для подготовки.</p>
            <div className="grid grid-cols-2 gap-3 mb-8">
              {EGE_SUBJECTS.map(sub => (
                <label key={sub.name} className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="checkbox" checked={selectedOnboarding.includes(sub.name)} onChange={(e) => {
                    if (e.target.checked) setSelectedOnboarding([...selectedOnboarding, sub.name]);
                    else setSelectedOnboarding(selectedOnboarding.filter(n => n !== sub.name));
                  }} className="w-5 h-5 text-blue-600 rounded" />
                  <span className="font-medium">{sub.name}</span>
                </label>
              ))}
            </div>
            <button onClick={handleOnboardingSubmit} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors">
              Сохранить и начать
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Мой план подготовки</h1>
        
        <div className="flex gap-2 items-center flex-wrap">
          <AdminShield role={user?.role} />
          <Link href="/stats" className="flex items-center gap-2 px-3 py-2 bg-white border text-gray-700 rounded-xl hover:bg-gray-50 transition-colors">
            <BarChart2 size={18} /> Статистика
          </Link>
          <Link href="/settings" className="flex items-center justify-center p-2 bg-white border text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">
            <Settings size={20} />
          </Link>
          <button onClick={openCreateModal} className="flex items-center gap-2 bg-black text-white px-5 py-2 rounded-xl hover:bg-gray-800 transition-transform active:scale-95 shadow-md">
            <Plus size={18} /> Запланировать
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4 bg-white p-2 rounded-xl border w-fit shadow-sm">
        <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="px-3 py-1 hover:bg-gray-100 rounded-lg">←</button>
        <span className="font-semibold text-lg min-w-[150px] text-center capitalize">{format(currentDate, "LLLL yyyy", { locale: ru })}</span>
        <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="px-3 py-1 hover:bg-gray-100 rounded-lg">→</button>
        <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg">Сегодня</button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <button onClick={() => setFilterSubject(null)} className={`px-3 py-1 rounded-lg text-sm border whitespace-nowrap ${!filterSubject ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600'}`}>Все предметы</button>
        {subjects.map(s => (
          <button key={s.id} onClick={() => setFilterSubject(s.id)} className={`px-3 py-1 rounded-lg text-sm border whitespace-nowrap ${filterSubject === s.id ? 'text-white border-transparent' : 'bg-white text-gray-600'}`} style={{ backgroundColor: filterSubject === s.id ? s.color : 'transparent', borderColor: s.color }}>
            {s.name}
          </button>
        ))}
      </div>

      {renderWeek()}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <form onSubmit={handleSaveTask} className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl">
            <h2 className="text-xl font-bold">{editingTaskId ? "Редактировать" : "Новое занятие"}</h2>
            <div>
              <label className="text-sm font-medium text-gray-700">Предмет</label>
              <select value={newSubjectId} onChange={e => setNewSubjectId(e.target.value)} className="w-full border p-3 rounded-xl mt-1 bg-gray-50">
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Начало</label>
              <input type="datetime-local" required value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full border p-3 rounded-xl mt-1 bg-gray-50" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Длительность (минут)</label>
              <input type="number" required value={newDuration} onChange={e => setNewDuration(Number(e.target.value))} className="w-full border p-3 rounded-xl mt-1 bg-gray-50" />
            </div>
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
