"use client";

import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import SectionTitle from "@/components/SectionTitle";
import { useAccount } from "@/lib/account";
import { apiSend } from "@/lib/api";
import type { Company, Project } from "@/lib/types";

const FIELDS = [
  { key: "name", label: "專案名稱", placeholder: "例如：退貨客服流程改善", required: true },
  { key: "work", label: "想改善的工作", placeholder: "例如：處理客戶退貨申請", required: true },
  { key: "problem", label: "目前遇到的問題", placeholder: "例如：客服要反覆查訂單和退貨政策，回覆很慢", multiline: true },
  { key: "scope", label: "分析範圍", placeholder: "例如：從收到客戶訊息到回覆客戶", multiline: true },
] as const;

type FormKey = (typeof FIELDS)[number]["key"];

/** company 為 null 時代表沒查統編，改由使用者自填公司名稱（選填）；
 *  workspaceId 有值時，專案建在該公司工作區，成員共用 */
export default function ProjectForm({ company, workspaceId }: { company: Company | null; workspaceId?: number }) {
  const demoQuery = (full: boolean) =>
    "?" + new URLSearchParams({ ...(full && { full: "true" }), ...(workspaceId && { workspace_id: String(workspaceId) }) });
  const router = useRouter();
  const [form, setForm] = useState<Record<FormKey, string>>({ name: "", work: "", problem: "", scope: "" });
  const account = useAccount();
  const [companyName, setCompanyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (create: () => Promise<Project>) => {
    setBusy(true);
    setError(null);
    try {
      const p = await create();
      router.push(`/projects/${p.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "建立失敗");
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
      <SectionTitle icon={ClipboardList}>建立改善專案</SectionTitle>
      <p className="mt-1 text-sm text-slate-500">
        先選一項想改善的工作。這些內容會成為流程 Agent 整理與追問時的背景。
      </p>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          go(() =>
            apiSend<Project>(
              "POST",
              "/api/projects",
              workspaceId
                ? { workspace_id: workspaceId, ...form }
                : company
                ? { tax_id: company.tax_id, ...form }
                : { company_name: companyName || account?.display_name || "", ...form },
            ),
          );
        }}
      >
        {!company && (
          <label className="text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">
              公司名稱<span className="font-normal text-slate-500">（選填）</span>
            </span>
            <input
              value={companyName}
              placeholder={account?.display_name ? `沒填會用「${account.display_name}」` : "沒填會顯示「我的公司」"}
              onChange={(e) => setCompanyName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        )}
        {FIELDS.map((f) => (
          <label key={f.key} className={"text-sm " + ("multiline" in f ? "sm:col-span-2" : "")}>
            <span className="font-medium text-slate-700">
              {f.label}
              {"required" in f && <span className="text-red-500"> *</span>}
            </span>
            {"multiline" in f ? (
              <textarea
                rows={2}
                value={form[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            ) : (
              <input
                required={"required" in f}
                value={form[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            )}
          </label>
        ))}
        <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2">
          {company?.registration_type === "demo" && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => go(() => apiSend<Project>("POST", "/api/projects/demo" + demoQuery(false)))}
                className="rounded-lg border border-brand-200 px-4 py-2.5 font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                title="從第一階段開始，現場示範 AI 引導補齊流程"
              >
                載入示範流程
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => go(() => apiSend<Project>("POST", "/api/projects/demo" + demoQuery(true)))}
                className="rounded-lg border border-brand-200 px-4 py-2.5 font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                title="四個階段都已完成，含預存的 AI 分析與摘要，不需等待 AI"
              >
                載入完整示範（四階段）
              </button>
            </>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "建立中…" : "開始建立現況流程 →"}
          </button>
        </div>
        {account === null && (
          <p className="text-right text-xs text-slate-500 sm:col-span-2">
            目前未登入：這次的分析不會保存，之後無法回來查看。
            <Link href="/login" className="ml-1 font-medium text-brand-600 hover:underline">
              登入或註冊
            </Link>
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{error}</p>}
      </form>
    </section>
  );
}
