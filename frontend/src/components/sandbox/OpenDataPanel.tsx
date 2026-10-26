"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import type { OpenDataSummary } from "@/lib/types";

export default function OpenDataPanel() {
  const [data, setData] = useState<OpenDataSummary | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    apiGet<OpenDataSummary>("/api/opendata").then(setData).catch(() => setData(null));
  }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      setData(await apiSend<OpenDataSummary>("POST", "/api/opendata/sync"));
    } finally {
      setSyncing(false);
    }
  };

  if (!data) return <p className="p-4 text-xs text-slate-500">開放資料載入中…</p>;

  const online = data.penalty_channels["網路"] ?? 0;
  const total = Object.values(data.penalty_channels).reduce((a, b) => a + b, 0);

  return (
    <section className="space-y-3 p-4 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">政府開放資料</h3>
        <button onClick={sync} disabled={syncing} className="text-xs text-brand-600 hover:underline disabled:opacity-60">
          {syncing ? "同步中…" : "立即同步"}
        </button>
      </div>
      <ul className="space-y-1.5 text-xs">
        {data.syncs.map((s) => (
          <li key={s.dataset} className="flex justify-between gap-2">
            <span>{s.dataset}</span>
            <span className="text-right text-slate-500">
              {s.total.toLocaleString("zh-TW")} 筆
              <span className={"ml-1 rounded px-1 " + (s.source === "live" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100")}>
                {s.source === "live" ? "已同步" : "快照"}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {total > 0 && (
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p>
            處分案件 {data.penalty_range[0]} ～ {data.penalty_range[1]}，共 {total} 件，其中
            <strong className="text-slate-800"> 網路販售 {online} 件（{Math.round((online / total) * 100)}%）</strong>
          </p>
          <p className="mt-1.5">最多的品類：</p>
          <p className="mt-0.5">
            {data.penalty_top_categories.slice(0, 5).map((c) => `${c.category} ${c.count}`).join("、")}
          </p>
          <p className="mt-1.5 text-slate-500">官方只保留近一個月，系統每天自動同步並累積。</p>
        </div>
      )}
    </section>
  );
}
