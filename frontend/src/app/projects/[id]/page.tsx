import { Suspense } from "react";
import ProjectWorkspace from "@/components/ProjectWorkspace";

// 專案 id 只在執行期才知道，工作區以 Suspense 包起來串流載入
export default function ProjectPage() {
  return (
    <Suspense fallback={<main className="p-8 text-slate-600">載入中…</main>}>
      <ProjectWorkspace />
    </Suspense>
  );
}
