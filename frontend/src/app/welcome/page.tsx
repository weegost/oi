"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Building2, Mail, Plus, Users } from "lucide-react";
import PageTop from "@/components/PageTop";
import { useAccount } from "@/lib/account";
import { apiGet, apiSend } from "@/lib/api";
import type { Invitation, WorkspaceSummary } from "@/lib/types";

const ROLE = { ADMIN: "管理者", MEMBER: "成員" } as const;

/** 我的工作區：已加入的公司工作區，以及寄給我、還沒回覆的邀請 */
export default function WelcomePage() {
  const account = useAccount();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      apiGet<WorkspaceSummary[]>("/api/workspaces"),
      apiGet<Invitation[]>("/api/workspaces/invitations/mine"),
    ])
      .then(([w, i]) => {
        setWorkspaces(w);
        setInvitations(i);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (account) load();
  }, [account, load]);

  const respond = async (id: number, action: "accept" | "decline") => {
    setError(null);
    try {
      await apiSend("POST", `/api/workspaces/invitations/${id}/${action}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗");
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PageTop />

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">我的工作區</h1>
          <p className="mt-1 text-sm text-slate-600">選擇公司，繼續團隊的探索與協作。</p>
        </div>
        {account && (
          <Link
            href="/workspaces/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
          >
            <Plus aria-hidden className="h-4 w-4" />
            建立工作區
          </Link>
        )}
      </div>

      {account === null && (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          請先
          <Link href="/login" className="mx-1 font-medium text-brand-600 hover:underline">
            登入
          </Link>
          才能查看你的公司工作區。
        </p>
      )}
      {error && <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {invitations.length > 0 && (
        <section className="mt-6 rounded-2xl border border-brand-200 bg-brand-50 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Mail aria-hidden className="h-4 w-4 text-brand-600" />
            待接受的邀請
          </h2>
          <ul className="mt-3 space-y-2">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <p className="text-sm text-slate-700">
                  {inv.invited_by || "管理者"} 邀請你加入
                  <span className="mx-1 font-semibold text-slate-900">{inv.workspace_name}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => respond(inv.id, "decline")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                  >
                    婉拒
                  </button>
                  <button
                    onClick={() => respond(inv.id, "accept")}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    接受並加入
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {account && workspaces?.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Building2 aria-hidden className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 font-medium text-slate-900">還沒有公司工作區</p>
          <p className="mt-1 text-sm text-slate-500">
            建立公司的共用空間，或請公司管理者用你的 Email（{account.username}）邀請你加入。
          </p>
          <Link
            href="/workspaces/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
          >
            <Plus aria-hidden className="h-4 w-4" />
            建立工作區
          </Link>
        </div>
      )}

      {workspaces && workspaces.length > 0 && (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {workspaces.map((w) => (
            <li key={w.id}>
              <Link
                href={`/workspaces/${w.id}`}
                className="block h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-400"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{w.company_name}</p>
                    <h2 className="truncate text-lg font-semibold text-slate-900">{w.name}</h2>
                  </div>
                  <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700">{ROLE[w.role]}</span>
                </div>
                <p className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Users aria-hidden className="h-3.5 w-3.5" />
                    {w.member_count} 位成員
                  </span>
                  <span>{w.project_count} 個專案</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
