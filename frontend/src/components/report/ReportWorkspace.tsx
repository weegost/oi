"use client";

import { ChevronDown, Download, Printer, Sparkles } from "lucide-react";
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

  // 收合的區塊在列印時要展開，否則存成 PDF 會漏掉內容
  useEffect(() => {
    const setAll = (open: boolean) => {
      document.querySelectorAll<HTMLDetailsElement>("article details[data-print-open]").forEach((d) => {
        if (open) d.dataset.wasOpen = String(d.open);
        d.open = open ? true : d.dataset.wasOpen === "true";
      });
    };
    const before = () => setAll(true);
    const after = () => setAll(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

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
  const stepRisks = report.allocations.filter((a) => a.risk);
  // 缺口已列在「導入前需補足的條件」，這裡只留其他待確認事項
  const pending = report.todo.filter((x) => !x.startsWith("[") && x !== "尚未執行情境沙盒測試。");
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
        {/* 頁首：系統名稱 */}
        <div className="flex items-center justify-between border-b-2 border-brand-600 pb-2 text-sm">
          <span className="font-semibold text-brand-700">{report.system}</span>
          <span className="text-slate-500">AI 導入需求草案</span>
        </div>
        <h1 className="mt-6 text-2xl font-bold text-slate-900">{report.title}</h1>

        <Section title="1. 專案概要">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[8rem_1fr]">
            <Row label="專案名稱" value={o.project} />
            <Row
              label="企業"
              value={o.has_tax_id ? `${o.company}（${o.is_demo ? "案例代碼" : "統一編號"} ${o.tax_id}）` : o.company}
            />
            <Row label="產業" value={o.industry} />
            <Row label="產出日期" value={report.generated_on} />
            <Row label="規模" value={`${o.stats.steps} 個工作步驟，其中 ${o.stats.ai_steps} 步規劃 AI 介入`} />
            {o.documents.length > 0 && <Row label="參考的企業文件" value={o.documents.join("、")} />}
          </dl>
        </Section>

        <Section title="2. 專案摘要">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[8rem_1fr]">
            <Row label="想改善的工作" value={o.work} />
            <Row label="目前問題" value={o.problem} />
          </dl>
          {report.ai_summary && (
            <div className="mt-4 rounded-lg bg-slate-50 p-4">
              <p className="mb-1 text-xs text-slate-500">AI 摘要（AI 依草案內容撰寫，請企業確認）</p>
              <p className="whitespace-pre-wrap">{report.ai_summary}</p>
            </div>
          )}
        </Section>

        <Section title="3. 人力與 AI 分配">
          <Table
            head={["步驟", "分工方式", "AI 負責", "人員負責"]}
            rows={report.allocations.map((a) => [
              a.step,
              a.mode,
              a.ai_does,
              a.human_does || (a.mode === "人工執行" ? `由${a.role || "負責人"}處理` : ""),
            ])}
          />
          {report.handoffs.length > 0 && (
            <Collapsible title="需轉由人工處理的情況" count={report.handoffs.length}>
              <List items={report.handoffs} />
            </Collapsible>
          )}
        </Section>

        <Section title="4. 現行工作流程">
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

        <Section title="5. AI 所需資料">
          <List items={report.data} empty="尚無 AI 分工" />
          {report.systems.length > 0 && (
            <p className="mt-2 text-sm">
              <span className="text-slate-500">需介接的系統：</span>
              {report.systems.join("、")}
            </p>
          )}
        </Section>

        <Section title="6. AI 操作權限">
          <List items={report.permissions} empty="尚無 AI 分工" />
        </Section>

        <Section title="7. 主要風險">
          {stepRisks.length > 0 && (
            <>
              <h3 className="font-medium text-slate-900">各步驟的風險</h3>
              <List items={stepRisks.map((a) => `${a.step}（${a.mode}）：${a.risk}`)} />
            </>
          )}
          <h3 className="mt-4 font-medium text-slate-900">導入前需補足的條件</h3>
          {!t.tested && <p className="text-sm text-amber-700">尚未執行情境沙盒測試，導入條件還沒有經過驗證。</p>}
          {t.tested && report.gaps.length === 0 && <p className="text-sm text-emerald-700">情境測試中沒有發現缺口。</p>}
          {report.gaps.length > 0 && (
            <ul className="space-y-2 text-sm">
              {report.gaps.map((g, i) => (
                <li key={i}>
                  <span className="mr-1 rounded bg-red-50 px-1.5 text-xs text-red-700">{g.type}</span>
                  {g.issue}
                  <span className="block text-slate-500">
                    建議：{g.action}（影響 {g.cases.length} 個測試案例）
                  </span>
                </li>
              ))}
            </ul>
          )}
          {pending.length > 0 && (
            <>
              <h3 className="mt-4 font-medium text-slate-900">尚待確認</h3>
              <List items={pending} />
            </>
          )}
        </Section>

        {/* 頁尾：免責聲明 */}
        <p className="mt-10 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">{report.disclaimer}</p>
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

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

/** 較長的清單收起來，點標題才展開；列印時會自動展開 */
function Collapsible({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <details data-print-open className="group mt-3 rounded-lg border border-slate-200">
      <summary className="flex list-none items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" />
        {title}
        <span className="font-normal text-slate-500">（{count} 項）</span>
      </summary>
      <div className="border-t border-slate-100 px-3 py-2">{children}</div>
    </details>
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
