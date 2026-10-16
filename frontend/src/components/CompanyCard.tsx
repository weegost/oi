import type { Company } from "@/lib/types";

const TYPE_LABEL = { company: "公司登記", business: "商業登記", demo: "虛構案例" } as const;

function formatCapital(v: string) {
  const n = Number(v);
  return v && Number.isFinite(n) ? `${n.toLocaleString("zh-TW")} 元` : "—";
}

// 民國年 YYYMMDD → YYY/MM/DD
function formatRocDate(v: string) {
  return /^\d{7}$/.test(v) ? `民國 ${+v.slice(0, 3)}/${v.slice(3, 5)}/${v.slice(5)}` : "—";
}

export default function CompanyCard({ company }: { company: Company }) {
  const { industry } = company;
  const coded = company.business_items.filter((i) => i.code);
  const described = company.business_items.filter((i) => !i.code);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {TYPE_LABEL[company.registration_type]} ·{" "}
            {company.registration_type === "demo" ? "案例代碼" : "統一編號"} {company.tax_id}
          </p>
          <h2 className="mt-1 text-2xl font-bold">{company.name}</h2>
        </div>
        <span
          className={
            "rounded-full px-3 py-1 text-sm font-medium " +
            (industry.is_3c ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700")
          }
        >
          {industry.label}
        </span>
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Field label="負責人" value={company.owner} />
        <Field label="登記狀態" value={company.status} />
        <Field label="資本額" value={formatCapital(company.capital)} />
        <Field label="設立日期" value={formatRocDate(company.setup_date)} />
        <div className="sm:col-span-2">
          <Field label="登記地址" value={company.address} />
        </div>
      </dl>

      <h3 className="mt-6 text-sm font-semibold text-slate-700">營業項目（{coded.length}）</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {coded.map((i) => (
          <li
            key={i.code}
            title={i.subcategory}
            className={
              "rounded-md border px-2 py-1 text-xs " +
              (industry.matched_items.some((m) => m.startsWith(i.code)) || i.code === "F399040"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-slate-200 text-slate-600")
            }
          >
            <span className="font-mono">{i.code}</span> {i.name}
          </li>
        ))}
      </ul>
      {described.length > 0 && (
        <details className="mt-3 text-sm text-slate-600">
          <summary className="cursor-pointer">登記的文字營業範圍（{described.length} 段）</summary>
          <ul className="mt-2 space-y-1">
            {described.map((i, idx) => (
              <li key={idx}>{i.name.trim()}</li>
            ))}
          </ul>
        </details>
      )}

      <div
        className={
          "mt-6 rounded-lg p-4 text-sm " +
          (industry.demo_scenario ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")
        }
      >
        {industry.demo_scenario ? (
          <>
            符合第一階段示範場域：系統將帶入 <strong>3C／小家電網路零售</strong>
            的客服、退貨、物流延誤等測試情境。
            {!industry.online_retail && "（未登記無店面零售業，網路銷售相關情境請再確認）"}
          </>
        ) : (
          <>此企業不在第一階段示範產業內，仍可建立工作流程，但沙盒測試情境需自行補充。</>
        )}
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium">{value || "—"}</dd>
    </div>
  );
}
