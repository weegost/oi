"use client";

import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { useAccount } from "@/lib/account";

/**
 * 系統內頁頂端的標誌：已登入時回工作區（在專案裡就回這個專案所屬的公司工作區，否則回「我的工作區」），
 * 沒登入（不註冊直接使用）沒有工作區可回，維持回首頁。
 */
export default function BrandLink({ workspaceId, compact }: { workspaceId?: number | null; compact?: boolean }) {
  const account = useAccount();
  const href = account ? (workspaceId ? `/workspaces/${workspaceId}` : "/welcome") : "/";
  return (
    <Link href={href} aria-label={account ? "回工作區" : "回首頁"} className="rounded-lg">
      <BrandMark compact={compact} />
    </Link>
  );
}
