"use client";

import { useEffect, useRef, useState } from "react";
import SourceList from "@/components/docs/SourceList";
import type { ChatMessage } from "@/lib/types";

type Props = {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
};

/** AI 一次問一題；使用者也可以一次把整個做法說完，兩種都會整理成流程圖 */
export default function ChatPanel({ messages, busy, onSend }: Props) {
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  const submit = () => {
    if (!text.trim() || busy) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="flex h-full flex-col">
      <p className="border-b border-slate-200 p-3 text-xs text-slate-500">
        AI 會從最近一次實際處理的情況開始，一次問一個問題。想一次把整個做法說完也可以，一樣會整理成流程圖。
      </p>

      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm" aria-live="polite">
        {messages.length === 0 && !busy && <p className="text-slate-400">還沒有對話。</p>}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                "max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 " +
                (m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800")
              }
            >
              {m.role === "assistant" && (
                <span className="mb-0.5 block text-xs text-slate-500">
                  {m.mode === "guided" ? "AI 引導" : "流程助理"}
                </span>
              )}
              {m.text}
              {m.sources && <SourceList sources={m.sources} />}
            </div>
          </div>
        ))}
        {busy && <p className="animate-pulse text-slate-500">AI 整理中，約需 10–20 秒…</p>}
        <div ref={bottom} />
      </div>

      <form
        className="border-t border-slate-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          rows={3}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
          }}
          placeholder="回答 AI 的問題，或一次把整個做法說完也可以"
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
          <span>Ctrl + Enter 送出</span>
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            送出
          </button>
        </div>
      </form>
    </div>
  );
}
