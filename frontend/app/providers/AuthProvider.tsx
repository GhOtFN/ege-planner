"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AuthScreen } from "../components/AuthScreen";

type User = { id: string; email: string; role: string };

const AuthContext = createContext<{
  user: User | null;
  setUser: (u: User | null) => void;
}>({
  user: null,
  setUser: () => {},
});

export const useAuth = () => useContext(AuthContext);

// Пути, доступные без авторизации
const PUBLIC_PATHS = ["/diagnostics"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname?.startsWith(p + "/")
  );

  const [state, setState] = useState<"loading" | "auth" | "app">("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (isPublic) return; // на публичных страницах не проверяем авторизацию
    (async () => {
      const refresh = localStorage.getItem("refresh_token");
      if (!refresh) {
        setState("auth");
        return;
      }
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        localStorage.setItem("refresh_token", data.refresh_token);
        setUser({ id: "me", email: "user@example.com", role: "user" });
        setState("app");
      } catch {
        localStorage.removeItem("refresh_token");
        setState("auth");
      }
    })();
  }, [isPublic]);

  if (isPublic) return <>{children}</>;
  if (state === "loading")
    return <div className="p-8 text-center">Загрузка...</div>;
  if (state === "auth") return <AuthScreen onSuccess={() => setState("app")} />;
  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
