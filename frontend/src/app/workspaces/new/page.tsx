"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2 } from "lucide-react";
import CompanyCard from "@/components/CompanyCard";
import PageTop from "@/components/PageTop";
import SectionTitle from "@/components/SectionTitle";
import { useAccount } from "@/lib/account";
import { apiGet, apiSend } from "@/lib/api";
import type { Company, WorkspaceSummary } from "@/lib/types";

const DEMO_CODE = "00000000";
const input =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

/** 建立公司工作區：1. 用統編查詢公司 2. 確認名稱與經營內容後建立，建立者成為管理者 */
export default function NewWorkspacePage() {
  const router = useRouter();
  const account = useAccount();
  const [taxId, setTaxId] = useState("");
  const [company, setCompany] = useState<Company | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (id: string) => {
    setTaxId(id);
    if (!/^\d{8}$/.test(id)) {
      setError("請輸入 8 碼統一編號。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const c = await apiGet<Company>(`/api/companies/${id}`);
      setCompany(c);
      setName(c.name);
    } catch (e) {
      setCompany(null);
      setError(e instanceof Error ? e.message : "查詢失敗");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!company) return;
    setBusy(true);
    setError(null);
    try {
      const w = await apiSend<WorkspaceSummary>("POST", "/api/workspaces", {
        tax_id: company.tax_id,
        name,
        description,
      });
      router.push(`/workspaces/${w.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "建立失敗");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PageTop />
      <p className="mt-8 text-sm text-slate-500">
        <Link href="/welcome" className="hover:text-brand-700 hover:underline">
          我的工作區
        </Link>
        <span className="mx-2">›</span>建立工作區
      </p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">建立公司工作區</h1>
      <p className="mt-1 text-sm text-slate-600">為公司建立一個共用空間，同事加入後可以一起看專案。建立的人會成為管理者。</p>

      {account === null && (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          請先
          <Link href="/login" className="mx-1 font-medium text-brand-600 hover:underline">
            登入
          </Link>
          再建立工作區。
        </p>
      )}

      {account && (
        <>
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
            <SectionTitle icon={Building2}>1. 查詢你的公司</SectionTitle>
            <p className="mt-1 text-sm text-slate-500">輸入統一編號，帶入公司登記資料。一個統編只能建立一個工作區。</p>
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
                disabled={busy}
                className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {busy && !company ? "查詢中…" : "查詢公司"}
              </button>
            </form>
            <p className="mt-3 text-sm text-slate-500">
              只是想試試看？
              <button
                type="button"
                onClick={() => lookup(DEMO_CODE)}
                className="ml-1 font-medium text-brand-600 hover:underline"
              >
                使用示範公司「小名 3C 網店」
              </button>
            </p>
          </section>

          {company && (
            <div className="mt-6 space-y-4">
              <CompanyCard company={company} />
              <section className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
                <SectionTitle icon={Building2}>2. 確認並建立</SectionTitle>
                <form
                  className="mt-4 space-y-4 text-sm"
                  onSubmit={(e) => {
                    e.preventDefault();
                    create();
                  }}
                >
                  <label className="block">
                    <span className="font-medium text-slate-700">工作區名稱</span>
                    <input required value={name} onChange={(e) => setName(e.target.value)} className={input} />
                    <span className="mt-1 block text-xs text-slate-500">同事會在工作區清單看到這個名稱。</span>
                  </label>
                  <label className="block">
                    <span className="font-medium text-slate-700">
                      實際經營內容<span className="font-normal text-slate-500">（選填）</span>
                    </span>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      maxLength={4000}
                      placeholder="例如：經營 3C 與小家電網路零售，主要透過電商平台接單，提供商品諮詢與售後服務。"
                      className={input}
                    />
                  </label>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                    >
                      {busy ? "建立中…" : "建立工作區"}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          )}
          {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </>
      )}
    </main>
  );
}
