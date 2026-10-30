import { Suspense } from "react";
import WorkspaceView from "@/components/WorkspaceView";

// 工作區 id 只在執行期才知道，以 Suspense 包起來串流載入
export default function WorkspacePage() {
  return (
    <Suspense fallback={<main className="p-8 text-slate-600">載入中…</main>}>
      <WorkspaceView />
    </Suspense>
  );
}
