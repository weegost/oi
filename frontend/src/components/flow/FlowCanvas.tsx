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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";
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
  badges?: Record<string, { label: string; cls: string }>;
};

export default function FlowCanvas({ flow, gaps, selection, onChange, onSelect, readOnly, badges }: Props) {
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
        markerEnd: { type: MarkerType.ArrowClosed },
        selected: selection?.type === "edge" && selection.id === edgeId(e),
        labelBgPadding: [6, 2] as [number, number],
        labelStyle: { fontWeight: 600 },
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
        const { x, y } = c.position;
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
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
