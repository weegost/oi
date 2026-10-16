"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatPanel, { type Mode } from "@/components/flow/ChatPanel";
import DetailPanel from "@/components/flow/DetailPanel";
import FlowCanvas, { type Selection } from "@/components/flow/FlowCanvas";
import ProjectHeader from "@/components/ProjectHeader";
import { apiGet, apiSend } from "@/lib/api";
import { findGaps } from "@/lib/gaps";
import { autoLayout, ensureLayout } from "@/lib/layout";
import type { Flow, FlowNode, Project } from "@/lib/types";

type SaveState = "saved" | "dirty" | "saving" | "error";

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [flow, setFlow] = useState<Flow>({ nodes: [], edges: [] });
  const [selection, setSelection] = useState<Selection>(null);
  const [mode, setMode] = useState<Mode>("direct");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  // 版本號：每次本地編輯 +1，用來判斷自動儲存期間是否又有新的編輯
  const edits = useRef(0);

  const gaps = useMemo(() => findGaps(flow), [flow]);

  const persist = useCallback(
    async (next: Flow) => {
      const version = edits.current;
      setSave("saving");
      try {
        await apiSend("PUT", `/api/projects/${id}/flow`, next);
        if (version === edits.current) setSave("saved");
      } catch {
        setSave("error");
      }
    },
    [id],
  );

  const applyServer = useCallback(
    (p: Project) => {
      setProject(p);
      const laid = ensureLayout(p.flow);
      setFlow(laid);
      // Agent 新增的節點剛排好位置，存回去避免下次重排
      if (laid !== p.flow) persist(laid);
    },
    [persist],
  );

  useEffect(() => {
    apiGet<Project>(`/api/projects/${id}`).then(applyServer).catch((e) => setError(e.message));
  }, [id, applyServer]);

  // 編輯後 1 秒自動儲存
  useEffect(() => {
    if (save !== "dirty") return;
    const t = setTimeout(() => persist(flow), 1000);
    return () => clearTimeout(t);
  }, [flow, save, persist]);

  const edit = (next: Flow) => {
    edits.current += 1;
    setFlow(next);
    setSave("dirty");
  };

  const chat = async (nextMode: Mode, message: string) => {
    setBusy(true);
    setError(null);
    if (message) {
      // 先讓使用者看到自己的訊息
      setProject((p) => p && { ...p, messages: [...p.messages, { role: "user", mode: nextMode, text: message }] });
    }
    try {
      if (save !== "saved") await persist(flow); // Agent 要看到企業剛剛的手動修改
      applyServer(await apiSend<Project>("POST", `/api/projects/${id}/chat`, { mode: nextMode, message }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 暫時無法回應");
      // 移除畫面上先顯示的使用者訊息；後端也連不上時保留目前畫面，錯誤訊息已顯示
      apiGet<Project>(`/api/projects/${id}`)
        .then(setProject)
        .catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => {
    if (m === mode || busy) return;
    setMode(m);
    // 切到 AI 引導時，請 Agent 依目前缺口主動提出第一個問題
    if (m === "guided") chat("guided", "");
  };

  const addNode = () => {
    const n: FlowNode = {
      id: `m${Date.now().toString(36)}`,
      kind: "process",
      title: "新步驟",
      role: "",
      system: "",
      data: "",
      condition: "",
      description: "",
      output: "",
      exceptions: "",
      status: "pending",
      source: "企業描述",
      x: 40,
      y: 40,
    };
    edit({ ...flow, nodes: [...flow.nodes, n] });
    setSelection({ type: "node", id: n.id });
  };

  if (!project) {
    return <main className="p-8 text-slate-600">{error ?? "載入中…"}</main>;
  }

  const confirmed = flow.nodes.filter((n) => n.status === "confirmed" && !["start", "end"].includes(n.kind)).length;
  const tasks = flow.nodes.filter((n) => !["start", "end"].includes(n.kind)).length;

  return (
    <main className="flex h-screen flex-col">
      <ProjectHeader project={project} stage={0} />

      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <button onClick={addNode} className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50">
          ＋ 新增步驟
        </button>
        <button
          onClick={() => edit(autoLayout(flow))}
          disabled={!flow.nodes.length}
          className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
        >
          自動排列
        </button>
        <span className="ml-2 text-slate-500">
          已確認 {confirmed}/{tasks} 步 · 待補 {gaps.length} 項
        </span>
        <span className="ml-auto text-xs text-slate-400">
          {{ saved: "已儲存", dirty: "編輯中…", saving: "儲存中…", error: "儲存失敗，請檢查後端連線" }[save]}
        </span>
        <button
          disabled={!tasks}
          onClick={async () => {
            if (save !== "saved") await persist(flow); // 離開前先存好手動修改
            router.push(`/projects/${id}/allocate`);
          }}
          className="rounded-md bg-brand-600 px-3 py-1 font-medium text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-500"
        >
          下一步：AI 介入探索 →
        </button>
      </div>

      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="h-80 shrink-0 border-b border-slate-200 bg-white lg:h-auto lg:w-80 lg:border-r lg:border-b-0">
          <ChatPanel
            messages={project.messages}
            mode={mode}
            busy={busy}
            onModeChange={switchMode}
            onSend={(text) => chat(mode, text)}
          />
        </aside>
        <section className="relative min-h-[420px] flex-1 bg-slate-50">
          {flow.nodes.length === 0 && (
            <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-slate-400">
              在左側描述工作，流程圖會出現在這裡
            </p>
          )}
          <FlowCanvas flow={flow} gaps={gaps} selection={selection} onChange={edit} onSelect={setSelection} />
        </section>
        <aside className="shrink-0 overflow-y-auto border-t border-slate-200 bg-white lg:w-80 lg:border-t-0 lg:border-l">
          <DetailPanel flow={flow} gaps={gaps} selection={selection} onChange={edit} onSelect={setSelection} />
        </aside>
      </div>
    </main>
  );
}
