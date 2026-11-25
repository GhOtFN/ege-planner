"use client";
import { useEffect, useState } from "react";
import { Calendar } from "./components/Calendar";
import { useAuth } from "./providers/AuthProvider";
import { Flame, Target } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import { motion } from "framer-motion";

export default function Home() {
  const { user } = useAuth();
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [nearestSubj, setNearestSubj] = useState("");

  useEffect(() => {
    if (user && (user as any).exam_dates) {
      const dates = (user as any).exam_dates;
      let minDays = Infinity;
      let subj = "";
      Object.entries(dates).forEach(([name, date]) => {
        const d = differenceInDays(parseISO(date as string), new Date());
        if (d >= 0 && d < minDays) { minDays = d; subj = name; }
      });
      if (minDays !== Infinity) { setDaysLeft(minDays); setNearestSubj(subj); }
    }
  }, [user]);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Верхняя плашка со стриком и счетчиком */}
      <div className="bg-white border-b px-4 py-2 flex justify-between items-center sticky top-0 z-40">
        <div className="flex gap-4">
          {user && (
            <div className="flex items-center gap-1 text-orange-500 font-bold">
              <Flame size={20} className="fill-orange-500" />
              <span>{(user as any).streak_days || 0} дн.</span>
            </div>
          )}
          {daysLeft !== null && (
            <div className="flex items-center gap-1 text-blue-600 font-medium text-sm">
              <Target size={16} />
              <span>До {nearestSubj}: <b>{daysLeft} дн.</b></span>
            </div>
          )}
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Calendar />
      </motion.div>
    </main>
  );
}
