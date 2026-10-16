"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";

export type Mode = "direct" | "guided";

type Props = {
  messages: ChatMessage[];
  mode: Mode;
  busy: boolean;
  onModeChange: (m: Mode) => void;
  onSend: (text: string) => void;
};

const HINTS: Record<Mode, string> = {
  direct: "直接描述目前這項工作怎麼完成：誰收到什麼、接著做什麼、遇到什麼情況會怎麼處理。",
  guided: "不知道從哪裡說起？AI 會從最近一次實際案例開始，一次問一個問題。",
};

export default function ChatPanel({ messages, mode, busy, onModeChange, onSend }: Props) {
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
      <div className="border-b border-slate-200 p-3">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm" role="group" aria-label="對話模式">
          {(["direct", "guided"] as const).map((m) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => onModeChange(m)}
              className={
                "rounded-md py-1.5 font-medium " +
                (mode === m ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700")
              }
            >
              {m === "direct" ? "直接描述" : "AI 引導"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{HINTS[mode]}</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-slate-400">還沒有對話。從描述工作開始，或切換到 AI 引導。</p>
        )}
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
          placeholder={mode === "direct" ? "例如：客人在聊聊問退貨，客服先查訂單…" : "回答 AI 的問題…"}
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
