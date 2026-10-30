"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, LayoutGrid, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import DocumentsDrawer from "@/components/docs/DocumentsDrawer";
import ChatPanel from "@/components/flow/ChatPanel";
import DetailPanel from "@/components/flow/DetailPanel";
import FlowCanvas, { type Selection } from "@/components/flow/FlowCanvas";
import GapHint from "@/components/flow/GapHint";
import ProjectHeader from "@/components/ProjectHeader";
import { apiGet, apiSend } from "@/lib/api";
import { findGaps } from "@/lib/gaps";
import { autoLayout, ensureLayout } from "@/lib/layout";
import type { CompanyDocument, Flow, FlowNode, Project } from "@/lib/types";

type SaveState = "saved" | "dirty" | "saving" | "error";

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [flow, setFlow] = useState<Flow>({ nodes: [], edges: [] });
  const [selection, setSelection] = useState<Selection>(null);
  const [busy, setBusy] = useState(false);
  // AI 剛改到的步驟，在流程圖上標示幾秒，讓人看得出對話後哪裡變了
  const [updated, setUpdated] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [chatOpen, setChatOpen] = useState(true);
  const [fitKey, setFitKey] = useState(0);
  const [docs, setDocs] = useState<CompanyDocument[]>([]);
  const [docsOpen, setDocsOpen] = useState(false);
  // 版本號：每次本地編輯 +1，用來判斷自動儲存期間是否又有新的編輯
  const edits = useRef(0);
  // 新專案只請 AI 開場提問一次（開發模式下 effect 會執行兩次）
  const opened = useRef(false);

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

  const taxId = project?.tax_id;
  useEffect(() => {
    if (!taxId) return;
    apiGet<CompanyDocument[]>(`/api/companies/${taxId}/documents`)
      .then(setDocs)
      .catch(() => {}); // 文件清單載入失敗不影響流程建模
  }, [taxId]);

  // 「剛更新」標示 6 秒後自動消失
  useEffect(() => {
    if (!updated.length) return;
    const t = setTimeout(() => setUpdated([]), 6000);
    return () => clearTimeout(t);
  }, [updated]);

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

  // 一律用 AI 引導：企業說的話（一句或一大段）都會先整理進流程，再追問一個還缺的地方
  const chat = async (message: string) => {
    setBusy(true);
    setError(null);
    if (message) {
      // 先讓使用者看到自己的訊息
      setProject((p) => p && { ...p, messages: [...p.messages, { role: "user", mode: "guided", text: message }] });
    }
    try {
      if (save !== "saved") await persist(flow); // Agent 要看到企業剛剛的手動修改
      const before = flow;
      const p = await apiSend<Project>("POST", `/api/projects/${id}/chat`, { mode: "guided", message });
      applyServer(p);
      setUpdated(changedNodeIds(before, p.flow));
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

  // 剛建立、還沒有任何對話與流程的專案：AI 先開口問第一題，使用者不用想從哪裡說起
  const fresh = project !== null && project.messages.length === 0 && project.flow.nodes.length === 0;
  useEffect(() => {
    if (!fresh || opened.current) return;
    opened.current = true;
    chat("");
    // chat 每次 render 都是新函式，這裡只在專案載入後判斷一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);

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
      <ProjectHeader project={project} stage={0} lockAhead={!tasks || gaps.length > 0} />

      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <button
          onClick={() => {
            setChatOpen(!chatOpen);
            setFitKey((k) => k + 1); // 畫布寬度改變後重新縮放
          }}
          aria-label={chatOpen ? "收合對話" : "展開對話"}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-50"
        >
          {chatOpen ? <PanelLeftClose aria-hidden className="h-4 w-4" /> : <PanelLeftOpen aria-hidden className="h-4 w-4" />}
          {chatOpen ? "收合對話" : "展開對話"}
        </button>
        <button onClick={addNode} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50">
          <Plus aria-hidden className="h-4 w-4" />
          新增步驟
        </button>
        <button
          onClick={() => {
            edit(autoLayout(flow));
            setFitKey((k) => k + 1);
          }}
          disabled={!flow.nodes.length}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
        >
          <LayoutGrid aria-hidden className="h-4 w-4" />
          自動排列
        </button>
        <button
          onClick={() => setDocsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50"
        >
          <FileText aria-hidden className="h-4 w-4" />
          企業文件（{docs.length}）
        </button>
        <span className="ml-2 text-slate-500">
          已確認 {confirmed}/{tasks} 步 · 待補 {gaps.length} 項
        </span>
        <span className="ml-auto text-xs text-slate-400">
          {{ saved: "已儲存", dirty: "編輯中…", saving: "儲存中…", error: "儲存失敗，請檢查後端連線" }[save]}
        </span>
        {/* 尚待補充的項目全部補完，才能進入下一步 */}
        <button
          disabled={!tasks || gaps.length > 0}
          onClick={async () => {
            if (save !== "saved") await persist(flow); // 離開前先存好手動修改
            router.push(`/projects/${id}/allocate`);
          }}
          className="rounded-md bg-brand-600 px-3 py-1 font-medium text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-500"
        >
          {tasks && gaps.length > 0 ? `還有 ${gaps.length} 項待補，補完才能下一步` : "下一步：AI 介入探索 →"}
        </button>
      </div>

      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {chatOpen && (
          <aside className="h-80 shrink-0 border-b border-slate-200 bg-white lg:h-auto lg:w-80 lg:border-r lg:border-b-0">
            <ChatPanel messages={project.messages} busy={busy} onSend={chat} />
          </aside>
        )}
        <section className="relative min-h-[420px] flex-1 bg-slate-50">
          {flow.nodes.length === 0 ? (
            <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-slate-400">
              在左側描述工作，流程圖會出現在這裡
            </p>
          ) : (
            !selection && <GapHint gaps={gaps} onSelect={setSelection} />
          )}
          <FlowCanvas
            flow={flow}
            highlight={updated}
            selection={selection}
            onChange={edit}
            onSelect={setSelection}
            fitKey={fitKey}
          />
          {/* 選了步驟或連線才浮出編輯面板，不常駐占用畫布寬度 */}
          {selection && (
            <aside className="absolute top-3 right-3 bottom-3 z-10 flex w-80 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              <div className="flex justify-end border-b border-slate-100 px-2 py-1">
                <button
                  onClick={() => setSelection(null)}
                  aria-label="關閉編輯面板"
                  className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <DetailPanel flow={flow} gaps={gaps} selection={selection} onChange={edit} onSelect={setSelection} />
              </div>
            </aside>
          )}
        </section>
      </div>
      {docsOpen && (
        <DocumentsDrawer taxId={project.tax_id} docs={docs} onChange={setDocs} onClose={() => setDocsOpen(false)} />
      )}
    </main>
  );
}

const COMPARED = ["kind", "title", "role", "system", "data", "condition", "exceptions", "output", "description"] as const;

/** AI 這次新增或改了內容的步驟（位置變動不算） */
function changedNodeIds(before: Flow, after: Flow): string[] {
  const old = new Map(before.nodes.map((n) => [n.id, n]));
  return after.nodes
    .filter((n) => {
      const o = old.get(n.id);
      return !o || COMPARED.some((f) => (o[f] ?? "") !== (n[f] ?? ""));
    })
    .map((n) => n.id);
}
