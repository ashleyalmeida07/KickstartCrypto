import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { parseEther } from 'viem';
import { sendCampaignCreatedEmail } from '@/lib/email';

/**
 * POST /api/campaigns
 * Called right after the on-chain tx confirms.
 * Body: { contractAddress, creatorAddress, txHash, title, description,
 *         category, imageUrl, goalEth, durationDays, milestones, rewardTiers }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      contractAddress,
      creatorAddress,
      txHash,
      title,
      description,
      category,
      imageUrl,
      goalEth,
      durationDays,
      milestones,   // { title, description, percentage, estimatedDate }[]
      rewardTiers,  // { name, minContribution, description }[]
    } = body;

    if (!contractAddress || !creatorAddress || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const goalWei    = parseEther(String(goalEth)).toString();
    const deadlineTs = new Date(Date.now() + durationDays * 86400 * 1000).toISOString();

    // 1. Upsert creator user row (wallet-only — no email)
    await query(
      `INSERT INTO users (wallet_address, auth_provider)
       VALUES ($1, 'wallet')
       ON CONFLICT (wallet_address) DO NOTHING`,
      [creatorAddress.toLowerCase()],
    );

    const user = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE wallet_address = $1`,
      [creatorAddress.toLowerCase()],
    );

    // 2. Insert campaign row
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM campaigns WHERE contract_address = $1`,
      [contractAddress.toLowerCase()],
    );
    if (existing) {
      return NextResponse.json({ id: existing.id, message: 'already_exists' }, { status: 200 });
    }

    const [campaign] = await query<{ id: string }>(
      `INSERT INTO campaigns
         (contract_address, creator_id, creator_address, title,
          short_description, category, image_cid, goal_wei, deadline,
          deploy_tx_hash, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active')
       RETURNING id`,
      [
        contractAddress.toLowerCase(),
        user?.id ?? null,
        creatorAddress.toLowerCase(),
        title,
        description ?? '',
        category ?? 'Other',
        imageUrl ?? '',
        goalWei,
        deadlineTs,
        txHash ?? null,
      ],
    );

    const campaignId = campaign.id;

    // 3. Insert milestones
    if (Array.isArray(milestones)) {
      for (let i = 0; i < milestones.length; i++) {
        const m = milestones[i];
        await query(
          `INSERT INTO milestones
             (campaign_id, milestone_index, title, description, percentage, estimated_date)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (campaign_id, milestone_index) DO NOTHING`,
          [
            campaignId, i,
            m.title ?? '',
            m.description ?? '',
            m.percentage ?? 0,
            m.estimatedDate || null,
          ],
        );
      }
    }

    // 4. Insert reward tiers (off-chain only)
    if (Array.isArray(rewardTiers)) {
      for (let i = 0; i < rewardTiers.length; i++) {
        const t = rewardTiers[i];
        if (!t.name) continue;
        const minWei = t.minContribution ? parseEther(String(t.minContribution)).toString() : '0';
        await query(
          `INSERT INTO reward_tiers
             (campaign_id, tier_index, name, min_contribution_wei, description)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (campaign_id, tier_index) DO NOTHING`,
          [campaignId, i, t.name, minWei, t.description ?? ''],
        );
      }
    }

    // 5. Send campaign created email (fire-and-forget, never blocks)
    const creator = await queryOne<{ email: string; name: string }>(
      `SELECT email, name FROM users WHERE id = $1`,
      [user?.id ?? null],
    );
    if (creator?.email) {
      sendCampaignCreatedEmail(
        creator.email,
        title,
        contractAddress,
        String(goalEth),
      );
    }

    return NextResponse.json({ id: campaignId, message: 'created' }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/campaigns]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * GET /api/campaigns?address=0x…
 * Returns a single campaign with milestones from DB.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address');
  if (!address) {
    return NextResponse.json({ error: 'address param required' }, { status: 400 });
  }
  const campaign = await queryOne(
    `SELECT c.*, u.name AS creator_name, u.avatar_url AS creator_avatar
     FROM campaigns c
     LEFT JOIN users u ON u.id = c.creator_id
     WHERE c.contract_address = $1`,
    [address.toLowerCase()],
  );
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const milestones = await query(
    `SELECT * FROM milestones WHERE campaign_id = $1 ORDER BY milestone_index`,
    [(campaign as { id: string }).id],
  );
  const rewardTiers = await query(
    `SELECT * FROM reward_tiers WHERE campaign_id = $1 ORDER BY tier_index`,
    [(campaign as { id: string }).id],
  );
  return NextResponse.json({ ...campaign, milestones, rewardTiers });
}
