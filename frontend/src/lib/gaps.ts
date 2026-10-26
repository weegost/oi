import type { Flow, FlowNode, Gap } from "./types";

// 與 backend/app/flow.py 的 find_gaps 相同規則；前端即時計算，讓編輯後立刻看到缺口變化
const LABELS: Record<string, string> = {
  role: "誰負責",
  data: "需要哪些資料",
  condition: "怎麼判斷",
  branches: "判斷後的兩條路",
  exceptions: "例外狀況怎麼處理",
  connection: "接上前後步驟",
  start_end: "開始和結束",
};

const TASK_KINDS = new Set(["process", "wait", "decision", "handoff"]);

export function findGaps(flow: Flow): Gap[] {
  const gaps: Gap[] = [];
  const add = (node: FlowNode | null, field: string) =>
    gaps.push({ node_id: node?.id ?? null, node_title: node?.title ?? "", field, label: LABELS[field] });

  const tasks = flow.nodes.filter((n) => TASK_KINDS.has(n.kind));
  if (!tasks.length) return gaps;

  const kinds = new Set(flow.nodes.map((n) => n.kind));
  if (!kinds.has("start") || !kinds.has("end")) add(null, "start_end");

  const linked = new Set(flow.edges.flatMap((e) => [e.source, e.target]));
  const outgoing = new Map<string, number>();
  flow.edges.forEach((e) => outgoing.set(e.source, (outgoing.get(e.source) ?? 0) + 1));

  for (const n of tasks) {
    if (n.status === "confirmed") continue;
    if (!linked.has(n.id)) add(n, "connection");
    if (!n.role.trim() && n.kind !== "wait") add(n, "role");
    if (n.kind === "decision") {
      if (!n.condition.trim()) add(n, "condition");
      if ((outgoing.get(n.id) ?? 0) < 2) add(n, "branches");
    } else if (!n.data.trim()) add(n, "data");
  }

  if (!kinds.has("handoff") && !tasks.some((n) => n.exceptions.trim())) add(null, "exceptions");
  return gaps;
}
