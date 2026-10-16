import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNode } from "@/lib/types";

export type CardData = { node: FlowNode; gapCount: number; badge?: { label: string; cls: string } };
export type CardNode = Node<CardData, "card">;

const KIND = {
  start: { label: "開始", cls: "rounded-full border-slate-400 bg-slate-100" },
  end: { label: "結束", cls: "rounded-full border-slate-400 bg-slate-100" },
  process: { label: "工作", cls: "rounded-lg border-brand-300 bg-white" },
  wait: { label: "等待", cls: "rounded-lg border-dashed border-sky-400 bg-sky-50" },
  decision: { label: "判斷", cls: "rounded-lg border-amber-400 bg-amber-50" },
  handoff: { label: "人工接管", cls: "rounded-lg border-rose-400 bg-rose-50" },
} as const;

const STATUS = {
  pending: { label: "待確認", dot: "bg-slate-400" },
  confirmed: { label: "已確認", dot: "bg-emerald-500" },
  clarify: { label: "待釐清", dot: "bg-amber-500" },
} as const;

export default function FlowNodeCard({ data, selected }: NodeProps<CardNode>) {
  const { node, gapCount, badge } = data;
  const kind = KIND[node.kind];
  const status = STATUS[node.status];
  const terminal = node.kind === "start" || node.kind === "end";

  return (
    <div
      className={
        "w-[220px] border-2 px-3 py-2 text-slate-900 shadow-sm " +
        kind.cls +
        (selected ? " ring-2 ring-brand-500 ring-offset-2" : "") +
        (gapCount > 0 && !terminal ? " outline-2 outline-offset-2 outline-amber-400 outline-dashed" : "")
      }
    >
      {node.kind !== "start" && <Handle type="target" position={Position.Top} />}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{kind.label}</span>
        {!terminal && (
          <span className="flex items-center gap-1">
            <i className={"inline-block h-2 w-2 rounded-full " + status.dot} />
            {status.label}
          </span>
        )}
      </div>
      <div className="mt-0.5 truncate font-semibold" title={node.title}>
        {node.title}
      </div>
      {!terminal && (
        <div className="mt-0.5 flex justify-between gap-2 text-xs text-slate-500">
          <span className="truncate">{node.role || "負責人未填"}</span>
          {gapCount > 0 && <span className="shrink-0 text-amber-700">缺 {gapCount} 項</span>}
        </div>
      )}
      {badge && (
        <div className={"mt-1.5 rounded border px-1.5 py-0.5 text-center text-xs font-medium " + badge.cls}>
          {badge.label}
        </div>
      )}
      {node.kind !== "end" && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}
