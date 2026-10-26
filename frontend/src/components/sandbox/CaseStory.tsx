import { Bot, ChevronDown, Search, TriangleAlert, User, UserRound } from "lucide-react";
import type { CaseResult, FlowNode } from "@/lib/types";

/** 給不懂 AI 的企業看的白話結果 */
export const VERDICT: Record<CaseResult["disposition"], { label: string; chip: string; box: string; explain: string }> = {
  "AI 協助完成": {
    label: "處理好了",
    chip: "bg-emerald-100 text-emerald-800",
    box: "bg-emerald-50 text-emerald-900",
    explain: "AI 依照公司規定把事情處理好，人員只需要在必要時確認。",
  },
  正確轉人工: {
    label: "交給人處理",
    chip: "bg-amber-100 text-amber-900",
    box: "bg-amber-50 text-amber-900",
    explain: "這件事有風險或需要判斷，AI 沒有自己做決定，而是交給人處理，這是對的。",
  },
  人工處理: {
    label: "由人員處理",
    chip: "bg-slate-100 text-slate-700",
    box: "bg-slate-50 text-slate-700",
    explain: "這些步驟本來就安排由人員處理，AI 沒有參與。",
  },
  需補足條件: {
    label: "卡住了",
    chip: "bg-red-100 text-red-800",
    box: "bg-red-50 text-red-900",
    explain: "還缺一些準備，AI 沒辦法順利處理這位客人。",
  },
};

type Speaker = { name: string; kind: "ai" | "person" | "system" };

function speakerOf(step: CaseResult["trace"][number], nodes: FlowNode[]): Speaker {
  if (step.mode === "-") return { name: "系統檢查", kind: "system" };
  if (step.mode === "人工執行") {
    const role = nodes.find((n) => n.title === step.node)?.role;
    return { name: role || "負責人員", kind: "person" };
  }
  return { name: "AI", kind: "ai" };
}

const BUBBLE = {
  ai: "border-teal-200 bg-teal-50",
  person: "border-orange-200 bg-orange-50",
  system: "border-slate-200 bg-slate-50",
} as const;
const ICON = { ai: Bot, person: UserRound, system: Search } as const;

/** 一位客人從開口到處理完的過程，用對話的方式呈現 */
type Props = {
  result: CaseResult;
  nodes: FlowNode[];
  /** 缺口對應到左邊哪一題（白話題目） */
  conditionLabel: (key: string) => string;
};

export default function CaseStory({ result: r, nodes, conditionLabel }: Props) {
  const verdict = VERDICT[r.disposition];

  return (
    <article className="space-y-3 text-sm">
      <Line icon={User} name="客人" className="border-slate-200 bg-white">
        {r.message}
      </Line>

      {r.trace.map((t, i) => {
        const who = speakerOf(t, nodes);
        const stuck = t.status === "fail";
        return (
          <Line
            key={i}
            icon={ICON[who.kind]}
            name={who.name}
            className={stuck ? "border-red-300 bg-red-50" : BUBBLE[who.kind]}
          >
            {stuck && <span className="mr-1 rounded bg-red-600 px-1.5 text-xs text-white">卡住</span>}
            {t.action}
            <span className={"mt-0.5 block text-xs font-medium " + (stuck ? "text-red-700" : "text-slate-600")}>
              步驟：{t.node || t.capability}
            </span>
          </Line>
        );
      })}

      {r.risks.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <p className="flex items-center gap-1.5 font-medium">
            <TriangleAlert aria-hidden className="h-4 w-4" />
            系統注意到
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {r.risks.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={"rounded-lg p-3 " + verdict.box}>
        <p className="font-semibold">結果：{verdict.label}</p>
        <p className="mt-0.5">{verdict.explain}</p>
      </div>

      {r.gaps.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-white p-3">
          <p className="font-medium text-red-800">為什麼卡住、要準備什麼</p>
          <ul className="mt-1 space-y-2">
            {r.gaps.map((g, i) => (
              <li key={i}>
                {g.issue}
                <span className="block text-slate-600">要準備：{g.action}</span>
                {g.condition && (
                  <span className="mt-0.5 block text-xs text-brand-700">對應左邊的「{conditionLabel(g.condition)}」</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.notes.map((n, i) => (
        <p key={i} className="text-xs text-slate-500">
          {n}
        </p>
      ))}

      {r.evidence.length > 0 && (
        <details className="group rounded-lg border border-slate-200 bg-white p-3">
          <summary className="flex items-center gap-1 text-slate-700">
            <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" />
            系統比對了政府公開資料（{r.evidence.length} 筆）
          </summary>
          <ul className="mt-2 space-y-1 text-slate-600">
            {r.evidence.map((e, i) => (
              <li key={i}>
                <span className="text-xs text-slate-500">
                  {e.source} · {e.date}
                </span>
                <br />
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {e.text}
                  </a>
                ) : (
                  e.text
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function Line({
  icon: Icon,
  name,
  className,
  children,
}: {
  icon: typeof Bot;
  name: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-start gap-2">
      <span className="flex items-center justify-end gap-1 pt-2 text-xs text-slate-500">
        <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{name}</span>
      </span>
      <div className={"rounded-xl border px-3 py-2 text-slate-800 " + className}>{children}</div>
    </div>
  );
}
