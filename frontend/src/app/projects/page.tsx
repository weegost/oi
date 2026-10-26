"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";
import { useAccount } from "@/lib/account";
import { apiGet } from "@/lib/api";

type ProjectSummary = {
  id: number;
  name: string;
  work: string;
  company_name: string;
  steps: number;
  progress: number; // 0–4：做到第幾個階段
  updated_at: string;
};

const STAGE = ["尚未開始", "流程建模", "AI 介入探索", "情境沙盒測試", "需求草案產出"];

export default function MyProjectsPage() {
  const account = useAccount();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    apiGet<ProjectSummary[]>("/api/projects")
      .then(setProjects)
      .catch((e) => setError(e.message));
  }, [account]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" aria-label="回首頁" className="rounded-lg">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-2">
          <AccountMenu />
          <ThemeToggle />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">我的專案</h1>
          {account && <p className="mt-1 text-sm text-slate-600">{account.display_name || account.username} 建立過的分析</p>}
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
        >
          <Plus aria-hidden className="h-4 w-4" />
          建立新專案
        </Link>
      </div>

      {account === null && (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          請先
          <Link href="/login" className="mx-1 font-medium text-brand-600 hover:underline">
            登入
          </Link>
          才能查看之前的專案。
        </p>
      )}
      {error && <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {account && projects?.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          還沒有專案。按「建立新專案」開始第一個分析。
        </p>
      )}

      {projects && projects.length > 0 && (
        <ul className="mt-6 space-y-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}${p.progress >= 4 ? "/report" : ""}`}
                className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-400"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{p.company_name}</p>
                    <h2 className="truncate text-lg font-semibold text-slate-900">{p.name}</h2>
                    {p.work && <p className="mt-0.5 text-sm text-slate-600">{p.work}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700">
                    {p.progress === 0 ? "尚未開始" : `已做到第 ${p.progress} 步：${STAGE[p.progress]}`}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                  <ol className="flex gap-1" aria-hidden>
                    {[1, 2, 3, 4].map((i) => (
                      <li key={i} className={"h-1.5 w-8 rounded-full " + (i <= p.progress ? "bg-brand-500" : "bg-slate-200")} />
                    ))}
                  </ol>
                  <span>{p.steps} 個工作步驟</span>
                  <span>最後更新 {new Date(p.updated_at).toLocaleString("zh-TW")}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
