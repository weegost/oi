"""經濟部商工行政資料開放平臺：以統編查詢公司／商業登記與營業項目。"""

import asyncio
import re

import httpx

BASE = "https://data.gcis.nat.gov.tw/od/data/api"

COMPANY_PROFILE = "5F64D864-61CB-4D0D-8AD9-492047CC1EA6"  # 公司登記基本資料－應用一
COMPANY_ITEMS = "236EE382-4942-41A9-BD03-CA0709025E7C"  # 公司登記基本資料－應用三（含營業項目）
BUSINESS_PROFILE = "7E6AFA72-AD6A-46D3-8681-ED77951D912D"  # 商業登記基本資料－應用一（需申登機關）
BUSINESS_ITEMS = "426D5542-5F05-43EB-83F9-F1300F14E1F1"  # 商業登記基本資料－應用三
ITEM_CODES = "FCB90AB1-E382-45CE-8D4F-394861851E28"  # 公司行號營業項目代碼表

# 商業登記應用一必須指定申登機關；應用三查不到時才逐一嘗試
BUSINESS_AGENCIES = [
    "376410000A", "379100000G", "383100000G", "376570000A", "376580000A",
    "376590000A", "376610000A", "376600000A", "376430000A", "376440000A",
    "376420000A", "376450000A", "376470000A", "376480000A", "376490000A",
    "376500000A", "376530000A", "376560000A", "376550000A", "376540000A",
    "371010000A", "371030000A",
]


CODE_RE = re.compile(r"[A-Z0-9]{6,8}")


class GcisError(RuntimeError):
    pass


def _records(value) -> list[dict]:
    # 官方端點可能回傳陣列、單筆物件或空字串
    if isinstance(value, list):
        return value
    return [value] if isinstance(value, dict) else []


async def _query(client: httpx.AsyncClient, dataset: str, filter_: str, top: int = 1) -> list[dict]:
    params = {"$format": "json", "$filter": filter_, "$skip": "0", "$top": str(top)}
    r = await client.get(f"{BASE}/{dataset}", params=params)
    r.raise_for_status()
    # 查無資料時官方回傳空內容
    if not r.content.strip():
        return []
    try:
        return _records(r.json())
    except ValueError as e:
        raise httpx.DecodingError(f"資料集 {dataset} 回傳格式錯誤") from e


async def _business_registration(client: httpx.AsyncClient, tax_id: str) -> dict | None:
    try:
        matches = await _query(client, BUSINESS_ITEMS, f"President_No eq {tax_id}", top=50)
    except httpx.HTTPError:
        matches = []
    current = next((m for m in matches if m.get("Business_Current_Status") == "01"), None)
    found = current or (matches[0] if matches else None)

    if found and found.get("Agency"):
        try:
            details = await _query(
                client, BUSINESS_PROFILE, f"President_No eq {tax_id} and Agency eq {found['Agency']}"
            )
            return {**found, **details[0]} if details else found
        except httpx.HTTPError:
            return found
    if found:
        return found

    results = await asyncio.gather(
        *(
            _query(client, BUSINESS_PROFILE, f"President_No eq {tax_id} and Agency eq {agency}")
            for agency in BUSINESS_AGENCIES
        ),
        return_exceptions=True,
    )
    for r in results:
        if isinstance(r, list) and r:
            return r[0]
    return None


async def _item_categories(client: httpx.AsyncClient, codes: list[str]) -> dict[str, dict]:
    # 條件太長時官方回傳非 JSON，分批查詢
    batches = [codes[i : i + 10] for i in range(0, len(codes), 10)]
    results = await asyncio.gather(
        *(
            _query(client, ITEM_CODES, " or ".join(f"Business_Item eq {c}" for c in batch), top=len(batch))
            for batch in batches
        ),
        return_exceptions=True,
    )
    # 代碼表暫時無法讀取時略過，仍保留登記資料中的項目名稱
    return {r["Business_Item"]: r for rows in results if isinstance(rows, list) for r in rows}


async def lookup(tax_id: str) -> dict | None:
    """回傳整理後的登記資料；查無資料回傳 None。"""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            profile_rows, items_rows = await asyncio.gather(
                _query(client, COMPANY_PROFILE, f"Business_Accounting_NO eq {tax_id}"),
                _query(client, COMPANY_ITEMS, f"Business_Accounting_NO eq {tax_id}"),
            )
            profile = profile_rows[0] if profile_rows else {}
            items_row = items_rows[0] if items_rows else {}

            if profile or items_row:
                kind = "company"
                raw_items = items_row.get("Cmp_Business") or []
                business = None
            else:
                business = await _business_registration(client, tax_id)
                if not business:
                    return None
                kind = "business"
                raw_items = business.get("Business_Item_Old") or []

            # 官方資料偶有空白代碼，混入查詢條件會讓整批失敗
            codes = sorted({c for i in raw_items if CODE_RE.fullmatch(c := (i.get("Business_Item") or "").strip())})
            categories = await _item_categories(client, codes)
    except httpx.TimeoutException as e:
        raise GcisError("商工資料查詢逾時，請稍後重試。") from e
    except httpx.HTTPError as e:
        raise GcisError(f"無法連線至商工行政資料開放平臺：{e}") from e

    items = []
    for i in raw_items:
        code = (i.get("Business_Item") or "").strip()
        if not code and not i.get("Business_Item_Desc"):
            continue
        cat = categories.get(code, {})
        items.append(
            {
                "code": code,
                "name": i.get("Business_Item_Desc") or cat.get("Business_Item_Desc", ""),
                "category": cat.get("Category_Name", ""),
                "subcategory": cat.get("Subcategories_Name", ""),
            }
        )

    if kind == "company":
        info = {**items_row, **profile}
        return {
            "registration_type": "company",
            "name": info.get("Company_Name", ""),
            "owner": info.get("Responsible_Name", ""),
            "address": info.get("Company_Location", ""),
            "status": info.get("Company_Status_Desc", ""),
            "capital": info.get("Capital_Stock_Amount", ""),
            "setup_date": info.get("Company_Setup_Date", ""),
            "business_items": items,
            "raw": info,
        }
    return {
        "registration_type": "business",
        "name": business.get("Business_Name", ""),
        "owner": business.get("Responsible_Name", ""),
        "address": business.get("Business_Address", ""),
        "status": business.get("Business_Current_Status_Desc", ""),
        "capital": business.get("Business_Register_Funds", ""),
        "setup_date": "",
        "business_items": items,
        "raw": business,
    }
