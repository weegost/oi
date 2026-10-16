"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type Health = {
  api: string;
  database: string;
  pgvector: string | null;
  llm_configured: boolean;
  llm_model: string;
};

// 暫時的系統狀態頁：確認前端、後端、資料庫、Gemini 都接得上。正式介面之後取代。
export default function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [llm, setLlm] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Health>("/api/health").then(setHealth).catch((e) => setError(e.message));
  }, []);

  const testLlm = () => {
    setLlm("測試中…");
    apiGet<{ reply: string }>("/api/health/llm")
      .then((r) => setLlm(`回覆：${r.reply}`))
      .catch((e) => setLlm(`失敗：${e.message}`));
  };

  return (
    <main className="mx-auto w-full max-w-xl p-8">
      <h1 className="text-2xl font-bold">智行進業 BizPilot AI</h1>
      <p className="mt-1 text-sm text-gray-500">系統連線狀態</p>
      {error && <p className="mt-6 text-red-600">後端連線失敗：{error}</p>}
      {!health && !error && <p className="mt-6">檢查中…</p>}
      {health && (
        <ul className="mt-6 space-y-2">
          <li>後端 API：{health.api}</li>
          <li>資料庫：{health.database}（pgvector {health.pgvector ?? "未啟用"}）</li>
          <li>
            Gemini：{health.llm_configured ? `已設定（${health.llm_model}）` : "尚未設定金鑰"}
          </li>
        </ul>
      )}
      <button
        onClick={testLlm}
        className="mt-6 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        測試 Gemini 連線
      </button>
      {llm && <p className="mt-3">{llm}</p>}
    </main>
  );
}
