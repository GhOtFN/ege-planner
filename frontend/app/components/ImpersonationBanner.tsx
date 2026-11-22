"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../providers/AuthProvider";

export function ImpersonationBanner() {
  const { user } = useAuth();
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    setIsImpersonating(!!sessionStorage.getItem("impersonation_token"));
  }, []);

  if (!isImpersonating) return null;

  const stopImpersonation = () => {
    sessionStorage.removeItem("impersonation_token");
    sessionStorage.removeItem("original_admin_token");
    window.location.href = "/admin";
  };

  return (
    <div className="bg-amber-100 border-b border-amber-300 text-amber-900 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-4 sticky top-0 z-[60]">
      <span>Вы действуете от имени пользователя <b>{user?.email}</b></span>
      <button onClick={stopImpersonation} className="bg-amber-200 hover:bg-amber-300 px-3 py-1 rounded transition-colors">
        Завершить имперсонацию
      </button>
    </div>
  );
}
