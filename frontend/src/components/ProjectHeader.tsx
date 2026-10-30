import AccountMenu from "@/components/AccountMenu";
import BrandLink from "@/components/BrandLink";
import StageNav from "@/components/StageNav";
import ThemeToggle from "@/components/ThemeToggle";
import type { Project } from "@/lib/types";

export default function ProjectHeader({
  project,
  stage,
  lockAhead,
}: {
  project: Project;
  stage: number;
  /** 這一階段還沒完成時，後面的階段不能點 */
  lockAhead?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-t-4 border-b border-t-brand-600 border-b-slate-200 bg-white px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-4">
        <BrandLink workspaceId={project.workspace_id} compact />
        <div className="min-w-0 border-l border-slate-200 pl-4">
          <p className="truncate text-xs text-slate-500">{project.company_name}</p>
          <h1 className="truncate text-base font-semibold text-slate-900">{project.name}</h1>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <StageNav current={stage} projectId={project.id} lockAhead={lockAhead} />
        <AccountMenu />
        <ThemeToggle />
      </div>
    </header>
  );
}
