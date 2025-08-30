"use client";

export default function ThemeToggle() {
  return (
    <button
      onClick={() => document.documentElement.classList.toggle("dark")}
      className="text-sm border rounded px-3 py-1"
    >
      Toggle Theme
    </button>
  );
}
