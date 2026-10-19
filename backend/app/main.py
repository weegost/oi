import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import llm, models, opendata  # noqa: F401  models 需先載入，create_all 才會建表
from .config import settings
from .db import Base, SessionLocal, engine, get_db
from .routers import companies, documents, mock, projects, report, sandbox
from .routers import opendata as opendata_router

# pgvector 擴充通常由 db/init 建立；資料庫若是先前建的，在此補上
with engine.begin() as conn:
    conn.execute(text("create extension if not exists vector"))

# 原型階段直接依模型建表；資料表穩定後再改用 Alembic 管理版本
Base.metadata.create_all(engine)
with engine.begin() as conn:
    # create_all 不會替既有資料表加欄位，新增欄位在此補上
    conn.execute(text("alter table projects add column if not exists allocations jsonb not null default '{}'"))
    conn.execute(text("alter table projects add column if not exists sandbox jsonb not null default '{}'"))
    conn.execute(text("alter table projects add column if not exists report jsonb not null default '{}'"))

log = logging.getLogger("bizpilot")


def _sync_if_due():
    with SessionLocal() as db:
        opendata.load_snapshots(db)
        if opendata.needs_sync(db):
            log.info("同步標檢局處分案件：%s", opendata.sync_penalties(db))


async def _sync_loop():
    # 官方處分資料只保留近一個月，每小時檢查一次、超過一天就同步，讓資料逐月累積
    while True:
        try:
            await asyncio.to_thread(_sync_if_due)
        except Exception:
            log.exception("開放資料同步失敗，下次再試")
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(_sync_loop())
    yield
    task.cancel()


app = FastAPI(title="BizPilot AI API", lifespan=lifespan)
app.include_router(companies.router)
app.include_router(documents.router)
app.include_router(projects.router)
app.include_router(opendata_router.router)
app.include_router(sandbox.router)
app.include_router(report.router)
app.include_router(mock.router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    vector = db.execute(text("select extversion from pg_extension where extname = 'vector'")).scalar()
    return {
        "api": "ok",
        "database": "ok",
        "pgvector": vector,
        "llm_configured": bool(settings.gemini_api_key),
        "llm_model": settings.gemini_model,
    }


@app.get("/api/health/llm")
def health_llm():
    try:
        reply, model = llm.generate("請只回覆「連線成功」四個字。")
    except llm.LLMNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:  # Gemini 端錯誤（金鑰錯誤、額度用盡、模型名稱不存在）
        raise HTTPException(status_code=502, detail=f"Gemini 呼叫失敗：{e}")
    return {"model": model, "reply": reply.strip()}
