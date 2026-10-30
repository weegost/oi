import AccountMenu from "@/components/AccountMenu";
import BrandLink from "@/components/BrandLink";
import ThemeToggle from "@/components/ThemeToggle";

/** 工作區相關頁面的頂端列：左邊標誌回工作區，右邊帳號選單與深色切換 */
export default function PageTop() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <BrandLink />
      <div className="flex items-center gap-2">
        <AccountMenu />
        <ThemeToggle />
      </div>
    </div>
  );
}
