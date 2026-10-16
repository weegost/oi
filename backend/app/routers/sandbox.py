from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..sandbox import engine, service
from ..sandbox.scenarios import SCENARIOS
from .projects import _load

router = APIRouter(prefix="/api/projects/{project_id}/sandbox", tags=["sandbox"])


class RunRequest(BaseModel):
    config: dict[str, bool] = {}
    scenarios: list[str] = []  # 空白代表全部情境


def _state(p) -> dict:
    sb = p.sandbox or {}
    return {
        "conditions": engine.CONDITIONS,
        "scenarios": SCENARIOS,
        "config": {k: bool(sb.get("config", {}).get(k)) for k in engine.CONDITIONS},
        "run": sb.get("run", 0),
        "ran_at": sb.get("ran_at"),
        "selected_scenarios": sb.get("scenarios", []),
        "results": sb.get("results", []),
        "summary": sb.get("summary"),
        "stale": bool(sb.get("run")) and sb.get("fingerprint") != engine.fingerprint(p.flow, p.allocations or {}),
    }


@router.get("")
def get_sandbox(project_id: int, db: Session = Depends(get_db)):
    p, _ = _load(db, project_id)
    return _state(p)


@router.post("/run")
def run_sandbox(project_id: int, body: RunRequest, db: Session = Depends(get_db)):
    """依目前的流程、人機分工與準備條件執行情境測試。"""
    p, _ = _load(db, project_id)
    service.run_and_store(p, db, body.config, body.scenarios)
    db.commit()
    return _state(p)
