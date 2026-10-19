from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import rag
from ..db import get_db
from ..models import Company, Document

router = APIRouter(prefix="/api/companies/{tax_id}/documents", tags=["documents"])


def _company(db: Session, tax_id: str) -> Company:
    company = db.get(Company, tax_id)
    if not company:
        raise HTTPException(404, "找不到這家企業，請先查詢統一編號。")
    return company


@router.get("")
def list_documents(tax_id: str, db: Session = Depends(get_db)):
    _company(db, tax_id)
    return rag.list_documents(db, tax_id)


@router.post("")
async def upload_document(
    tax_id: str, file: UploadFile = File(...), kind: str = Form("其他"), db: Session = Depends(get_db)
):
    """上傳 SOP、FAQ、政策或商品資料；解析、切段並向量化後存入 pgvector。"""
    _company(db, tax_id)
    raw = await file.read(rag.MAX_BYTES + 1)
    try:
        rag.upload(db, tax_id, file.filename or "未命名文件", kind, raw)
    except rag.DocumentError as e:
        raise HTTPException(400, str(e))
    db.commit()
    return rag.list_documents(db, tax_id)


@router.delete("/{document_id}")
def delete_document(tax_id: str, document_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc or doc.tax_id != tax_id:
        raise HTTPException(404, "找不到這份文件。")
    db.delete(doc)
    db.commit()
    return rag.list_documents(db, tax_id)


@router.get("/search")
def search_documents(tax_id: str, q: str, db: Session = Depends(get_db)):
    """讓企業試問文件，確認 AI 找得到正確段落。"""
    _company(db, tax_id)
    return rag.search(db, tax_id, q)
