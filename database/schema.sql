-- ============================================================
-- Kickstart Crypto — NeonDB PostgreSQL Schema
-- Run this in the Neon SQL Editor or via psql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────
-- 1. USERS
--    Supports both MetaMask (wallet) and Google OAuth logins
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address  TEXT        UNIQUE,                  -- MetaMask address (lowercase)
    email           TEXT        UNIQUE,                  -- Google OAuth email
    name            TEXT,
    avatar_url      TEXT,
    auth_provider   TEXT        NOT NULL DEFAULT 'wallet', -- 'wallet' | 'google' | 'both'
    nonce           TEXT,                                -- SIWE nonce (one-time)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_wallet   ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);

-- ─────────────────────────────────────────────────────────
-- 2. NEXT-AUTH SESSIONS (required by @auth/pg-adapter)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
    id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                 TEXT    NOT NULL,
    provider             TEXT    NOT NULL,
    provider_account_id  TEXT    NOT NULL,
    refresh_token        TEXT,
    access_token         TEXT,
    expires_at           BIGINT,
    token_type           TEXT,
    scope                TEXT,
    id_token             TEXT,
    session_state        TEXT,
    UNIQUE(provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sessions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token TEXT        UNIQUE NOT NULL,
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires       TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_tokens (
    identifier TEXT        NOT NULL,
    token      TEXT        NOT NULL,
    expires    TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (identifier, token)
);

-- ─────────────────────────────────────────────────────────
-- 3. CAMPAIGNS (off-chain metadata mirror)
--    The source of truth is on-chain; this table is a fast
--    index for search/filter without calling the blockchain.
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_address     TEXT        UNIQUE NOT NULL,    -- deployed Campaign address
    creator_id           UUID        REFERENCES users(id),
    creator_address      TEXT        NOT NULL,
    title                TEXT        NOT NULL,
    short_description    TEXT,
    description          TEXT,                           -- markdown body
    category             TEXT        NOT NULL DEFAULT 'Other',
    image_cid            TEXT,                           -- IPFS CID for thumbnail
    goal_wei             NUMERIC     NOT NULL,           -- in wei (use NUMERIC for big ints)
    deadline             TIMESTAMPTZ NOT NULL,
    total_contributed_wei NUMERIC    NOT NULL DEFAULT 0,
    backer_count         INTEGER     NOT NULL DEFAULT 0,
    goal_reached         BOOLEAN     NOT NULL DEFAULT FALSE,
    withdrawn            BOOLEAN     NOT NULL DEFAULT FALSE,
    cancelled            BOOLEAN     NOT NULL DEFAULT FALSE,
    metadata_cid         TEXT,                           -- IPFS CID for full metadata JSON
    platform_fee_bps     SMALLINT    NOT NULL DEFAULT 250,
    deploy_tx_hash       TEXT,
    status               TEXT        NOT NULL DEFAULT 'active', -- active|funded|ended|cancelled
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_creator   ON campaigns(creator_address);
CREATE INDEX IF NOT EXISTS idx_campaigns_category  ON campaigns(category);
CREATE INDEX IF NOT EXISTS idx_campaigns_status    ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_deadline  ON campaigns(deadline);

-- ─────────────────────────────────────────────────────────
-- 4. MILESTONES (off-chain mirror of on-chain milestones)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestones (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id       UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    milestone_index   INTEGER     NOT NULL,              -- index in the on-chain array
    title             TEXT        NOT NULL,
    description       TEXT,
    percentage        SMALLINT    NOT NULL,              -- % of total funds
    estimated_date    DATE,
    status            TEXT        NOT NULL DEFAULT 'pending', -- pending|voting|approved|completed|rejected
    votes_for_wei     NUMERIC     NOT NULL DEFAULT 0,
    votes_against_wei NUMERIC     NOT NULL DEFAULT 0,
    total_voters      INTEGER     NOT NULL DEFAULT 0,
    payout_released   BOOLEAN     NOT NULL DEFAULT FALSE,
    payout_tx_hash    TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(campaign_id, milestone_index)
);

CREATE INDEX IF NOT EXISTS idx_milestones_campaign ON milestones(campaign_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status   ON milestones(status);

-- ─────────────────────────────────────────────────────────
-- 5. CONTRIBUTIONS
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contributions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id      UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    backer_address   TEXT        NOT NULL,
    backer_user_id   UUID        REFERENCES users(id),
    amount_wei       NUMERIC     NOT NULL,
    tx_hash          TEXT        NOT NULL UNIQUE,
    block_number     BIGINT,
    refunded         BOOLEAN     NOT NULL DEFAULT FALSE,
    refund_tx_hash   TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contributions_campaign ON contributions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contributions_backer   ON contributions(backer_address);
CREATE INDEX IF NOT EXISTS idx_contributions_tx       ON contributions(tx_hash);

-- ─────────────────────────────────────────────────────────
-- 6. VOTES
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS votes (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id   UUID        NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    voter_address  TEXT        NOT NULL,
    voter_user_id  UUID        REFERENCES users(id),
    approve        BOOLEAN     NOT NULL,
    weight_wei     NUMERIC     NOT NULL,                 -- voter's contribution amount (vote weight)
    tx_hash        TEXT        NOT NULL UNIQUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(milestone_id, voter_address)                  -- one vote per milestone per address
);

CREATE INDEX IF NOT EXISTS idx_votes_milestone ON votes(milestone_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter     ON votes(voter_address);

-- ─────────────────────────────────────────────────────────
-- 7. CAMPAIGN UPDATES
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_updates (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title           TEXT        NOT NULL,
    body            TEXT,
    ipfs_cid        TEXT,                                -- IPFS CID of full update content
    on_chain_tx     TEXT,                                -- tx hash of UpdatePosted event
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_updates_campaign ON campaign_updates(campaign_id);

-- ─────────────────────────────────────────────────────────
-- 8. REWARD TIERS (stored off-chain only — not in contracts)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_tiers (
    id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id         UUID    NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    tier_index          INTEGER NOT NULL,
    name                TEXT    NOT NULL,
    min_contribution_wei NUMERIC NOT NULL,
    description         TEXT,
    UNIQUE(campaign_id, tier_index)
);

-- ─────────────────────────────────────────────────────────
-- 9. PLATFORM STATS (materialized for fast display)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_stats (
    id                  INTEGER PRIMARY KEY DEFAULT 1,  -- single row
    total_raised_wei    NUMERIC NOT NULL DEFAULT 0,
    active_campaigns    INTEGER NOT NULL DEFAULT 0,
    total_backers       INTEGER NOT NULL DEFAULT 0,
    success_rate        NUMERIC NOT NULL DEFAULT 0,
    last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO platform_stats (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- 10. HELPFUL VIEWS
-- ─────────────────────────────────────────────────────────

-- Campaign summary view (used by explore page)
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

-- ─────────────────────────────────────────────────────────
-- 11. TRIGGER: auto-update updated_at
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_campaigns_updated
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
