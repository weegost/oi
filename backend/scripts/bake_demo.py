"""預先產生完整示範的 AI 分析與摘要，存成 app/demo_data/demo_full.json。

示範流程或分工有改動時重新執行一次（需要 Gemini 金鑰，約 2–3 分鐘）：
    cd backend
    .venv/Scripts/python scripts/bake_demo.py
只改了沙盒條件時，可沿用已存的步驟分析、只重寫摘要：
    .venv/Scripts/python scripts/bake_demo.py --summary-only
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import allocation, demo_full, report  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.flow import Flow  # noqa: E402
from app.models import Company  # noqa: E402


def main():
    with SessionLocal() as db:
        company = db.get(Company, demo_full.DEMO_TAX_ID)
        if not company:
            sys.exit("請先啟動後端並在首頁以 00000000 載入示範企業。")
        context = {
            "company": company.name,
            "industry": company.industry.get("label", ""),
            "work": demo_full.DEMO_PROJECT["work"],
            "problem": demo_full.DEMO_PROJECT["problem"],
        }
        flow = Flow.model_validate(demo_full.DEMO_FULL_FLOW)
        summary_only = "--summary-only" in sys.argv
        explorations = demo_full.load_baked()["explorations"] if summary_only else {}
        for node in [] if summary_only else flow.nodes:
            if node.id not in demo_full.DEMO_FULL_MODES:
                continue
            print(f"分析「{node.title}」…", flush=True)
            exp = allocation.explore(context, flow, node)
            explorations[node.id] = {"node_title": node.title, "exploration": exp.model_dump()}
            print(f"  建議：{allocation.MODES[exp.recommended]}", flush=True)

        # 以完整狀態建立暫時專案產生摘要，完成後刪除
        p = demo_full.create(db, {"explorations": explorations, "summary": None})
        print("撰寫摘要…", flush=True)
        summary = report.ai_summary(report.build(p, company))
        db.rollback()
        demo_full.save_baked(explorations, summary)
        print(f"完成：{demo_full.BAKED_PATH}")
        print(summary)


if __name__ == "__main__":
    main()
