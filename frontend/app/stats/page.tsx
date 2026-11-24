"use client";
import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowLeft, Clock, BookOpen, TrendingUp } from "lucide-react";
import Link from "next/link";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export default function StatsPage() {
  const [data, setData] = useState<any>(null);
  const [period, setPeriod] = useState("week");

  useEffect(() => {
    const fetchStats = async () => {
      const token = sessionStorage.getItem("impersonation_token") || localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/tasks/stats?period=${period}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setData(await res.json());
    };
    fetchStats();
  }, [period]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 mt-4 md:mt-6 pb-20">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/" className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200"><ArrowLeft size={20}/></Link>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">Статистика</h1>
      </div>

      <div className="flex gap-2 mb-6 bg-white p-1 rounded-xl border w-fit shadow-sm">
        {[{id:"day", label:"День"}, {id:"week", label:"Неделя"}, {id:"month", label:"Месяц"}].map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === p.id ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{p.label}</button>
        ))}
      </div>

      {!data || data.subjects.length === 0 ? (
        <div className="text-center p-10 bg-white rounded-2xl shadow-sm border">
          <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">За этот период нет выполненных задач.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border flex items-center gap-4">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><Clock size={24} /></div>
              <div><p className="text-gray-500 text-xs">Часов</p><h3 className="text-2xl font-bold">{data.total_hours}</h3></div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border flex items-center gap-4">
              <div className="p-3 bg-purple-100 text-purple-600 rounded-xl"><BookOpen size={24} /></div>
              <div><p className="text-gray-500 text-xs">Предметов</p><h3 className="text-2xl font-bold">{data.subjects.length}</h3></div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border flex items-center gap-4">
              <div className="p-3 bg-green-100 text-green-600 rounded-xl"><TrendingUp size={24} /></div>
              <div><p className="text-gray-500 text-xs">В среднем</p><h3 className="text-2xl font-bold">{Math.round(data.total_hours / (period==='week'?7:period==='month'?30:1) * 10) / 10} ч</h3></div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.subjects} dataKey="hours" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, hours }) => `${name}: ${hours}ч`}>
                    {data.subjects.map((e:any, i:number) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `${v} ч`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.subjects} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip formatter={(v) => `${v} ч`} />
                  <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                    {data.subjects.map((e:any, i:number) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
