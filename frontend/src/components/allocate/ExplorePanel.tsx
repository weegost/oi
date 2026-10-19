"use client";

import { Check, Star } from "lucide-react";
import SourceList from "@/components/docs/SourceList";
import { MODE_LABEL, MODE_STYLE, type Allocation, type Fit, type FlowNode, type Mode, type ModeOption } from "@/lib/types";

const FIT_STYLE: Record<Fit, string> = {
  建議: "bg-emerald-600 text-white",
  可行: "bg-slate-200 text-slate-700",
  不建議: "bg-red-100 text-red-700",
};

type Props = {
  node: FlowNode;
  allocation?: Allocation;
  exploring: boolean;
  onExplore: () => void;
  onChoose: (mode: Mode) => void;
};

export default function ExplorePanel({ node, allocation, exploring, onExplore, onChoose }: Props) {
  const exp = allocation?.exploration;
  const chosen = allocation?.mode ?? "human";

  return (
    <div className="space-y-4 p-4 text-sm">
      <div>
        <p className="text-xs text-slate-500">{node.role || "負責人未填"}</p>
        <h3 className="text-base font-semibold">{node.title}</h3>
        {node.data && <p className="mt-1 text-slate-600">需要的資料：{node.data}</p>}
      </div>

      {!exp ? (
        <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50 p-4">
          <p className="text-brand-900">讓 AI 分析這一步可以怎麼協助，並比較四種人機分工方式。</p>
          <button
            onClick={onExplore}
            disabled={exploring}
            className="mt-3 w-full rounded-md bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {exploring ? "AI 分析中，約需 15–40 秒…" : "探索 AI 可以怎麼協助"}
          </button>
        </div>
      ) : (
        <>
          <section>
            <h4 className="font-semibold text-slate-700">AI 可以協助的任務</h4>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700">
              {exp.ai_tasks.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            <p className="mt-2 text-slate-600">
              <span className="font-medium text-slate-700">改善目標：</span>
              {exp.goal}
            </p>
            {allocation?.sources && <SourceList sources={allocation.sources} title="分析時參考的企業文件" />}
          </section>

          <section className="space-y-3">
            <h4 className="font-semibold text-slate-700">四種分工方式比較</h4>
            {exp.options.map((o) => (
              <OptionCard
                key={o.mode}
                option={o}
                chosen={chosen === o.mode}
                recommended={exp.recommended === o.mode}
                onChoose={() => onChoose(o.mode)}
              />
            ))}
          </section>

          <button onClick={onExplore} disabled={exploring} className="text-xs text-brand-600 hover:underline disabled:opacity-60">
            {exploring ? "重新分析中…" : "重新分析"}
          </button>
        </>
      )}
    </div>
  );
}

function OptionCard({
  option: o,
  chosen,
  recommended,
  onChoose,
}: {
  option: ModeOption;
  chosen: boolean;
  recommended: boolean;
  onChoose: () => void;
}) {
  return (
    <div className={"rounded-lg border-2 p-3 " + (chosen ? "border-brand-500 bg-brand-50/40" : "border-slate-200")}>
      <div className="flex items-center justify-between gap-2">
        <span className={"rounded border px-2 py-0.5 text-xs font-semibold " + MODE_STYLE[o.mode]}>
          {MODE_LABEL[o.mode]}
        </span>
        <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + FIT_STYLE[o.fit]}>
          {recommended ? (
            <span className="flex items-center gap-1">
              <Star aria-hidden className="h-3 w-3 fill-current" />
              建議
            </span>
          ) : (
            o.fit
          )}
        </span>
      </div>
      <dl className="mt-2 space-y-1.5 text-[13px]">
        <Row label="AI 做什麼" value={o.ai_does} />
        <Row label="人做什麼" value={o.human_does} />
        {o.mode !== "human" && (
          <>
            <Row label="所需資料" value={o.required_data.join("、")} />
            <Row label="操作權限" value={o.permissions.join("、")} />
          </>
        )}
        <Row label="人工接管" value={o.handoff.join("、")} />
        <Row label="風險" value={o.risk} />
      </dl>
      {o.reason && <p className={"mt-2 text-xs " + (o.fit === "不建議" ? "text-red-700" : "text-slate-500")}>{o.reason}</p>}
      <button
        onClick={onChoose}
        disabled={chosen}
        className={
          "mt-2 w-full rounded-md py-1.5 text-sm font-medium " +
          (chosen ? "bg-brand-600 text-white" : "border border-slate-300 hover:bg-slate-50")
        }
      >
        {chosen ? (
          <span className="flex items-center justify-center gap-1">
            <Check aria-hidden className="h-4 w-4" />
            目前採用
          </span>
        ) : (
          "採用這個分工"
        )}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}
