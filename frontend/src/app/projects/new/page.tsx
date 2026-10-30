import { Suspense } from "react";
import ProjectEntry from "@/components/ProjectEntry";

// 工作區編號放在網址 ?workspace=，執行期才知道，以 Suspense 包起來
export default function NewProjectPage() {
  return (
    <Suspense fallback={<main className="p-8 text-slate-600">讀取工作區…</main>}>
      <ProjectEntry />
    </Suspense>
  );
}
