import type { LucideIcon } from "lucide-react";

/** 卡片標題：暖橘圓底圖示＋標題，讓各區塊一眼可辨 */
export default function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 text-lg font-semibold">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
        <Icon aria-hidden className="h-4 w-4" />
      </span>
      {children}
    </h2>
  );
}
