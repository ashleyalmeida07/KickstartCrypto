# KickstartCrypto — Agentic Backend

FastAPI service hosting LangGraph agentic flows for the KickstartCrypto platform.
Runs as a sidecar to the Next.js frontend on **port 8001**.

## Flows implemented

| # | Flow | Framework | Status |
|---|------|-----------|--------|
| 1 | Campaign Vetting & Risk Scoring | LangGraph | ✅ Done |
| 2 | Donor Support & Dispute Resolution | LangGraph | ✅ Done |
| 3 | Milestone Proof Verification | LangGraph | ✅ Done |
| 4 | Admin Monitoring & Reporting | CrewAI | 🔜 Next |

---

## Setup

### 1. Prerequisites
- Python 3.11+
- A NeonDB PostgreSQL database (shared with Next.js)
- An [OpenRouter](https://openrouter.ai/) API key (free tier works)
- An [Etherscan](https://etherscan.io/myapikey) API key (free tier)

### 2. Run the database migrations

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

Then run `database/milestone_proof_migration.sql` for Flow 3 — it creates the
`milestone_proofs` table and adds `payout_status` / `proof_status` /
`last_verified_at` to `milestones`. The service also creates these on startup if
they are missing, so local dev works without running it manually.

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
| `POST` | `/pre-vet` | Synchronous risk check on form data, before deploy |
| `POST` | `/vet-campaign` | Trigger LangGraph vetting (async, returns 202) |
| `GET`  | `/vetting-status/{address}` | Poll vetting result |
| `POST` | `/donor-support/query` | Submit a donor support query (async, 202) |
| `GET`  | `/donor-support/ticket/{id}` | Poll a support ticket |
| `GET`  | `/donor-support/tickets` | Admin: escalated ticket queue |
| `POST` | `/donor-support/resolve/{id}` | Admin: resolve a support ticket |
| `POST` | `/milestone-proof/submit` | Submit milestone proof (async, 202) |
| `GET`  | `/milestone-proof/queue` | Admin: proofs awaiting human review |
| `GET`  | `/milestone-proof/campaign/{address}` | All proofs for one campaign |
| `GET`  | `/milestone-proof/{proof_id}` | Poll a proof verification result |
| `POST` | `/milestone-proof/resolve/{proof_id}` | Admin: approve/reject a queued proof |

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

## LangGraph Flow 3 — Milestone Proof Verification

Runs when a creator submits proof to unlock the next milestone's funds.

```
extract_milestone_claim      ← what was promised (stored milestone plan)
        │
        ▼
    parse_proof              ← OCR / vision-LLM / PDF text / link fetch
        │
        ▼
cross_check_onchain_spend    ← claimed spend vs real outflow since last milestone
        │
        ▼
 consistency_check           ← LLM: does the proof match the milestone?
        │
        ▼
 confidence_scorer           ← OCR + on-chain match + consistency → one score
        │
        ▼
 conditional_router
  │         │          │
(high)  (ambiguous)  (mismatch)
  │         │          │
  ▼         ▼          ▼
release_ queue_for_  flag_
tranche    admin    mismatch
  │         │          │
  └─────────┴──────────┘
            ▼
         notify            ← writes verdict + every signal behind it
```

### Accepted proof types

| Type | Use for | How it is read |
|------|---------|----------------|
| `image` | Receipts, photos of physical progress or deliverables | Vision LLM OCR (`OPENROUTER_VISION_MODEL`) |
| `pdf` | Invoices, contracts, official documents | Text layer via `pypdf` |
| `link` | GitHub commit/PR/repo, deployed app URL, video | GitHub API, or the page's own text |
| `text` | The creator's own explanation, standing alone | Taken as written |

A short text description is always allowed **alongside** any of the above, and is
appended to the parsed content before the consistency check runs.

### Confidence thresholds (configurable in `.env`)

| Confidence | Decision |
|------------|----------|
| ≥ 0.75 | `auto_approved` → tranche cleared for release |
| 0.35 – 0.75 | `pending_review` → admin queue |
| ≤ 0.35 | `rejected` → tranche withheld |

### How the score is built

```
confidence = 0.25 · ocr_confidence      (could we read it?)
           + 0.30 · spend_match_score   (does the money line up?)
           + 0.45 · consistency_score   (does it prove THIS milestone?)
```

Consistency carries the most weight because it is the only signal that speaks to
the actual question — a flawless receipt for the wrong thing should not pass.

Four policy caps sit on top of the weighted sum:

1. **Clear mismatch** — consistency ≤ 0.25 caps confidence at 0.20, whatever else scored well.
2. **Overclaiming** — claiming a larger spend than actually left the wallet caps confidence at 0.45, so it can never auto-approve.
3. **Text-only proof** — capped at `PROOF_TEXT_ONLY_CONFIDENCE_CAP` (0.60). The creator's unbacked word never auto-approves.
4. **Tool failure** — if the vision model is down, the PDF has no text layer, or the LLM response was unparseable, confidence is clamped *into* the review band. An outage on our side must not read as either a pass or a fraud verdict.

### On-chain spend check

`cross_check_onchain_spend` measures value leaving the project between the last
verified milestone and now, across two addresses:

- **The creator's wallet** — where spending happens, since `settle()` sends the
  whole balance there.
- **The Campaign contract** — anything it paid to third parties.

The `settle()` payout itself (contract → creator), sends back into the campaign,
self-sends and reverted transactions are all excluded — that is money moving
*within* the project, not money spent.

Amounts on receipts are usually in fiat. Converting them to ETH would need a
price feed at the transaction date, so the flow does not guess: fiat amounts are
flagged (`proof_amounts_in_fiat_not_convertible`) and the on-chain comparison
uses the creator's stated `claimed_spend_eth`, falling back to an ETH amount read
off the proof itself.

### Tranche release

`Campaign.sol` has no per-milestone release function — `settle()` pays the
creator the entire balance in one transaction after the deadline, and milestones
are informational on-chain. So `release_tranche` **records** that the tranche is
cleared rather than moving funds:

```
milestones.status        = 'approved'
milestones.proof_status  = 'verified'
milestones.payout_status = 'ready_for_release'
milestone_proofs.verdict = 'auto_approved'
```

The hook for an actual on-chain call is marked with a `TODO` in
`graph/milestone_proof/nodes/outcomes.py`. When the contract gains something like
`releaseMilestone(index)`, call it there and set `payout_status` to `released`.

### Human-in-the-loop

Unlike Flow 2, this graph does not suspend. `queue_for_admin` writes the pending
state and ends; `POST /milestone-proof/resolve/{id}` applies an admin's decision
directly. Every node has already run and written its output, so there is nothing
left to re-run once a human has made the call.

### Example

```bash
# Submit proof
curl -X POST http://localhost:8001/milestone-proof/submit \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_address": "0xYourCampaignAddress",
    "milestone_index": 0,
    "submitted_by": "0xCreatorWallet",
    "proof_type": "link",
    "proof_url": "https://github.com/owner/repo/commit/abc123",
    "proof_text": "Shipped the auth rewrite promised in milestone 1.",
    "claimed_spend_eth": 0.25
  }'

# Poll the verdict
curl http://localhost:8001/milestone-proof/<proof_id>

# Admin queue
curl http://localhost:8001/milestone-proof/queue

# Admin decision
curl -X POST http://localhost:8001/milestone-proof/resolve/<proof_id> \
  -H "Content-Type: application/json" \
  -d '{"action": "approve", "review_notes": "Commit history checks out."}'
```

### Frontend touchpoints

- `src/components/ui/MilestoneProofModal.tsx` — creator submits proof and sees the verdict; mounted from `src/app/manage/[address]/page.tsx`.
- `src/components/ui/MilestoneProofQueue.tsx` — admin review queue; mounted in `src/app/admin/page.tsx`.
- Both read `NEXT_PUBLIC_AGENT_BACKEND_URL` via `src/lib/agent.ts`.
- `src/app/api/upload/route.ts` accepts `application/pdf` so PDF proofs can be uploaded.

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
