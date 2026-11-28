"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AuthScreen } from "../components/AuthScreen";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");


export type User = { 
  id: string; 
  email: string; 
  role: string; 
  telegram_id: number | null;
  streak_days?: number;
  exam_dates?: Record<string, string>;
  weekly_template?: any[]; // <--- ДОБАВИТЬ
};

const AuthContext = createContext<{ user: User | null; setUser: (u: User | null) => void }>({ user: null, setUser: () => {} });
export const useAuth = () => useContext(AuthContext);
const PUBLIC_PATHS = ["/diagnostics"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname?.startsWith(p + "/"));
  const [state, setState] = useState<"loading" | "auth" | "app">("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (isPublic) return;
    (async () => {
      const refresh = localStorage.getItem("refresh_token");
      const impToken = typeof window !== "undefined" ? sessionStorage.getItem("impersonation_token") : null;
      
      if (!refresh && !impToken) {
        setState("auth");
        return;
      }
      
      try {
        if (impToken) {
          const meRes = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${impToken}` } });
          if (meRes.ok) {
            setUser(await meRes.json());
            setState("app");
            return;
          } else {
            sessionStorage.removeItem("impersonation_token");
          }
        }

        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        localStorage.setItem("refresh_token", data.refresh_token);
        localStorage.setItem("access_token", data.access_token);
        
        const meRes = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${data.access_token}` } });
        if (meRes.ok) setUser(await meRes.json());
        
        setState("app");
      } catch {
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("access_token");
        setState("auth");
      }
    })();
  }, [isPublic, pathname]);

  if (isPublic) return <>{children}</>;
  if (state === "loading") return <div className="p-8 text-center">Загрузка...</div>;
  if (state === "auth") return <AuthScreen onSuccess={() => window.location.reload()} />;
  return <AuthContext.Provider value={{ user, setUser }}>{children}</AuthContext.Provider>;
}
