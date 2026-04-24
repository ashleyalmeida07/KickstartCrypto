import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { sepolia } from 'viem/chains';
import { query, queryOne } from '@/lib/db';
import { parseEther } from 'viem';
import { sendCampaignCreatedEmail } from '@/lib/email';

/**
 * POST /api/campaigns/register
 * Called after createCampaign tx confirms on-chain.
 * Reads the CampaignCreated event log to find the deployed contract address,
 * then saves campaign + milestones + reward tiers to NeonDB.
 *
 * Body: { txHash, creatorAddress, title, description, category, imageUrl,
 *         goalEth, durationDays, milestones, rewardTiers }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      txHash, creatorAddress, creatorEmail, title, description,
      category, imageUrl, goalEth, durationDays, milestones, rewardTiers,
    } = body;

    if (!txHash || !creatorAddress || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ── 1. Resolve contract address from tx receipt on Sepolia ──────────────
    const client = createPublicClient({
      chain:     sepolia,
      transport: http(process.env.ALCHEMY_SEPOLIA_URL || process.env.NEXT_PUBLIC_ALCHEMY_SEPOLIA_URL),
    });

    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

    // CampaignCreated event: event CampaignCreated(address indexed campaignAddress, ...)
    const CAMPAIGN_CREATED_TOPIC =
      '0x' + Buffer.from(
        // keccak256("CampaignCreated(address,address,uint256,uint256,string)")
        require('crypto').createHash('sha256')
          .update('CampaignCreated(address,address,uint256,uint256,string)')
          .digest('hex')
      ).toString('hex');

    // Safer: just use the first address-type topic in the logs from our factory
    const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '').toLowerCase();

    let contractAddress: string | null = null;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === FACTORY_ADDRESS && log.topics.length >= 2) {
        // First indexed param is campaignAddress — padded to 32 bytes
        const rawAddr = log.topics[1];
        if (rawAddr) {
          contractAddress = '0x' + rawAddr.slice(26); // last 20 bytes
          break;
        }
      }
    }

    // Fallback: receipt.contractAddress (if factory returned it)
    if (!contractAddress && receipt.contractAddress) {
      contractAddress = receipt.contractAddress;
    }

    if (!contractAddress) {
      return NextResponse.json(
        { error: 'Could not extract campaign address from tx receipt' },
        { status: 422 },
      );
    }

    contractAddress = contractAddress.toLowerCase();

    // ── 2. Upsert user ──────────────────────────────────────────────────────
    await query(
      `INSERT INTO users (wallet_address, auth_provider)
       VALUES ($1,'wallet') ON CONFLICT (wallet_address) DO NOTHING`,
      [creatorAddress.toLowerCase()],
    );
    const user = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE wallet_address = $1`,
      [creatorAddress.toLowerCase()],
    );

    // ── 3. Insert campaign (idempotent) ─────────────────────────────────────
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM campaigns WHERE contract_address = $1`,
      [contractAddress],
    );
    if (existing) {
      return NextResponse.json({ id: existing.id, contractAddress, message: 'already_exists' });
    }

    const goalWei    = parseEther(String(goalEth)).toString();
    const deadlineTs = new Date(Date.now() + Number(durationDays) * 86400 * 1000).toISOString();
    // Use email passed from session, or fall back to wallet DB lookup
    let resolvedEmail: string | null = creatorEmail ?? null;
    if (!resolvedEmail) {
      const wu = await queryOne<{ email: string | null }>(
        `SELECT email FROM users WHERE wallet_address = $1`,
        [creatorAddress.toLowerCase()],
      );
      resolvedEmail = wu?.email ?? null;
    }

    const [campaign] = await query<{ id: string }>(
      `INSERT INTO campaigns
         (contract_address, creator_id, creator_address, creator_email, title,
          short_description, category, image_cid, goal_wei,
          deadline, deploy_tx_hash, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active')
       RETURNING id`,
      [
        contractAddress,
        user?.id ?? null,
        creatorAddress.toLowerCase(),
        resolvedEmail,
        title,
        description ?? '',
        category ?? 'Other',
        imageUrl ?? '',
        goalWei,
        deadlineTs,
        txHash,
      ],
    );
    const campaignId = campaign.id;

    // ── 4. Insert milestones ────────────────────────────────────────────────
    if (Array.isArray(milestones)) {
      for (let i = 0; i < milestones.length; i++) {
        const m = milestones[i];
        await query(
          `INSERT INTO milestones
             (campaign_id, milestone_index, title, description, percentage, estimated_date)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (campaign_id, milestone_index) DO NOTHING`,
          [campaignId, i, m.title ?? '', m.description ?? '', m.percentage ?? 0, m.estimatedDate || null],
        );
      }
    }

    // ── 5. Insert reward tiers ──────────────────────────────────────────────
    if (Array.isArray(rewardTiers)) {
      for (let i = 0; i < rewardTiers.length; i++) {
        const t = rewardTiers[i];
        if (!t.name) continue;
        const minWei = t.minContribution
          ? parseEther(String(t.minContribution)).toString()
          : '0';
        await query(
          `INSERT INTO reward_tiers
             (campaign_id, tier_index, name, min_contribution_wei, description)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (campaign_id, tier_index) DO NOTHING`,
          [campaignId, i, t.name, minWei, t.description ?? ''],
        );
      }
    }

    console.log(`[register] Campaign ${contractAddress} saved to DB (id=${campaignId})`);

    // ── 6. Send confirmation email to creator ───────────────────────────────
    try {
      // Priority: 1. Email passed from frontend session, 2. wallet DB lookup
      let emailTo: string | null = creatorEmail ?? null;

      if (!emailTo) {
        const walletUser = await queryOne<{ email: string | null }>(
          `SELECT email FROM users WHERE wallet_address = $1`,
          [creatorAddress.toLowerCase()],
        );
        emailTo = walletUser?.email ?? null;
      }

      if (emailTo) {
        await sendCampaignCreatedEmail(emailTo, title, contractAddress, String(goalEth));
        console.log(`[register] Campaign created email sent to ${emailTo}`);
      } else {
        console.warn('[register] No email found for creator — skipping email');
      }
    } catch (emailErr) {
      console.warn('[register] Email send failed (non-fatal):', emailErr);
    }

    return NextResponse.json({ id: campaignId, contractAddress, message: 'created' }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/campaigns/register]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
