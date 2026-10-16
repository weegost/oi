"""模擬企業系統：訂單、物流、庫存、退款。

沙盒測試不碰企業真實系統；AI 介入時改呼叫這些模擬 API，
由呼叫是否成功、需要哪些權限，看出正式導入前要準備的介接與授權。
資料以「今天」為基準動態產生日期，示範時天數永遠合理。
"""

from datetime import date, timedelta

PRODUCTS = {
    "PB20K": {"name": "20000mAh 快充行動電源", "category": "行動電源", "price": 890},
    "AD65": {"name": "65W 氮化鎵電源轉接器", "category": "電源轉接器", "price": 690},
    "FAN14": {"name": "14 吋 DC 節能桌扇", "category": "家用電扇", "price": 1490},
    "DH12": {"name": "12 公升清淨除濕機", "category": "除濕機", "price": 6990},
    # recall_kw：比對召回訊息用的關鍵字；「耳機」太寬，會誤中電話耳機的召回
    "BTE": {"name": "藍牙降噪耳機", "category": "耳機", "price": 2290, "recall_kw": "藍牙耳機"},
    "MSE": {"name": "無線靜音滑鼠", "category": "滑鼠", "price": 390},
}

STOCK = {"PB20K": 42, "AD65": 18, "FAN14": 0, "DH12": 6, "BTE": 25, "MSE": 60}


def _d(days_ago: int) -> str:
    return (date.today() - timedelta(days=days_ago)).isoformat()


def orders() -> dict[str, dict]:
    # (sku, 下單幾天前, 出貨幾天前, 物流狀態, 最後物流更新幾天前, 是否送達)
    raw = {
        "A1001": ("BTE", 6, 5, "已送達", 3, True),
        "A1002": ("PB20K", 5, 4, "已送達", 2, True),
        "A1003": ("DH12", 8, 7, "已送達", 5, True),
        "A1004": ("FAN14", 10, 8, "轉運中", 6, False),
        "A1005": ("AD65", 16, 15, "已送達", 12, True),
        "A1006": ("MSE", 3, 2, "配送中", 1, False),
    }
    out = {}
    for oid, (sku, ordered, shipped, status, updated, delivered) in raw.items():
        p = PRODUCTS[sku]
        out[oid] = {
            "order_id": oid,
            "sku": sku,
            "product": p["name"],
            "category": p["category"],
            "recall_kw": p.get("recall_kw", p["category"]),
            "amount": p["price"],
            "payment": "信用卡",
            "ordered_at": _d(ordered),
            "shipped_at": _d(shipped),
            "carrier": "黑貓宅急便",
            "tracking_no": f"9{oid[1:]}0023",
            "logistics_status": status,
            "logistics_updated_at": _d(updated),
            "delivered_at": _d(updated) if delivered else None,
        }
    return out


def get_order(order_id: str) -> dict | None:
    return orders().get(order_id)


def get_logistics(order_id: str) -> dict | None:
    o = get_order(order_id)
    if not o:
        return None
    stale = (date.today() - date.fromisoformat(o["logistics_updated_at"])).days
    return {
        "carrier": o["carrier"],
        "tracking_no": o["tracking_no"],
        "status": o["logistics_status"],
        "last_update": o["logistics_updated_at"],
        "days_without_update": 0 if o["delivered_at"] else stale,
    }


def get_inventory(sku: str) -> dict | None:
    if sku not in PRODUCTS:
        return None
    return {"sku": sku, "product": PRODUCTS[sku]["name"], "stock": STOCK[sku]}


def days_since_delivery(order: dict) -> int | None:
    return (date.today() - date.fromisoformat(order["delivered_at"])).days if order["delivered_at"] else None
