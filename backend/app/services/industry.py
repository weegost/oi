"""依營業項目代碼判斷產業，決定是否套用 3C／小家電網路零售示範情境。"""

# 代碼與名稱已對照「公司行號營業項目代碼表」
THREE_C_ITEMS = {
    "F113020": "電器批發業",
    "F113050": "電腦及事務性機器設備批發業",
    "F113070": "電信器材批發業",
    "F213010": "電器零售業",
    "F213030": "電腦及事務性機器設備零售業",
    "F213060": "電信器材零售業",
    "F218010": "資訊軟體零售業",
}
ONLINE_RETAIL = "F399040"  # 無店面零售業


def classify(items: list[dict]) -> dict:
    codes = {i.get("code") for i in items}
    three_c = sorted(codes & THREE_C_ITEMS.keys())
    online = ONLINE_RETAIL in codes
    is_3c = bool(three_c)

    if is_3c and online:
        label = "3C／小家電網路零售"
    elif is_3c:
        label = "3C／小家電銷售"
    else:
        # 非示範產業：以第一個營業項目的中類作為參考
        label = next((i["subcategory"] for i in items if i.get("subcategory")), "其他產業")

    return {
        "label": label,
        "is_3c": is_3c,
        "online_retail": online,
        "matched_items": [f"{c} {THREE_C_ITEMS[c]}" for c in three_c],
        # 第一階段只有 3C 示範情境；其他產業仍可建模，但沙盒情境需自行補充
        "demo_scenario": "3c_retail" if is_3c else None,
    }
