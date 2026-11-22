"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { AuthScreen } from "../components/AuthScreen";

type User = { id: string; email: string; role: string };

const AuthContext = createContext<{ user: User | null; setUser: (u: User | null) => void }>({
  user: null,
  setUser: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "auth" | "app">("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
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
        // В реальном приложении здесь нужно получить профиль через /auth/me
        setUser({ id: "me", email: "user@example.com", role: "user" });
        setState("app");
      } catch {
        localStorage.removeItem("refresh_token");
        setState("auth");
      }
    })();
  }, []);

  if (state === "loading") return <div className="p-8 text-center">Загрузка...</div>;
  if (state === "auth") return <AuthScreen onSuccess={() => setState("app")} />;
  return <AuthContext.Provider value={{ user, setUser }}>{children}</AuthContext.Provider>;
}
