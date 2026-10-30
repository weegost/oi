"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, FolderOpen, Mail, Plus, Trash2, Users, X } from "lucide-react";
import CompanyCard from "@/components/CompanyCard";
import PageTop from "@/components/PageTop";
import { useAccount } from "@/lib/account";
import { apiDelete, apiGet, apiSend } from "@/lib/api";
import type { Company, WorkspaceDetail } from "@/lib/types";

type ProjectSummary = { id: number; name: string; work: string; progress: number; steps: number; updated_at: string };
type Tab = "projects" | "members" | "company";

const ROLE = { ADMIN: "管理者", MEMBER: "成員" } as const;
// progress 0 表示剛建立、還在第一階段
const STAGE = ["現況流程建模", "現況流程建模", "AI 介入探索", "情境沙盒測試", "需求草案產出"];
const TABS: { key: Tab; label: string; icon: typeof FolderOpen }[] = [
  { key: "projects", label: "探索專案", icon: FolderOpen },
  { key: "members", label: "成員", icon: Users },
  { key: "company", label: "公司背景", icon: Building2 },
];
const card = "rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm";
const primary =
  "inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700";

/** 公司工作區：探索專案、成員、公司背景三個分頁；管理者可以邀請同事、刪除專案 */
export default function WorkspaceView() {
  const { id } = useParams<{ id: string }>();
  const tabParam = useSearchParams().get("tab");
  const tab: Tab = tabParam === "members" || tabParam === "company" ? tabParam : "projects";
  const account = useAccount();
  const [ws, setWs] = useState<WorkspaceDetail | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      apiGet<WorkspaceDetail>(`/api/workspaces/${id}`),
      apiGet<ProjectSummary[]>(`/api/projects?workspace_id=${id}`),
    ])
      .then(([w, p]) => {
        setWs(w);
        setProjects(p);
        return apiGet<Company>(`/api/companies/${w.tax_id}`).then(setCompany);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (account) load();
  }, [account, load]);

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    setNotice(null);
    const sent = email;
    if (await run(() => apiSend("POST", `/api/workspaces/${id}/invitations`, { email: sent }), "邀請失敗")) {
      setNotice(`已邀請 ${sent}。對方用這個 Email 登入後，在「我的工作區」接受即可加入。`);
      setEmail("");
    }
  };

  const remove = async (projectId: number) => {
    if (await run(() => apiDelete(`/api/projects/${projectId}`), "暫時無法刪除專案。")) setRemoving(null);
  };

  const admin = ws?.role === "ADMIN";
  const newProjectUrl = `/projects/new?workspace=${id}`;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PageTop />
      <Link href="/welcome" className="mt-8 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
        <ArrowLeft aria-hidden className="h-4 w-4" />
        我的工作區
      </Link>

      {account === null && (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          請先
          <Link href="/login" className="mx-1 font-medium text-brand-600 hover:underline">
            登入
          </Link>
          才能查看工作區。
        </p>
      )}
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {ws && (
        <>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{ws.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>統編 {ws.tax_id}</span>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-brand-700">{ROLE[ws.role]}</span>
            {company?.registration_type === "demo" && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">示範資料</span>
            )}
          </p>

          <nav className="mt-6 flex gap-1 border-b border-slate-200" aria-label="工作區分頁">
            {TABS.map(({ key, label, icon: Icon }) => (
              <Link
                key={key}
                href={key === "projects" ? `/workspaces/${id}` : `/workspaces/${id}?tab=${key}`}
                replace
                scroll={false}
                aria-current={tab === key ? "page" : undefined}
                className={
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium " +
                  (tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-900")
                }
              >
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>

          {tab === "projects" && (
            <section className={card + " mt-6"}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">探索專案</h2>
                {projects.length > 0 && (
                  <Link href={newProjectUrl} className={primary}>
                    <Plus aria-hidden className="h-4 w-4" />
                    建立探索專案
                  </Link>
                )}
              </div>
              {projects.length === 0 ? (
                <div className="py-10 text-center">
                  <FolderOpen aria-hidden className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-2 font-medium">尚未建立探索專案</p>
                  <p className="mt-1 text-sm text-slate-500">選一項想改善的工作，開始團隊的第一次探索。</p>
                  <Link href={newProjectUrl} className={primary + " mt-4"}>
                    <Plus aria-hidden className="h-4 w-4" />
                    建立探索專案
                  </Link>
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {projects.map((p) => (
                    <li key={p.id} className="py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/projects/${p.id}${p.progress >= 4 ? "/report" : ""}`}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 hover:text-brand-700"
                        >
                          <FolderOpen aria-hidden className="h-5 w-5 shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{p.name}</span>
                            {p.work && <span className="block text-sm text-slate-500">{p.work}</span>}
                            <span className="mt-1 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-brand-700">
                              {STAGE[p.progress]}
                            </span>
                          </span>
                          <time dateTime={p.updated_at} className="shrink-0 text-xs text-slate-500">
                            {new Date(p.updated_at).toLocaleDateString("zh-TW")}
                          </time>
                          <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
                        </Link>
                        {admin && (
                          <button
                            onClick={() => setRemoving(removing === p.id ? null : p.id)}
                            aria-label={`刪除「${p.name}」`}
                            title="刪除專案"
                            className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 aria-hidden className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {admin && removing === p.id && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-3 text-sm">
                          <p className="mr-auto text-red-800">刪除「{p.name}」之後就救不回來了，確定要刪除嗎？</p>
                          <button
                            disabled={busy}
                            onClick={() => remove(p.id)}
                            className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-60"
                          >
                            {busy ? "刪除中…" : "確定刪除"}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => setRemoving(null)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
                          >
                            取消
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "members" && (
            <section className={card + " mt-6"}>
              <h2 className="text-lg font-semibold">成員（{ws.member_count}）</h2>
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {ws.members.map((m) => (
                  <li key={m.account_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span>
                      <span className="font-medium">{m.display_name || m.email}</span>
                      <span className="ml-2 text-slate-500">{m.email}</span>
                    </span>
                    <span className="text-xs text-slate-500">{ROLE[m.role]}</span>
                  </li>
                ))}
              </ul>

              {admin && (
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Mail aria-hidden className="h-4 w-4 text-brand-600" />
                    邀請同事
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    不會寄出郵件；同事用這個 Email 註冊或登入後，會在「我的工作區」看到邀請。
                  </p>
                  <form
                    className="mt-3 flex flex-col gap-2 sm:flex-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      invite();
                    }}
                  >
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="同事的 Email"
                      aria-label="同事的 Email"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:max-w-xs"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                    >
                      送出邀請
                    </button>
                  </form>
                  {notice && <p className="mt-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{notice}</p>}
                  {ws.invitations.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm">
                      {ws.invitations.map((inv) => (
                        <li key={inv.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                          <span className="text-slate-700">
                            {inv.email}
                            <span className="ml-2 text-xs text-slate-500">等待回覆</span>
                          </span>
                          <button
                            onClick={() => run(() => apiDelete(`/api/workspaces/${id}/invitations/${inv.id}`), "取消失敗")}
                            aria-label={`取消邀請 ${inv.email}`}
                            title="取消邀請"
                            className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                          >
                            <X aria-hidden className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}

          {tab === "company" && (
            <div className="mt-6 space-y-4">
              {company && <CompanyCard company={company} />}
              <section className={card}>
                <h2 className="text-lg font-semibold">實際經營內容</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                  {ws.description || "建立工作區時沒有填寫。"}
                </p>
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
