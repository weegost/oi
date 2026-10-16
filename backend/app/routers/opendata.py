from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import opendata
from ..db import get_db

router = APIRouter(prefix="/api/opendata", tags=["opendata"])


@router.get("")
def get_summary(db: Session = Depends(get_db)):
    return opendata.summary(db)


@router.post("/sync")
def sync_now(db: Session = Depends(get_db)):
    """立即同步標檢局處分案件（平常由背景每天自動同步）。"""
    opendata.sync_penalties(db)
    return opendata.summary(db)
