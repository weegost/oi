import Link from "next/link";

const STAGES = [
  { label: "企業背景與流程建模", path: "" },
  { label: "AI 介入探索", path: "/allocate" },
  { label: "情境沙盒測試", path: "/sandbox" },
  { label: "需求草案產出", path: "/report" },
];

// 有 projectId 時，已開放的階段可以點擊切換
export default function StageNav({ current, projectId }: { current: number; projectId?: number }) {
  return (
    <ol className="flex flex-wrap gap-2 text-sm">
      {STAGES.map(({ label, path }, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        const cls =
          "flex items-center gap-2 rounded-full border px-3 py-1 " +
          (state === "active"
            ? "border-brand-600 bg-brand-600 text-white"
            : state === "done"
              ? "border-brand-200 bg-brand-50 text-brand-700"
              : "border-slate-200 bg-white text-slate-500");
        const content = (
          <>
            <span className="font-semibold">{i + 1}</span>
            {label}
          </>
        );
        return (
          <li key={label}>
            {projectId && path !== null && i !== current ? (
              <Link href={`/projects/${projectId}${path}`} className={cls + " hover:border-brand-400"}>
                {content}
              </Link>
            ) : (
              <span className={cls}>{content}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
