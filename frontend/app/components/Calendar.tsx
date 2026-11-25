"use client";
import { useState, useEffect } from "react";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { Plus, Settings, Trash2, CheckCircle2, Circle, BarChart2, StickyNote, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useAuth } from "../providers/AuthProvider";
import { AdminShield } from "./AdminShield";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

type Subject = { id: string; name: string; color: string };
type Task = { 
  id: string; 
  title: string; 
  start_at: string; 
  duration_min: number; 
  status: string; 
  subject_id: string | null; 
  notes?: string;
  is_deadline?: boolean;
  recurrence_rule?: string | null;
};

export function Calendar() {
  const { user, setUser } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filterSubject, setFilterSubject] = useState<string | null>(null);
  
  // Состояния модального окна
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [newDuration, setNewDuration] = useState(60);
  const [newNotes, setNewNotes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [isDeadline, setIsDeadline] = useState(false);

  // UI состояния
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => { 
    setToast({ msg, type }); 
    setTimeout(() => setToast(null), 3000); 
  };
  
  const getToken = () => sessionStorage.getItem("impersonation_token") || localStorage.getItem("access_token");

  const fetchData = async () => {
    const token = getToken(); 
    if (!token) return;
    
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
    
    const payload = { 
      title: subjects.find(s => s.id === newSubjectId)?.name || "Занятие", 
      start_at: new Date(newDate).toISOString(), 
      duration_min: newDuration, 
      subject_id: newSubjectId,
      notes: newNotes,
      recurrence_rule: isRecurring ? "FREQ=WEEKLY" : null,
      is_deadline: isDeadline
    };
    
    const res = await fetch(url, { 
      method, 
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, 
      body: JSON.stringify(payload) 
    });
    
    if (res.ok) { 
      setIsModalOpen(false); 
      fetchData(); 
      showToast(editingTaskId ? "Задача обновлена" : "Занятие добавлено"); 
    } else {
      showToast("Ошибка при сохранении", "error");
    }
  };

  const toggleStatus = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const newStatus = task.status === "done" ? "planned" : "done";
    
    // Конфетти при выполнении!
    if (newStatus === "done") {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#3B82F6', '#10B981', '#F59E0B']
      });
    }
    
    // Оптимистичное обновление UI
    setTasks(tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    
    const token = getToken();
    const res = await fetch(`${API_URL}/tasks/${task.id}`, { 
      method: "PUT", 
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, 
      body: JSON.stringify({ status: newStatus }) 
    });
    
    // Если бэкенд вернул новый стрик, обновляем профиль
    if (res.ok) {
      const data = await res.json();
      if (data.streak !== undefined && user && setUser) {
        setUser({ ...user, streak_days: data.streak } as any);
      }
    }
  };

  const handleDeleteTask = async () => {
    if (!confirmDelete) return;
    await fetch(`${API_URL}/tasks/${confirmDelete}`, { 
      method: "DELETE", 
      headers: { Authorization: `Bearer ${getToken()}` } 
    });
    setConfirmDelete(null); 
    fetchData(); 
    showToast("Занятие удалено");
  };

  const openCreateModal = () => {
    setEditingTaskId(null);
    setNewSubjectId(subjects[0]?.id || "");
    setNewDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setNewDuration(60);
    setNewNotes("");
    setIsRecurring(false);
    setIsDeadline(false);
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTaskId(task.id);
    setNewSubjectId(task.subject_id || "");
    setNewDate(format(new Date(task.start_at), "yyyy-MM-dd'T'HH:mm"));
    setNewDuration(task.duration_min);
    setNewNotes(task.notes || "");
    setIsRecurring(!!task.recurrence_rule);
    setIsDeadline(!!task.is_deadline);
    setIsModalOpen(true);
  };

  const getSubjectColor = (id: string | null) => subjects.find(s => s.id === id)?.color || "#9CA3AF";
  const getSubjectName = (id: string | null) => subjects.find(s => s.id === id)?.name || "Занятие";

  const renderDays = () => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }).map((_, i) => addDays(start, i));
    
    return (
      <div className="flex flex-col md:grid md:grid-cols-7 gap-3 mt-4">
        {days.map((day, i) => {
          const dayTasks = tasks
            .filter(t => isSameDay(new Date(t.start_at), day) && (!filterSubject || t.subject_id === filterSubject))
            .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
            
          const isToday = isSameDay(day, new Date());
          
          return (
            <div key={i} className={`bg-white border rounded-2xl p-3 md:p-2 min-h-[100px] md:min-h-[450px] shadow-sm flex flex-col ${isToday ? "ring-2 ring-blue-500 shadow-md" : ""}`}>
              <div className={`text-center mb-2 pb-2 border-b ${isToday ? "text-blue-600 font-bold" : "text-gray-600"}`}>
                <div className="text-xs uppercase">{format(day, "eee", { locale: ru })}</div>
                <div className="text-2xl">{format(day, "d")}</div>
              </div>
              
              <div className="space-y-2 flex-1">
                {dayTasks.map(t => (
                  <motion.div 
                    key={t.id} 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    onClick={() => openEditModal(t)} 
                    className={`cursor-pointer text-sm bg-white border border-gray-100 border-l-4 p-2.5 rounded-xl shadow-sm relative group transition-all hover:shadow-md ${t.status === 'done' ? 'opacity-50 grayscale-[50%]' : ''}`} 
                    style={{ borderLeftColor: getSubjectColor(t.subject_id) }}
                  >
                    <div className="font-medium flex justify-between items-start">
                      <span className={`flex items-center gap-1 ${t.status === 'done' ? 'line-through text-gray-500' : 'text-gray-700'}`}>
                        {t.is_deadline ? <AlertCircle size={14} className="text-red-500"/> : null}
                        {format(new Date(t.start_at), "HH:mm")}
                      </span>
                      <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => toggleStatus(e, t)} className="text-gray-400 hover:text-green-500 bg-white rounded-full">
                          {t.status === 'done' ? <CheckCircle2 size={18} className="text-green-500" /> : <Circle size={18} />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(t.id); }} className="text-gray-400 hover:text-red-500 bg-white rounded-full">
                          <Trash2 size={16}/>
                        </button>
                      </div>
                    </div>
                    
                    <div className={`font-semibold truncate mt-1 text-xs md:text-sm ${t.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {getSubjectName(t.subject_id)}
                    </div>
                    
                    <div className="flex justify-between items-center mt-1">
                      <div className="text-[11px] text-gray-400">{t.duration_min} мин</div>
                      {t.notes && <StickyNote size={12} className="text-amber-400" title={t.notes} />}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-4 max-w-7xl mx-auto relative pb-24 md:pb-4">
      {/* Toast Уведомления */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }} 
            className={`fixed top-4 right-4 z-[100] px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Кастомная модалка удаления */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white p-6 rounded-2xl w-full max-w-sm text-center shadow-2xl">
              <h3 className="text-lg font-bold mb-2">Удалить занятие?</h3>
              <p className="text-gray-500 mb-6 text-sm">Это действие нельзя отменить.</p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border rounded-xl hover:bg-gray-50 font-medium">Отмена</button>
                <button onClick={handleDeleteTask} className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium shadow-md">Удалить</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Шапка с кнопками */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">Мой план</h1>
        <div className="flex gap-2 items-center">
          <AdminShield role={user?.role} />
          <Link href="/stats" className="p-2.5 bg-white border rounded-xl text-gray-600 hover:bg-gray-50 shadow-sm transition-colors" title="Статистика"><BarChart2 size={20} /></Link>
          <Link href="/settings" className="p-2.5 bg-white border rounded-xl text-gray-600 hover:bg-gray-50 shadow-sm transition-colors" title="Настройки"><Settings size={20} /></Link>
          <button onClick={openCreateModal} className="hidden md:flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-xl hover:bg-gray-800 shadow-md transition-transform active:scale-95 font-medium">
            <Plus size={18} /> Запланировать
          </button>
        </div>
      </div>

      {/* Плавающая кнопка добавления для мобилок (iOS) */}
      <button onClick={openCreateModal} className="md:hidden fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-xl z-40 active:scale-95 transition-transform flex items-center justify-center">
        <Plus size={28} />
      </button>

      {/* Навигация по датам */}
      <div className="flex items-center gap-2 mb-4 bg-white p-2 rounded-xl border w-fit shadow-sm overflow-x-auto max-w-full">
        <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="px-3 py-1.5 hover:bg-gray-100 rounded-lg text-gray-600 font-medium">←</button>
        <span className="font-semibold text-sm md:text-lg min-w-[130px] text-center capitalize text-gray-800">{format(currentDate, "LLLL yyyy", { locale: ru })}</span>
        <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="px-3 py-1.5 hover:bg-gray-100 rounded-lg text-gray-600 font-medium">→</button>
        <div className="w-px h-6 bg-gray-200 mx-1"></div>
        <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">Сегодня</button>
      </div>

      {/* Фильтры по предметам */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-2 scrollbar-hide">
        <button onClick={() => setFilterSubject(null)} className={`px-4 py-1.5 rounded-full text-sm font-medium border whitespace-nowrap transition-colors ${!filterSubject ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
          Все предметы
        </button>
        {subjects.map(s => (
          <button 
            key={s.id} 
            onClick={() => setFilterSubject(s.id)} 
            className={`px-4 py-1.5 rounded-full text-sm font-medium border whitespace-nowrap transition-colors ${filterSubject === s.id ? 'text-white border-transparent shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50'}`} 
            style={{ backgroundColor: filterSubject === s.id ? s.color : 'transparent', borderColor: s.color }}
          >
            {s.name}
          </button>
        ))}
      </div>

      {renderDays()}

      {/* Модалка создания/редактирования задачи */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.form 
              initial={{ scale: 0.9, y: 20 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.9, y: 20 }}
              onSubmit={handleSaveTask} 
              className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl"
            >
              <h2 className="text-xl font-bold text-gray-800">{editingTaskId ? "Редактировать" : "Новое занятие"}</h2>
              
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Предмет</label>
                <select value={newSubjectId} onChange={e => setNewSubjectId(e.target.value)} className="w-full border p-3 rounded-xl bg-gray-50 text-sm font-medium mt-1">
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Время и дата</label>
                <input type="datetime-local" required value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full border p-3 rounded-xl bg-gray-50 text-sm mt-1" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Длительность (мин)</label>
                <input type="number" required value={newDuration} onChange={e => setNewDuration(Number(e.target.value))} className="w-full border p-3 rounded-xl bg-gray-50 text-sm mt-1" placeholder="Например: 60" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Заметки (номера задач, темы)</label>
                <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} className="w-full border p-3 rounded-xl bg-gray-50 text-sm h-20 mt-1 resize-none" placeholder="Например: решить №13-15" />
              </div>
              
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="w-4 h-4 rounded text-blue-600" /> 
                  Повторять каждую неделю
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={isDeadline} onChange={e => setIsDeadline(e.target.checked)} className="w-4 h-4 rounded text-red-600" /> 
                  Это дедлайн (без напоминания)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors">Отмена</button>
                <button type="submit" className="px-6 py-2.5 bg-blue-600 text-white rounded-xl shadow hover:bg-blue-700 font-medium transition-colors">Сохранить</button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
