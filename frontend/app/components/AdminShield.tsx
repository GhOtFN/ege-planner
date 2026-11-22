import Link from "next/link";
import { Shield } from "lucide-react";

export function AdminShield({ role }: { role?: string }) {
  if (!role || role === "user") return null;
  return (
    <Link href="/admin" className="text-gray-400 hover:text-gray-600 p-2 rounded-lg bg-gray-100" title="Админ-панель">
      <Shield size={20} />
    </Link>
  );
}
