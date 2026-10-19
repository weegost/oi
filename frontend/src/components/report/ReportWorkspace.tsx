"use client";

import { Download, Printer, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import ProjectHeader from "@/components/ProjectHeader";
import { API_BASE, apiGet, apiSend } from "@/lib/api";
import type { Project, ReportData } from "@/lib/types";

const KIND_LABEL: Record<string, string> = { process: "工作", wait: "等待", decision: "判斷", handoff: "人工接管" };

export default function ReportWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiGet<Project>(`/api/projects/${id}`), apiGet<ReportData>(`/api/projects/${id}/report`)])
      .then(([p, r]) => {
        setProject(p);
        setReport(r);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const writeSummary = async () => {
    setWriting(true);
    setError(null);
    try {
      setReport(await apiSend<ReportData>("POST", `/api/projects/${id}/report/summary`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 暫時無法回應");
    } finally {
      setWriting(false);
    }
  };

  if (!project || !report) return <main className="p-8 text-slate-600">{error ?? "載入中…"}</main>;

  const o = report.overview;
  const t = report.testing;
  const btn = "inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50";

  return (
    <main className="min-h-screen">
      <div className="print:hidden">
        <ProjectHeader project={project} stage={3} />
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-sm">
          <Link href={`/projects/${id}/sandbox`} className={btn}>
            ← 情境沙盒測試
          </Link>
          <button onClick={writeSummary} disabled={writing} className={btn + " ml-auto disabled:opacity-60"}>
            <Sparkles aria-hidden className="h-4 w-4" />
            {writing ? "AI 撰寫中…" : report.ai_summary ? "重新撰寫 AI 摘要" : "請 AI 撰寫摘要"}
          </button>
          <a href={`${API_BASE}/api/projects/${id}/report/markdown`} className={btn}>
            <Download aria-hidden className="h-4 w-4" />
            下載 Markdown
          </a>
          <button onClick={() => window.print()} className={btn}>
            <Printer aria-hidden className="h-4 w-4" />
            列印／存成 PDF
          </button>
          <a
            href={`${API_BASE}/api/projects/${id}/report/docx`}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1 font-medium text-white hover:bg-brand-700"
          >
            <Download aria-hidden className="h-4 w-4" />
            下載 Word
          </a>
        </div>
        {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      </div>

      <article className="mx-auto my-6 max-w-4xl rounded-xl border border-slate-200 bg-white px-8 py-10 text-[15px] leading-relaxed text-slate-800 shadow-sm print:my-0 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-slate-200 pb-5">
          <p className="text-sm text-brand-600">智行進業 BizPilot AI · AI 導入需求草案</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{report.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            產出日期 {report.generated_on} ・ 供顧問諮詢、工具採購或系統開發溝通使用
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="工作步驟" value={o.stats.steps} />
            <Stat label="規劃 AI 介入" value={o.stats.ai_steps} />
            <Stat label="測試案例" value={o.stats.cases} />
            <Stat label="導入缺口" value={o.stats.gaps} warn={o.stats.gaps > 0} />
          </dl>
        </header>

        {report.todo.length > 0 && (
          <div className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 print:hidden">
            草案還有 {report.todo.length} 項待確認，詳見第 9 節。
          </div>
        )}

        {report.ai_summary && (
          <Section title="摘要" note="AI 依草案內容撰寫，請企業確認">
            <p className="whitespace-pre-wrap">{report.ai_summary}</p>
          </Section>
        )}

        <Section title="1. 專案概要">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[8rem_1fr]">
            <Row label="企業" value={`${o.company}（${o.is_demo ? "案例代碼" : "統一編號"} ${o.tax_id}）`} />
            <Row label="產業" value={o.industry} />
            <Row label="改善專案" value={o.project} />
            <Row label="想改善的工作" value={o.work} />
            <Row label="目前問題" value={o.problem} />
            <Row label="分析範圍" value={o.scope} />
            {o.documents.length > 0 && <Row label="參考的企業文件" value={o.documents.join("、")} />}
          </dl>
        </Section>

        <Section title="2. 現況工作流程">
          <Table
            head={["#", "步驟", "類型", "負責角色", "使用系統", "需要的資料", "確認"]}
            rows={report.steps.map((s, i) => [
              String(i + 1),
              s.title,
              KIND_LABEL[s.kind] ?? s.kind,
              s.role,
              s.system,
              s.data,
              s.status,
            ])}
          />
        </Section>

        <Section title="3. 人機分工與 AI 任務">
          <div className="space-y-4">
            {report.allocations.filter((a) => a.mode !== "人工執行").map((a) => (
              <div key={a.step} className="break-inside-avoid rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="font-semibold text-slate-900">{a.step}</h3>
                  <span className="rounded bg-brand-50 px-2 text-sm text-brand-700">{a.mode}</span>
                  {a.recommended && a.recommended !== a.mode && (
                    <span className="text-xs text-slate-500">AI 建議：{a.recommended}</span>
                  )}
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[6rem_1fr]">
                  <Row label="AI 做什麼" value={a.ai_does} />
                  <Row label="人做什麼" value={a.human_does} />
                  <Row label="AI 任務" value={a.ai_tasks.join("；")} />
                  <Row label="改善目標" value={a.goal} />
                  <Row label="主要風險" value={a.risk} />
                </dl>
              </div>
            ))}
            {report.allocations.some((a) => a.mode === "人工執行") && (
              <p className="text-sm text-slate-600">
                維持人工執行：
                {report.allocations
                  .filter((a) => a.mode === "人工執行")
                  .map((a) => a.step)
                  .join("、")}
              </p>
            )}
          </div>
        </Section>

        <Section title="4. 所需資料與系統">
          <List items={[...report.data.map((d) => `資料：${d}`), ...report.systems.map((s) => `系統：${s}`)]} empty="尚無 AI 分工" />
        </Section>
        <Section title="5. 操作權限">
          <List items={report.permissions} empty="尚無 AI 分工" />
        </Section>
        <Section title="6. 人工接管方式">
          <List items={report.handoffs} empty="尚未定義" />
        </Section>

        <Section title="7. 情境沙盒測試">
          {!t.tested ? (
            <p className="text-slate-500">尚未執行情境測試。</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                第 {t.run} 次測試
                {t.stale && <span className="ml-2 text-amber-700">（流程或分工已變更，結果可能過期）</span>}
              </p>
              <p className="mt-2 text-sm">
                <span className="text-slate-500">假設已具備：</span>
                {t.assumed.join("、") || "無"}
              </p>
              <p className="text-sm">
                <span className="text-slate-500">尚未具備：</span>
                {t.not_ready.join("、") || "無"}
              </p>
              <div className="mt-3">
                <Table
                  head={["情境", "案例", "結果", "風險"]}
                  rows={t.cases.map((c) => [c.scenario, c.title, c.disposition, c.risks.join("；")])}
                />
              </div>
              {t.evidence.length > 0 && (
                <>
                  <p className="mt-3 text-sm font-medium">政府開放資料比對</p>
                  <List items={t.evidence} />
                </>
              )}
            </>
          )}
        </Section>

        <Section title="8. 導入缺口">
          {report.gaps.length === 0 ? (
            <p className="text-slate-500">目前測試中沒有發現缺口。</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {report.gaps.map((g, i) => (
                <li key={i}>
                  <span className="mr-1 rounded bg-red-50 px-1.5 text-xs text-red-700">{g.type}</span>
                  {g.issue}
                  <span className="block text-slate-500">建議：{g.action}（影響 {g.cases.length} 個案例）</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="9. 尚待確認事項">
          {report.todo.length === 0 ? (
            <p className="text-emerald-700">沒有待確認事項。</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {report.todo.map((x, i) => (
                <li key={i} className="flex gap-2">
                  <Square aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  {x}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <p className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">
          本草案中的測試以模擬系統與虛構案例進行，未連接企業真實系統，也不會實際退款或開通權限。
        </p>
      </article>
    </main>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="border-l-4 border-brand-500 pl-3 text-lg font-semibold text-slate-900">
        {title}
        {note && <span className="ml-2 text-xs font-normal text-slate-500">{note}</span>}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={"text-2xl font-bold " + (warn ? "text-red-600" : "text-slate-900")}>{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function List({ items, empty }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-slate-500">{empty}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-slate-600">
            {head.map((h) => (
              <th key={h} className="border border-slate-200 px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="break-inside-avoid">
              {r.map((c, j) => (
                <td key={j} className="border border-slate-200 px-2 py-1.5 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
