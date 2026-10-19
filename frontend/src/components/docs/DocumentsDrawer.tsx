"use client";

import { useRef, useState } from "react";
import { FileText, Search, Trash2, Upload, X } from "lucide-react";
import SourceList from "@/components/docs/SourceList";
import { apiDelete, apiGet, apiUpload } from "@/lib/api";
import { DOC_KINDS, type CompanyDocument, type DocKind, type DocSource } from "@/lib/types";

type Props = {
  taxId: string;
  docs: CompanyDocument[];
  onChange: (docs: CompanyDocument[]) => void;
  onClose: () => void;
};

/** 企業文件：上傳 SOP、FAQ、政策等，Agent 整理流程與 AI 探索時會依內容檢索 */
export default function DocumentsDrawer({ taxId, docs, onChange, onClose }: Props) {
  const base = `/api/companies/${taxId}/documents`;
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocKind>("SOP");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DocSource[] | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  };

  const upload = (file: File) =>
    run(async () => {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      onChange(await apiUpload<CompanyDocument[]>(base, form));
    });

  const remove = (d: CompanyDocument) => {
    if (!window.confirm(`確定刪除「${d.filename}」？`)) return;
    run(async () => onChange(await apiDelete<CompanyDocument[]>(`${base}/${d.id}`)));
  };

  const search = () =>
    query.trim() &&
    run(async () => setHits(await apiGet<DocSource[]>(`${base}/search?q=${encodeURIComponent(query.trim())}`)));

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="企業文件"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col bg-white text-slate-900 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <FileText aria-hidden className="h-4 w-4 text-teal-700" />
            企業文件
          </h2>
          <button onClick={onClose} aria-label="關閉" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-sm">
          <p className="text-slate-500">
            上傳 SOP、FAQ、政策或商品資料。整理流程與探索 AI 分工時，系統會找出相關段落給 AI 參考，並標示出處。
          </p>

          <section className="flex flex-wrap items-center gap-2">
            <label className="text-slate-600">
              類型
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as DocKind)}
                className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1.5"
              >
                {DOC_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = ""; // 同一個檔案改版後可以再選一次
              }}
            />
            <button
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              <Upload aria-hidden className="h-4 w-4" />
              {busy ? "處理中…" : "上傳文件"}
            </button>
            <span className="w-full text-xs text-slate-400">支援 PDF、Word（.docx）、文字檔，5 MB 以內；同檔名會取代舊版。</span>
          </section>

          {error && <p className="rounded-md bg-red-50 p-2 text-red-700">{error}</p>}

          <section>
            <h3 className="mb-2 font-medium text-slate-700">已上傳（{docs.length}）</h3>
            {docs.length === 0 ? (
              <p className="text-slate-400">還沒有文件。</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="shrink-0 rounded border border-teal-300 bg-teal-50 px-1.5 text-xs text-teal-800">
                      {d.kind}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{d.filename}</span>
                      <span className="block text-xs text-slate-400">
                        {d.chunks} 段 · {d.chars.toLocaleString()} 字
                        {!d.embedded && " · 向量化失敗，暫用關鍵字比對"}
                      </span>
                    </span>
                    <button
                      onClick={() => remove(d)}
                      disabled={busy}
                      aria-label={`刪除 ${d.filename}`}
                      className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {docs.length > 0 && (
            <section>
              <h3 className="mb-2 font-medium text-slate-700">試問文件</h3>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  search();
                }}
              >
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="例如：商品冒煙怎麼處理"
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  disabled={busy || !query.trim()}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Search aria-hidden className="h-4 w-4" />
                  檢索
                </button>
              </form>
              {hits && (hits.length ? <SourceList sources={hits} title="最相關的段落" /> : <p className="mt-2 text-slate-400">找不到相關段落。</p>)}
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
