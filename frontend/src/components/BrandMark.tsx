import { Workflow } from "lucide-react";

/** 品牌標誌：深藍底白色流程圖示＋中英文名稱 */
export default function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
        <Workflow aria-hidden className="h-4.5 w-4.5" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-bold text-slate-900">智行進業</span>
        {!compact && <span className="block text-xs font-medium text-slate-500">BizPilot AI</span>}
      </span>
    </span>
  );
}
