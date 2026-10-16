import { CircleAlert, CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { MODE_LABEL, MODE_STYLE, type CaseResult, type Mode } from "@/lib/types";

const DISPOSITION_STYLE: Record<CaseResult["disposition"], string> = {
  需補足條件: "bg-red-100 text-red-800",
  正確轉人工: "bg-amber-100 text-amber-900",
  人工處理: "bg-slate-100 text-slate-700",
  "AI 協助完成": "bg-emerald-100 text-emerald-800",
};

const STATUS_ICON = { ok: CircleCheck, warn: CircleAlert, fail: CircleX } as const;
const STATUS_STYLE = { ok: "text-emerald-600", warn: "text-amber-600", fail: "text-red-600" } as const;
const STATUS_LABEL = { ok: "完成", warn: "注意", fail: "缺口" } as const;

const MODE_BY_LABEL = Object.fromEntries(Object.entries(MODE_LABEL).map(([k, v]) => [v, k])) as Record<string, Mode>;

export default function CaseCard({ result: r }: { result: CaseResult }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm">
      <header className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{r.scenario}</span>
        <h3 className="font-semibold">{r.title}</h3>
        <span className={"ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold " + DISPOSITION_STYLE[r.disposition]}>
          {r.disposition}
        </span>
      </header>

      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <span className="mr-1 text-xs text-slate-400">客戶：</span>
        {r.message}
      </p>

      {r.risks.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-amber-900">
          {r.risks.map((x, i) => (
            <li key={i} className="flex gap-1.5">
              <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              {x}
            </li>
          ))}
        </ul>
      )}

      <ol className="mt-3 space-y-1.5 text-sm">
        {r.trace.map((t, i) => {
          const mode = MODE_BY_LABEL[t.mode];
          const Icon = STATUS_ICON[t.status];
          return (
            <li key={i} className="grid grid-cols-[1.25rem_1fr] gap-2">
              <Icon aria-label={STATUS_LABEL[t.status]} className={"mt-0.5 h-5 w-5 " + STATUS_STYLE[t.status]} />
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{t.capability}</span>
                  <span className="text-xs text-slate-400">· {t.node}</span>
                  {mode && <span className={"rounded border px-1 text-xs " + MODE_STYLE[mode]}>{t.mode}</span>}
                </div>
                <p className="text-slate-600">{t.action}</p>
                {t.api && <code className="text-xs text-brand-700">{t.api}</code>}
              </div>
            </li>
          );
        })}
      </ol>

      {r.gaps.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm">
          <p className="font-medium text-red-800">導入缺口</p>
          <ul className="mt-1 space-y-1.5">
            {r.gaps.map((g, i) => (
              <li key={i}>
                <span className="mr-1 rounded bg-red-100 px-1.5 text-xs text-red-800">{g.type}</span>
                {g.issue}
                <span className="block text-xs text-slate-600">建議：{g.action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.notes.map((n, i) => (
        <p key={i} className="mt-2 text-xs text-slate-500">
          <Info aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          {n}
        </p>
      ))}

      {r.evidence.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-brand-700">政府開放資料比對結果（{r.evidence.length}）</summary>
          <ul className="mt-1 space-y-1 text-slate-600">
            {r.evidence.map((e, i) => (
              <li key={i}>
                <span className="text-xs text-slate-400">{e.source} · {e.date}</span>
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
