"use client";
import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowLeft, Plus, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export default function ExamsPage() {
  const [exams, setExams] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Форма
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [score, setScore] = useState("");

  const [toast, setToast] = useState<string | null>(null);
  const getToken = () => sessionStorage.getItem("impersonation_token") || localStorage.getItem("access_token");

  const fetchData = async () => {
    const token = getToken(); if (!token) return;
    const [eRes, sRes] = await Promise.all([
      fetch(`${API_URL}/tasks/mock-exams`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/subjects/`, { headers: { Authorization: `Bearer ${token}` } })
    ]);
    if (eRes.ok) setExams(await eRes.json());
    if (sRes.ok) setSubjects(await sRes.json());
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken();
    const res = await fetch(`${API_URL}/tasks/mock-exams`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject_id: subjectId, date, score: Number(score) })
    });
    if (res.ok) {
      setIsModalOpen(false);
      setScore("");
      fetchData();
      setToast("Результат добавлен!");
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Группируем данные для графика (по датам)
  const chartData = exams.map(e => ({
    date: format(new Date(e.date), "dd.MM"),
    score: e.score,
    subject: e.subject
  }));

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 mt-4">
      {toast && <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-xl shadow-lg">{toast}</div>}

      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200"><ArrowLeft size={20}/></Link>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">Трекер пробников</h1>
        </div>
        <button onClick={() => { setIsModalOpen(true); setSubjectId(subjects[0]?.id || ""); }} className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-xl hover:bg-gray-800">
          <Plus size={18} /> Добавить
        </button>
      </div>

      <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border mb-6">
        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><Target size={18} className="text-blue-600"/> Динамика баллов</h2>
        {exams.length === 0 ? (
          <div className="text-center py-10 text-gray-400">Пока нет результатов. Добавьте свой первый пробник!</div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Line type="monotone" dataKey="score" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4, fill: '#3B82F6' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {exams.map(e => (
          <div key={e.id} className="flex justify-between items-center bg-white p-4 rounded-xl border shadow-sm text-sm">
            <div>
              <span className="font-bold text-gray-800">{e.subject}</span>
              <span className="text-gray-400 ml-2">{format(new Date(e.date), "d MMM yyyy", { locale: ru })}</span>
            </div>
            <div className="text-lg font-bold text-blue-600">{e.score} <span className="text-xs text-gray-400 font-normal">/ {e.max}</span></div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl">
            <h2 className="text-xl font-bold">Новый результат</h2>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className="w-full border p-3 rounded-xl bg-gray-50">
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full border p-3 rounded-xl bg-gray-50" />
            <input type="number" required placeholder="Баллы (например: 78)" value={score} onChange={e => setScore(e.target.value)} className="w-full border p-3 rounded-xl bg-gray-50" />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600">Отмена</button>
              <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-xl">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
