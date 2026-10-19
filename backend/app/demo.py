"""示範案例「小名 3C 網店」（虛構）。報告時一鍵載入，避免現場依賴 AI 即時產生。

刻意保留一個缺口：判斷節點只有「符合條件」一個分支，
示範時切換到 AI 引導，Agent 會追問例外案件怎麼處理。
"""

DEMO_PROJECT = {
    "name": "小名網店退貨客服流程改善",
    "work": "處理客戶退貨申請",
    "problem": "客服需要反覆確認訂單、商品狀態與退貨政策；資料不足或疑似安全問題時須由人工接手。",
    "scope": "從收到客戶訊息、查詢訂單、確認退貨條件，到回覆客戶。",
}


def _node(id, kind, title, x, y, **fields):
    return {"id": id, "kind": kind, "title": title, "x": x, "y": y, "status": "pending", "source": "企業描述", **fields}


DEMO_FLOW = {
    "nodes": [
        _node("start", "start", "收到退貨訊息", None, None),
        _node(
            "receive", "process", "接收客戶需求", None, None,
            role="客服專員", system="蝦皮聊聊",
            data="客戶姓名、訂單編號、商品照片、問題描述",
            exceptions="客戶未附訂單編號或商品照片時，先請客戶補充。",
            output="退貨申請與待補資料清單",
        ),
        _node(
            "lookup", "process", "查詢訂單資料", None, None,
            role="客服專員", system="蝦皮賣家中心",
            data="訂單狀態、付款方式、出貨日期、商品資訊",
            exceptions="查無訂單或商品資訊不一致時，交由人工處理。",
            output="訂單查詢摘要",
        ),
        _node(
            "decision", "decision", "是否符合退款條件？", None, None,
            role="客服主管", system="退貨政策文件",
            data="訂單日期、商品狀態、退款原因",
            condition="訂單在七天內且商品未使用",
            output="退貨條件檢查結果",
        ),
        _node(
            "notify", "process", "通知客戶處理結果", None, None,
            role="客服專員", system="蝦皮聊聊",
            data="退款結果、處理說明、客服訊息範本",
            output="給客戶的回覆",
        ),
        _node("end", "end", "完成處理", None, None),
    ],
    "edges": [
        {"source": "start", "target": "receive", "label": ""},
        {"source": "receive", "target": "lookup", "label": ""},
        {"source": "lookup", "target": "decision", "label": ""},
        {"source": "decision", "target": "notify", "label": "符合條件"},
        {"source": "notify", "target": "end", "label": ""},
    ],
}

DEMO_MESSAGES = [
    {
        "role": "user",
        "mode": "direct",
        "text": "客人買的小家電想退貨，常常沒附訂單編號，也沒說清楚商品問題。客服要先問資料、到蝦皮後台查訂單，再看退貨政策，主管確認後回覆客人。",
    },
    {
        "role": "assistant",
        "mode": "direct",
        "text": "已整理出 4 個工作步驟：接收客戶需求、查詢訂單資料、判斷是否符合退款條件、通知客戶。請逐一確認節點內容。",
    },
]


# ---- 完整示範：四個階段都已完成的狀態 ----
# 流程補上 AI 引導問出的例外分支，所有步驟已確認；座標留空由前端自動排列。


def _full_flow() -> dict:
    import copy

    flow = copy.deepcopy(DEMO_FLOW)
    for n in flow["nodes"]:
        n.update(x=None, y=None, status="confirmed")
    end = flow["nodes"].pop()  # 讓「完成處理」維持在最後
    flow["nodes"] += [
        {
            **_node(
                "handoff", "handoff", "轉交主管處理", None, None,
                role="客服主管", system="LINE 群組",
                data="訂單資料、客戶描述、商品照片",
                condition="不符合退款條件、疑似商品安全問題或客戶表示將申訴",
                output="主管處理指示",
            ),
            "status": "confirmed",
        },
        {
            **_node(
                "call", "process", "主管電話確認", None, None,
                role="客服主管", system="電話",
                data="客戶電話、商品異常狀況",
                exceptions="必要時請客戶寄回商品檢測。",
                output="與客戶確認後的處理方式",
            ),
            "status": "confirmed",
        },
        end,
    ]
    flow["edges"] += [
        {"source": "decision", "target": "handoff", "label": "例外／爭議"},
        {"source": "handoff", "target": "call", "label": ""},
        {"source": "call", "target": "notify", "label": ""},
    ]
    return flow


DEMO_FULL_FLOW = _full_flow()

# 選定的人機分工：讀取類工作交給 AI，判斷與回覆保留人工確認，例外由人處理
DEMO_FULL_MODES = {
    "receive": "assist",
    "lookup": "auto",
    "decision": "review",
    "notify": "review",
    "handoff": "human",
    "call": "human",
}

# 沙盒條件：刻意保留「補件規則」未具備，只影響「未提供訂單編號」案例，草案會列出這個待補缺口
DEMO_FULL_SANDBOX_CONFIG = {
    "docs_ready": True,
    "api_connected": True,
    "read_permission": True,
    "write_permission": True,
    "required_fields": False,
    "open_data": True,
    "handoff_owner": True,
}

DEMO_FULL_MESSAGES = DEMO_MESSAGES + [
    {"role": "assistant", "mode": "guided", "text": "上次遇到客人想退貨但資料沒給齊，或是商品狀況有爭議時，主管是怎麼判斷要不要給退的？"},
    {
        "role": "user",
        "mode": "guided",
        "text": "不符合條件或商品看起來有過熱、冒煙這種安全問題時，客服會轉給主管小名處理，小名會打電話跟客人確認，必要時請客人寄回檢測。",
    },
    {
        "role": "assistant",
        "mode": "guided",
        "text": "已新增「轉交主管處理」與「主管電話確認」兩個步驟，補上例外分支。流程資訊已大致完整，請逐一確認節點。",
    },
]
