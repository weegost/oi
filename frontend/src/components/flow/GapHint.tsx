"use client";

import { ChevronDown, ListChecks } from "lucide-react";
import type { Gap } from "@/lib/types";
import type { Selection } from "./FlowCanvas";

/** 浮在流程圖左上角的待補清單；沒選步驟時取代右側說明面板，讓畫布保持寬敞 */
export default function GapHint({ gaps, onSelect }: { gaps: Gap[]; onSelect: (s: Selection) => void }) {
  return (
    <div className="absolute top-3 left-3 z-10 max-w-xs text-sm">
      {gaps.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-slate-500 shadow-sm backdrop-blur">
          點選步驟可編輯；拖曳步驟下方的圓點可新增連線
        </p>
      ) : (
        <details className="group rounded-lg border border-amber-300 bg-amber-50/95 text-amber-900 shadow-sm backdrop-blur">
          <summary className="flex list-none items-center gap-2 px-3 py-2 font-medium [&::-webkit-details-marker]:hidden">
            <ListChecks aria-hidden className="h-4 w-4" />
            尚待補充 {gaps.length} 項
            <ChevronDown aria-hidden className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <p className="border-t border-amber-200 px-3 pt-2 text-xs text-amber-800">
            全部補完才能進下一步。可以回答左邊 AI 的問題，或點下面的項目自己填。
          </p>
          <ul className="max-h-64 space-y-1 overflow-y-auto px-3 py-2">
            {gaps.map((g, i) => (
              <li key={i}>
                {g.node_id ? (
                  <button className="text-left hover:underline" onClick={() => onSelect({ type: "node", id: g.node_id! })}>
                    {g.node_title}：{g.label}
                  </button>
                ) : (
                  `整體流程：${g.label}`
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
