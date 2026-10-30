"""第四階段：彙整流程、人機分工與沙盒測試結果，產出 AI 導入需求草案。

草案內容全部由已確認的資料組成（決定性）；AI 摘要是選用的附加段落，另外標示。
"""

from datetime import date

from pydantic import BaseModel

from .allocation import MODES
from .flow import Flow
from .models import Company, Project
from .sandbox import engine as sandbox

SYSTEM_NAME = "智行進業 BizPilot AI"
DISCLAIMER = (
    "免責聲明：本報告由智行進業 BizPilot AI 依企業提供的資訊與 AI 分析自動產生，僅供 AI 導入規劃與溝通參考，"
    "不構成法律、財務或技術上的保證。AI 產生的建議可能不完整或有誤，正式導入前請由企業與專業顧問確認。"
    "情境測試使用模擬系統與虛構案例，未連接企業真實系統，也不會實際退款或開通權限。"
)


def _chosen_option(alloc: dict) -> dict | None:
    exp = alloc.get("exploration")
    if not exp:
        return None
    return next((o for o in exp["options"] if o["mode"] == alloc.get("mode", "human")), None)


def _uniq(items: list[str]) -> list[str]:
    seen, out = set(), []
    for i in items:
        i = i.strip()
        if i and i not in seen:
            seen.add(i)
            out.append(i)
    return out


def build(p: Project, company: Company) -> dict:
    flow = Flow.model_validate(p.flow)
    tasks = [n for n in flow.nodes if n.kind not in ("start", "end")]
    allocs = p.allocations or {}
    sb = p.sandbox or {}

    # 2. 現況流程
    steps = [
        {
            "title": n.title,
            "kind": n.kind,
            "role": n.role,
            "system": n.system,
            "data": n.data,
            "condition": n.condition,
            "exceptions": n.exceptions,
            "status": {"pending": "待確認", "confirmed": "已確認", "clarify": "待釐清"}[n.status],
        }
        for n in tasks
    ]

    # 3–6. 人機分工、資料、權限、人工接管
    allocation_rows, data, systems, permissions, handoffs = [], [], [], [], []
    for n in tasks:
        a = allocs.get(n.id, {})
        mode = a.get("mode", "human")
        opt = _chosen_option(a)
        exp = a.get("exploration") or {}
        allocation_rows.append(
            {
                "step": n.title,
                "role": n.role,
                "mode": MODES[mode],
                "recommended": MODES[exp["recommended"]] if exp else None,
                "ai_tasks": exp.get("ai_tasks", []) if mode != "human" else [],
                "goal": exp.get("goal", "") if mode != "human" else "",
                "ai_does": opt["ai_does"] if opt else ("不使用 AI" if mode == "human" else "尚未分析"),
                "human_does": opt["human_does"] if opt else "",
                "risk": opt["risk"] if opt and mode != "human" else "",
                # 這一步交給人處理的情況，報告重點區當作風險的對策
                "handoff": opt["handoff"] if opt and mode != "human" else [],
                "explored": bool(exp),
            }
        )
        if mode == "human":
            continue
        if opt:
            data += opt["required_data"]
            permissions += [f"{n.title}：{x}" for x in opt["permissions"]]
            handoffs += opt["handoff"]
        if n.system:
            systems.append(n.system)
    for n in tasks:
        if n.kind == "handoff":
            handoffs.append(f"流程步驟「{n.title}」由{n.role or '指定人員'}處理")

    # 7–8. 情境測試與缺口
    tested = bool(sb.get("run"))
    stale = tested and sb.get("fingerprint") != sandbox.fingerprint(p.flow, allocs)
    config = sb.get("config", {})
    assumed = [label for k, label in sandbox.CONDITIONS.items() if config.get(k)]
    not_ready = [label for k, label in sandbox.CONDITIONS.items() if not config.get(k)]
    cases = [
        {"scenario": r["scenario"], "title": r["title"], "disposition": r["disposition"], "risks": r["risks"]}
        for r in sb.get("results", [])
    ]
    gaps = [
        {"type": g["type"], "issue": g["issue"], "action": g["action"], "cases": g["cases"]}
        for g in (sb.get("summary") or {}).get("gaps", [])
    ]
    evidence = _uniq([f"{e['source']}：{e['text']}" for r in sb.get("results", []) for e in r.get("evidence", [])])

    # 9. 尚待確認事項
    todo = []
    unconfirmed = [n.title for n in tasks if n.status != "confirmed"]
    if unconfirmed:
        todo.append(f"流程步驟尚未由企業確認：{'、'.join(unconfirmed)}")
    unexplored = [r["step"] for r in allocation_rows if r["mode"] != MODES["human"] and not r["explored"]]
    if unexplored:
        todo.append(f"已選 AI 分工但尚未分析：{'、'.join(unexplored)}")
    if not any(r["mode"] != MODES["human"] for r in allocation_rows):
        todo.append("尚未為任何步驟選擇 AI 分工。")
    if not tested:
        todo.append("尚未執行情境沙盒測試。")
    elif stale:
        todo.append("流程或分工在最後一次測試後有變更，請重新執行情境測試。")
    for label in assumed:
        todo.append(f"沙盒中假設「{label}」，正式導入前需實際確認。")
    for g in gaps:
        todo.append(f"[{g['type']}] {g['issue']}")

    ai_steps = [r for r in allocation_rows if r["mode"] != MODES["human"]]
    return {
        "system": SYSTEM_NAME,
        "disclaimer": DISCLAIMER,
        "title": f"{company.name} AI 導入需求草案",
        "generated_on": date.today().isoformat(),
        "overview": {
            "company": company.name,
            "tax_id": company.tax_id,
            "is_demo": company.registration_type == "demo",
            "has_tax_id": company.registration_type != "manual",  # 不查統編、自填公司名稱時為 False
            "industry": (company.industry or {}).get("label", ""),
            "project": p.name,
            "work": p.work,
            "problem": p.problem,
            "scope": p.scope,
            # AI 探索時引用過的企業文件
            "documents": _uniq([src["filename"] for a in allocs.values() for src in a.get("sources", [])]),
            "stats": {
                "steps": len(tasks),
                "ai_steps": len(ai_steps),
                "cases": len(cases),
                "gaps": len(gaps),
            },
        },
        "steps": steps,
        "allocations": allocation_rows,
        "data": _uniq(data),
        "systems": _uniq(systems),
        "permissions": _uniq(permissions),
        "handoffs": _uniq(handoffs),
        "testing": {
            "tested": tested,
            "stale": stale,
            "run": sb.get("run", 0),
            "ran_at": sb.get("ran_at"),
            "assumed": assumed,
            "not_ready": not_ready,
            "cases": cases,
            "evidence": evidence,
        },
        "gaps": gaps,
        "todo": todo,
        "ai_summary": (p.report or {}).get("summary"),
        # 重點區的短句（AI 撰寫，與摘要一起產生）；還沒產生時為 None
        "ai_brief": (p.report or {}).get("brief"),
    }


# ---- 匯出 ----

KIND_LABEL = {"process": "工作", "wait": "等待", "decision": "判斷", "handoff": "人工接管"}


def _human_side(a: dict) -> str:
    if a["human_does"]:
        return a["human_does"]
    return f"由{a['role'] or '負責人'}處理" if a["mode"] == MODES["human"] else ""


def _body_markdown(r: dict) -> str:
    """報告本文（不含頁首系統名稱與頁尾免責聲明）。"""
    o = r["overview"]
    t = r["testing"]
    L = [f"# {r['title']}", ""]
    L += [
        "## 1. 專案概要",
        "",
        f"- 專案名稱：{o['project']}",
        f"- 企業：{o['company']}" + (f"（{'案例代碼' if o['is_demo'] else '統一編號'} {o['tax_id']}）" if o["has_tax_id"] else ""),
        f"- 產業：{o['industry']}",
        f"- 產出日期：{r['generated_on']}",
        f"- 規模：{o['stats']['steps']} 個工作步驟，其中 {o['stats']['ai_steps']} 步規劃 AI 介入",
    ]
    if o["documents"]:
        L.append(f"- 參考的企業文件：{'、'.join(o['documents'])}")
    L += [
        "",
        "## 2. 專案摘要",
        "",
        f"- 想改善的工作：{o['work']}",
        f"- 目前問題：{o['problem']}",
    ]
    if r["ai_summary"]:
        L += ["", "### AI 摘要（AI 撰寫，請企業確認）", "", r["ai_summary"]]

    L += ["", "## 3. 人力與 AI 分配", "", "| 步驟 | 分工方式 | AI 負責 | 人員負責 |", "|---|---|---|---|"]
    for a in r["allocations"]:
        L.append(f"| {a['step']} | {a['mode']} | {a['ai_does']} | {_human_side(a)} |")
    if r["handoffs"]:
        L += ["", "需轉由人工處理的情況："] + [f"- {x}" for x in r["handoffs"]]

    L += [
        "",
        "## 4. 現行工作流程",
        "",
        "| # | 步驟 | 類型 | 負責角色 | 使用系統 | 需要的資料 | 確認狀態 |",
        "|---|---|---|---|---|---|---|",
    ]
    for i, s in enumerate(r["steps"], 1):
        L.append(f"| {i} | {s['title']} | {KIND_LABEL.get(s['kind'], s['kind'])} | {s['role']} | {s['system']} | {s['data']} | {s['status']} |")

    L += ["", "## 5. AI 所需資料", ""]
    L += [f"- {x}" for x in r["data"]] or ["- （尚無 AI 分工）"]
    if r["systems"]:
        L += ["", f"需介接的系統：{'、'.join(r['systems'])}"]
    L += ["", "## 6. AI 操作權限", ""]
    L += [f"- {x}" for x in r["permissions"]] or ["- （尚無 AI 分工）"]

    L += ["", "## 7. 主要風險", ""]
    step_risks = [a for a in r["allocations"] if a["risk"]]
    if step_risks:
        L += ["### 各步驟的風險", ""] + [f"- {a['step']}（{a['mode']}）：{a['risk']}" for a in step_risks] + [""]
    L += ["### 導入前需補足的條件", ""]
    if not t["tested"]:
        L.append("- 尚未執行情境沙盒測試，導入條件還沒有經過驗證。")
    for g in r["gaps"]:
        L.append(f"- **{g['type']}**：{g['issue']} 建議：{g['action']}（影響 {len(g['cases'])} 個測試案例）")
    if t["tested"] and not r["gaps"]:
        L.append("- 情境測試中沒有發現缺口。")
    # 缺口已在上面列出；其餘待確認事項（未確認步驟、沙盒假設等）放在這裡
    pending = [x for x in r["todo"] if not x.startswith("[") and x != "尚未執行情境沙盒測試。"]
    if pending:
        L += ["", "### 尚待確認", ""] + [f"- {x}" for x in pending]
    return "\n".join(L)


def to_markdown(r: dict) -> str:
    return "\n".join([f"> {r['system']}｜AI 導入需求草案", "", _body_markdown(r), "", "---", "", r["disclaimer"]])


def to_docx(r: dict) -> bytes:
    """以 Markdown 內容為基礎產生 Word 檔，方便企業直接修改。"""
    import io

    from docx import Document
    from docx.oxml.ns import qn
    from docx.shared import Pt

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Microsoft JhengHei"
    style.font.size = Pt(10.5)
    style.element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft JhengHei")

    table_rows: list[list[str]] = []

    def flush_table():
        if not table_rows:
            return
        header, *body = table_rows
        t = doc.add_table(rows=1, cols=len(header))
        t.style = "Table Grid"
        for cell, text in zip(t.rows[0].cells, header):
            cell.text = text
            for run in cell.paragraphs[0].runs:
                run.bold = True
        for row in body:
            cells = t.add_row().cells
            for cell, text in zip(cells, row):
                cell.text = text
        table_rows.clear()

    # 頁首放系統名稱、頁尾放免責聲明，每一頁都會出現
    section = doc.sections[0]
    section.header.paragraphs[0].text = f"{r['system']}｜AI 導入需求草案"
    footer = section.footer.paragraphs[0]
    footer.text = r["disclaimer"]
    footer.runs[0].font.size = Pt(8)

    for line in _body_markdown(r).splitlines():
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if not all(set(c) <= {"-"} for c in cells):
                table_rows.append(cells)
            continue
        flush_table()
        if line.startswith("# "):
            doc.add_heading(line[2:], level=0)
        elif line.startswith("## "):
            doc.add_heading(line[3:], level=1)
        elif line.startswith("### "):
            doc.add_heading(line[4:], level=2)
        elif line.startswith("- [ ] "):
            doc.add_paragraph("☐ " + line[6:], style="List Bullet")
        elif line.startswith("- "):
            doc.add_paragraph(line[2:].replace("**", ""), style="List Bullet")
        elif line.strip() and line != "---":
            doc.add_paragraph(line)
    flush_table()

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


SUMMARY_SYSTEM = """你是協助台灣中小企業導入 AI 的顧問。請根據需求草案寫一段摘要給企業老闆與外部顧問看。
原則：只根據草案內容，不新增草案沒有的承諾或數字；清楚區分「已確認」與「假設、待確認」；繁體中文，口語但專業。"""


def ai_summary(r: dict) -> str:
    from . import llm

    prompt = f"""以下是 AI 導入需求草案（Markdown）：

{to_markdown({**r, "ai_summary": None})}

請寫 150–250 字摘要，依序說明：
1. 想解決的問題與這次規劃 AI 介入的步驟
2. 哪些步驟保留人工判斷、為什麼
3. 正式導入前最需要先補齊的 2–3 個條件
只輸出摘要段落，不要標題。"""
    text, _ = llm.generate(prompt, system=SUMMARY_SYSTEM)
    return text.strip()


class BriefStep(BaseModel):
    step: str  # 步驟名稱，照草案原文
    text: str  # AI 在這一步做什麼，白話短句


class Brief(BaseModel):
    """草案最上面「重點」用的短句：AI 做什麼、哪些留給人。"""

    ai: list[BriefStep]
    human: str


def ai_brief(r: dict) -> dict:
    from . import llm

    ai_steps = [a["step"] for a in r["allocations"] if a["mode"] != MODES["human"]]
    prompt = f"""以下是 AI 導入需求草案（Markdown）：

{to_markdown({**r, "ai_summary": None})}

請替老闆寫兩個問題的白話回答，不要用「介接、權限、節點」這類術語：
1. ai：「AI 會幫我們做什麼？」依序對這些步驟各寫一句，每句 20 字以內，只寫 AI 實際做的事：{"、".join(ai_steps) or "（無）"}
   step 欄位照抄步驟名稱。
2. human：「哪些還是要人來？」一句話，40 字以內，說明哪些步驟由誰負責，以及什麼情況 AI 一定交給人。"""
    brief = llm.generate_json(prompt, Brief, system=SUMMARY_SYSTEM)
    # 只保留草案裡真的有、而且有 AI 參與的步驟，避免 AI 自己多寫
    return {"ai": [s.model_dump() for s in brief.ai if s.step in ai_steps], "human": brief.human.strip()}
