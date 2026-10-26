"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";
import { login, register } from "@/lib/account";

type Tab = "login" | "register";

const input =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (tab === "login") await login(username, password);
      else await register(username, password, displayName);
      router.push("/projects");
    } catch (e) {
      setError(e instanceof Error ? e.message : "登入失敗");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href="/" aria-label="回首頁" className="rounded-lg">
          <BrandMark />
        </Link>
        <ThemeToggle />
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm" role="tablist">
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className={
                "rounded-md py-1.5 font-medium " + (tab === t ? "bg-white text-brand-700 shadow-sm" : "text-slate-500")
              }
            >
              {t === "login" ? "登入" : "註冊新帳號"}
            </button>
          ))}
        </div>

        <p className="mt-4 text-sm text-slate-600">
          {tab === "login"
            ? "登入後，之前分析過的專案都會保存在「我的專案」。"
            : "註冊後，分析過的專案都會保留下來，隨時可以回來繼續。"}
        </p>

        <form
          className="mt-4 space-y-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {tab === "register" && (
            <label className="block">
              <span className="font-medium text-slate-700">公司名稱</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例如：小名 3C 網店"
                className={input}
              />
            </label>
          )}
          <label className="block">
            <span className="font-medium text-slate-700">帳號</span>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="英文或數字，例如 xiaoming3c"
              className={input}
            />
          </label>
          <label className="block">
            <span className="font-medium text-slate-700">密碼</span>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
              placeholder={tab === "register" ? "至少 6 個字" : ""}
              className={input}
            />
          </label>
          {error && <p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "處理中…" : tab === "login" ? "登入" : "註冊並登入"}
          </button>
        </form>
      </section>

      <p className="mt-4 text-center text-sm text-slate-600">
        不想登入？
        <Link href="/" className="ml-1 font-medium text-brand-600 hover:underline">
          直接使用（不會保存紀錄）
        </Link>
      </p>
    </main>
  );
}
