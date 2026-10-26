"use client";

import { ChevronDown } from "lucide-react";
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

type Field = { key: keyof FlowNode; label: string; hint: string; decisionOnly?: boolean };

// 常用的三項（判斷步驟多一項）預設顯示，其餘收進「更多」，避免一次看到太多欄位
const MAIN_FIELDS: Field[] = [
  { key: "role", label: "誰負責這一步？", hint: "例如：客服專員" },
  { key: "system", label: "用什麼系統或工具？", hint: "例如：蝦皮賣家中心、Excel" },
  { key: "data", label: "需要哪些資料？", hint: "例如：訂單編號、商品照片" },
  { key: "condition", label: "怎麼判斷？", hint: "例如：訂單在七天內而且商品沒用過", decisionOnly: true },
];

const MORE_FIELDS: Field[] = [
  { key: "output", label: "做完這一步會得到什麼？", hint: "例如：查到的訂單資料、回覆客人的訊息" },
  { key: "exceptions", label: "什麼情況要交給別人處理？", hint: "例如：客人說商品會發燙，就轉給主管" },
  { key: "description", label: "其他想補充的", hint: "" },
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
  const terminal = node.kind === "start" || node.kind === "end";
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
        <span className="text-slate-600">這一步在做什麼？</span>
        <input className={input} value={node.title} onChange={(e) => update({ title: e.target.value })} />
      </label>

      {!terminal &&
        MAIN_FIELDS.filter((f) => !f.decisionOnly || node.kind === "decision").map((f) => (
          <Field key={f.key} field={f} node={node} update={update} />
        ))}

      <details className="group rounded-lg border border-slate-200">
        <summary className="flex list-none items-center gap-1 px-3 py-2 text-slate-600 [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" />
          更多
        </summary>
        <div className="space-y-3 border-t border-slate-100 p-3">
          <label className="block">
            <span className="text-slate-600">這是哪一種步驟？</span>
            <select className={input} value={node.kind} onChange={(e) => update({ kind: e.target.value as NodeKind })}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          {!terminal && MORE_FIELDS.map((f) => <Field key={f.key} field={f} node={node} update={update} />)}
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
      </details>
    </div>
  );
}

function Field({
  field,
  node,
  update,
}: {
  field: Field;
  node: FlowNode;
  update: (patch: Partial<FlowNode>) => void;
}) {
  return (
    <label className="block">
      <span className="text-slate-600">{field.label}</span>
      <textarea
        rows={field.key === "description" ? 3 : 2}
        className={input}
        placeholder={field.hint}
        value={String(node[field.key] ?? "")}
        onChange={(e) => update({ [field.key]: e.target.value, source: "企業描述" })}
      />
    </label>
  );
}
