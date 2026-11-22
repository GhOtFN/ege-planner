"use client";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  useEffect(() => {
    // Здесь должен быть запрос к /admin/users
    setUsers([{ id: "1", email: "user@example.com" }]);
  }, []);
  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold mb-4">Админ-панель</h1>
      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="flex justify-between border p-2 rounded-lg">
            <span>{u.email}</span>
            <button className="text-sm text-blue-600">Войти как</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
