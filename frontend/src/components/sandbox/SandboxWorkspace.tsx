"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ProjectHeader from "@/components/ProjectHeader";
import CaseCard from "@/components/sandbox/CaseCard";
import OpenDataPanel from "@/components/sandbox/OpenDataPanel";
import { apiGet, apiSend } from "@/lib/api";
import type { Project, SandboxState } from "@/lib/types";

const GAP_STYLE: Record<string, string> = {
  資料不足: "bg-sky-100 text-sky-800",
  系統介接: "bg-violet-100 text-violet-800",
  操作權限: "bg-orange-100 text-orange-800",
  人工接管: "bg-red-100 text-red-800",
  流程缺口: "bg-slate-200 text-slate-800",
};

export default function SandboxWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<SandboxState | null>(null);
  const [config, setConfig] = useState<Record<string, boolean>>({});
  const [scenarios, setScenarios] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiGet<Project>(`/api/projects/${id}`), apiGet<SandboxState>(`/api/projects/${id}/sandbox`)])
      .then(([p, s]) => {
        setProject(p);
        setState(s);
        setConfig(s.config);
        setScenarios(s.selected_scenarios);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setState(await apiSend<SandboxState>("POST", `/api/projects/${id}/sandbox/run`, { config, scenarios }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "測試失敗");
    } finally {
      setRunning(false);
    }
  };

  if (!project || !state) return <main className="p-8 text-slate-600">{error ?? "載入中…"}</main>;

  const aiSteps = Object.values(project.allocations).filter((a) => a.mode !== "human").length;
  const changed = state.run > 0 && JSON.stringify(config) !== JSON.stringify(state.config);

  return (
    <main className="flex h-screen flex-col">
      <ProjectHeader project={project} stage={2} />

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <Link href={`/projects/${id}/allocate`} className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50">
          ← 調整人機分工
        </Link>
        <span className="ml-2 text-slate-500">
          {state.run ? `第 ${state.run} 次測試 · ${new Date(state.ran_at!).toLocaleString("zh-TW")}` : "尚未測試"}
        </span>
        <Link
          href={`/projects/${id}/report`}
          className="ml-auto rounded-md bg-brand-600 px-3 py-1 font-medium text-white hover:bg-brand-700"
        >
          下一步：需求草案產出 →
        </Link>
      </div>

      {aiSteps === 0 && (
        <p className="bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          目前所有步驟都是人工執行。先到「AI 介入探索」為步驟選擇 AI 分工，測試才會檢查 AI 需要的條件。
        </p>
      )}
      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="shrink-0 overflow-y-auto border-b border-slate-200 bg-white lg:w-72 lg:border-r lg:border-b-0">
          <section className="space-y-2 p-4 text-sm">
            <h3 className="font-semibold">導入準備條件</h3>
            <p className="text-xs text-slate-500">勾選代表「假設已準備好」，不會真的開通權限。</p>
            {Object.entries(state.conditions).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 accent-brand-600"
                  checked={!!config[key]}
                  onChange={(e) => setConfig({ ...config, [key]: e.target.checked })}
                />
                <span>{label}</span>
              </label>
            ))}
          </section>
          <section className="border-t border-slate-100 p-4 text-sm">
            <h3 className="font-semibold">測試情境</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {state.scenarios.map((s) => {
                const on = scenarios.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => setScenarios(on ? scenarios.filter((x) => x !== s) : [...scenarios, s])}
                    className={
                      "rounded-full border px-2.5 py-0.5 text-xs " +
                      (on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-600")
                    }
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-400">{scenarios.length ? `只測 ${scenarios.join("、")}` : "全部情境"}</p>
            <button
              onClick={run}
              disabled={running}
              className="mt-3 w-full rounded-lg bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {running ? "測試中…" : state.run ? "重新測試" : "執行情境測試"}
            </button>
            {changed && <p className="mt-1 text-xs text-amber-700">條件已變更，重新測試後才會反映。</p>}
          </section>
          <div className="border-t border-slate-100">
            <OpenDataPanel />
          </div>
        </aside>

        <section className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
          {state.results.length === 0 ? (
            <div className="mx-auto mt-16 max-w-md text-center text-slate-500">
              <p className="text-lg font-medium text-slate-700">把人機分工放進實際情境測試</p>
              <p className="mt-2 text-sm">
                系統會用客服、退貨、物流延誤、消費爭議等案例，搭配模擬訂單與退款系統、政府開放資料，
                檢查目前的分工還缺哪些資料、權限與人工接管條件。
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-3">
              {state.results.map((r) => (
                <CaseCard key={r.id} result={r} />
              ))}
            </div>
          )}
        </section>

        {state.summary && (
          <aside className="shrink-0 overflow-y-auto border-t border-slate-200 bg-white p-4 text-sm lg:w-80 lg:border-t-0 lg:border-l">
            <h3 className="font-semibold">測試結果</h3>
            <ul className="mt-2 space-y-1">
              {Object.entries(state.summary.dispositions).map(([d, n]) => (
                <li key={d} className="flex justify-between">
                  <span>{d}</span>
                  <span className="font-semibold">{n} 件</span>
                </li>
              ))}
            </ul>
            <h3 className="mt-5 font-semibold">尚未具備的導入條件（{state.summary.gaps.length}）</h3>
            {state.summary.gaps.length === 0 ? (
              <p className="mt-2 text-emerald-700">目前分工在所有測試案例中都具備執行條件。</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {state.summary.gaps.map((g, i) => (
                  <li key={i}>
                    <span className={"rounded px-1.5 text-xs " + (GAP_STYLE[g.type] ?? "bg-slate-100")}>{g.type}</span>
                    <p className="mt-1">{g.issue}</p>
                    <p className="text-xs text-slate-500">影響 {g.cases.length} 個案例</p>
                    {g.condition && !config[g.condition] && (
                      <button
                        onClick={() => setConfig({ ...config, [g.condition!]: true })}
                        className="mt-1 text-xs text-brand-600 hover:underline"
                      >
                        假設已補上「{state.conditions[g.condition]}」
                      </button>
                    )}
                    {!g.condition && (
                      <Link href={`/projects/${id}${g.type === "流程缺口" ? "" : "/allocate"}`} className="mt-1 block text-xs text-brand-600 hover:underline">
                        {g.type === "流程缺口" ? "回流程建模調整 →" : "回去調整分工 →"}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
