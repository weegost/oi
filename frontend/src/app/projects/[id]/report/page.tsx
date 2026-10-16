import { Suspense } from "react";
import ReportWorkspace from "@/components/report/ReportWorkspace";

export default function ReportPage() {
  return (
    <Suspense fallback={<main className="p-8 text-slate-600">載入中…</main>}>
      <ReportWorkspace />
    </Suspense>
  );
}
