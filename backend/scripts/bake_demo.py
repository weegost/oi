"""預先產生完整示範的 AI 分析與摘要，存成 app/demo_data/demo_full.json；
示範文件（app/demo_data/docs）的向量存成 app/demo_data/demo_docs.json。

示範流程或分工有改動時重新執行一次（需要 Gemini 金鑰，約 2–3 分鐘）：
    cd backend
    .venv/Scripts/python scripts/bake_demo.py
只改了沙盒條件時，可沿用已存的步驟分析、只重寫摘要：
    .venv/Scripts/python scripts/bake_demo.py --summary-only
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete  # noqa: E402

from app import allocation, demo_full, llm, rag, report  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.flow import Flow  # noqa: E402
from app.models import EMBED_DIM, Company, Document  # noqa: E402


def bake_doc_vectors(db):
    """示範文件向量化並存檔，再以新向量重新放入示範企業的文件。"""
    vectors = {}
    for filename, _ in demo_full.DEMO_DOCS:
        chunks = rag.chunk_text((demo_full.DOCS_DIR / filename).read_text(encoding="utf-8"))
        print(f"向量化《{filename}》{len(chunks)} 段…", flush=True)
        vectors[filename] = [[round(x, 6) for x in v] for v in llm.embed(chunks, "RETRIEVAL_DOCUMENT", EMBED_DIM)]
    demo_full.DOC_VECTORS_PATH.write_text(json.dumps(vectors), encoding="utf-8")
    db.execute(delete(Document).where(Document.tax_id == demo_full.DEMO_TAX_ID))
    demo_full.seed_documents(db)
    db.commit()


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
        if not summary_only:
            bake_doc_vectors(db)
        explorations = demo_full.load_baked()["explorations"] if summary_only else {}
        for node in [] if summary_only else flow.nodes:
            if node.id not in demo_full.DEMO_FULL_MODES:
                continue
            print(f"分析「{node.title}」…", flush=True)
            sources = rag.search(db, demo_full.DEMO_TAX_ID, allocation.node_query(node))
            exp = allocation.explore(context, flow, node, sources)
            explorations[node.id] = {"node_title": node.title, "exploration": exp.model_dump(), "sources": sources}
            print(f"  引用文件：{[(s['filename'], s['idx'], s['score']) for s in sources]}", flush=True)
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
