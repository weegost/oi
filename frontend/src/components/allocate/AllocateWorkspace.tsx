"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ExplorePanel from "@/components/allocate/ExplorePanel";
import FlowCanvas, { type Selection } from "@/components/flow/FlowCanvas";
import ProjectHeader from "@/components/ProjectHeader";
import { apiGet, apiSend } from "@/lib/api";
import { autoLayout } from "@/lib/layout";
import { MODE_LABEL, MODE_STYLE, type Mode, type Project } from "@/lib/types";

const MODES: Mode[] = ["human", "assist", "review", "auto"];

export default function AllocateWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [exploring, setExploring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Project>(`/api/projects/${id}`).then(setProject).catch((e) => setError(e.message));
  }, [id]);

  // 節點多了分工標籤，以較高的節點重新排列，避免重疊
  const flow = useMemo(() => (project ? autoLayout(project.flow, 104) : { nodes: [], edges: [] }), [project]);
  const tasks = flow.nodes.filter((n) => n.kind !== "start" && n.kind !== "end");
  const allocs = project?.allocations ?? {};
  const modeOf = (nodeId: string): Mode => allocs[nodeId]?.mode ?? "human";

  const badges = useMemo(() => {
    const a = project?.allocations ?? {};
    return Object.fromEntries(
      flow.nodes.map((n) => {
        const m = a[n.id]?.mode ?? "human";
        return [n.id, { label: MODE_LABEL[m], cls: MODE_STYLE[m] }];
      }),
    );
  }, [project, flow]);

  const call = async (fn: () => Promise<Project>) => {
    setError(null);
    try {
      setProject(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗");
    }
  };

  const explore = async (nodeId: string) => {
    setExploring(nodeId);
    await call(() => apiSend<Project>("POST", `/api/projects/${id}/nodes/${nodeId}/explore`));
    setExploring(null);
  };

  const choose = (nodeId: string, mode: Mode) =>
    call(() => apiSend<Project>("PUT", `/api/projects/${id}/allocations/${nodeId}`, { mode }));

  const applyRecommended = async () => {
    for (const n of tasks) {
      const rec = allocs[n.id]?.exploration?.recommended;
      if (rec && rec !== modeOf(n.id)) await choose(n.id, rec);
    }
  };

  if (!project) return <main className="p-8 text-slate-600">{error ?? "載入中…"}</main>;

  const selected = selection?.type === "node" ? tasks.find((n) => n.id === selection.id) : undefined;
  const explored = tasks.filter((n) => allocs[n.id]?.exploration).length;
  const pending = tasks.filter((n) => n.status !== "confirmed").length;

  return (
    <main className="flex h-screen flex-col">
      <ProjectHeader project={project} stage={1} />

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <Link href={`/projects/${id}`} className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50">
          ← 回流程建模
        </Link>
        <span className="ml-2 text-slate-500">已分析 {explored}/{tasks.length} 步</span>
        <span className="flex flex-wrap gap-1">
          {MODES.map((m) => {
            const count = tasks.filter((n) => modeOf(n.id) === m).length;
            return count ? (
              <span key={m} className={"rounded border px-1.5 text-xs " + MODE_STYLE[m]}>
                {MODE_LABEL[m]} {count}
              </span>
            ) : null;
          })}
        </span>
        <button
          onClick={applyRecommended}
          disabled={!explored}
          className="ml-auto rounded-md border border-brand-300 px-3 py-1 text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          全部套用 AI 建議
        </button>
        <Link
          href={`/projects/${id}/sandbox`}
          className="rounded-md bg-brand-600 px-3 py-1 font-medium text-white hover:bg-brand-700"
        >
          下一步：情境沙盒測試 →
        </Link>
      </div>

      {pending > 0 && (
        <p className="bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          還有 {pending} 個步驟未確認。分工建議以目前流程為準，流程改變後建議重新分析。
        </p>
      )}
      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="shrink-0 overflow-y-auto border-b border-slate-200 bg-white lg:w-64 lg:border-r lg:border-b-0">
          <ul className="divide-y divide-slate-100 text-sm">
            {tasks.map((n) => {
              const a = allocs[n.id];
              return (
                <li key={n.id}>
                  <button
                    onClick={() => setSelection({ type: "node", id: n.id })}
                    className={
                      "w-full px-4 py-2.5 text-left hover:bg-slate-50 " +
                      (selected?.id === n.id ? "bg-brand-50" : "")
                    }
                  >
                    <span className="block truncate font-medium">{n.title}</span>
                    <span className="mt-1 flex items-center gap-2 text-xs">
                      <span className={"rounded border px-1.5 " + MODE_STYLE[modeOf(n.id)]}>{MODE_LABEL[modeOf(n.id)]}</span>
                      <span className="text-slate-400">
                        {exploring === n.id ? "分析中…" : a?.exploration ? "已分析" : "未分析"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <section className="relative min-h-[420px] flex-1 bg-slate-50">
          <FlowCanvas
            flow={flow}
            gaps={[]}
            selection={selection}
            onChange={() => {}}
            onSelect={(s) => setSelection(s?.type === "node" && tasks.some((n) => n.id === s.id) ? s : null)}
            readOnly
            badges={badges}
          />
        </section>
        <aside className="shrink-0 overflow-y-auto border-t border-slate-200 bg-white lg:w-[420px] lg:border-t-0 lg:border-l">
          {selected ? (
            <ExplorePanel
              node={selected}
              allocation={allocs[selected.id]}
              exploring={exploring === selected.id}
              onExplore={() => explore(selected.id)}
              onChoose={(mode) => choose(selected.id, mode)}
            />
          ) : (
            <div className="p-4 text-sm text-slate-600">
              <p>點選左側清單或流程圖上的步驟，探索 AI 可以怎麼協助。</p>
              <p className="mt-2">
                每一步都可以比較四種分工：人工執行、AI 輔助、AI 執行後人工確認、AI 自動執行。
                系統會標出高風險步驟，避免把 AI 導入誤解為全面自動化。
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
