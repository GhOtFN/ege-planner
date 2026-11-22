import { Calendar } from "./components/Calendar";
import { AdminShield } from "./components/AdminShield";

export default function Home() {
  return (
    <main className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-semibold">Мой план</h1>
        <AdminShield role="user" /> {/* сюда передаётся реальная роль */}
      </div>
      <Calendar />
    </main>
  );
}
