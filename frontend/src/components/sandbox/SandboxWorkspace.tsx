"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, CircleHelp, Play } from "lucide-react";
import ProjectHeader from "@/components/ProjectHeader";
import CaseStory, { VERDICT } from "@/components/sandbox/CaseStory";
import OpenDataPanel from "@/components/sandbox/OpenDataPanel";
import { apiGet, apiSend } from "@/lib/api";
import type { CaseResult, Project, SandboxState } from "@/lib/types";

// 不懂 AI 的老闆也能回答：問的是公司現況與老闆的決定，不是問 AI 能做什麼。
// 例：不問「AI 有沒有寫入權限」，而是問「你願不願意讓 AI 直接退款」。沒列到的沿用後端名稱。
const PLAIN_CONDITION: Record<string, { label: string; hint: string }> = {
  docs_ready: {
    label: "我們有寫好的退貨規定或作業流程",
    hint: "紙本、Word、公告都算。AI 要照規定回答客人，沒有規定就只能用猜的。",
  },
  api_connected: {
    label: "訂單、物流資料都在系統裡（例如蝦皮後台）",
    hint: "只記在本子或腦中的話，AI 查不到。",
  },
  read_permission: {
    label: "我願意讓 AI 查看訂單和物流資料",
    hint: "就像讓新進員工登入後台查資料，但不能改。",
  },
  write_permission: {
    label: "我願意讓 AI 直接幫客人退款、回覆訊息",
    hint: "不勾也沒關係，AI 可以先準備好，由人按下確認。",
  },
  required_fields: {
    label: "客人資料不齊時，我們知道要請他補什麼",
    hint: "例如沒給訂單編號，要請他提供姓名和手機末三碼。",
  },
  open_data: {
    label: "希望系統順便比對政府公告的違規、召回商品",
    hint: "例如客人買的行動電源，政府是否公告過有問題。",
  },
  handoff_owner: {
    label: "出狀況時，已經指定誰接手、多久內處理",
    hint: "例如商品冒煙一律由主管在 24 小時內打電話給客人。",
  },
};

const ORDER: CaseResult["disposition"][] = ["AI 協助完成", "正確轉人工", "人工處理", "需補足條件"];

export default function SandboxWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<SandboxState | null>(null);
  const [config, setConfig] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null); // 目前展開說明的題目
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiGet<Project>(`/api/projects/${id}`), apiGet<SandboxState>(`/api/projects/${id}/sandbox`)])
      .then(([p, s]) => {
        setProject(p);
        setState(s);
        setConfig(s.config);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  // 測試是固定規則、幾乎瞬間完成，所以每次打勾都直接重跑，讓企業馬上看到差別
  const run = async (next: Record<string, boolean>) => {
    setConfig(next);
    setRunning(true);
    setError(null);
    try {
      setState(await apiSend<SandboxState>("POST", `/api/projects/${id}/sandbox/run`, { config: next, scenarios: [] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "模擬失敗");
    } finally {
      setRunning(false);
    }
  };

  if (!project || !state) return <main className="p-8 text-slate-600">{error ?? "載入中…"}</main>;

  const results = state.results;
  const aiSteps = Object.values(project.allocations).filter((a) => a.mode !== "human").length;
  const current = results.find((r) => r.id === selected) ?? results.find((r) => r.disposition === "需補足條件") ?? results[0];

  return (
    <main className="flex min-h-screen flex-col">
      <ProjectHeader project={project} stage={2} />

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <Link href={`/projects/${id}/allocate`} className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50">
          ← 調整人機分工
        </Link>
        <span className="ml-2 text-slate-500">用今天會遇到的客人，模擬 AI 上線後的樣子；不會真的退款或回覆客人</span>
        <Link
          href={`/projects/${id}/report`}
          className="ml-auto rounded-md bg-brand-600 px-3 py-1 font-medium text-white hover:bg-brand-700"
        >
          下一步：需求草案產出 →
        </Link>
      </div>

      {aiSteps === 0 && (
        <p className="bg-amber-50 px-4 py-1.5 text-sm text-amber-900">
          目前所有步驟都由人員處理。先到「AI 介入探索」為步驟選擇 AI 分工，才看得出 AI 上線後的差別。
        </p>
      )}
      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-4">
        {/* 一句話總結 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {results.length === 0 ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-slate-900">模擬上線一天</h2>
                <p className="mt-1 text-sm text-slate-600">
                  系統準備了 7 位今天會遇到的客人：想退貨、問保固、包裹沒到、商品發燙、要申訴……
                  看看照目前的分工，AI 能幫上哪些忙、哪些會交給人、哪些會卡住。
                </p>
              </div>
              <button
                onClick={() => run(config)}
                disabled={running}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                <Play aria-hidden className="h-4 w-4" />
                {running ? "模擬中…" : "開始模擬一天"}
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-900">
                模擬上線一天：今天有 {results.length} 位客人來詢問
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {ORDER.filter((d) => state.summary?.dispositions[d]).map((d) => (
                  <span key={d} className={"rounded-full px-3 py-1 text-sm font-medium " + VERDICT[d].chip}>
                    {VERDICT[d].label} {state.summary!.dispositions[d]} 位
                  </span>
                ))}
              </div>
              {state.summary?.gaps.length === 0 && (
                <p className="mt-3 text-sm text-emerald-700">照目前的準備，今天的客人都能妥善處理。</p>
              )}
              {(state.summary?.gaps.length ?? 0) > 0 && (
                <p className="mt-3 text-sm text-slate-600">點左邊「卡住了」的客人，可以看卡住的原因和要準備什麼。</p>
              )}
            </>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
              <h3 className="font-semibold text-slate-900">我們公司目前的狀況</h3>
              <p className="mt-0.5 text-xs text-slate-500">不用懂 AI，照公司實際情況勾選就好；不確定的先不要勾。勾完右邊結果會馬上更新。</p>
              <div className="mt-3 space-y-2">
                {Object.keys(state.conditions).map((key) => {
                  const plain = PLAIN_CONDITION[key];
                  return (
                    <div key={key} className="rounded-lg p-1 hover:bg-slate-50">
                      <div className="flex items-start gap-2">
                        <label className="flex flex-1 items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1 accent-brand-600"
                            checked={!!config[key]}
                            disabled={running}
                            onChange={(e) => run({ ...config, [key]: e.target.checked })}
                          />
                          <span>{plain?.label ?? state.conditions[key]}</span>
                        </label>
                        {plain && (
                          <button
                            type="button"
                            onClick={() => setHint(hint === key ? null : key)}
                            aria-label="這題是什麼意思"
                            aria-expanded={hint === key}
                            className={
                              "mt-0.5 shrink-0 rounded-full " +
                              (hint === key ? "text-brand-600" : "text-slate-500 hover:text-brand-600")
                            }
                          >
                            <CircleHelp aria-hidden className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {plain && hint === key && (
                        <p className="mt-1 ml-6 rounded-md bg-slate-100 px-2 py-1.5 text-xs text-slate-600">{plain.hint}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {results.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
                <h3 className="font-semibold text-slate-900">今天的客人</h3>
                <ul className="mt-2 space-y-1.5">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => setSelected(r.id)}
                        className={
                          "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left " +
                          (current?.id === r.id ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50")
                        }
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{r.title}</span>
                          <span className="text-xs font-medium text-slate-600">{r.scenario}</span>
                        </span>
                        <span className={"shrink-0 rounded-full px-2 py-0.5 text-xs " + VERDICT[r.disposition].chip}>
                          {VERDICT[r.disposition].label}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="flex items-center gap-1 px-4 py-3 text-sm font-semibold text-slate-900">
                <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" />
                系統會比對的政府公開資料
              </summary>
              <div className="border-t border-slate-100">
                <OpenDataPanel />
              </div>
            </details>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {current ? (
              <>
                <h3 className="mb-4 font-semibold text-slate-900">
                  「{current.title}」的客人，是怎麼被處理的？
                </h3>
                <CaseStory
                  result={current}
                  nodes={project.flow.nodes}
                  conditionLabel={(k) => PLAIN_CONDITION[k]?.label ?? state.conditions[k]}
                />
              </>
            ) : (
              <p className="py-16 text-center text-slate-500">按「開始模擬一天」，這裡會一步一步顯示每位客人被處理的過程。</p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
