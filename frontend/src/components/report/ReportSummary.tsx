import { ChevronRight, Clock, FileText, GraduationCap, Plug, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import type { ReportData } from "@/lib/types";

// AI 參與程度是有順序的：人工（灰，沒有 AI）→ 藍色由淺到深（已用 dataviz 驗證：單一色相、亮度遞減、最淺一階對底色 2:1）
// 圖例由 AI 做最多排到最少，和圓餅圖從 12 點鐘方向順時針的順序一致
const LEVELS = [
  { mode: "AI 自動執行", color: "#184f95" },
  { mode: "AI 執行後人工確認", color: "#3987e5" },
  { mode: "AI 輔助", color: "#86b6ef" },
  { mode: "人工執行", color: "#d6d5cf" },
];

const STAGE_TEXT: Record<string, string> = {
  "AI 輔助": "AI 只幫忙準備，人做決定",
  "AI 執行後人工確認": "AI 先做，人確認後才算數",
  "AI 自動執行": "前面穩定後，再讓 AI 自動做",
};

/** 風險的建議對策：這一種分工本身的把關方式，加上這一步交給人處理的情況（取前兩項） */
function countermeasure(mode: string, handoff: string[]): string {
  const base = { "AI 輔助": "由人做最後決定", "AI 執行後人工確認": "人確認後才算數", "AI 自動執行": "AI 自動完成" }[mode] ?? "";
  // 有些情況本身就寫了「…時由人工接手」，去掉結尾，避免和後面的「時交給人處理」重複
  const cases = [...new Set(handoff.map((h) => h.replace(/時(由|轉|交).*$|時$/, "")))].slice(0, 2);
  return cases.length ? `${base}；遇到${cases.join("、")}時交給人處理。` : `${base}；例外情況交給人處理。`;
}

/** 列前幾項，其餘只寫數量 */
const short = (items: string[], n: number) => {
  const unique = [...new Set(items.filter(Boolean))];
  return unique.length > n ? `${unique.slice(0, n).join("、")} 等 ${unique.length} 項` : unique.join("、");
};

/**
 * 導入時會花錢的項目，只列項目不估金額（系統沒有價格資料，不替企業編數字）。
 * 依報告內容判斷要不要列：有要讀取的系統才列串接、有人要確認 AI 結果才列內部工時……
 */
function costItems(report: ReportData): { icon: LucideIcon; title: string; detail: string }[] {
  const ai = report.allocations.filter((a) => a.mode !== "人工執行");
  const count = (mode: string) => ai.filter((a) => a.mode === mode).length;
  const roles = [...new Set(ai.map((a) => a.role).filter(Boolean))];
  const items: { icon: LucideIcon; title: string; detail: string }[] = [];
  if (report.systems.length) items.push({ icon: Plug, title: "系統串接", detail: `讓 AI 讀取：${short(report.systems, 3)}` });
  if (ai.length) items.push({ icon: Sparkles, title: "AI 服務使用費", detail: `${ai.length} 個步驟會用到 AI，通常按月或按用量計費` });
  if (report.data.length) items.push({ icon: FileText, title: "資料整理", detail: `先把 AI 要用的資料整理好：${short(report.data, 3)}` });
  if (ai.length) items.push({ icon: GraduationCap, title: "教育訓練", detail: `教${roles.length ? short(roles, 3) : "相關人員"}使用 AI、檢查 AI 的結果` });
  if (count("AI 執行後人工確認")) items.push({ icon: Clock, title: "內部人力時間", detail: `${count("AI 執行後人工確認")} 個步驟要有人確認 AI 的結果` });
  if (count("AI 自動執行")) items.push({ icon: Wrench, title: "日常維護", detail: `${count("AI 自動執行")} 個步驟由 AI 自動做，要定期檢查、更新規則` });
  return items;
}

/** 需求草案的簡略版：圓餅圖看出 AI 幫多少、哪幾步由誰做，再看導入順序與風險對策；細節看下面的完整報告 */
export default function ReportSummary({ report }: { report: ReportData }) {
  const o = report.overview;
  const groups = LEVELS.map((l) => ({ ...l, steps: report.allocations.filter((a) => a.mode === l.mode).map((a) => a.step) }));
  const total = report.allocations.length;
  const aiSteps = total - (groups.find((g) => g.mode === "人工執行")?.steps.length ?? 0);
  // 只有 AI 參與的步驟有風險說明；依 LEVELS 順序（AI 做最多的在前）排列
  const risks = LEVELS.flatMap((l) =>
    report.allocations
      .filter((a) => a.mode === l.mode && a.risk)
      .map((a) => ({ step: a.step, risk: a.risk, mode: a.mode, color: l.color, handoff: a.handoff ?? [] })),
  );
  // 導入順序和圖例相反：AI 做得少、人能把關的先試，AI 自動執行的最後
  const stages = groups.filter((g) => g.mode in STAGE_TEXT && g.steps.length).reverse();
  const costs = costItems(report);

  return (
    <section aria-label="報告重點" className="mt-6 break-inside-avoid [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
      <p className="text-lg">
        <span className="mr-2 text-slate-500">主旨</span>
        {o.work || o.project}
      </p>

      <figure className="mt-6 flex flex-wrap items-center gap-x-12 gap-y-6">
        <Pie groups={groups} total={total} aiSteps={aiSteps} />
        <figcaption className="min-w-0 flex-1">
          <ul className="space-y-3">
            {groups.map((g) => (
              <li key={g.mode} className={"grid grid-cols-[1rem_auto_1fr] items-start gap-x-3 " + (g.steps.length ? "" : "opacity-50")}>
                <span className="mt-1 h-4 w-4 rounded" style={{ background: g.color }} aria-hidden />
                <span className="font-medium text-slate-900">
                  {g.mode}
                  <span className="ml-2 font-normal text-slate-500 tabular-nums">{g.steps.length} 步</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {g.steps.map((s, i) => (
                    <span key={i} className="rounded-md border border-slate-200 bg-slate-50 px-2 text-sm leading-6 text-slate-700">
                      {s}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </figcaption>
      </figure>

      {stages.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">建議導入順序</h2>
          <p className="mt-0.5 text-sm text-slate-500">先從人能把關、出錯影響小的步驟試起，順了再進到下一階段。</p>
          <ol className="mt-3 flex flex-wrap items-stretch gap-2">
            {stages.map((s, i) => (
              <li key={s.mode} className="flex items-stretch gap-2">
                {i > 0 && <ChevronRight aria-hidden className="h-5 w-5 shrink-0 self-center text-slate-400" />}
                <div className="w-60 rounded-lg border border-slate-200 p-3">
                  <p className="flex items-center gap-2 font-medium text-slate-900">
                    <span className="h-4 w-4 shrink-0 rounded" style={{ background: s.color }} aria-hidden />第 {i + 1} 階段
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">{STAGE_TEXT[s.mode]}</p>
                  <ul className="mt-2 space-y-0.5 text-sm text-slate-800">
                    {s.steps.map((step, k) => (
                      <li key={k}>・{step}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {costs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">要準備預算的地方</h2>
          <p className="mt-0.5 text-sm text-slate-500">以下是導入時會花錢的項目，金額請向廠商詢價。</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {costs.map(({ icon: Icon, title, detail }) => (
              <li key={title} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                <span>
                  <span className="block font-medium text-slate-900">{title}</span>
                  <span className="block text-sm text-slate-600">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {risks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">
            風險與建議對策
            <span className="ml-2 text-base font-normal text-slate-500">{risks.length} 個步驟要注意</span>
          </h2>
          {/* AI 做得越多的步驟排越前面；步驟標籤用和圓餅圖相同的顏色，一眼對得上 */}
          <ul className="mt-3 space-y-3">
            {risks.map(({ step, risk, color, mode, handoff }, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,14rem)_1fr] items-start gap-4">
                <span className="flex items-center gap-2" title={mode}>
                  <span className="h-4 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                  <span className="truncate font-medium text-slate-900">{step}</span>
                </span>
                <span>
                  <span className="block text-slate-800">
                    <span className="mr-2 text-sm text-red-700">風險</span>
                    {risk}
                  </span>
                  <span className="mt-0.5 block text-slate-700">
                    <span className="mr-2 text-sm text-emerald-700">建議對策</span>
                    {countermeasure(mode, handoff)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-sm text-slate-500">資料、權限、試跑結果與風險的細節，在下方「完整報告內容」。</p>
    </section>
  );
}

/** 中空圓餅圖：片與片之間留 2px 縫，中間寫「幾步讓 AI 幫忙」；滑過每一片會顯示步數 */
function Pie({ groups, total, aiSteps }: { groups: { mode: string; color: string; steps: string[] }[]; total: number; aiSteps: number }) {
  const R = 60;
  const C = 2 * Math.PI * R;
  const GAP = groups.filter((g) => g.steps.length).length > 1 ? 2 : 0;
  const summary = groups
    .filter((g) => g.steps.length)
    .map((g) => `${g.mode} ${g.steps.length} 步`)
    .join("、");
  const slices = groups
    .filter((g) => g.steps.length)
    .reduce<{ g: (typeof groups)[number]; len: number; start: number }[]>((acc, g) => {
      const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].len : 0;
      return [...acc, { g, len: (g.steps.length / Math.max(total, 1)) * C, start }];
    }, []);

  return (
    <svg viewBox="0 0 160 160" className="h-52 w-52 shrink-0" role="img" aria-label={`共 ${total} 步，${aiSteps} 步讓 AI 幫忙：${summary}`}>
      <g transform="rotate(-90 80 80)">
        {total === 0 ? (
          <circle cx="80" cy="80" r={R} fill="none" stroke="#e7e6e1" strokeWidth="26" />
        ) : (
          slices.map(({ g, len, start }) => (
            <circle
              key={g.mode}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={g.color}
              strokeWidth="26"
              strokeDasharray={`${Math.max(len - GAP, 0)} ${C}`}
              strokeDashoffset={-start}
            >
              <title>{`${g.mode} ${g.steps.length} 步`}</title>
            </circle>
          ))
        )}
      </g>
      <text x="80" y="80" textAnchor="middle" className="fill-slate-900 text-[34px] font-bold">
        {aiSteps}
        <tspan className="fill-slate-400 text-[20px] font-medium">{` / ${total}`}</tspan>
      </text>
      <text x="80" y="102" textAnchor="middle" className="fill-slate-600 text-[13px]">
        步讓 AI 幫忙
      </text>
    </svg>
  );
}
