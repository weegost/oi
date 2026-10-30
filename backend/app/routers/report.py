from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import llm, report
from ..auth import check_project_access
from ..db import get_db
from .projects import _load

router = APIRouter(prefix="/api/projects/{project_id}/report", tags=["report"], dependencies=[Depends(check_project_access)])


def _download(content: bytes, filename: str, media_type: str) -> Response:
    # 中文檔名需以 RFC 5987 編碼
    return Response(
        content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.get("")
def get_report(project_id: int, db: Session = Depends(get_db)):
    return report.build(*_load(db, project_id))


@router.get("/markdown")
def download_markdown(project_id: int, db: Session = Depends(get_db)):
    r = report.build(*_load(db, project_id))
    return _download(report.to_markdown(r).encode("utf-8"), f"{r['title']}.md", "text/markdown; charset=utf-8")


@router.get("/docx")
def download_docx(project_id: int, db: Session = Depends(get_db)):
    r = report.build(*_load(db, project_id))
    return _download(
        report.to_docx(r),
        f"{r['title']}.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.post("/summary")
def write_summary(project_id: int, db: Session = Depends(get_db)):
    """請 AI 依草案內容寫一段摘要，並寫重點區「AI 做什麼、哪些留給人」的短句（選用）。"""
    p, company = _load(db, project_id)
    try:
        r = report.build(p, company)
        text = report.ai_summary(r)
        brief = report.ai_brief(r)
    except llm.LLMNotConfigured as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"AI 暫時無法回應，請稍後再試。（{type(e).__name__}）")
    p.report = {"summary": text, "brief": brief, "generated_at": datetime.now(timezone.utc).isoformat()}
    db.commit()
    return report.build(p, company)
