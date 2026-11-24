"use client";
import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowLeft, Clock, BookOpen, TrendingUp } from "lucide-react";
import Link from "next/link";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

type StatData = {
  total_hours: number;
  subjects: { name: string; color: string; hours: number }[];
};

export default function StatsPage() {
  const [data, setData] = useState<StatData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const token = sessionStorage.getItem("impersonation_token") || localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/tasks/stats`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setData(await res.json());
      setLoading(false);
    };
    fetchStats();
  }, []);

  if (loading) return <div className="p-10 text-center">Загрузка графиков...</div>;
  if (!data || data.subjects.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center mt-20">
        <BookOpen size={64} className="mx-auto text-gray-300 mb-4" />
        <h2 className="text-2xl font-bold text-gray-700">Пока нет данных</h2>
        <p className="text-gray-500 mt-2 mb-6">Отмечайте задачи выполненными (зеленая галочка в календаре), чтобы видеть статистику.</p>
        <Link href="/" className="px-6 py-3 bg-blue-600 text-white rounded-xl">Вернуться в календарь</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 mt-6">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/" className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200"><ArrowLeft size={20}/></Link>
        <h1 className="text-2xl font-bold text-gray-800">Статистика подготовки</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-4 bg-blue-100 text-blue-600 rounded-xl"><Clock size={28} /></div>
          <div>
            <p className="text-gray-500 text-sm font-medium">Всего часов</p>
            <h3 className="text-3xl font-bold text-gray-800">{data.total_hours}</h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-4 bg-purple-100 text-purple-600 rounded-xl"><BookOpen size={28} /></div>
          <div>
            <p className="text-gray-500 text-sm font-medium">Предметов</p>
            <h3 className="text-3xl font-bold text-gray-800">{data.subjects.length}</h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-4 bg-green-100 text-green-600 rounded-xl"><TrendingUp size={28} /></div>
          <div>
            <p className="text-gray-500 text-sm font-medium">Среднее в день</p>
            <h3 className="text-3xl font-bold text-gray-800">{Math.round(data.total_hours / 7 * 10) / 10} ч</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold mb-4 text-gray-800">Распределение по предметам</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.subjects} dataKey="hours" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, hours }) => `${name}: ${hours}ч`}>
                  {data.subjects.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(value) => `${value} ч`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold mb-4 text-gray-800">Часы по предметам</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.subjects} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip formatter={(value) => `${value} ч`} />
                <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                  {data.subjects.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
