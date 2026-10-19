"use client";

import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import type { Flow, Gap } from "@/lib/types";
import FlowNodeCard, { type CardNode } from "./FlowNodeCard";

export type Selection = { type: "node" | "edge"; id: string } | null;

const nodeTypes = { card: FlowNodeCard };
export const edgeId = (e: { source: string; target: string }) => `${e.source}->${e.target}`;

type Props = {
  flow: Flow;
  gaps: Gap[];
  selection: Selection;
  onChange: (flow: Flow) => void;
  onSelect: (s: Selection) => void;
  /** 只能選取、不能改流程結構（第二階段使用） */
  readOnly?: boolean;
  /** 數值改變時重新縮放到剛好看得到整張圖（例如自動排列、面板開關後） */
  fitKey?: number;
  badges?: Record<string, { label: string; cls: string }>;
};

export default function FlowCanvas({ flow, gaps, selection, onChange, onSelect, readOnly, badges, fitKey = 0 }: Props) {
  // 節點物件每次都由 flow 重建；必須帶回 React Flow 量到的尺寸與拖曳狀態，
  // 否則它會把節點當成未量測而先隱藏，拖曳時每一格都閃一下
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [dragging, setDragging] = useState<string | null>(null);

  const nodes: CardNode[] = useMemo(
    () =>
      flow.nodes.map((n) => ({
        id: n.id,
        type: "card",
        position: { x: n.x ?? 0, y: n.y ?? 0 },
        measured: sizes[n.id],
        dragging: dragging === n.id,
        selected: selection?.type === "node" && selection.id === n.id,
        data: {
          node: n,
          gapCount: gaps.filter((g) => g.node_id === n.id).length,
          badge: n.kind === "start" || n.kind === "end" ? undefined : badges?.[n.id],
        },
      })),
    [flow.nodes, gaps, selection, badges, sizes, dragging],
  );

  const edges: Edge[] = useMemo(
    () =>
      flow.edges.map((e) => ({
        id: edgeId(e),
        source: e.source,
        target: e.target,
        label: e.label || undefined,
        type: "smoothstep",
        pathOptions: { borderRadius: 14, offset: 24 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        style: { strokeWidth: 1.5 },
        selected: selection?.type === "edge" && selection.id === edgeId(e),
        // 分支標籤加底色與圓角，壓在線上也看得清楚
        labelBgPadding: [8, 4] as [number, number],
        labelBgBorderRadius: 6,
        labelStyle: { fontWeight: 600, fontSize: 12 },
      })),
    [flow.edges, selection],
  );

  const onNodesChange = (changes: NodeChange<CardNode>[]) => {
    const measured = changes.flatMap((c) => (c.type === "dimensions" && c.dimensions ? [[c.id, c.dimensions] as const] : []));
    if (measured.length) setSizes((prev) => ({ ...prev, ...Object.fromEntries(measured) }));

    let next = flow;
    for (const c of changes) {
      if (c.type === "position") setDragging(c.dragging ? c.id : null);
      if (c.type === "position" && c.position) {
        const { y } = c.position;
        const x = snapX(next, c.id, c.position.x);
        next = { ...next, nodes: next.nodes.map((n) => (n.id === c.id ? { ...n, x, y } : n)) };
      } else if (c.type === "remove") {
        next = {
          nodes: next.nodes.filter((n) => n.id !== c.id),
          edges: next.edges.filter((e) => e.source !== c.id && e.target !== c.id),
        };
        onSelect(null);
      } else if (c.type === "select" && c.selected) {
        onSelect({ type: "node", id: c.id });
      }
    }
    if (next !== flow) onChange(next);
  };

  const onEdgesChange = (changes: EdgeChange[]) => {
    const removed = new Set(changes.flatMap((c) => (c.type === "remove" ? [c.id] : [])));
    if (removed.size) {
      onChange({ ...flow, edges: flow.edges.filter((e) => !removed.has(edgeId(e))) });
      onSelect(null);
    }
    for (const c of changes) {
      if (c.type === "select" && c.selected) onSelect({ type: "edge", id: c.id });
    }
  };

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    if (flow.edges.some((e) => e.source === c.source && e.target === c.target)) return;
    onChange({ ...flow, edges: [...flow.edges, { source: c.source, target: c.target, label: "" }] });
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={readOnly ? undefined : onConnect}
      onPaneClick={() => onSelect(null)}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      deleteKeyCode={readOnly ? null : ["Delete"]}
      fitView
      fitViewOptions={FIT}
      minZoom={0.3}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} />
      <Controls showInteractive={false} fitViewOptions={FIT} />
      <AutoFit nodeKey={flow.nodes.map((n) => n.id).join(",")} fitKey={fitKey} />
    </ReactFlow>
  );
}

// 拖曳時離相連步驟的水平位置在這個距離內，就吸附對齊，連線才會是筆直的
const SNAP = 20;

function snapX(flow: Flow, id: string, x: number): number {
  const linked = new Set(flow.edges.flatMap((e) => (e.source === id ? [e.target] : e.target === id ? [e.source] : [])));
  let best = x;
  let bestDist = SNAP;
  for (const n of flow.nodes) {
    if (!linked.has(n.id) || n.x == null) continue;
    const d = Math.abs(n.x - x);
    if (d < bestDist) [best, bestDist] = [n.x, d];
  }
  return best;
}

// 不放大超過 100%，節點少時也不會大得突兀
const FIT = { padding: 0.15, maxZoom: 1 };

/** 步驟增減（例如 AI 新增節點）或外部要求時，自動重新縮放到整張圖 */
function AutoFit({ nodeKey, fitKey }: { nodeKey: string; fitKey: number }) {
  const { fitView } = useReactFlow();
  // 節點尚未量好尺寸時縮放會算錯（停在 100% 而圖被切掉），等全部量好再縮放
  const measured = useNodesInitialized();
  useEffect(() => {
    if (!measured) return;
    const t = setTimeout(() => fitView({ ...FIT, duration: 300 }), 60);
    return () => clearTimeout(t);
  }, [measured, nodeKey, fitKey, fitView]);
  return null;
}
