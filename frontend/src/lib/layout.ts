import dagre from "@dagrejs/dagre";
import type { Flow } from "./types";

export const NODE_W = 220;
export const NODE_H = 72;

/** 由上而下自動排列；回傳帶座標的新流程。height 可加大給有分工標籤的節點。 */
export function autoLayout(flow: Flow, height = NODE_H): Flow {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 50 });
  g.setDefaultEdgeLabel(() => ({}));
  flow.nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height }));
  flow.edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return {
    ...flow,
    nodes: flow.nodes.map((n) => {
      const p = g.node(n.id);
      return { ...n, x: p.x - NODE_W / 2, y: p.y - height / 2 };
    }),
  };
}

/** Agent 新增的節點沒有座標時，整張圖重新排列。 */
export function ensureLayout(flow: Flow): Flow {
  return flow.nodes.some((n) => n.x == null || n.y == null) ? autoLayout(flow) : flow;
}
