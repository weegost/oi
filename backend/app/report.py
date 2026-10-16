"""第四階段：彙整流程、人機分工與沙盒測試結果，產出 AI 導入需求草案。

草案內容全部由已確認的資料組成（決定性）；AI 摘要是選用的附加段落，另外標示。
"""

from datetime import date

from .allocation import MODES
from .flow import Flow
from .models import Company, Project
from .sandbox import engine as sandbox


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
                "mode": MODES[mode],
                "recommended": MODES[exp["recommended"]] if exp else None,
                "ai_tasks": exp.get("ai_tasks", []) if mode != "human" else [],
                "goal": exp.get("goal", "") if mode != "human" else "",
                "ai_does": opt["ai_does"] if opt else ("不使用 AI" if mode == "human" else "尚未分析"),
                "human_does": opt["human_does"] if opt else "",
                "risk": opt["risk"] if opt and mode != "human" else "",
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
        "title": f"{company.name} AI 導入需求草案",
        "generated_on": date.today().isoformat(),
        "overview": {
            "company": company.name,
            "tax_id": company.tax_id,
            "is_demo": company.registration_type == "demo",
            "industry": (company.industry or {}).get("label", ""),
            "project": p.name,
            "work": p.work,
            "problem": p.problem,
            "scope": p.scope,
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
    }


# ---- 匯出 ----

KIND_LABEL = {"process": "工作", "wait": "等待", "decision": "判斷", "handoff": "人工接管"}


def to_markdown(r: dict) -> str:
    o = r["overview"]
    t = r["testing"]
    L = [f"# {r['title']}", "", f"產出日期：{r['generated_on']}　｜　由智行進業 BizPilot AI 產生，供顧問諮詢、工具採購或系統開發溝通使用", ""]
    if r["ai_summary"]:
        L += ["## 摘要（AI 撰寫，請企業確認）", "", r["ai_summary"], ""]
    L += [
        "## 1. 專案概要",
        "",
        f"- 企業：{o['company']}（{'案例代碼' if o['is_demo'] else '統一編號'} {o['tax_id']}）",
        f"- 產業：{o['industry']}",
        f"- 改善專案：{o['project']}",
        f"- 想改善的工作：{o['work']}",
        f"- 目前問題：{o['problem']}",
        f"- 分析範圍：{o['scope']}",
        f"- 規模：{o['stats']['steps']} 個工作步驟，其中 {o['stats']['ai_steps']} 步規劃 AI 介入",
        "",
        "## 2. 現況工作流程",
        "",
        "| # | 步驟 | 類型 | 負責角色 | 使用系統 | 需要的資料 | 確認狀態 |",
        "|---|---|---|---|---|---|---|",
    ]
    for i, s in enumerate(r["steps"], 1):
        L.append(f"| {i} | {s['title']} | {KIND_LABEL.get(s['kind'], s['kind'])} | {s['role']} | {s['system']} | {s['data']} | {s['status']} |")
    L += ["", "## 3. 人機分工與 AI 任務", ""]
    human = [a["step"] for a in r["allocations"] if a["mode"] == MODES["human"]]
    for a in [a for a in r["allocations"] if a["mode"] != MODES["human"]]:
        L.append(f"### {a['step']}：{a['mode']}" + (f"（AI 建議：{a['recommended']}）" if a["recommended"] and a["recommended"] != a["mode"] else ""))
        L.append(f"- AI 做什麼：{a['ai_does']}")
        if a["human_does"]:
            L.append(f"- 人做什麼：{a['human_does']}")
        if a["ai_tasks"]:
            L.append(f"- AI 任務：{'；'.join(a['ai_tasks'])}")
        if a["goal"]:
            L.append(f"- 改善目標：{a['goal']}")
        if a["risk"]:
            L.append(f"- 主要風險：{a['risk']}")
        L.append("")
    if human:
        L += [f"維持人工執行：{'、'.join(human)}", ""]
    L += ["## 4. 所需資料與系統", ""]
    L += [f"- 資料：{x}" for x in r["data"]] or ["- （尚無 AI 分工）"]
    L += [f"- 系統：{x}" for x in r["systems"]]
    L += ["", "## 5. 操作權限", ""]
    L += [f"- {x}" for x in r["permissions"]] or ["- （尚無 AI 分工）"]
    L += ["", "## 6. 人工接管方式", ""]
    L += [f"- {x}" for x in r["handoffs"]] or ["- （尚未定義）"]
    L += ["", "## 7. 情境沙盒測試", ""]
    if not t["tested"]:
        L.append("尚未執行情境測試。")
    else:
        L.append(f"第 {t['run']} 次測試" + ("（流程或分工已變更，結果可能過期）" if t["stale"] else ""))
        L.append("")
        L.append(f"- 假設已具備：{'、'.join(t['assumed']) or '無'}")
        L.append(f"- 尚未具備：{'、'.join(t['not_ready']) or '無'}")
        L += ["", "| 情境 | 案例 | 結果 | 風險 |", "|---|---|---|---|"]
        for c in t["cases"]:
            L.append(f"| {c['scenario']} | {c['title']} | {c['disposition']} | {'；'.join(c['risks'])} |")
        if t["evidence"]:
            L += ["", "政府開放資料比對："] + [f"- {e}" for e in t["evidence"]]
    L += ["", "## 8. 導入缺口", ""]
    for g in r["gaps"]:
        L.append(f"- **{g['type']}**：{g['issue']} 建議：{g['action']}（影響 {len(g['cases'])} 個案例）")
    if not r["gaps"]:
        L.append("- 目前測試中沒有發現缺口。")
    L += ["", "## 9. 尚待確認事項", ""] + [f"- [ ] {x}" for x in r["todo"]]
    L += ["", "---", "", "本草案中的測試以模擬系統與虛構案例進行，未連接企業真實系統，也不會實際退款或開通權限。"]
    return "\n".join(L)


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

    for line in to_markdown(r).splitlines():
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
