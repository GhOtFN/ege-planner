"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Trophy, Clock } from "lucide-react";

export default function PublicSharePage() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPublic = async () => {
      const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
      const res = await fetch(`${API_URL}/public/stats/${token}?period=month`);
      if (res.ok) setData(await res.json());
      setLoading(false);
    };
    if (token) fetchPublic();
  }, [token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Загрузка...</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-red-500">Статистика не найдена или скрыта.</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border">
        <Trophy size={48} className="mx-auto text-yellow-400 mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Успехи в подготовке!</h1>
        <p className="text-gray-500 text-sm mb-6">{data.email} готовится к ЕГЭ</p>
        
        <div className="bg-blue-50 p-4 rounded-2xl mb-6 inline-flex items-center gap-3 w-full justify-center">
          <Clock size={24} className="text-blue-600" />
          <div className="text-left">
            <p className="text-xs text-blue-600 font-semibold uppercase">Всего часов за месяц</p>
            <p className="text-3xl font-bold text-gray-800">{data.stats.total_hours}</p>
          </div>
        </div>

        {data.stats.subjects.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.stats.subjects} dataKey="hours" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                  {data.stats.subjects.map((e:any, i:number) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v) => `${v} ч`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-6">Создано в ЕГЭ-Планер</p>
      </div>
    </div>
  );
}
