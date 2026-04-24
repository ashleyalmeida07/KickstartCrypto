-- Migration: Add suspended field to campaigns
-- Run in Neon SQL Editor

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS suspended       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_campaigns_suspended ON campaigns(suspended);

-- Update campaign_summary view to expose suspended flag
CREATE OR REPLACE VIEW campaign_summary AS
SELECT
    c.id,
    c.contract_address,
    c.title,
    c.short_description,
    c.category,
    c.image_cid,
    c.goal_wei,
    c.total_contributed_wei,
    c.backer_count,
    c.goal_reached,
    c.deadline,
    c.status,
    c.suspended,
    c.suspended_reason,
    c.creator_address,
    u.name  AS creator_name,
    u.avatar_url AS creator_avatar,
    CASE WHEN c.goal_wei > 0
         THEN ROUND((c.total_contributed_wei / c.goal_wei) * 100, 2)
         ELSE 0
    END AS funded_percent,
    c.created_at
FROM campaigns c
LEFT JOIN users u ON u.wallet_address = LOWER(c.creator_address)
ORDER BY c.created_at DESC;
