import type { Metadata } from "next";
import { VersionLogger } from "@/components/version-logger";
import "./globals.css";

export const metadata: Metadata = {
  title: "Praxarch — Agentic Business OS",
  description: "Multi-tenant agentic business management command center.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // `dark` class enables the deep dark-mode palette by default (premium B2B feel).
  // Each surface (super-admin vs tenant app) supplies its own shell via nested layouts.
  return (
    <html lang="en" className="dark">
      <body>
        <VersionLogger />
        {children}
      </body>
    </html>
  );
}
