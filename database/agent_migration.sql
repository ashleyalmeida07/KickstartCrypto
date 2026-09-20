-- ============================================================
-- Agent Backend Migration — Campaign Vetting Columns
-- Run this in NeonDB SQL Editor (after schema.sql)
-- ============================================================

-- Add vetting columns to the campaigns table
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS vetting_status        TEXT         DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS vetting_score         NUMERIC,
    ADD COLUMN IF NOT EXISTS vetting_reasons       TEXT,        -- JSON array stored as text
    ADD COLUMN IF NOT EXISTS vetting_completed_at  TIMESTAMPTZ;

-- Index for admin dashboard queries filtering by vetting status
CREATE INDEX IF NOT EXISTS idx_campaigns_vetting_status ON campaigns(vetting_status);

-- ── Helpful comment ──────────────────────────────────────────
-- vetting_status values:
--   pending          → not yet submitted for vetting
--   running          → LangGraph graph currently executing
--   approved         → auto-approved (risk_score < 0.30)
--   flagged_for_review → sent to admin queue (0.30 ≤ score ≤ 0.65)
--   rejected         → auto-rejected (risk_score > 0.65)
--   error            → graph encountered an unrecoverable error
