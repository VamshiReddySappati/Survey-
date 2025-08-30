export const metadata = {
  title: "Form Builder",
  description: "Custom Form Builder with Live Analytics",
};

import "./globals.css";
import type { ReactNode } from "react";
import ThemeToggle from "@/components/ThemeToggle";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <div className="max-w-5xl mx-auto p-6">
          <header className="flex items-center justify-between mb-6">
            <a href="/" className="text-xl font-semibold">Form Builder</a>
            <ThemeToggle />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
