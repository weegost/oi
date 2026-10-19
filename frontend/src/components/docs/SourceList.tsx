import { FileText } from "lucide-react";
import type { DocSource } from "@/lib/types";

/** AI 參考的企業文件段落：預設只列檔名與段落，點開才看原文 */
export default function SourceList({ sources, title = "參考文件" }: { sources: DocSource[]; title?: string }) {
  if (!sources.length) return null;
  return (
    <div className="mt-2 space-y-1 text-xs">
      <p className="font-medium text-slate-500">{title}</p>
      {sources.map((s, i) => (
        <details key={i} className="group rounded-md border border-slate-200 bg-white">
          <summary className="flex items-center gap-1.5 px-2 py-1 text-slate-700 hover:bg-slate-50">
            <FileText aria-hidden className="h-3.5 w-3.5 shrink-0 text-teal-700" />
            <span className="truncate">{s.filename}</span>
            <span className="shrink-0 text-slate-400">第 {s.idx} 段</span>
          </summary>
          <p className="border-t border-slate-100 px-2 py-1.5 whitespace-pre-wrap text-slate-600">{s.text}</p>
        </details>
      ))}
    </div>
  );
}
