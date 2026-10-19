"use client";

import type { Flow, FlowNode, Gap, NodeKind, NodeStatus } from "@/lib/types";
import { edgeId, type Selection } from "./FlowCanvas";

const KINDS: { value: NodeKind; label: string }[] = [
  { value: "process", label: "工作" },
  { value: "decision", label: "判斷" },
  { value: "wait", label: "等待／外部回覆" },
  { value: "handoff", label: "人工接管" },
  { value: "start", label: "開始" },
  { value: "end", label: "結束" },
];

const STATUSES: { value: NodeStatus; label: string; cls: string }[] = [
  { value: "pending", label: "待確認", cls: "border-slate-300 text-slate-700" },
  { value: "confirmed", label: "已確認", cls: "border-emerald-500 bg-emerald-50 text-emerald-800" },
  { value: "clarify", label: "待釐清", cls: "border-amber-500 bg-amber-50 text-amber-800" },
];

const FIELDS: { key: keyof FlowNode; label: string; hint: string; decisionOnly?: boolean }[] = [
  { key: "role", label: "負責角色", hint: "例如：客服專員" },
  { key: "system", label: "使用的系統／工具", hint: "例如：蝦皮賣家中心、Excel" },
  { key: "data", label: "需要的資料", hint: "例如：訂單編號、商品照片" },
  { key: "condition", label: "判斷條件", hint: "例如：訂單在七天內且商品未使用", decisionOnly: true },
  { key: "output", label: "產出", hint: "這一步完成後產生什麼" },
  { key: "exceptions", label: "例外狀況", hint: "遇到什麼情況要改由別人處理" },
  { key: "description", label: "補充說明", hint: "" },
];

const input =
  "mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

type Props = {
  flow: Flow;
  gaps: Gap[];
  selection: Selection;
  onChange: (flow: Flow) => void;
  onSelect: (s: Selection) => void;
};

export default function DetailPanel({ flow, gaps, selection, onChange, onSelect }: Props) {
  if (!selection) return null; // 沒選取時改由流程圖左上角的 GapHint 顯示待補清單

  if (selection.type === "edge") {
    const edge = flow.edges.find((e) => edgeId(e) === selection.id);
    if (!edge) return null;
    const title = (id: string) => flow.nodes.find((n) => n.id === id)?.title ?? id;
    return (
      <div className="space-y-3 p-4 text-sm">
        <h3 className="font-semibold">連線</h3>
        <p className="text-slate-600">
          {title(edge.source)} → {title(edge.target)}
        </p>
        <label className="block">
          <span className="text-slate-600">分支標籤</span>
          <input
            className={input}
            value={edge.label}
            placeholder="例如：是／否、符合條件"
            onChange={(e) =>
              onChange({
                ...flow,
                edges: flow.edges.map((x) => (edgeId(x) === selection.id ? { ...x, label: e.target.value } : x)),
              })
            }
          />
        </label>
        <button
          className="text-red-600 hover:underline"
          onClick={() => {
            onChange({ ...flow, edges: flow.edges.filter((x) => edgeId(x) !== selection.id) });
            onSelect(null);
          }}
        >
          刪除連線
        </button>
      </div>
    );
  }

  const node = flow.nodes.find((n) => n.id === selection.id);
  if (!node) return null;
  const nodeGaps = gaps.filter((g) => g.node_id === node.id);
  const update = (patch: Partial<FlowNode>) =>
    onChange({ ...flow, nodes: flow.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)) });

  return (
    <div className="space-y-3 p-4 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">步驟內容</h3>
        <span className="text-xs text-slate-500">來源：{node.source}</span>
      </div>

      <div className="flex gap-1.5">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => update({ status: s.value })}
            className={
              "flex-1 rounded-md border px-2 py-1 text-xs " +
              (node.status === s.value ? s.cls + " font-semibold" : "border-slate-200 text-slate-500")
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      {nodeGaps.length > 0 && (
        <p className="rounded-md bg-amber-50 p-2 text-amber-900">
          待補：{nodeGaps.map((g) => g.label).join("、")}
        </p>
      )}

      <label className="block">
        <span className="text-slate-600">步驟名稱</span>
        <input className={input} value={node.title} onChange={(e) => update({ title: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-slate-600">類型</span>
        <select
          className={input}
          value={node.kind}
          onChange={(e) => update({ kind: e.target.value as NodeKind })}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>

      {node.kind !== "start" &&
        node.kind !== "end" &&
        FIELDS.filter((f) => !f.decisionOnly || node.kind === "decision").map((f) => (
          <label key={f.key} className="block">
            <span className="text-slate-600">{f.label}</span>
            <textarea
              rows={f.key === "description" ? 3 : 2}
              className={input}
              placeholder={f.hint}
              value={String(node[f.key] ?? "")}
              onChange={(e) => update({ [f.key]: e.target.value, source: "企業描述" })}
            />
          </label>
        ))}

      <button
        className="text-red-600 hover:underline"
        onClick={() => {
          onChange({
            nodes: flow.nodes.filter((n) => n.id !== node.id),
            edges: flow.edges.filter((e) => e.source !== node.id && e.target !== node.id),
          });
          onSelect(null);
        }}
      >
        刪除這個步驟
      </button>
    </div>
  );
}
