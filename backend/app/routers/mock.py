"""模擬企業系統 API。沙盒引擎直接呼叫同一組函式，這裡另外開放成 HTTP，方便報告時展示。"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..sandbox import mock_systems as m

router = APIRouter(prefix="/api/mock", tags=["mock systems"])


def _or_404(value, what: str):
    if value is None:
        raise HTTPException(404, f"查無此{what}")
    return value


@router.get("/orders")
def list_orders():
    return list(m.orders().values())


@router.get("/orders/{order_id}")
def get_order(order_id: str):
    return _or_404(m.get_order(order_id), "訂單")


@router.get("/logistics/{order_id}")
def get_logistics(order_id: str):
    return _or_404(m.get_logistics(order_id), "物流資料")


@router.get("/inventory/{sku}")
def get_inventory(sku: str):
    return _or_404(m.get_inventory(sku), "商品")


class RefundRequest(BaseModel):
    order_id: str
    amount: int
    reason: str


@router.post("/refunds")
def create_refund(body: RefundRequest):
    """模擬退款：只回傳結果，不會真的退款。"""
    order = _or_404(m.get_order(body.order_id), "訂單")
    if body.amount > order["amount"]:
        raise HTTPException(400, "退款金額超過訂單金額")
    return {"refund_id": f"R-{body.order_id}", "status": "已建立（模擬）", **body.model_dump()}
