import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Praxarch — Agentic Business OS",
  description: "Multi-tenant agentic business management command center.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // `dark` class enables the deep dark-mode palette by default (premium B2B feel).
  return (
    <html lang="en" className="dark">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
