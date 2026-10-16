"""政府開放資料：匯入、定期同步與查詢。

- 標檢局電子類／電機類處分案件：官方只保留近一個月，定期抓取並以處分文號去重累積；
  連不上時改用 backend/data 內的快照，確保報告現場可用。
- 歷年商品召回訊息、消保會申訴統計：官方已不更新，直接匯入隨附快照。
"""

import csv
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .models import ComplaintStat, DataSync, PenaltyCase, ProductRecall

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

PENALTY_SOURCES = {
    "電子": ("https://data.bsmi.gov.tw/opendata/download/313000000G-000009-080.action", "bsmi-penalty-electronic.xml"),
    "電機": ("https://data.bsmi.gov.tw/opendata/download/313000000G-000010-080.action", "bsmi-penalty-electrical.xml"),
}
SYNC_INTERVAL = timedelta(days=1)

# 3C 示範情境相關的消保會申訴類別
THREE_C_COMPLAINT_CATEGORIES = ["電腦及周邊產品", "電器及周邊產品", "通訊及周邊產品", "相機及周邊產品"]


def parse_penalty_xml(raw: bytes, dataset: str) -> list[dict]:
    """解析處分案件 XML，同一 (文號, 分類) 的多條違反條文合併為一筆。"""
    merged: dict[tuple[str, str], dict] = {}
    for r in ET.fromstring(raw):
        doc_no = (r.findtext("處分文號") or "").strip()
        if not doc_no:
            continue
        category = (r.findtext("商品分類") or "").strip()
        violation = (r.findtext("違反條文") or "").strip()
        row = merged.setdefault(
            (doc_no, category),
            {
                "doc_no": doc_no,
                "category": category,
                "dataset": dataset,
                "penalty_date": (r.findtext("處分日期") or "").strip(),
                "violation": "",
                "channel": (r.findtext("實體或網路") or "").strip(),
                "origin": (r.findtext("產製輸入管道") or "").strip(),
            },
        )
        if violation and violation not in row["violation"]:
            row["violation"] = "；".join(filter(None, [row["violation"], violation]))
    return list(merged.values())


def _record(db: Session, dataset: str, source: str, rows: int, total: int, message: str = ""):
    stmt = insert(DataSync).values(
        dataset=dataset, source=source, rows=rows, total=total, message=message, synced_at=func.now()
    )
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=["dataset"],
            set_={"source": source, "rows": rows, "total": total, "message": message, "synced_at": func.now()},
        )
    )


def sync_penalties(db: Session, fetch=None) -> dict:
    """抓取最新處分案件；失敗時改用快照。fetch 可替換（測試用）。"""
    fetch = fetch or (lambda url: httpx.get(url, timeout=30, follow_redirects=True).content)
    result = {}
    for dataset, (url, snapshot) in PENALTY_SOURCES.items():
        try:
            rows, source, message = parse_penalty_xml(fetch(url), dataset), "live", ""
        except Exception as e:  # 官方網站暫時無法連線或格式錯誤
            rows = parse_penalty_xml((DATA_DIR / snapshot).read_bytes(), dataset)
            source, message = "snapshot", f"官方資料暫時無法取得，改用隨附快照（{type(e).__name__}）"
        if rows:
            db.execute(insert(PenaltyCase).values(rows).on_conflict_do_nothing(index_elements=["doc_no", "category"]))
        total = db.scalar(select(func.count()).select_from(PenaltyCase).where(PenaltyCase.dataset == dataset))
        _record(db, f"處分案件-{dataset}", source, len(rows), total, message)
        result[dataset] = {"source": source, "rows": len(rows), "total": total, "message": message}
    db.commit()
    return result


def load_snapshots(db: Session):
    """召回與申訴統計只需匯入一次。"""
    if not db.scalar(select(func.count()).select_from(ProductRecall)):
        with open(DATA_DIR / "product-recalls.csv", encoding="utf-8-sig") as f:
            rows = [
                {"id": int(r["編號"]), "title": r["召回訊息"], "published": r["發布日期"], "url": r["網址"]}
                for r in csv.DictReader(f)
            ]
        db.execute(insert(ProductRecall).values(rows).on_conflict_do_nothing())
        _record(db, "商品召回", "snapshot", len(rows), len(rows), "官方資料至民國 105 年")

    if not db.scalar(select(func.count()).select_from(ComplaintStat)):
        rows = []
        with open(DATA_DIR / "complaint-stats.csv", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                for month, count in zip(r["統計日期"].split(","), r["統計值"].split(",")):
                    rows.append({"category": r["類別"], "region": r["地區"], "month": month, "count": int(count)})
        # 原始資料「其他」類別在同縣市出現兩次，加總後再寫入
        merged: dict[tuple, int] = {}
        for r in rows:
            key = (r["category"], r["region"], r["month"])
            merged[key] = merged.get(key, 0) + r["count"]
        values = [{"category": c, "region": g, "month": m, "count": n} for (c, g, m), n in merged.items()]
        for i in range(0, len(values), 5000):
            db.execute(insert(ComplaintStat).values(values[i : i + 5000]).on_conflict_do_nothing())
        _record(db, "消費申訴統計", "snapshot", len(values), len(values), "2024-10 至 2026-09")
    db.commit()


def needs_sync(db: Session) -> bool:
    last = db.scalar(select(func.min(DataSync.synced_at)).where(DataSync.dataset.like("處分案件-%")))
    return last is None or datetime.now(timezone.utc) - last > SYNC_INTERVAL


# ---- 查詢（沙盒比對用）----


def penalties_for(db: Session, keyword: str, limit: int = 5) -> list[PenaltyCase]:
    """依商品分類比對處分案件；處分資料沒有型號，只能比對到品類。"""
    return list(
        db.scalars(
            select(PenaltyCase)
            .where(PenaltyCase.category.contains(keyword))
            .order_by(PenaltyCase.penalty_date.desc())
            .limit(limit)
        )
    )


def recalls_for(db: Session, keyword: str, limit: int = 3) -> list[ProductRecall]:
    return list(
        db.scalars(select(ProductRecall).where(ProductRecall.title.contains(keyword)).order_by(ProductRecall.id.desc()).limit(limit))
    )


def complaint_trend(db: Session, category: str, months: int = 12) -> list[dict]:
    """全國合計的月申訴件數（最近 months 個月，排除尚未結算的 0 件月份）。"""
    rows = db.execute(
        select(ComplaintStat.month, func.sum(ComplaintStat.count))
        .where(ComplaintStat.category == category)
        .group_by(ComplaintStat.month)
        .order_by(ComplaintStat.month.desc())
    ).all()
    rows = [r for r in rows if r[1] > 0][:months]
    return [{"month": m, "count": int(n)} for m, n in reversed(rows)]


def summary(db: Session) -> dict:
    syncs = db.scalars(select(DataSync).order_by(DataSync.dataset)).all()
    by_channel = dict(
        db.execute(select(PenaltyCase.channel, func.count()).group_by(PenaltyCase.channel)).all()
    )
    top = db.execute(
        select(PenaltyCase.category, func.count())
        .where(PenaltyCase.category != "")
        .group_by(PenaltyCase.category)
        .order_by(func.count().desc())
        .limit(8)
    ).all()
    date_range = db.execute(select(func.min(PenaltyCase.penalty_date), func.max(PenaltyCase.penalty_date))).one()
    return {
        "syncs": [
            {"dataset": s.dataset, "source": s.source, "rows": s.rows, "total": s.total, "message": s.message, "synced_at": s.synced_at}
            for s in syncs
        ],
        "penalty_channels": by_channel,
        "penalty_top_categories": [{"category": c, "count": n} for c, n in top],
        "penalty_range": [_fmt(d) for d in date_range],
        "complaints": {c: complaint_trend(db, c) for c in THREE_C_COMPLAINT_CATEGORIES},
    }


def _fmt(d: str | None) -> str | None:
    return f"{d[:4]}-{d[4:6]}-{d[6:]}" if d and re.fullmatch(r"\d{8}", d) else d
