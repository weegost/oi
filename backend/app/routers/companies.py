import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Company
from ..services import gcis, industry

router = APIRouter(prefix="/api/companies", tags=["companies"])

CACHE_TTL = timedelta(days=7)

# 案例代碼：虛構企業，只在本系統內使用，絕不送往官方 API
DEMO_TAX_ID = "00000000"
DEMO_COMPANY = {
    "registration_type": "demo",
    "name": "小名 3C 網店",
    "owner": "小名",
    "address": "未提供（虛構案例）",
    "status": "案例背景",
    "capital": "",
    "setup_date": "",
    "business_items": [
        {"code": "F213030", "name": "電腦及事務性機器設備零售業", "category": "批發、零售及餐飲業", "subcategory": "機械器具零售業"},
        {"code": "F213010", "name": "電器零售業", "category": "批發、零售及餐飲業", "subcategory": "機械器具零售業"},
        {"code": "F399040", "name": "無店面零售業", "category": "批發、零售及餐飲業", "subcategory": "其他綜合零售業"},
    ],
    "raw": {},
}


def _to_dict(c: Company) -> dict:
    return {
        "tax_id": c.tax_id,
        "name": c.name,
        "registration_type": c.registration_type,
        "owner": c.owner,
        "address": c.address,
        "status": c.status,
        "capital": c.capital,
        "setup_date": c.setup_date,
        "business_items": c.business_items,
        "industry": c.industry,
        "fetched_at": c.fetched_at,
    }


@router.get("/{tax_id}")
async def lookup_company(
    tax_id: str,
    refresh: bool = Query(False, description="略過快取，重新查詢官方資料"),
    db: Session = Depends(get_db),
):
    if not re.fullmatch(r"\d{8}", tax_id):
        raise HTTPException(400, "請輸入 8 碼統一編號。")

    cached = db.get(Company, tax_id)
    fresh = cached and datetime.now(timezone.utc) - cached.fetched_at < CACHE_TTL
    if cached and (fresh or tax_id == DEMO_TAX_ID) and not refresh:
        return _to_dict(cached)

    if tax_id == DEMO_TAX_ID:
        data = DEMO_COMPANY
    else:
        try:
            data = await gcis.lookup(tax_id)
        except gcis.GcisError as e:
            if cached:  # 官方暫時無法連線時，退回舊的快取資料
                return _to_dict(cached)
            raise HTTPException(502, str(e))
        if data is None:
            raise HTTPException(404, "查無此統一編號的公司或商業登記資料。")

    company = cached or Company(tax_id=tax_id)
    for key, value in data.items():
        setattr(company, key, value)
    company.industry = industry.classify(data["business_items"])
    company.fetched_at = datetime.now(timezone.utc)
    db.add(company)
    db.commit()
    db.refresh(company)
    return _to_dict(company)
