"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2, ChevronRight } from "lucide-react";
import PageTop from "@/components/PageTop";
import ProjectForm from "@/components/ProjectForm";
import { useAccount } from "@/lib/account";
import { apiGet } from "@/lib/api";
import type { Company, WorkspaceDetail } from "@/lib/types";

/** 在公司工作區建立探索專案：公司背景沿用工作區，只要填想改善的工作 */
export default function ProjectEntry() {
  const workspaceId = Number(useSearchParams().get("workspace"));
  const account = useAccount();
  const [ws, setWs] = useState<WorkspaceDetail | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account || !workspaceId) return;
    apiGet<WorkspaceDetail>(`/api/workspaces/${workspaceId}`)
      .then((w) => {
        setWs(w);
        return apiGet<Company>(`/api/companies/${w.tax_id}`).then(setCompany);
      })
      .catch((e) => setError(e.message));
  }, [account, workspaceId]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PageTop />
      {ws && (
        <Link
          href={`/workspaces/${ws.id}`}
          className="mt-8 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          {ws.name}
        </Link>
      )}
      <h1 className={(ws ? "mt-2" : "mt-8") + " text-2xl font-bold text-slate-900"}>建立探索專案</h1>
      <p className="mt-1 text-sm text-slate-600">選一項想改善的工作，描述目前遇到的問題。</p>

      {account === null && (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          請先
          <Link href="/login" className="mx-1 font-medium text-brand-600 hover:underline">
            登入
          </Link>
          再建立專案。
        </p>
      )}
      {account && !workspaceId && (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          請先到
          <Link href="/welcome" className="mx-1 font-medium text-brand-600 hover:underline">
            我的工作區
          </Link>
          選擇公司，再建立專案。
        </p>
      )}
      {error && <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {ws && company && (
        <div className="mt-6 space-y-4">
          <Link
            href={`/workspaces/${ws.id}?tab=company`}
            className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4 hover:border-brand-300"
            aria-label="查看公司背景"
          >
            <Building2 aria-hidden className="h-5 w-5 shrink-0 text-brand-600" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">{company.name}</span>
              <span className="block text-sm text-slate-600">
                {company.industry?.label ? `${company.industry.label} · ` : ""}已帶入工作區公司背景
              </span>
            </span>
            <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-slate-400" />
          </Link>
          <ProjectForm company={company} workspaceId={ws.id} />
        </div>
      )}
    </main>
  );
}
