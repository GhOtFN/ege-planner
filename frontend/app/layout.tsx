import "./globals.css";
import { AuthProvider } from "./providers/AuthProvider";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "ЕГЭ-Планер" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
