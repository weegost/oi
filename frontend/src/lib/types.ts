export type BusinessItem = {
  code: string;
  name: string;
  category: string;
  subcategory: string;
};

export type Industry = {
  label: string;
  is_3c: boolean;
  online_retail: boolean;
  matched_items: string[];
  demo_scenario: string | null;
};

export type Company = {
  tax_id: string;
  name: string;
  registration_type: "company" | "business" | "demo";
  owner: string;
  address: string;
  status: string;
  capital: string;
  setup_date: string;
  business_items: BusinessItem[];
  industry: Industry;
  fetched_at: string;
};

export type NodeKind = "start" | "end" | "process" | "wait" | "decision" | "handoff";
export type NodeStatus = "pending" | "confirmed" | "clarify";

export type FlowNode = {
  id: string;
  kind: NodeKind;
  title: string;
  role: string;
  system: string;
  data: string;
  condition: string;
  description: string;
  output: string;
  exceptions: string;
  status: NodeStatus;
  source: string;
  x: number | null;
  y: number | null;
};

export type FlowEdge = { source: string; target: string; label: string };
export type Flow = { nodes: FlowNode[]; edges: FlowEdge[] };

export type Gap = { node_id: string | null; node_title: string; field: string; label: string };
export type ChatMessage = { role: "user" | "assistant"; mode: "direct" | "guided"; text: string };

export type Project = {
  id: number;
  tax_id: string;
  company_name: string;
  industry: Industry;
  name: string;
  work: string;
  problem: string;
  scope: string;
  flow: Flow;
  gaps: Gap[];
  messages: ChatMessage[];
  allocations: Record<string, Allocation>;
};

export type Mode = "human" | "assist" | "review" | "auto";
export type Fit = "建議" | "可行" | "不建議";

export type ModeOption = {
  mode: Mode;
  ai_does: string;
  human_does: string;
  required_data: string[];
  permissions: string[];
  handoff: string[];
  risk: string;
  fit: Fit;
  reason: string;
};

export type Exploration = {
  ai_tasks: string[];
  goal: string;
  options: ModeOption[];
  recommended: Mode;
};

export type Allocation = { mode: Mode; exploration?: Exploration; node_title: string };

export const MODE_LABEL: Record<Mode, string> = {
  human: "人工執行",
  assist: "AI 輔助",
  review: "AI 執行後人工確認",
  auto: "AI 自動執行",
};

export const MODE_STYLE: Record<Mode, string> = {
  human: "bg-slate-100 text-slate-700 border-slate-300",
  assist: "bg-teal-50 text-teal-800 border-teal-300",
  review: "bg-violet-100 text-violet-800 border-violet-300",
  auto: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

// ---- 情境沙盒 ----

export type TraceStep = {
  capability: string;
  node: string;
  mode: string;
  action: string;
  api: string;
  status: "ok" | "warn" | "fail";
};

export type SandboxGap = { type: string; issue: string; action: string; condition: string | null };
export type Evidence = { source: string; text: string; date: string; url: string };

export type CaseResult = {
  id: string;
  scenario: string;
  title: string;
  message: string;
  order_id: string | null;
  disposition: "需補足條件" | "正確轉人工" | "人工處理" | "AI 協助完成";
  risks: string[];
  trace: TraceStep[];
  gaps: SandboxGap[];
  notes: string[];
  evidence: Evidence[];
};

export type SandboxState = {
  conditions: Record<string, string>;
  scenarios: string[];
  config: Record<string, boolean>;
  run: number;
  ran_at: string | null;
  selected_scenarios: string[];
  results: CaseResult[];
  summary: {
    gaps: (SandboxGap & { cases: string[] })[];
    dispositions: Record<string, number>;
    cases: number;
  } | null;
};

export type OpenDataSummary = {
  syncs: { dataset: string; source: "live" | "snapshot"; rows: number; total: number; message: string; synced_at: string }[];
  penalty_channels: Record<string, number>;
  penalty_top_categories: { category: string; count: number }[];
  penalty_range: [string | null, string | null];
  complaints: Record<string, { month: string; count: number }[]>;
};

// ---- 需求草案 ----

export type ReportData = {
  title: string;
  generated_on: string;
  overview: {
    company: string;
    tax_id: string;
    is_demo: boolean;
    industry: string;
    project: string;
    work: string;
    problem: string;
    scope: string;
    stats: { steps: number; ai_steps: number; cases: number; gaps: number };
  };
  steps: { title: string; kind: string; role: string; system: string; data: string; condition: string; exceptions: string; status: string }[];
  allocations: {
    step: string;
    mode: string;
    recommended: string | null;
    ai_tasks: string[];
    goal: string;
    ai_does: string;
    human_does: string;
    risk: string;
    explored: boolean;
  }[];
  data: string[];
  systems: string[];
  permissions: string[];
  handoffs: string[];
  testing: {
    tested: boolean;
    stale: boolean;
    run: number;
    ran_at: string | null;
    assumed: string[];
    not_ready: string[];
    cases: { scenario: string; title: string; disposition: string; risks: string[] }[];
    evidence: string[];
  };
  gaps: { type: string; issue: string; action: string; cases: string[] }[];
  todo: string[];
  ai_summary: string | null;
};
