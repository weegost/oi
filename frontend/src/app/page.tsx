import type { Metadata } from "next";
import HomePage from "@/components/HomePage";

export const metadata: Metadata = {
  title: "智行進業 BizPilot AI｜幫小公司看懂 AI 能做什麼",
  description: "把你每天怎麼做事說出來，我們幫你整理成流程，並告訴你 AI 能幫哪一步。",
};

// 網站首頁；原本輸入統編、建立專案的頁面移到 /start
export default function Page() {
  return <HomePage />;
}
