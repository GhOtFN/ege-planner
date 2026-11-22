"use client";
import { useState, useEffect } from "react";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { Plus, Settings, Trash2 } from "lucide-react";
import Link from "next/link";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

type Subject = { id: string; name: string; color: string };
type Task = { id: string; title: string; start_at: string; duration_min: number; subject_id: string | null };

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
  const [view, setView] = useState<"week">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedOnboarding, setSelectedOnboarding] = useState<string[]>([]);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [newDuration, setNewDuration] = useState(60);

  // Кастомные уведомления и подтверждения
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    const token = localStorage.getItem("access_token");
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
    setSavingOnboarding(true);
    const token = localStorage.getItem("access_token");
    const toCreate = EGE_SUBJECTS.filter(s => selectedOnboarding.includes(s.name));
    
    const res = await fetch(`${API_URL}/subjects/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(toCreate)
    });
    
    if (res.ok) {
      setShowOnboarding(false);
      fetchData();
    } else {
      showToast("Ошибка при сохранении предметов", "error");
    }
    setSavingOnboarding(false);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    const method = editingTaskId ? "PUT" : "POST";
    const url = editingTaskId ? `${API_URL}/tasks/${editingTaskId}` : `${API_URL}/tasks/`;

    const payload = {
      title: subjects.find(s => s.id === newSubjectId)?.name || "Занятие",
      start_at: new Date(newDate).toISOString(),
      duration_min: newDuration,
      subject_id: newSubjectId || null
    };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setIsModalOpen(false);
      fetchData();
      showToast(editingTaskId ? "Задача обновлена" : "Занятие добавлено");
    } else {
      showToast("Ошибка при сохранении", "error");
    }
  };

  const handleDeleteTask = async () => {
    if (!confirmDelete) return;
    const token = localStorage.getItem("access_token");
    await fetch(`${API_URL}/tasks/${confirmDelete}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setConfirmDelete(null);
    fetchData();
    showToast("Занятие удалено");
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
  const getSubjectName = (subId: string | null) => subjects.find(s => s.id === subId)?.name || "Предмет";

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
                  <div key={t.id} onClick={() => openEditModal(t)} className="cursor-pointer text-sm bg-white border-l-4 p-2 rounded shadow-sm hover:shadow-md relative group" style={{ borderLeftColor: getSubjectColor(t.subject_id) }}>
                    <div className="font-medium flex justify-between">
                      <span>{format(new Date(t.start_at), "HH:mm")}</span>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(t.id); }} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button>
                    </div>
                    <div className="font-semibold truncate">{getSubjectName(t.subject_id)}</div>
                    <div className="text-xs text-gray-500">{t.duration_min} мин</div>
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
    <div className="p-4 max-w-6xl mx-auto relative">
      {/* Тост-уведомление */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-6 py-3 rounded-lg shadow-lg text-white font-medium transition-all ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Окно подтверждения удаления */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-sm text-center shadow-xl">
            <h3 className="text-lg font-bold mb-2">Удалить занятие?</h3>
            <p className="text-gray-500 mb-6 text-sm">Это действие нельзя отменить.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Отмена</button>
              <button onClick={handleDeleteTask} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Удалить</button>
            </div>
          </div>
        </div>
      )}

      {showOnboarding && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-8 max-w-lg w-full">
            <h2 className="text-2xl font-bold mb-2 text-center">Какие предметы вы сдаете?</h2>
            <p className="text-gray-500 mb-6 text-center">Выберите предметы, чтобы мы добавили их в ваш планер.</p>
            <div className="grid grid-cols-2 gap-3 mb-8">
              {EGE_SUBJECTS.map(sub => (
                <label key={sub.name} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={selectedOnboarding.includes(sub.name)} onChange={(e) => {
                    if (e.target.checked) setSelectedOnboarding([...selectedOnboarding, sub.name]);
                    else setSelectedOnboarding(selectedOnboarding.filter(n => n !== sub.name));
                  }} className="w-4 h-4 text-blue-600" />
                  <span className="font-medium">{sub.name}</span>
                </label>
              ))}
            </div>
            <button onClick={handleOnboardingSubmit} disabled={savingOnboarding} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
              {savingOnboarding ? "Сохранение..." : "Сохранить и начать"}
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Мой план</h1>
        <div className="flex gap-3">
          <Link href="/settings" className="flex items-center justify-center p-2 bg-gray-100 rounded-lg hover:bg-gray-200">
            <Settings size={20} className="text-gray-600" />
          </Link>
          <button onClick={openCreateModal} className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800">
            <Plus size={16} /> Запланировать
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="px-3 py-1 border rounded hover:bg-gray-50">←</button>
        <span className="font-semibold text-lg capitalize">{format(currentDate, "LLLL yyyy", { locale: ru })}</span>
        <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="px-3 py-1 border rounded hover:bg-gray-50">→</button>
        <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm text-blue-600 hover:underline">Сегодня</button>
      </div>

      {renderWeek()}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveTask} className="bg-white p-6 rounded-xl w-full max-w-sm space-y-4 shadow-xl">
            <h2 className="text-xl font-bold">{editingTaskId ? "Редактировать" : "Новое занятие"}</h2>
            <div>
              <label className="text-sm text-gray-600">Предмет</label>
              <select value={newSubjectId} onChange={e => setNewSubjectId(e.target.value)} className="w-full border p-2 rounded-lg mt-1">
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600">Начало</label>
              <input type="datetime-local" required value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full border p-2 rounded-lg mt-1" />
            </div>
            <div>
              <label className="text-sm text-gray-600">Длительность (минут)</label>
              <input type="number" required value={newDuration} onChange={e => setNewDuration(Number(e.target.value))} className="w-full border p-2 rounded-lg mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Отмена</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
