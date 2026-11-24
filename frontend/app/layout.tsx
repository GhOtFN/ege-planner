import "./globals.css";
import { AuthProvider } from "./providers/AuthProvider";
import { ImpersonationBanner } from "./components/ImpersonationBanner";

export const metadata = {
  title: "ЕГЭ-Планер",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Планер" },
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
