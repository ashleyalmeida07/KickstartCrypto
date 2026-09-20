-- ============================================================
-- Agent Backend Migration — Flow 3: Milestone Proof Verification
-- Run this in NeonDB SQL Editor (after schema.sql + agent_migration.sql)
-- ============================================================

-- ─────────────────────────────────────────────────────────
-- 1. MILESTONE PROOFS
--    One row per proof submission. The LangGraph flow writes
--    its node outputs here as it runs, so the admin dashboard
--    can show exactly why a verdict was reached.
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestone_proofs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ── What is being proven ──────────────────────────────
    campaign_id         UUID        REFERENCES campaigns(id)  ON DELETE CASCADE,
    campaign_address    TEXT        NOT NULL,
    milestone_id        UUID        REFERENCES milestones(id) ON DELETE CASCADE,
    milestone_index     INTEGER     NOT NULL,
    submitted_by        TEXT        NOT NULL,          -- creator wallet address

    -- ── What the creator submitted ────────────────────────
    proof_type          TEXT        NOT NULL,          -- image | pdf | link | text
    proof_url           TEXT,                          -- Supabase/IPFS URL, or the link itself
    proof_text          TEXT,                          -- creator's own explanation (always allowed)
    claimed_spend_wei   NUMERIC,                       -- what the creator says they spent

    -- ── Node 2: parse_proof ───────────────────────────────
    parsed_content      TEXT,                          -- OCR / extracted text
    ocr_confidence      NUMERIC,                       -- 0–1, how legible the proof was

    -- ── Node 3: cross_check_onchain_spend ─────────────────
    onchain_outflow_wei NUMERIC,                       -- actual outflow since last milestone
    onchain_tx_count    INTEGER,
    spend_match_score   NUMERIC,                       -- 0–1, claimed vs actual

    -- ── Node 4: consistency_check ─────────────────────────
    consistency_score   NUMERIC,                       -- 0–1, proof vs milestone description
    consistency_notes   TEXT,                          -- LLM's reasoning

    -- ── Node 5: confidence_scorer ─────────────────────────
    confidence          NUMERIC,                       -- 0–1 composite
    reasons             TEXT,                          -- JSON array of flag strings

    -- ── Node 6/7: router + notify ─────────────────────────
    status              TEXT        NOT NULL DEFAULT 'pending',
    -- pending | running | auto_approved | pending_review | rejected | error
    verdict             TEXT,                          -- auto_approved | needs_review | rejected
    routing_decision    TEXT,                          -- release_tranche | queue_for_admin | flag_mismatch
    tranche_wei         NUMERIC,                       -- value of the tranche this proof unlocks

    -- ── Human-in-the-loop (admin queue resolution) ────────
    reviewed_by         TEXT,
    review_notes        TEXT,
    reviewed_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at         TIMESTAMPTZ                    -- when the graph finished
);

CREATE INDEX IF NOT EXISTS idx_proofs_campaign  ON milestone_proofs(campaign_address);
CREATE INDEX IF NOT EXISTS idx_proofs_status    ON milestone_proofs(status);
CREATE INDEX IF NOT EXISTS idx_proofs_milestone ON milestone_proofs(milestone_id);
CREATE INDEX IF NOT EXISTS idx_proofs_created   ON milestone_proofs(created_at DESC);

-- ─────────────────────────────────────────────────────────
-- 2. MILESTONE COLUMNS
--    payout_status tracks tranche readiness separately from
--    the existing payout_released boolean, which stays as the
--    record of an actual on-chain payout.
-- ─────────────────────────────────────────────────────────
ALTER TABLE milestones
    ADD COLUMN IF NOT EXISTS payout_status    TEXT DEFAULT 'locked',
    ADD COLUMN IF NOT EXISTS proof_status     TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_milestones_payout_status ON milestones(payout_status);

-- ── Value reference ──────────────────────────────────────
--
-- milestone_proofs.status
--   pending         → row created, graph not started
--   running         → LangGraph flow executing
--   auto_approved   → confidence ≥ PROOF_AUTO_APPROVE_THRESHOLD
--   pending_review  → ambiguous, sitting in the admin queue
--   approved        → an admin cleared it out of the queue
--   rejected        → confidence ≤ PROOF_REJECT_THRESHOLD, or admin rejected
--   error           → graph hit an unrecoverable error
--
-- milestone_proofs.verdict
--   auto_approved | needs_review | admin_approved | rejected
--
-- milestones.payout_status
--   locked            → default; nothing unlocked
--   ready_for_release → proof verified, tranche cleared for payout
--   released          → tranche actually paid out on-chain
--   withheld          → proof rejected, tranche explicitly blocked
--
-- milestones.proof_status
--   none | submitted | verified | needs_review | rejected
