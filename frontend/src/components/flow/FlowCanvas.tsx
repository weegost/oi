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
  useStoreApi,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import { DIAMOND_H, NODE_H, NODE_W } from "@/lib/layout";
import type { Flow, FlowNode } from "@/lib/types";
import FlowNodeCard, { type CardNode } from "./FlowNodeCard";

export type Selection = { type: "node" | "edge"; id: string } | null;

const nodeTypes = { card: FlowNodeCard };
export const edgeId = (e: { source: string; target: string }) => `${e.source}->${e.target}`;

// 還缺哪些資訊只在流程圖左上角的清單（GapHint）提醒，步驟方塊上不再重複標示
type Props = {
  flow: Flow;
  selection: Selection;
  onChange: (flow: Flow) => void;
  onSelect: (s: Selection) => void;
  /** 只能選取、不能改流程結構（第二階段使用） */
  readOnly?: boolean;
  /** 數值改變時重新縮放到剛好看得到整張圖（例如自動排列、面板開關後） */
  fitKey?: number;
  badges?: Record<string, { label: string; cls: string }>;
  /** 要標示「剛更新」的步驟 id（AI 對話後改到的步驟） */
  highlight?: string[];
  /** 不縮小整張圖去塞進畫面，而是照寬度縮放、從流程最上面開始顯示（圖長時往下拖曳看） */
  alignTop?: boolean;
};

export default function FlowCanvas({
  flow,
  selection,
  onChange,
  onSelect,
  readOnly,
  badges,
  highlight,
  alignTop,
  fitKey = 0,
}: Props) {
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
          badge: n.kind === "start" || n.kind === "end" ? undefined : badges?.[n.id],
          updated: highlight?.includes(n.id),
        },
      })),
    [flow.nodes, selection, badges, highlight, sizes, dragging],
  );

  const edges: Edge[] = useMemo(() => {
    const byId = new Map(flow.nodes.map((n) => [n.id, n]));
    return flow.edges.map((e) => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      return {
        id: edgeId(e),
        source: e.source,
        target: e.target,
        ...(s && t ? pickHandles(box(s, sizes[s.id]), box(t, sizes[t.id]), s.kind === "decision") : {}),
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
      };
    });
  }, [flow.nodes, flow.edges, selection, sizes]);

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
      <AutoFit nodeKey={flow.nodes.map((n) => n.id).join(",")} fitKey={fitKey} alignTop={alignTop} />
    </ReactFlow>
  );
}

type Box = { x: number; y: number; w: number; h: number };

/** 方塊在畫布上的位置與大小；還沒量到實際尺寸時用排版預設值 */
function box(n: FlowNode, size?: { width: number; height: number }): Box {
  return {
    x: n.x ?? 0,
    y: n.y ?? 0,
    w: size?.width ?? NODE_W,
    h: size?.height ?? (n.kind === "decision" ? DIAMOND_H : NODE_H),
  };
}

/** 依兩個方塊的相對位置選擇線從哪一邊出去、從哪一邊進來，避免線繞一大圈 */
function pickHandles(s: Box, t: Box, fromDecision: boolean) {
  const sCenter = s.x + s.w / 2;
  const tCenter = t.x + t.w / 2;
  const toLeft = tCenter < sCenter;
  // 目標在下方：一般往下接；判斷分岔到左右兩邊時，從菱形的左／右尖角出去
  if (t.y >= s.y + s.h - 8) {
    if (fromDecision && Math.abs(tCenter - sCenter) > s.w / 2) {
      return { sourceHandle: toLeft ? "left" : "right", targetHandle: "top" };
    }
    return { sourceHandle: "bottom", targetHandle: "top" };
  }
  // 同一高度並排：直接從側邊橫向接過去
  if (t.y < s.y + s.h && s.y < t.y + t.h) {
    return toLeft ? { sourceHandle: "left", targetHandle: "right-in" } : { sourceHandle: "right", targetHandle: "left-in" };
  }
  // 目標在上方（流程往回走）：從右側繞出去再接回來
  return { sourceHandle: "right", targetHandle: "right-in" };
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
function AutoFit({ nodeKey, fitKey, alignTop }: { nodeKey: string; fitKey: number; alignTop?: boolean }) {
  const { fitView, getNodes, getNodesBounds, setViewport } = useReactFlow();
  const store = useStoreApi();
  // 節點尚未量好尺寸時縮放會算錯（停在 100% 而圖被切掉），等全部量好再縮放
  const measured = useNodesInitialized();
  useEffect(() => {
    if (!measured) return;
    const t = setTimeout(() => {
      if (!alignTop) return fitView({ ...FIT, duration: 300 });
      // 寬度塞得下就維持 100%，水平置中，最上面的步驟貼齊畫面頂端
      const { width } = store.getState();
      const b = getNodesBounds(getNodes());
      const zoom = Math.min(FIT.maxZoom, (width * (1 - FIT.padding)) / b.width);
      setViewport({ x: (width - b.width * zoom) / 2 - b.x * zoom, y: TOP_GAP - b.y * zoom, zoom }, { duration: 300 });
    }, 60);
    return () => clearTimeout(t);
  }, [measured, nodeKey, fitKey, alignTop, fitView, getNodes, getNodesBounds, setViewport, store]);
  return null;
}

const TOP_GAP = 32;
