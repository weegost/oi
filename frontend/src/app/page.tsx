"use client";

import { useState } from "react";
import { Store } from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import BrandMark from "@/components/BrandMark";
import CompanyCard from "@/components/CompanyCard";
import ProjectForm from "@/components/ProjectForm";
import SectionTitle from "@/components/SectionTitle";
import StageNav from "@/components/StageNav";
import ThemeToggle from "@/components/ThemeToggle";
import { apiGet } from "@/lib/api";
import type { Company } from "@/lib/types";

const DEMO_CODE = "00000000";

export default function Home() {
  const [taxId, setTaxId] = useState("");
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [noTaxId, setNoTaxId] = useState(false); // 不查統編，直接開始

  const lookup = async (id: string) => {
    setTaxId(id);
    if (!/^\d{8}$/.test(id)) {
      setError("請輸入 8 碼統一編號。");
      return;
    }
    setLoading(true);
    setError(null);
    setNoTaxId(false);
    try {
      setCompany(await apiGet<Company>(`/api/companies/${id}`));
    } catch (e) {
      setCompany(null);
      setError(e instanceof Error ? e.message : "查詢失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="rounded-3xl border border-brand-100 bg-brand-50 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <BrandMark />
          <div className="flex items-center gap-2">
            <AccountMenu />
            <ThemeToggle />
          </div>
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">中小企業 AI 導入探索</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          從目前實際的工作流程出發，找出 AI 能協助的步驟、需要保留人工判斷的地方，以及導入前要先準備的條件。
        </p>
        <div className="mt-5">
          <StageNav current={0} />
        </div>
      </header>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
        <SectionTitle icon={Store}>建立企業背景</SectionTitle>
        <p className="mt-1 text-sm text-slate-500">
          輸入統一編號，系統會串接經濟部商工行政資料開放平臺，帶入登記資料與營業項目。
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            lookup(taxId.trim());
          }}
        >
          <input
            value={taxId}
            onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            placeholder="8 碼統一編號"
            aria-label="統一編號"
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 font-mono text-lg tracking-widest outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:w-64"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "查詢中…" : "查詢企業資料"}
          </button>
        </form>
        <p className="mt-3 text-sm text-slate-500">
          沒有要查詢的企業？
          <button
            type="button"
            onClick={() => lookup(DEMO_CODE)}
            className="ml-1 font-medium text-brand-600 hover:underline"
          >
            使用示範案例「小名 3C 網店」
          </button>
          <span className="mx-2 text-slate-300">|</span>
          <button
            type="button"
            onClick={() => {
              setCompany(null);
              setError(null);
              setNoTaxId(true);
            }}
            className="font-medium text-brand-600 hover:underline"
          >
            沒有統編，直接開始
          </button>
        </p>
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </section>

      {company && (
        <div className="mt-6 space-y-4">
          <CompanyCard company={company} />
          <ProjectForm company={company} />
        </div>
      )}
      {!company && noTaxId && (
        <div className="mt-6">
          <ProjectForm company={null} />
        </div>
      )}
    </main>
  );
}
