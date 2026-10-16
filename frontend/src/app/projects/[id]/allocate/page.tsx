import { Suspense } from "react";
import AllocateWorkspace from "@/components/allocate/AllocateWorkspace";

export default function AllocatePage() {
  return (
    <Suspense fallback={<main className="p-8 text-slate-600">載入中…</main>}>
      <AllocateWorkspace />
    </Suspense>
  );
}
