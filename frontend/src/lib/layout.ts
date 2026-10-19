import dagre from "@dagrejs/dagre";
import type { Flow } from "./types";

export const NODE_W = 220;
export const NODE_H = 84; // 實際卡片高度（三行文字）
export const DIAMOND_H = 150; // 判斷節點（菱形）的高度
const BRANCH_GAP = 90; // 分支與主線之間的水平間距

/**
 * 主線：從開始節點起，每一步沿著「第一條」出線往下走（判斷節點的第一條分支視為主要情況）。
 */
function mainPath(flow: Flow): Set<string> {
  const firstOut = new Map<string, string>();
  for (const e of flow.edges) if (!firstOut.has(e.source)) firstOut.set(e.source, e.target);
  const start = flow.nodes.find((n) => n.kind === "start") ?? flow.nodes[0];
  const path = new Set<string>();
  for (let id: string | undefined = start?.id; id && !path.has(id); id = firstOut.get(id)) path.add(id);
  return path;
}

/** 由上而下自動排列；回傳帶座標的新流程。height 可加大給有分工標籤的節點。 */
export function autoLayout(flow: Flow, height = NODE_H): Flow {
  const g = new dagre.graphlib.Graph();
  // 間距加大，分支與連線之間留出空間，避免擁擠
  g.setGraph({ rankdir: "TB", nodesep: 90, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  const h = (kind: string) => (kind === "decision" ? Math.max(height, DIAMOND_H) : height);
  flow.nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: h(n.kind) }));
  flow.edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  // dagre 會替跨越多層的連線預留繞道，但流程圖畫線時直接走直線，
  // 若分支節點離主線太近，主線的連線會穿過分支節點。把太近的分支推到主線旁邊。
  const main = mainPath(flow);
  const mainXs = [...main].map((id) => g.node(id).x);
  const shiftX = (x: number) => {
    if (!mainXs.length) return x;
    const mx = mainXs.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    if (Math.abs(x - mx) >= NODE_W + BRANCH_GAP) return x;
    return x <= mx ? mx - NODE_W - BRANCH_GAP : mx + NODE_W + BRANCH_GAP;
  };

  return {
    ...flow,
    nodes: flow.nodes.map((n) => {
      const p = g.node(n.id);
      const x = main.has(n.id) ? p.x : shiftX(p.x);
      return { ...n, x: x - NODE_W / 2, y: p.y - h(n.kind) / 2 };
    }),
  };
}

/** Agent 新增的節點沒有座標時，整張圖重新排列。 */
export function ensureLayout(flow: Flow): Flow {
  return flow.nodes.some((n) => n.x == null || n.y == null) ? autoLayout(flow) : flow;
}
