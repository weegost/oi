"""情境沙盒模擬引擎（決定性規則，不呼叫 LLM，報告現場結果穩定可重現）。

把企業選定的人機分工帶進每個測試案例：
1. 在流程圖中找到處理案例所需的步驟，依該步驟的分工決定由人或 AI 處理。
2. AI 處理時呼叫模擬系統，檢查資料、系統介接、操作權限是否具備。
3. 以客戶描述與政府開放資料判定風險；高風險案件必須有人工接管路徑。
結果列出每一步的處理軌跡，以及尚未具備的導入條件（缺口）。
"""

import re
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from .. import opendata
from ..flow import Flow, FlowNode
from . import mock_systems as mock
from .scenarios import CASES, COMPLAINT_CATEGORY, DISPUTE_WORDS, POLICY, SAFETY_SYMPTOMS, Case

CONDITIONS: dict[str, str] = {
    "docs_ready": "已提供 SOP／退貨政策文件",
    "api_connected": "訂單、物流、退款系統可介接",
    "read_permission": "AI 已取得讀取權限（訂單、物流）",
    "write_permission": "AI 已取得寫入權限（退款、發送回覆）",
    "required_fields": "已設定必填欄位與補件規則",
    "open_data": "已納入政府開放資料比對",
    "handoff_owner": "已指定人工接管負責人與時限",
}

CAP_LABEL = {
    "intake": "接收客戶訊息",
    "order": "查詢訂單",
    "logistics": "查詢物流",
    "policy": "查找政策",
    "decide": "判斷處理方式",
    "refund": "退款／換貨",
    "notify": "回覆客戶",
    "handoff": "人工接管",
}

CAP_PATTERN = {
    "intake": r"接收|收到|受理|需求|訊息|詢問|申請",
    "order": r"訂單",
    "logistics": r"物流|貨況|配送|包裹|宅配|運送|黑貓",
    "policy": r"政策|規定|規則|SOP|保固|條款",
    "decide": r"判斷|是否|審核|核准",
    "refund": r"退款|退費|換貨",
    "notify": r"通知|回覆|告知|結案|回應",
    "handoff": r"主管|人工|轉交|接管",
}
# 流程沒有獨立步驟時，由相近的步驟兼任（例如查訂單時一併查物流）
CAP_FALLBACK = {"logistics": "order", "policy": "decide", "refund": "decide"}

MODE_LABEL = {"human": "人工執行", "assist": "AI 輔助", "review": "AI 執行後人工確認", "auto": "AI 自動執行"}


@dataclass
class Result:
    case: Case
    trace: list[dict] = field(default_factory=list)
    gaps: list[dict] = field(default_factory=list)
    risks: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    evidence: list[dict] = field(default_factory=list)
    ai_involved: bool = False

    def step(self, cap: str, node: FlowNode | None, mode: str, action: str, status: str = "ok", api: str = ""):
        self.trace.append(
            {
                "capability": CAP_LABEL[cap],
                "node": node.title if node else "（流程中沒有）",
                "mode": MODE_LABEL.get(mode, mode),
                "action": action,
                "api": api,
                "status": status,  # ok／warn／fail
            }
        )

    def gap(self, type_: str, issue: str, action: str, condition: str | None = None):
        if not any(g["type"] == type_ and g["issue"] == issue for g in self.gaps):
            self.gaps.append({"type": type_, "issue": issue, "action": action, "condition": condition})

    def to_dict(self) -> dict:
        c = self.case
        if self.gaps:
            disposition = "需補足條件"
        elif self.risks:
            disposition = "正確轉人工"
        elif not self.ai_involved:
            disposition = "人工處理"
        else:
            disposition = "AI 協助完成"
        return {
            "id": c.id,
            "scenario": c.scenario,
            "title": c.title,
            "message": c.message,
            "order_id": c.order_id,
            "disposition": disposition,
            "risks": self.risks,
            "trace": self.trace,
            "gaps": self.gaps,
            "notes": self.notes,
            "evidence": self.evidence,
        }


class Context:
    def __init__(self, flow: Flow, allocations: dict, config: dict, db: Session):
        self.tasks = [n for n in flow.nodes if n.kind not in ("start", "end")]
        self.allocations = allocations
        self.config = {k: bool(config.get(k)) for k in CONDITIONS}
        self.db = db

    def find(self, cap: str) -> FlowNode | None:
        for n in self.tasks:
            if cap == "decide" and n.kind == "decision":
                return n
            if cap == "handoff" and n.kind == "handoff":
                return n
        pattern = re.compile(CAP_PATTERN[cap])
        for n in self.tasks:
            if pattern.search(f"{n.title} {n.system} {n.description}"):
                return n
        if cap == "intake" and self.tasks:
            return self.tasks[0]
        return self.find(CAP_FALLBACK[cap]) if cap in CAP_FALLBACK else None

    def mode(self, node: FlowNode) -> str:
        return self.allocations.get(node.id, {}).get("mode", "human")


def _assess_risk(case: Case, order: dict | None, ctx: Context, r: Result):
    """依客戶描述、訂單狀態與開放資料判定風險。"""
    category = order["category"] if order else None
    symptom = next((w for w in SAFETY_SYMPTOMS if w in case.message), None)
    if symptom:
        r.risks.append(f"商品安全疑慮：客戶描述「{symptom}」")
    if any(w in case.message for w in DISPUTE_WORDS):
        r.risks.append("消費爭議：客戶表示將申訴")

    if order and case.intent in ("return", "dispute"):
        days = mock.days_since_delivery(order)
        if days is not None and days > POLICY["return_days"]:
            r.risks.append(f"已超過 {POLICY['return_days']} 天鑑賞期（送達 {days} 天），退款需人工判斷")
    if order and case.intent == "delay":
        logi = mock.get_logistics(order["order_id"])
        if logi and logi["days_without_update"] >= 5:
            r.risks.append(f"物流 {logi['days_without_update']} 天沒有更新，需人工聯繫物流商")

    if not category:
        return
    recalls = opendata.recalls_for(ctx.db, order["recall_kw"])
    penalties = opendata.penalties_for(ctx.db, category)
    if not ctx.config["open_data"]:
        if recalls:
            r.gap(
                "資料不足",
                f"未比對政府開放資料，無法發現「{category}」曾有召回訊息。",
                "納入標檢局商品召回與處分資料，比對客戶購買的品類。",
                "open_data",
            )
        return

    for rc in recalls:
        r.evidence.append({"source": "標檢局歷年商品召回", "text": rc.title, "date": rc.published, "url": rc.url})
    seen: dict[tuple, dict] = {}
    for p in penalties:  # 同日同通路的處分合併顯示
        key = (p.dataset, p.channel, p.penalty_date)
        if key in seen:
            seen[key]["count"] += 1
            continue
        seen[key] = {
            "source": f"標檢局{p.dataset}類處分案件",
            "text": f"{p.category}（{p.channel}販售）違反商品檢驗規定",
            "date": opendata._fmt(p.penalty_date),
            "url": "",
            "count": 1,
        }
    for ev in seen.values():
        if ev["count"] > 1:
            ev["text"] += f"，共 {ev['count']} 件"
        r.evidence.append(ev)
    if recalls:
        r.risks.append(f"開放資料比對：「{category}」曾有召回訊息，需人工確認是否為召回品")
    if penalties:
        msg = f"開放資料比對：近期有 {len(penalties)} 件「{category}」違反商品檢驗規定的處分"
        if symptom:
            r.risks.append(msg + "，加上客戶描述安全疑慮，須人工覆核")
        else:
            r.notes.append(msg + "，建議人工抽查同批商品標示")
    if case.intent == "dispute" and (cc := COMPLAINT_CATEGORY.get(category)):
        trend = opendata.complaint_trend(ctx.db, cc, months=12)
        if trend:
            total = sum(t["count"] for t in trend)
            r.evidence.append(
                {"source": "消保會申訴統計", "text": f"「{cc}」近 {len(trend)} 個月全國申訴 {total:,} 件", "date": trend[-1]["month"], "url": ""}
            )


def run_case(case: Case, ctx: Context) -> dict:
    r = Result(case)
    cfg = ctx.config
    order = mock.get_order(case.order_id) if case.order_id else None
    _assess_risk(case, order, ctx, r)
    risky = bool(r.risks)
    waiting_for_order = case.order_id is None  # 沒有訂單編號時，後續查詢、判斷、退款都要等補件

    for cap in case.steps:
        node = ctx.find(cap)
        if not node:
            r.step(cap, None, "-", "流程中找不到負責這件事的步驟", "fail")
            r.gap("流程缺口", f"流程中沒有「{CAP_LABEL[cap]}」的步驟。", "回到流程建模補上這個步驟與負責人。")
            continue
        mode = ctx.mode(node)
        if mode == "human":
            r.step(cap, node, mode, f"由{node.role or '負責人'}人工處理")
            continue
        r.ai_involved = True

        if cap == "intake":
            if case.order_id:
                r.step(cap, node, mode, f"AI 整理客戶訊息，辨識訂單 {case.order_id}")
            elif cfg["required_fields"]:
                r.step(cap, node, mode, "缺少訂單編號，AI 依補件規則請客戶提供", "warn")
            else:
                r.step(cap, node, mode, "缺少訂單編號，AI 沒有補件規則可依循", "fail")
                r.gap("資料不足", "客戶沒提供訂單編號時，沒有補件規則，AI 可能自行猜測或卡住。",
                      "設定必填欄位與補件話術，禁止以猜測值繼續處理。", "required_fields")

        elif cap in ("order", "logistics"):
            if waiting_for_order:
                r.step(cap, node, mode, "等待客戶補件，暫不查詢", "warn")
                continue
            api = f"GET /api/mock/{'orders' if cap == 'order' else 'logistics'}/{case.order_id}"
            if not cfg["api_connected"]:
                r.step(cap, node, mode, "無法連到系統，AI 查不到資料", "fail", api)
                r.gap("系統介接", f"AI 需要{CAP_LABEL[cap]}，但系統尚未介接。",
                      "確認系統是否提供 API、欄位對照與錯誤回傳。", "api_connected")
            elif not cfg["read_permission"]:
                r.step(cap, node, mode, "系統拒絕存取：沒有讀取權限", "fail", api)
                r.gap("操作權限", f"AI 尚未取得{CAP_LABEL[cap]}的讀取權限。",
                      "開放 AI 專用帳號的唯讀權限，並限制可查詢範圍。", "read_permission")
            elif cap == "order":
                r.step(cap, node, mode, f"查到訂單：{order['product']}，{order['amount']} 元，{order['logistics_status']}", api=api)
            else:
                logi = mock.get_logistics(case.order_id)
                r.step(cap, node, mode, f"物流狀態：{logi['status']}，{logi['days_without_update']} 天未更新", api=api)

        elif cap == "policy":
            if not cfg["docs_ready"]:
                r.step(cap, node, mode, "沒有可引用的政策文件", "fail")
                r.gap("資料不足", "AI 沒有可引用的 SOP／退貨政策，回覆可能沒有依據。",
                      "提供退貨、保固政策文件，並標明版本與適用範圍。", "docs_ready")
            else:
                r.step(cap, node, mode, f"引用企業政策：{POLICY['text']}")

        elif cap == "decide":
            if waiting_for_order:
                r.step(cap, node, mode, "資料不足，暫不判斷", "warn")
            elif risky and mode == "auto":
                r.step(cap, node, mode, "高風險案件仍由 AI 自動判斷", "fail")
                r.gap("人工接管", f"「{node.title}」設為 AI 自動執行，高風險案件會在沒有人把關下被判定。",
                      "把這一步改為「AI 執行後人工確認」或「AI 輔助」。")
            elif risky:
                r.step(cap, node, mode, "AI 整理判斷依據並標示風險，交由人決定", "warn")
            else:
                r.step(cap, node, mode, "AI 依政策判定符合處理條件" + ("" if mode == "auto" else "，待人確認"))

        elif cap == "refund":
            if waiting_for_order:
                r.step(cap, node, mode, "資料不足，暫不處理退款", "warn")
            elif risky and mode == "auto":
                r.step(cap, node, mode, "AI 在未經人工確認下直接退款", "fail", "POST /api/mock/refunds")
                r.gap("人工接管", "高風險案件的退款被設為 AI 自動執行。", "退款一律改為主管核准後才執行。")
            elif risky:
                r.step(cap, node, mode, "暫停退款，等待人工處理", "warn")
            elif mode == "assist":
                r.step(cap, node, mode, f"AI 建議退款 {order['amount']} 元，由人到系統操作")
            elif not cfg["write_permission"]:
                r.step(cap, node, mode, "無法建立退款：沒有寫入權限", "fail", "POST /api/mock/refunds")
                r.gap("操作權限", "AI 需要建立退款單，但尚未取得退款系統的寫入權限。",
                      "分開設定查詢與寫入權限，寫入僅限建立待核准草稿。", "write_permission")
            else:
                done = "已建立退款（模擬）" if mode == "auto" else "已建立退款草稿，待人工核准"
                r.step(cap, node, mode, f"{done}：{order['amount']} 元", api="POST /api/mock/refunds")

        elif cap == "notify":
            if mode == "assist":
                r.step(cap, node, mode, "AI 產生回覆草稿，由客服修改後送出")
            elif risky and mode == "auto":
                r.step(cap, node, mode, "AI 直接回覆高風險案件", "fail")
                r.gap("人工接管", "高風險案件的回覆由 AI 自動送出，可能做出不當承諾。", "高風險案件改由人確認後再回覆。")
            elif not cfg["write_permission"]:
                r.step(cap, node, mode, "無法發送回覆：沒有發送訊息權限", "fail")
                r.gap("操作權限", "AI 需要直接發送回覆，但尚未取得發送權限。",
                      "開放發送權限前，先限定只能使用已核准的回覆範本。", "write_permission")
            else:
                r.step(cap, node, mode, "AI 依處理結果發送回覆" + ("" if mode == "auto" else "（經人確認）"))

    # 高風險或資料不足的案件，都需要明確的人工接管路徑
    if risky or waiting_for_order:
        node = ctx.find("handoff")
        if not node:
            r.step("handoff", None, "-", "流程中沒有人工接管步驟", "fail")
            r.gap("人工接管", "例外案件沒有人工接管步驟，會卡在 AI 或沒人處理。", "在流程中加入「轉交主管處理」並設定觸發條件。")
        elif not cfg["handoff_owner"]:
            r.step("handoff", node, ctx.mode(node), "有接管步驟，但沒有指定負責人與時限", "fail")
            r.gap("人工接管", f"「{node.title}」沒有指定負責人與處理時限。", "指定負責人、接管條件與回覆時限。", "handoff_owner")
        else:
            r.step("handoff", node, ctx.mode(node), f"轉交{node.role or '負責人'}處理，附上 AI 整理的摘要")

    if not r.ai_involved:
        r.notes.append("這個案例涉及的步驟都由人工處理，尚未測試 AI 介入的條件。")
    return r.to_dict()


def run(flow: Flow, allocations: dict, config: dict, db: Session, scenarios: list[str] | None = None) -> list[dict]:
    ctx = Context(flow, allocations, config, db)
    cases = [c for c in CASES if not scenarios or c.scenario in scenarios]
    return [run_case(c, ctx) for c in cases]


def summarize(results: list[dict]) -> dict:
    gaps: dict[str, dict] = {}
    for res in results:
        for g in res["gaps"]:
            key = (g["type"], g["issue"])
            entry = gaps.setdefault(key, {**g, "cases": []})
            entry["cases"].append(res["title"])
    dispositions: dict[str, int] = {}
    for res in results:
        dispositions[res["disposition"]] = dispositions.get(res["disposition"], 0) + 1
    return {"gaps": list(gaps.values()), "dispositions": dispositions, "cases": len(results)}


def fingerprint(flow: dict, allocations: dict) -> str:
    """流程結構與分工的指紋；與上次測試不同代表測試結果已過期。"""
    import hashlib
    import json

    nodes = sorted((n["id"], n.get("kind"), n.get("title")) for n in flow.get("nodes", []))
    edges = sorted((e["source"], e["target"]) for e in flow.get("edges", []))
    modes = sorted((k, v.get("mode")) for k, v in (allocations or {}).items())
    return hashlib.sha1(json.dumps([nodes, edges, modes], ensure_ascii=False).encode()).hexdigest()[:12]
