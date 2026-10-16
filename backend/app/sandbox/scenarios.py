"""3C／小家電網路零售的示範測試案例（客戶訊息為虛構）。

steps 是處理這個案例需要經過的工作能力，引擎會在企業的流程圖裡找對應的步驟；
risk 由引擎依客戶描述與政府開放資料判定，不寫死在案例裡。
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Case:
    id: str
    scenario: str  # 客服／退貨／物流延誤／消費爭議
    title: str
    message: str  # 客戶傳來的訊息
    order_id: str | None
    steps: tuple[str, ...]
    intent: str = "inquiry"  # inquiry／return／delay／dispute
    tags: tuple[str, ...] = field(default=())


CASES: list[Case] = [
    Case(
        "cs-warranty", "客服", "詢問商品保固",
        "你好，我上週買的無線滑鼠（訂單 A1006）保固多久？壞了要寄去哪裡？",
        "A1006", ("intake", "order", "policy", "notify"),
    ),
    Case(
        "return-normal", "退貨", "七天內一般退貨",
        "耳機音質跟我想的不一樣，還沒怎麼用，想退貨，訂單 A1001。",
        "A1001", ("intake", "order", "policy", "decide", "refund", "notify"), intent="return",
    ),
    Case(
        "return-missing", "退貨", "未提供訂單編號",
        "我買的東西有問題想退，要怎麼辦？",
        None, ("intake", "order", "policy", "decide", "refund", "notify"), intent="return",
    ),
    Case(
        "return-overheat", "退貨", "行動電源使用時過熱",
        "行動電源充電時燙到不能摸，還有一點焦味，我不敢用了，要退貨。訂單 A1002。",
        "A1002", ("intake", "order", "policy", "decide", "refund", "notify"), intent="return",
    ),
    Case(
        "return-recall", "退貨", "除濕機疑似召回品項",
        "除濕機用了幾天，聽說這類除濕機有召回？我想退貨。訂單 A1003。",
        "A1003", ("intake", "order", "policy", "decide", "refund", "notify"), intent="return",
    ),
    Case(
        "delay-stuck", "物流延誤", "包裹多日沒有更新",
        "電風扇一個多禮拜了還沒到，物流查詢好幾天都沒動，到底什麼時候會到？訂單 A1004。",
        "A1004", ("intake", "order", "logistics", "notify"), intent="delay",
    ),
    Case(
        "dispute-overdue", "消費爭議", "超過鑑賞期仍要求退款",
        "轉接器用兩個禮拜就不太穩，你們不給退我就去消保官申訴。訂單 A1005。",
        "A1005", ("intake", "order", "policy", "decide", "refund", "notify"), intent="dispute",
    ),
]

SCENARIOS = ["客服", "退貨", "物流延誤", "消費爭議"]

# 客戶描述中出現這些字，視為商品安全疑慮
SAFETY_SYMPTOMS = ("過熱", "燙", "焦味", "冒煙", "起火", "膨脹", "漏電", "爆")
DISPUTE_WORDS = ("申訴", "消保", "檢舉", "提告", "投訴")

# 退貨政策（示範企業 SOP 摘要），AI 有企業文件時才能引用
POLICY = {
    "return_days": 7,
    "text": "收到商品 7 天內、商品未嚴重使用可退貨；疑似商品安全問題一律由主管處理；保固一年，送修寄回原廠。",
}

# 示範品類對應的消保會申訴類別
COMPLAINT_CATEGORY = {
    "行動電源": "通訊及周邊產品",
    "電源轉接器": "電腦及周邊產品",
    "滑鼠": "電腦及周邊產品",
    "耳機": "通訊及周邊產品",
    "家用電扇": "電器及周邊產品",
    "除濕機": "電器及周邊產品",
}
