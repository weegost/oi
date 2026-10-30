import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { DIAMOND_H, NODE_W } from "@/lib/layout";
import type { FlowNode } from "@/lib/types";

export type CardData = { node: FlowNode; badge?: { label: string; cls: string }; updated?: boolean };
export type CardNode = Node<CardData, "card">;

// 步驟類型靠形狀與顏色區分，不再另外寫字：開始／結束為實心膠囊、等待為虛線框、交給別人處理為紅框、判斷為菱形
const KIND_CLS = {
  start: "rounded-full border-teal-700 bg-teal-700 text-white",
  end: "rounded-full border-teal-700 bg-teal-700 text-white",
  process: "rounded-lg border-teal-300 bg-teal-50 text-slate-900",
  wait: "rounded-lg border-dashed border-slate-400 bg-white text-slate-900",
  handoff: "rounded-lg border-rose-400 bg-rose-50 text-slate-900",
} as const;

// 已確認的步驟不顯示狀態，只有還沒確認的才提醒
const STATUS_TAG = {
  pending: { label: "待確認", cls: "border-slate-300 bg-white text-slate-600" },
  clarify: { label: "待釐清", cls: "border-amber-400 bg-amber-50 text-amber-800" },
} as const;

function StatusTag({ node }: { node: FlowNode }) {
  if (node.status === "confirmed") return null;
  const tag = STATUS_TAG[node.status];
  return (
    <span className={"absolute -top-3 right-2 z-10 rounded-full border px-2 text-xs leading-5 font-medium " + tag.cls}>
      {tag.label}
    </span>
  );
}

// 側邊的連接點不顯示也不能拖，只給程式依方塊相對位置選擇線要從哪一邊進出（見 FlowCanvas 的 pickHandles）
const HIDDEN = { opacity: 0, pointerEvents: "none" } as const;

/** 連接點：上方進、下方出可拖曳連線；左右兩側另有隱藏的進出點，讓分岔與並排的步驟不必繞路 */
function Handles({ source = true, target = true }: { source?: boolean; target?: boolean }) {
  return (
    <>
      {target && (
        <>
          <Handle type="target" id="top" position={Position.Top} />
          <Handle type="target" id="left-in" position={Position.Left} style={HIDDEN} isConnectable={false} />
          <Handle type="target" id="right-in" position={Position.Right} style={HIDDEN} isConnectable={false} />
        </>
      )}
      {source && (
        <>
          <Handle type="source" id="bottom" position={Position.Bottom} />
          <Handle type="source" id="left" position={Position.Left} style={HIDDEN} isConnectable={false} />
          <Handle type="source" id="right" position={Position.Right} style={HIDDEN} isConnectable={false} />
        </>
      )}
    </>
  );
}

/** AI 對話後剛改到的步驟：左上角的標記，幾秒後消失 */
function UpdatedTag({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span className="absolute -top-3 left-2 z-10 rounded-full bg-amber-400 px-2 text-xs leading-5 font-semibold text-amber-950">
      剛更新
    </span>
  );
}

function Badge({ badge }: { badge?: CardData["badge"] }) {
  if (!badge) return null;
  return <div className={"mt-1.5 rounded border px-1.5 py-0.5 text-center text-xs font-medium " + badge.cls}>{badge.label}</div>;
}

/** 判斷節點：菱形，四個尖角就是連線的進出點（分岔時從左右尖角出去） */
function DecisionDiamond({ data, selected }: NodeProps<CardNode>) {
  const { node, badge, updated } = data;
  const w = NODE_W;
  const h = DIAMOND_H;
  const points = `${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`;

  return (
    <div className="relative flex items-center justify-center text-slate-900" style={{ width: w, height: h }}>
      <svg className="absolute inset-0 overflow-visible drop-shadow-sm" width={w} height={h} aria-hidden>
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
      <StatusTag node={node} />
      <UpdatedTag show={updated} />
      <Handles />
      <div className="relative flex max-w-[132px] flex-col items-center text-center">
        <div className="line-clamp-3 text-sm leading-snug font-semibold" title={node.title}>
          {node.title}
        </div>
        <Badge badge={badge} />
      </div>
    </div>
  );
}

export default function FlowNodeCard(props: NodeProps<CardNode>) {
  const { data, selected } = props;
  const { node, badge, updated } = data;
  if (node.kind === "decision") return <DecisionDiamond {...props} />;
  const terminal = node.kind === "start" || node.kind === "end";

  return (
    <div
      className={
        "relative w-[220px] border-2 px-3 py-2.5 shadow-sm " +
        KIND_CLS[node.kind] +
        (selected ? " ring-2 ring-brand-500 ring-offset-2" : updated ? " ring-2 ring-amber-400 ring-offset-2" : "")
      }
    >
      {!terminal && <StatusTag node={node} />}
      <UpdatedTag show={updated} />
      <Handles source={node.kind !== "end"} target={node.kind !== "start"} />
      {/* 名稱放大、太長就換行，不截斷 */}
      <div className={"line-clamp-2 text-base leading-snug font-semibold" + (terminal ? " text-center" : "")} title={node.title}>
        {node.title}
      </div>
      {!terminal && <div className="mt-1 truncate text-sm text-slate-600">{node.role || "負責人未填"}</div>}
      <Badge badge={badge} />
    </div>
  );
}
