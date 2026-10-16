from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .. import opendata
from ..flow import Flow
from ..models import Project
from . import engine


def run_and_store(p: Project, db: Session, config: dict, scenarios: list[str]):
    """執行情境測試並把結果存進專案（API 與示範載入共用）。"""
    opendata.load_snapshots(db)  # 開放資料尚未匯入時（例如剛建好資料庫）先載入快照
    config = {k: bool(config.get(k)) for k in engine.CONDITIONS}
    results = engine.run(Flow.model_validate(p.flow), p.allocations or {}, config, db, scenarios)
    p.sandbox = {
        "config": config,
        "run": (p.sandbox or {}).get("run", 0) + 1,
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "scenarios": scenarios,
        "results": results,
        "summary": engine.summarize(results),
        "fingerprint": engine.fingerprint(p.flow, p.allocations or {}),
    }
