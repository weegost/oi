import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_TC, Plus_Jakarta_Sans } from "next/font/google";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

// 英數用 Plus Jakarta Sans，中文用 Noto Sans TC
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const notoTC = Noto_Sans_TC({
  variable: "--font-noto-tc",
  weight: ["400", "500", "700"],
  preload: false, // 中文字型檔很大，依頁面用到的字分批載入
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "智行進業 BizPilot AI",
  description: "中小企業 AI 導入探索平台",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-Hant"
      className={`${jakarta.variable} ${notoTC.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning // 內嵌腳本可能在 React 載入前加上 dark class
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
