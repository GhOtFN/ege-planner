import "./globals.css";
import { AuthProvider } from "./providers/AuthProvider";
import { ImpersonationBanner } from "./components/ImpersonationBanner";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ЕГЭ-Планер",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-icon.png", // Иконка для iPhone
  },
  appleWebApp: { 
    capable: true, 
    statusBarStyle: "default", 
    title: "Планер" 
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          <ImpersonationBanner />
          {children}
        </AuthProvider>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
          }
        ` }} />
      </body>
    </html>
  );
}
