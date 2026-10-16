import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import StageNav from "@/components/StageNav";
import type { Project } from "@/lib/types";

export default function ProjectHeader({ project, stage }: { project: Project; stage: number }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-4">
        <Link href="/" aria-label="回首頁" className="rounded-lg">
          <BrandMark compact />
        </Link>
        <div className="min-w-0 border-l border-slate-200 pl-4">
          <p className="truncate text-xs text-slate-500">{project.company_name}</p>
          <h1 className="truncate text-base font-semibold text-slate-900">{project.name}</h1>
        </div>
      </div>
      <StageNav current={stage} projectId={project.id} />
    </header>
  );
}
