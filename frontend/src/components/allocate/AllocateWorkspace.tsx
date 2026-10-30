"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, GripVertical, Loader2, MoveHorizontal } from "lucide-react";
import FlowCanvas from "@/components/flow/FlowCanvas";
import ProjectHeader from "@/components/ProjectHeader";
import { apiGet, apiSend } from "@/lib/api";
import { autoLayout } from "@/lib/layout";
import { MODE_LABEL, MODE_STYLE, type Flow, type Mode, type Project } from "@/lib/types";

const MODES: Mode[] = ["human", "assist", "review", "auto"];

// 每個做法一句白話說明，不用先看細節就能選
const PLAIN: Record<Mode, string> = {
  human: "全部由人處理，AI 不參與",
  assist: "AI 整理資料，由人來決定怎麼做",
  review: "AI 先做判斷，人確認後才算數",
  auto: "AI 直接完成，人只處理例外",
};

const isTask = (kind: string) => kind !== "start" && kind !== "end";

// 拖曳分隔線時的寬度限制：左邊步驟清單固定 288px（lg:w-72），流程圖與選項各留最小寬度
const STEPS_W = 288;
const MIN_FLOW_W = 320;
const MIN_PANEL_W = 480;

/** 第二步：一次只決定一步。進頁面時會依序分析還沒分析的步驟，分析好就能選。 */
export default function AllocateWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [index, setIndex] = useState(0);
  // 正在請 AI 分析的步驟；一進頁面會一次送出全部還沒分析的步驟
  const [analyzing, setAnalyzing] = useState<string[]>([]);
  // 流程圖預設打開，想要選項欄寬一點可以從左下角收起
  const [showFlow, setShowFlow] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  // 右邊選項欄的寬度，拖曳中間的分隔線調整；拖過一次就收起「可拖曳」提示
  const [panelW, setPanelW] = useState(860);
  const [resized, setResized] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const row = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    apiGet<Project>(`/api/projects/${id}`).then(setProject).catch((e) => setError(e.message));
  }, [id]);

  const flow: Flow = useMemo(
    () => (project ? autoLayout(project.flow, 124) : { nodes: [], edges: [] }),
    [project],
  );
  const tasks = flow.nodes.filter((n) => isTask(n.kind));
  const allocs = project?.allocations ?? {};
  const total = tasks.length;
  const done = index >= total;
  const current = tasks[index];
  const currentAlloc = current ? allocs[current.id] : undefined;
  const exp = currentAlloc?.exploration;
  const mode: Mode = currentAlloc?.mode ?? "human";
  const option = exp?.options.find((o) => o.mode === mode);
  const analyzedCount = tasks.filter((n) => allocs[n.id]?.exploration).length;

  // 多個步驟一次送給後端（後端同時請 AI 分析、全部完成後一起存）；單一步驟用於重試
  const analyze = async (ids: string[]) => {
    if (running.current || !ids.length) return;
    running.current = true;
    setAnalyzing(ids);
    setError(null);
    try {
      const path = ids.length === 1 ? `/nodes/${ids[0]}/explore` : "/explore";
      setProject(await apiSend<Project>("POST", `/api/projects/${id}${path}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 暫時無法回應，請稍後再試。");
      // 部分步驟可能已經分析好並存檔，重新載入才看得到
      apiGet<Project>(`/api/projects/${id}`)
        .then(setProject)
        .catch(() => {});
    } finally {
      setAnalyzing([]);
      running.current = false;
    }
  };

  // 第一次載入時，自動分析所有還沒分析的步驟
  useEffect(() => {
    if (!project || started.current) return;
    started.current = true;
    const pending = project.flow.nodes.filter((n) => isTask(n.kind) && !project.allocations?.[n.id]?.exploration);
    void analyze(pending.map((n) => n.id));
    // 只在第一次載入時自動分析，之後的更新由按鈕觸發
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  const choose = async (nodeId: string, m: Mode) => {
    setBusy(true);
    setError(null);
    try {
      setProject(await apiSend<Project>("PUT", `/api/projects/${id}/allocations/${nodeId}`, { mode: m }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  };

  const resizeTo = (w: number) => {
    const max = (row.current?.clientWidth ?? 1920) - STEPS_W - MIN_FLOW_W;
    setPanelW(Math.round(Math.max(MIN_PANEL_W, Math.min(max, w))));
  };

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); // 拖曳時不要選到文字
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const right = row.current?.getBoundingClientRect().right ?? window.innerWidth;
    const move = (ev: PointerEvent) => resizeTo(right - ev.clientX);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      setResized(true);
      setFitKey((k) => k + 1); // 流程圖寬度變了，重新對齊
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  if (!project) return <main className="p-8 text-slate-600">{error ?? "載入中…"}</main>;

  const badges = Object.fromEntries(
    tasks.map((n) => {
      const m = allocs[n.id]?.mode ?? "human";
      return [n.id, { label: MODE_LABEL[m], cls: MODE_STYLE[m] }];
    }),
  );

  return (
    <main className="flex h-screen flex-col">
      <ProjectHeader project={project} stage={1} />

      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-2.5 text-sm">
        <Link href={`/projects/${id}`} className="text-slate-600 hover:text-slate-900">
          ← 回流程建模
        </Link>
        <span className="text-slate-500">
          {analyzing.length > 1
            ? `AI 正在一次分析 ${analyzing.length} 個步驟…`
            : analyzedCount < total
              ? `已分析 ${analyzedCount}/${total} 步`
              : `${total} 步都已分析`}
        </span>
      </div>

      {error && <p className="bg-red-50 px-6 py-2 text-sm text-red-700">{error}</p>}

      <div ref={row} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* 左：步驟清單 */}
        <aside className="max-h-48 overflow-y-auto border-b border-slate-200 bg-white lg:max-h-none lg:w-72 lg:shrink-0 lg:border-r lg:border-b-0">
          <ol className="py-2">
            {tasks.map((n, i) => {
              const a = allocs[n.id];
              const status = analyzing.includes(n.id) ? "分析中…" : a?.exploration ? MODE_LABEL[a.mode] : "等待分析";
              const active = i === index && !done;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => setIndex(i)}
                    aria-current={active ? "step" : undefined}
                    className={"flex w-full items-start gap-3 px-5 py-3 text-left " + (active ? "bg-brand-50" : "hover:bg-slate-50")}
                  >
                    <span
                      className={
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
                        (a?.exploration ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-600")
                      }
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium text-slate-900">{n.title}</span>
                      <span className="block text-xs text-slate-500">{status}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="px-5 pb-4 pt-1">
            <button onClick={() => setShowFlow((v) => !v)} className="text-sm text-brand-700 hover:underline">
              {showFlow ? "收起流程圖" : "看整張流程圖"}
            </button>
          </div>
        </aside>

        {/* 中：流程圖，預設顯示，可用「收起流程圖」隱藏；點方塊會跳到那一步 */}
        {showFlow && (
          <section
            aria-label="整張流程圖"
            className="h-80 min-w-0 border-b border-slate-200 bg-white lg:h-auto lg:flex-1 lg:border-b-0"
          >
            <FlowCanvas
              flow={flow}
              selection={current && !done ? { type: "node", id: current.id } : null}
              onChange={() => {}}
              onSelect={(s) => {
                if (s?.type !== "node") return;
                const i = tasks.findIndex((n) => n.id === s.id);
                if (i >= 0) setIndex(i);
              }}
              readOnly
              badges={badges}
              alignTop
              fitKey={fitKey}
            />
          </section>
        )}

        {/* 流程圖與選項之間的分隔線：左右拖曳（或用方向鍵）調整寬度 */}
        {showFlow && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="拖曳調整流程圖與選項的寬度"
            aria-valuenow={panelW}
            tabIndex={0}
            onPointerDown={startResize}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              resizeTo(panelW + (e.key === "ArrowLeft" ? 40 : -40));
              setResized(true);
              setFitKey((k) => k + 1);
            }}
            className="group relative z-10 hidden w-3 shrink-0 cursor-col-resize touch-none border-x border-slate-200 bg-slate-100 outline-none hover:bg-brand-100 focus-visible:bg-brand-100 lg:block"
          >
            <span className="absolute top-1/2 left-1/2 flex h-16 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm group-hover:border-brand-400 group-hover:text-brand-700">
              <GripVertical aria-hidden className="h-4 w-4" />
            </span>
            {!resized && (
              <span className="pointer-events-none absolute top-1/2 left-full ml-4 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-800 px-3 py-2 text-sm text-white shadow-lg">
                <MoveHorizontal aria-hidden className="h-4 w-4" />
                按住左右拖曳，可以調整兩邊寬度
              </span>
            )}
          </div>
        )}

        {/* 右：這一步的選項（可捲動），上一步／下一步固定在底部，不用捲就按得到；
            流程圖收起時，這一欄佔滿剩下的寬度 */}
        <div
          style={{ "--panel-w": `${panelW}px` } as React.CSSProperties}
          className={
            "flex min-h-0 min-w-0 flex-col bg-slate-50 " +
            (showFlow ? "lg:w-(--panel-w) lg:max-w-[calc(100%-38rem)] lg:shrink-0" : "flex-1")
          }
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl px-8 py-6">
              {done ? (
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{total} 步都決定好了</h2>
                  <ul className="mt-5 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                    {tasks.map((n, i) => {
                      const m = allocs[n.id]?.mode ?? "human";
                      return (
                        <li key={n.id} className="flex items-center justify-between gap-4 px-5 py-3">
                          <span className="text-[16px]">
                            {i + 1}. {n.title}
                          </span>
                          <span className={"shrink-0 rounded border px-2 py-0.5 text-sm " + MODE_STYLE[m]}>{MODE_LABEL[m]}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-slate-500">
                    第 {index + 1} 步，共 {total} 步　負責人：{current.role || "未填"}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">{current.title}</h2>

                  {!exp ? (
                    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
                      {analyzing.includes(current.id) ? (
                        <p className="flex items-center gap-2 text-[16px] text-slate-700">
                          <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
                          {analyzing.length > 1
                            ? `AI 正在一次分析 ${analyzing.length} 個步驟，約需 30–60 秒…`
                            : "AI 正在分析這一步，約需 15–40 秒…"}
                        </p>
                      ) : (
                        <>
                          <p className="text-[16px] text-slate-700">這一步還沒分析，分析後才能選。</p>
                          <button
                            onClick={() => analyze([current.id])}
                            disabled={analyzing.length > 0}
                            className="mt-4 rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                          >
                            分析這一步
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <fieldset className="mt-6">
                        <legend className="mb-3 text-[16px] font-medium text-slate-700">這一步要怎麼做？</legend>
                        <div role="radiogroup" className="grid gap-4 sm:grid-cols-2">
                          {MODES.map((m) => {
                            const checked = mode === m;
                            return (
                              <button
                                key={m}
                                role="radio"
                                aria-checked={checked}
                                disabled={busy}
                                onClick={() => choose(current.id, m)}
                                className={
                                  "flex items-start gap-4 rounded-xl border-2 bg-white p-5 text-left disabled:opacity-70 " +
                                  (checked ? "border-brand-600" : "border-slate-200 hover:border-slate-300")
                                }
                              >
                                <span
                                  className={
                                    "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 " +
                                    (checked ? "border-brand-600" : "border-slate-300")
                                  }
                                >
                                  {checked && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
                                </span>
                                <span>
                                  <span className="block text-[18px] font-semibold text-slate-900">{MODE_LABEL[m]}</span>
                                  <span className="mt-1 block text-[15px] leading-relaxed text-slate-600">{PLAIN[m]}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>

                      {option && (
                        <div className="mt-5">
                          <button
                            onClick={() => setShowDetail((v) => !v)}
                            aria-expanded={showDetail}
                            className="flex items-center gap-1 text-[15px] text-brand-700 hover:underline"
                          >
                            <ChevronDown aria-hidden className={"h-4 w-4 transition-transform " + (showDetail ? "rotate-180" : "")} />
                            {showDetail ? "收起細節" : `看「${MODE_LABEL[mode]}」的細節`}
                          </button>
                          {showDetail && (
                            <dl className="mt-3 grid gap-x-8 gap-y-4 rounded-xl bg-white p-5 text-[15px] sm:grid-cols-2">
                              <Row label="AI 做什麼" value={option.ai_does} />
                              <Row label="人做什麼" value={option.human_does} />
                              <Row label="需要的資料" value={option.required_data.join("、")} />
                              <Row label="AI 的權限" value={option.permissions.join("、")} />
                              <Row label="交給人的情況" value={option.handoff.join("、")} />
                              <Row label="風險" value={option.risk} />
                            </dl>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white px-8 py-3">
            <div className="mx-auto flex max-w-4xl items-center justify-between">
              <button
                onClick={() => setIndex((i) => Math.max(0, Math.min(i, total) - 1))}
                disabled={index === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-5 py-2.5 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
                {done ? "回到最後一步" : "上一步"}
              </button>
              {done ? (
                <Link
                  href={`/projects/${id}/sandbox`}
                  className="rounded-lg bg-brand-600 px-6 py-2.5 font-medium text-white hover:bg-brand-700"
                >
                  前往情境沙盒測試
                </Link>
              ) : (
                <button
                  onClick={() => {
                    setShowDetail(false);
                    setIndex((i) => i + 1);
                  }}
                  disabled={!exp}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-6 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-40"
                >
                  {index === total - 1 ? "確定，看總結" : "確定，下一步"}
                  <ChevronRight aria-hidden className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{value}</dd>
    </div>
  );
}
