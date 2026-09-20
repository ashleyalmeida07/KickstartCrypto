# KickstartCrypto — Agentic Backend

FastAPI service hosting LangGraph agentic flows for the KickstartCrypto platform.
Runs as a sidecar to the Next.js frontend on **port 8001**.

## Flows implemented

| # | Flow | Framework | Status |
|---|------|-----------|--------|
| 1 | Campaign Vetting & Risk Scoring | LangGraph | ✅ Done |
| 2 | Donor Support & Dispute Resolution | LangGraph | 🔜 Next |
| 3 | Admin Monitoring & Reporting | CrewAI | 🔜 Next |

---

## Setup

### 1. Prerequisites
- Python 3.11+
- A NeonDB PostgreSQL database (shared with Next.js)
- An [OpenRouter](https://openrouter.ai/) API key (free tier works)
- An [Etherscan](https://etherscan.io/myapikey) API key (free tier)

### 2. Run the database migration

In the Neon SQL Editor, run:
```sql
-- file: database/agent_migration.sql
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS vetting_status        TEXT         DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS vetting_score         NUMERIC,
    ADD COLUMN IF NOT EXISTS vetting_reasons       TEXT,
    ADD COLUMN IF NOT EXISTS vetting_completed_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_campaigns_vetting_status ON campaigns(vetting_status);
```

### 3. Configure environment

```bash
cd agent_backend
cp .env.example .env
# Edit .env — fill in OPENROUTER_API_KEY and ETHERSCAN_API_KEY
```

### 4. Install & run

```bash
cd agent_backend
pip install -r requirements.txt
python main.py
# → Listening on http://localhost:8001
```

Or with uvicorn directly:
```bash
uvicorn main:app --reload --port 8001
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Health check |
| `POST` | `/vet-campaign` | Trigger LangGraph vetting (async, returns 202) |
| `GET`  | `/vetting-status/{address}` | Poll vetting result |

### Example

```bash
# Trigger vetting
curl -X POST http://localhost:8001/vet-campaign \
  -H "Content-Type: application/json" \
  -d '{"contract_address": "0xYourCampaignAddress"}'

# Poll result
curl http://localhost:8001/vetting-status/0xYourCampaignAddress
```

---

## LangGraph Flow 1 — Campaign Vetting

```
extract_campaign_data
        │
        ▼
check_wallet_history
        │
        ▼
content_authenticity_check
        │
        ▼
    risk_scorer
        │
        ▼
conditional_router
    │       │        │
(low)   (medium)  (high)
    │       │        │
auto_   flag_for  auto_
approve  review   reject
    │       │        │
    └───────┴────────┘
            ▼
          notify   ← writes verdict to DB
```

### Risk Thresholds (configurable in `.env`)
| Score | Decision |
|-------|----------|
| < 0.30 | `approved` |
| 0.30 – 0.65 | `flagged_for_review` |
| > 0.65 | `rejected` |

### Wallet score signals
- Wallet age (new wallets are riskier)
- Transaction count  
- GoPlus Security / static blocklist check

### Content score signals (LLM via OpenRouter)
- Unrealistic promises
- Copy-paste / generic text patterns
- Goal/description mismatch
- High-pressure urgency language

---

## Deployment (Render)

This backend is designed to be easily hosted on Render as a Web Service. Since it lives inside a monorepo, you must configure the **Root Directory**.

1. Create a new **Web Service** on Render and connect your GitHub repo.
2. Configure the following settings:
   - **Root Directory**: `agent_backend` (CRITICAL)
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Add your Environment Variables (`OPENROUTER_API_KEY`, etc.) in the Render dashboard. Do not set `PORT`; Render assigns it automatically.
4. Deploy and update your Next.js `.env` to point to the new Render URL instead of `localhost:8001`.
