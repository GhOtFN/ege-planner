"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, X, Trash2, CheckCircle2 } from "lucide-react";
import Link from "next/link";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6..22

type Slot = { day: number; hour: number; subject_id: string; duration: number };

export default function TemplatesPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [modal, setModal] = useState<{ day: number; hour: number } | null>(null);
  const [selSub, setSelSub] = useState("");
  const [selDur, setSelDur] = useState(60);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedStatus, setSavedStatus] = useState<"idle" | "saving" | "saved">("idle");

  const getToken = () => sessionStorage.getItem("impersonation_token") || localStorage.getItem("access_token");

  useEffect(() => {
    (async () => {
      const token = getToken();
      // Загружаем предметы и профиль (где лежит сохраненный шаблон)
      const [subsRes, meRes] = await Promise.all([
        fetch(`${API_URL}/subjects/`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      if (subsRes.ok) { 
        const s = await subsRes.json(); 
        setSubjects(s); 
        setSelSub(s[0]?.id || ""); 
      }
      if (meRes.ok) {
        const me = await meRes.json();
        setSlots(me.weekly_template || []);
      }
      setLoading(false);
    })();
  }, []);

  // Сохраняем шаблон в базу при каждом изменении (автосохранение)
  const saveToDatabase = async (newSlots: Slot[]) => {
    setSavedStatus("saving");
    await fetch(`${API_URL}/auth/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ weekly_template: newSlots })
    });
    setSavedStatus("saved");
    setTimeout(() => setSavedStatus("idle"), 2000);
  };

  const updateSlots = (newSlots: Slot[]) => {
    setSlots(newSlots);
    saveToDatabase(newSlots);
  };

  const applySlot = () => {
    if (!modal || !selSub) return;
    const newSlots = slots.filter(s => !(s.day === modal.day && s.hour === modal.hour));
    newSlots.push({ day: modal.day, hour: modal.hour, subject_id: selSub, duration: selDur });
    updateSlots(newSlots);
    setModal(null);
  };

  const removeSlot = (day: number, hour: number) => {
    updateSlots(slots.filter(s => !(s.day === day && s.hour === hour)));
  };

  const clearTemplate = () => {
    if (confirm("Очистить весь шаблон?")) {
      updateSlots([]);
    }
  };

  const applyTemplateToCalendar = async () => {
    if (slots.length === 0) return;
    setSaving(true);
    const res = await fetch(`${API_URL}/tasks/apply-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({
        slots: slots.map(s => ({ day_of_week: s.day, hour: s.hour, subject_id: s.subject_id, duration_min: s.duration })),
        weeks: 4
      })
    });
    if (res.ok) {
      const data = await res.json();
      alert(`Готово! Создано занятий: ${data.created}`);
      router.push("/");
    }
    setSaving(false);
  };

  const getSlot = (day: number, hour: number) => slots.find(s => s.day === day && s.hour === hour);

  if (loading) return <div className="p-10 text-center">Загрузка шаблона...</div>;

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <Link href="/settings" className="inline-flex items-center gap-2 text-blue-600 font-medium"><ArrowLeft size={20}/> Назад</Link>
        
        <div className="flex items-center gap-4">
          {savedStatus === "saving" && <span className="text-sm text-gray-400">Сохранение...</span>}
          {savedStatus === "saved" && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 size={16}/> Сохранено</span>}
          
          {slots.length > 0 && (
            <button onClick={clearTemplate} className="text-sm text-red-500 hover:underline flex items-center gap-1">
              <Trash2 size={14} /> Очистить
            </button>
          )}
        </div>
      </div>
      
      <h1 className="text-2xl font-bold mb-2">Шаблон недели</h1>
      <p className="text-gray-500 text-sm mb-4">Кликните по ячейке, чтобы назначить занятие. Изменения сохраняются автоматически.</p>

      <div className="overflow-x-auto pb-4">
        <div className="inline-grid grid-cols-8 gap-1 min-w-[700px]">
          <div></div>
          {DAYS.map(d => <div key={d} className="text-center font-bold text-sm p-2 bg-gray-100 rounded">{d}</div>)}
          {HOURS.map(h => (
            <div key={h} className="contents">
              <div className="text-right text-xs text-gray-500 p-2">{h}:00</div>
              {DAYS.map((_, di) => {
                const slot = getSlot(di, h);
                return (
                  <div key={`${di}-${h}`} onClick={() => { setSelDur(60); if (subjects[0]) setSelSub(subjects[0].id); setModal({ day: di, hour: h }); }}
                    className={`h-10 border rounded cursor-pointer text-xs flex items-center justify-center transition-colors ${slot ? 'bg-blue-500 text-white border-blue-600 shadow-sm' : 'bg-white hover:bg-blue-50'}`}>
                    {slot ? subjects.find(s => s.id === slot.subject_id)?.name?.slice(0, 6) : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <button onClick={applyTemplateToCalendar} disabled={saving || slots.length === 0} className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors">
        {saving ? "Создаем..." : `Перенести в календарь на 4 недели (${slots.length} слотов)`}
      </button>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">{DAYS[modal.day]}, {modal.hour}:00</h3>
              <button onClick={() => setModal(null)}><X size={20}/></button>
            </div>
            <select value={selSub} onChange={e => setSelSub(e.target.value)} className="w-full border p-3 rounded-xl bg-gray-50">
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="number" value={selDur} onChange={e => setSelDur(Number(e.target.value))} className="w-full border p-3 rounded-xl bg-gray-50" placeholder="Минут" />
            <div className="flex gap-2">
              {getSlot(modal.day, modal.hour) && <button onClick={() => { removeSlot(modal.day, modal.hour); setModal(null); }} className="flex-1 py-2 bg-red-100 text-red-700 rounded-xl">Удалить</button>}
              <button onClick={applySlot} className="flex-1 py-2 bg-blue-600 text-white rounded-xl">Готово</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
