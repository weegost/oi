"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_EVENT as EVENT, THEME_KEY as KEY } from "@/lib/theme";

// 目前模式以 <html class="dark"> 為準；layout 的內嵌腳本會在畫面出現前先套用上次的選擇
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}
const isDark = () => document.documentElement.classList.contains("dark");

export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  const toggle = () => {
    const next = !isDark();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      // 無痕模式等無法儲存時，只在這次瀏覽有效
    }
    window.dispatchEvent(new Event(EVENT));
  };

  const label = dark ? "切換為淺色模式" : "切換為深色模式";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 print:hidden"
    >
      {dark ? <Sun aria-hidden className="h-4.5 w-4.5" /> : <Moon aria-hidden className="h-4.5 w-4.5" />}
    </button>
  );
}
