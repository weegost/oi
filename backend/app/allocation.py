"""第二階段：AI 介入探索與人機分工。

對選定的工作節點，請 Gemini 整理 AI 可協助的任務，並比較四種分工方式；
再以決定性的風險規則把關，避免高風險步驟被建議成全自動。
"""

import re
from typing import Literal

from pydantic import BaseModel, Field

from . import llm
from .flow import Flow, FlowNode

Mode = Literal["human", "assist", "review", "auto"]
Fit = Literal["建議", "可行", "不建議"]

MODES: dict[str, str] = {
    "human": "人工執行",
    "assist": "AI 輔助",
    "review": "AI 執行後人工確認",
    "auto": "AI 自動執行",
}


class ModeOption(BaseModel):
    mode: Mode
    ai_does: str = Field(description="這種分工下 AI 負責什麼；人工執行時寫「不使用 AI」")
    human_does: str = Field(description="這種分工下人負責什麼")
    required_data: list[str] = Field(description="AI 需要取得的資料")
    permissions: list[str] = Field(description="AI 需要的系統操作權限，標明讀取或寫入")
    handoff: list[str] = Field(description="哪些情況必須改由人工接管")
    risk: str = Field(description="這種分工的主要風險，一句話")
    fit: Fit
    reason: str = Field(description="為什麼建議／可行／不建議，一句話")


class Exploration(BaseModel):
    ai_tasks: list[str] = Field(description="AI 在這一步可以協助的具體任務，2–4 項")
    goal: str = Field(description="導入 AI 想達成的改善目標，例如縮短回覆時間")
    options: list[ModeOption] = Field(description="human、assist、review、auto 四種各一個")
    recommended: Mode


# 涉及金錢、安全、爭議或核准的步驟，不能建議 AI 自動執行
HIGH_RISK = re.compile(r"退款|退費|金額|付款|賠償|安全|過熱|召回|爭議|申訴|核准|審核|主管")


def risk_reasons(node: FlowNode) -> list[str]:
    reasons = []
    if node.kind == "decision":
        reasons.append("這一步是判斷決策，需由人負責結果")
    if node.kind == "handoff":
        reasons.append("這一步本身就是人工接管")
    # 不看「需要的資料」：讀取付款方式之類的欄位不代表這一步本身高風險
    text = " ".join([node.title, node.condition, node.exceptions])
    if m := HIGH_RISK.search(text):
        reasons.append(f"涉及「{m.group()}」，屬高風險作業")
    return reasons


def apply_guardrails(node: FlowNode, exp: Exploration) -> Exploration:
    """補齊缺少的分工選項，並依風險規則修正適合度與建議。"""
    by_mode = {o.mode: o for o in exp.options}
    for mode in MODES:
        if mode not in by_mode:
            by_mode[mode] = ModeOption(
                mode=mode, ai_does="（AI 未提供）", human_does="", required_data=[], permissions=[],
                handoff=[], risk="", fit="可行", reason="",
            )
    human = by_mode["human"]
    human.ai_does = "不使用 AI"
    human.required_data, human.permissions = [], []

    reasons = risk_reasons(node)
    if reasons:
        auto = by_mode["auto"]
        auto.fit = "不建議"
        auto.reason = "；".join(reasons) + "。建議保留人工確認。"
        if exp.recommended == "auto":
            exp.recommended = "review"
        if human.fit == "不建議":  # 高風險步驟由人處理永遠是安全的選項
            human.fit = "可行"
            human.reason = "效率較低，但由人負責判斷結果最安全。"

    exp.options = [by_mode[m] for m in MODES]
    by_mode[exp.recommended].fit = "建議"
    return exp


SYSTEM = """你是「智行進業」的 AI 導入顧問，協助台灣中小企業評估 AI 能介入工作流程的哪些步驟。
原則：
- AI 導入不等於全面自動化。要清楚說明 AI 做什麼、人做什麼、什麼情況要人接手。
- 只根據企業目前的流程與條件評估，不推銷特定產品。
- 權限要具體到「讀取訂單」「寫入退款紀錄」這種層級。
- 使用繁體中文，讓不懂技術的老闆也看得懂。"""


def explore(context: dict, flow: Flow, node: FlowNode) -> Exploration:
    steps = "\n".join(f"- {n.title}（{n.role or '未填'}）" for n in flow.nodes if n.kind not in ("start", "end"))
    prompt = f"""企業：{context['company']}（{context['industry']}）
想改善的工作：{context['work']}
目前問題：{context['problem']}

整體流程步驟：
{steps}

要評估的步驟：
{node.model_dump_json(exclude={"x", "y", "status", "source"})}

請評估 AI 能如何介入「{node.title}」：
1. 列出 AI 可協助的具體任務與改善目標。
2. 分別說明四種分工方式（human 人工執行、assist AI 輔助、review AI 執行後人工確認、auto AI 自動執行）
   各自的 AI 工作、人工工作、所需資料、操作權限、人工接管條件、風險與適合度。
3. 選出最適合目前條件的 recommended。"""
    exp = llm.generate_json(prompt, Exploration, system=SYSTEM)
    return apply_guardrails(node, exp)
