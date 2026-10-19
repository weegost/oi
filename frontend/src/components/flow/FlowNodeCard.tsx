import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { DIAMOND_H, NODE_W } from "@/lib/layout";
import type { FlowNode } from "@/lib/types";

export type CardData = { node: FlowNode; gapCount: number; badge?: { label: string; cls: string } };
export type CardNode = Node<CardData, "card">;

// 冷暖對比：工作用藍綠，跟橘色網站區隔；開始／結束為實心藍綠膠囊
const KIND = {
  start: { label: "開始", cls: "rounded-full border-teal-700 bg-teal-700 text-white", sub: "text-teal-100" },
  end: { label: "結束", cls: "rounded-full border-teal-700 bg-teal-700 text-white", sub: "text-teal-100" },
  process: { label: "工作", cls: "rounded-lg border-teal-300 bg-teal-50 text-slate-900", sub: "text-slate-500" },
  wait: { label: "等待", cls: "rounded-lg border-dashed border-slate-400 bg-white text-slate-900", sub: "text-slate-500" },
  decision: { label: "判斷", cls: "", sub: "text-amber-800" },
  handoff: { label: "人工接管", cls: "rounded-lg border-rose-400 bg-rose-50 text-slate-900", sub: "text-slate-500" },
} as const;

const STATUS = {
  pending: { label: "待確認", dot: "bg-slate-400" },
  confirmed: { label: "已確認", dot: "bg-emerald-500" },
  clarify: { label: "待釐清", dot: "bg-amber-500" },
} as const;

/** 判斷節點：菱形，上下兩個尖角就是連線的進出點 */
function DecisionDiamond({ data, selected }: NodeProps<CardNode>) {
  const { node, gapCount, badge } = data;
  const status = STATUS[node.status];
  const w = NODE_W;
  const h = DIAMOND_H;
  const points = `${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`;

  return (
    <div className="relative flex items-center justify-center text-slate-900" style={{ width: w, height: h }}>
      <svg className="absolute inset-0 overflow-visible drop-shadow-sm" width={w} height={h} aria-hidden>
        {gapCount > 0 && (
          <polygon
            points={`${w / 2},-9 ${w + 14},${h / 2} ${w / 2},${h + 9} -14,${h / 2}`}
            className="fill-none stroke-amber-400"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}
        {selected && (
          <polygon
            points={`${w / 2},-3 ${w + 5},${h / 2} ${w / 2},${h + 3} -5,${h / 2}`}
            className="fill-none stroke-brand-500"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
        <polygon points={points} className="fill-amber-50 stroke-amber-400" strokeWidth={2} strokeLinejoin="round" />
      </svg>
      <Handle type="target" position={Position.Top} />
      <div className="relative flex max-w-[124px] flex-col items-center text-center">
        <div className="flex items-center justify-center gap-1 text-[11px] text-amber-800">
          {KIND.decision.label}
          <i className={"inline-block h-2 w-2 rounded-full " + status.dot} title={status.label} />
        </div>
        <div className="line-clamp-2 text-[13px] leading-snug font-semibold" title={node.title}>
          {node.title}
        </div>
        {gapCount > 0 && <div className="text-[11px] text-amber-700">缺 {gapCount} 項</div>}
        {badge && (
          <div className={"mt-1 rounded border px-1 text-[10px] leading-4 font-medium whitespace-nowrap " + badge.cls}>{badge.label}</div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default function FlowNodeCard(props: NodeProps<CardNode>) {
  const { data, selected } = props;
  const { node, gapCount, badge } = data;
  if (node.kind === "decision") return <DecisionDiamond {...props} />;
  const kind = KIND[node.kind];
  const status = STATUS[node.status];
  const terminal = node.kind === "start" || node.kind === "end";

  return (
    <div
      className={
        "w-[220px] border-2 px-3 py-2 shadow-sm " +
        kind.cls +
        (selected ? " ring-2 ring-brand-500 ring-offset-2" : "") +
        (gapCount > 0 && !terminal ? " outline-2 outline-offset-2 outline-amber-400 outline-dashed" : "")
      }
    >
      {node.kind !== "start" && <Handle type="target" position={Position.Top} />}
      <div className={"flex items-center justify-between text-xs " + kind.sub}>
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
