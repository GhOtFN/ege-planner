"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
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
  const getToken = () => sessionStorage.getItem("impersonation_token") || localStorage.getItem("access_token");

  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_URL}/subjects/`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) { const s = await res.json(); setSubjects(s); setSelSub(s[0]?.id || ""); }
    })();
  }, []);

  const applySlot = () => {
    if (!modal || !selSub) return;
    setSlots([...slots.filter(s => !(s.day === modal.day && s.hour === modal.hour)), { day: modal.day, hour: modal.hour, subject_id: selSub, duration: selDur }]);
    setModal(null);
  };

  const removeSlot = (day: number, hour: number) => {
    setSlots(slots.filter(s => !(s.day === day && s.hour === hour)));
  };

  const save = async () => {
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

  return (
    <div className="max-w-6xl mx-auto p-4">
      <Link href="/settings" className="inline-flex items-center gap-2 text-blue-600 font-medium mb-4"><ArrowLeft size={20}/> Назад</Link>
      <h1 className="text-2xl font-bold mb-2">Шаблон недели</h1>
      <p className="text-gray-500 text-sm mb-4">Кликните по ячейке, чтобы назначить занятие. Оно будет продублировано на 4 недели вперед.</p>

      <div className="overflow-x-auto">
        <div className="inline-grid grid-cols-8 gap-1 min-w-[700px]">
          <div></div>
          {DAYS.map(d => <div key={d} className="text-center font-bold text-sm p-2 bg-gray-100 rounded">{d}</div>)}
          {HOURS.map(h => (
            <>
              <div key={`h${h}`} className="text-right text-xs text-gray-500 p-2">{h}:00</div>
              {DAYS.map((_, di) => {
                const slot = getSlot(di, h);
                return (
                  <div key={`${di}-${h}`} onClick={() => { setSelDur(60); if (subjects[0]) setSelSub(subjects[0].id); setModal({ day: di, hour: h }); }}
                    className={`h-10 border rounded cursor-pointer text-xs flex items-center justify-center transition-colors ${slot ? 'bg-blue-500 text-white' : 'bg-white hover:bg-blue-50'}`}>
                    {slot ? subjects.find(s => s.id === slot.subject_id)?.name?.slice(0, 6) : ""}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving || slots.length === 0} className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50">
        {saving ? "Создаем..." : `Применить на 4 недели (${slots.length} слотов)`}
      </button>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">{DAYS[modal.day]}, {modal.hour}:00</h3>
              <button onClick={() => setModal(null)}><X size={20}/></button>
            </div>
            <select value={selSub} onChange={e => setSelSub(e.target.value)} className="w-full border p-3 rounded-xl">
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="number" value={selDur} onChange={e => setSelDur(Number(e.target.value))} className="w-full border p-3 rounded-xl" placeholder="Минут" />
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
