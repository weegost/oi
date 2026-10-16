# 智行進業 BizPilot AI

中小企業 AI 導入探索平台。從企業現在實際怎麼工作出發，逐步釐清 AI 能介入哪些步驟、需要什麼條件，最後產出一份可以拿去和顧問、廠商溝通的 **AI 導入需求草案**。

第一階段以「3C／小家電網路零售業者」為示範場域。

## 四個階段

| 階段 | 做什麼 | 主要技術 |
|---|---|---|
| 1. 企業背景與流程建模 | 輸入統編帶入登記資料；以「直接描述」或「AI 引導」整理現況流程，產生可編輯的積木式流程圖 | 商工開放資料、Gemini、LangGraph、React Flow |
| 2. AI 介入探索 | 逐步驟分析 AI 可協助的任務，比較人工執行／AI 輔助／AI 執行後人工確認／AI 自動執行四種分工；高風險步驟自動標示不建議全自動 | Gemini 結構化輸出 + 風險規則 |
| 3. 情境沙盒測試 | 把分工帶進客服、退貨、物流延誤、消費爭議等 7 個案例，搭配模擬訂單／物流／退款 API 與政府開放資料，找出資料、介接、權限、人工接管的缺口 | 決定性規則引擎（不呼叫 AI，結果可重現） |
| 4. 需求草案產出 | 彙整流程、分工、測試結果與待確認事項，可下載 Word、Markdown 或列印成 PDF；可請 AI 撰寫摘要 | python-docx |

## 架構

```
智行進業/
├── frontend/            Next.js 16 + React Flow + Tailwind（網頁介面）
├── backend/             Python FastAPI（API、AI Agent、沙盒、報告）
│   ├── app/
│   │   ├── agent.py         流程建模 Agent（LangGraph）
│   │   ├── allocation.py    AI 介入探索與風險規則
│   │   ├── sandbox/         情境案例、模擬系統、沙盒引擎
│   │   ├── report.py        需求草案與匯出
│   │   ├── opendata.py      開放資料匯入與每日同步
│   │   ├── services/        商工登記查詢、產業判斷
│   │   └── demo_data/       完整示範的預存 AI 分析
│   ├── data/            開放資料快照
│   ├── scripts/         bake_demo.py（重新產生示範分析）
│   └── tests/           pytest
├── db/init/             資料庫初始化（啟用 pgvector）
├── docker-compose.yml   PostgreSQL 17 + pgvector
└── .env.example         設定範本
```

## 第一次設定（Windows）

需要先安裝：

- [Docker Desktop](https://www.docker.com/products/docker-desktop)（會一併要求安裝 WSL）
- [Node.js](https://nodejs.org) 20 以上
- [Python](https://www.python.org) 3.12
- Gemini API 金鑰：到 [Google AI Studio](https://aistudio.google.com) →「Get API key」申請，免費

```bash
# 1. 設定檔：複製後把自己的 Gemini 金鑰填進 .env 的 GEMINI_API_KEY
cp .env.example .env

# 2. 資料庫（Docker Desktop 要先開著）
docker compose up -d

# 3. 後端
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt

# 4. 前端
cd ../frontend
npm install
```

> `.env` 有每個人自己的金鑰，**不要上傳到 GitHub**（已列在 `.gitignore`）。

## 每次啟動

開三個終端機：

```bash
docker compose up -d
```

```bash
cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend && npm run dev
```

- 系統：http://localhost:3000
- 連線狀態檢查：http://localhost:3000/status
- 後端 API 文件：http://localhost:8000/docs

## 示範案例

首頁點「使用示範案例」（或統編輸入 `00000000`）會載入虛構的「小名 3C 網店」，不會送往官方 API。接著有兩個按鈕：

- **載入示範流程**：從第一階段開始，可現場示範 AI 引導追問例外處理。第二階段分析示範步驟時直接使用預存結果，不用等 AI。
- **載入完整示範（四階段）**：四個階段都已完成，約 1 秒載入、不呼叫 AI，適合當報告備案。

預存的 AI 分析在 `backend/app/demo_data/demo_full.json`。改動示範流程或分工（`backend/app/demo.py`）後，重新產生：

```bash
cd backend
.venv/Scripts/python scripts/bake_demo.py            # 全部重做，約 2–3 分鐘
.venv/Scripts/python scripts/bake_demo.py --summary-only   # 只改沙盒條件時，只重寫摘要
```

## 政府開放資料

| 資料集 | 用途 |
|---|---|
| 公司／商業登記基本資料（應用一、三）、營業項目代碼表 | 統編帶入企業背景，判斷是否屬 3C 示範產業 |
| 申訴及調解案件分類統計資料 | 消費爭議情境 |
| 歷年商品召回訊息 | 商品安全情境（官方資料至民國 105 年） |
| 標檢局電子類／電機類處分案件資料集 | 商品安全情境；官方只保留近一個月，後端每天自動同步並累積（不儲存被處分人、電話、地址） |

`backend/data/` 內附快照：召回與申訴統計直接匯入；處分案件連不上官方網站時改用快照。

## 情境沙盒的模擬系統

沙盒不碰企業真實系統，改用模擬的訂單、物流、庫存、退款 API（見 http://localhost:8000/docs 的 mock systems）。測試案例與商品資料在 `backend/app/sandbox/`，日期以當天為基準自動產生。

## 測試

```bash
cd backend && .venv/Scripts/python -m pytest -q
cd frontend && npx tsc --noEmit && npm run lint
```

後端測試需要資料庫開著，AI 呼叫一律用替身，不會消耗 Gemini 額度。

## 常見問題

- **電腦重開機後打不開**：先開 Docker Desktop，再執行 `docker compose up -d`。
- **改了後端程式沒生效**：Windows 上 `--reload` 偶爾會卡住，在後端終端機按 Ctrl+C 後重新啟動。
- **改了 CSS 沒生效**：重新啟動前端（`npm run dev`）。
- **AI 回應很慢或失敗**：Gemini 免費版偶爾忙碌，系統會自動改用 `.env` 裡 `GEMINI_FALLBACK_MODELS` 的備援模型；報告時建議使用「載入完整示範」。
- **Gemini 模型名稱失效**：到 AI Studio 看目前可用的 Flash 模型，改 `.env` 的 `GEMINI_MODEL`。

## 組員協作

- 不要直接改 `main`，每個功能開一個分支：`git switch -c feature/功能名稱`
- 推上去後在 GitHub 開 Pull Request，請其他組員看過再合併
- 每個人各自建立 `.env`，金鑰不要貼到群組或程式碼裡
