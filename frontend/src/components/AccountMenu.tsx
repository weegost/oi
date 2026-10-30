"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, FolderOpen, LogIn, LogOut } from "lucide-react";
import { logout, useAccount } from "@/lib/account";

/** 右上角：沒登入顯示「登入」，登入後顯示姓名、我的工作區、我的專案、登出。
 *  showLogin=false 用在「不用註冊、直接開始」的頁面，沒登入時什麼都不顯示 */
export default function AccountMenu({ showLogin = true }: { showLogin?: boolean }) {
  const account = useAccount();
  const router = useRouter();
  const btn = "inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm hover:bg-slate-50";

  if (account === undefined) return null;
  if (!account) {
    if (!showLogin) return null;
    return (
      <Link href="/login" className={btn}>
        <LogIn aria-hidden className="h-4 w-4" />
        登入
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-40 truncate text-sm text-slate-600 sm:inline">{account.display_name || account.username}</span>
      <Link href="/welcome" className={btn}>
        <Building2 aria-hidden className="h-4 w-4" />
        我的工作區
      </Link>
      <Link href="/projects" className={btn}>
        <FolderOpen aria-hidden className="h-4 w-4" />
        我的專案
      </Link>
      <button
        onClick={async () => {
          await logout();
          router.push("/");
        }}
        aria-label="登出"
        title="登出"
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        <LogOut aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
