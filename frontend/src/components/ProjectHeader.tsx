import Link from "next/link";
import AccountMenu from "@/components/AccountMenu";
import BrandMark from "@/components/BrandMark";
import StageNav from "@/components/StageNav";
import ThemeToggle from "@/components/ThemeToggle";
import type { Project } from "@/lib/types";

export default function ProjectHeader({ project, stage }: { project: Project; stage: number }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-t-4 border-b border-t-brand-600 border-b-slate-200 bg-white px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-4">
        <Link href="/" aria-label="回首頁" className="rounded-lg">
          <BrandMark compact />
        </Link>
        <div className="min-w-0 border-l border-slate-200 pl-4">
          <p className="truncate text-xs text-slate-500">{project.company_name}</p>
          <h1 className="truncate text-base font-semibold text-slate-900">{project.name}</h1>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <StageNav current={stage} projectId={project.id} />
        <AccountMenu />
        <ThemeToggle />
      </div>
    </header>
  );
}
