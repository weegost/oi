import { Suspense } from "react";
import SandboxWorkspace from "@/components/sandbox/SandboxWorkspace";

export default function SandboxPage() {
  return (
    <Suspense fallback={<main className="p-8 text-slate-600">載入中…</main>}>
      <SandboxWorkspace />
    </Suspense>
  );
}
