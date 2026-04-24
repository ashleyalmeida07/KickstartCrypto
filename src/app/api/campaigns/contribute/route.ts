import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

/**
 * POST /api/campaigns/contribute
 * Called after contribution tx confirms on-chain.
 * Body: { contractAddress, backerAddress, amountWei, txHash, blockNumber? }
 */
export async function POST(req: NextRequest) {
  try {
    const { contractAddress, backerAddress, amountWei, txHash, blockNumber } = await req.json();

    if (!contractAddress || !backerAddress || !amountWei || !txHash) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Ensure backer exists in users table
    await query(
      `INSERT INTO users (wallet_address, auth_provider)
       VALUES ($1, 'wallet')
       ON CONFLICT (wallet_address) DO NOTHING`,
      [backerAddress.toLowerCase()],
    );

    const user = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE wallet_address = $1`,
      [backerAddress.toLowerCase()],
    );

    // Get campaign row
    const campaign = await queryOne<{ id: string; backer_count: number; total_contributed_wei: string; goal_wei: string }>(
      `SELECT id, backer_count, total_contributed_wei, goal_wei
       FROM campaigns WHERE contract_address = $1`,
      [contractAddress.toLowerCase()],
    );

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found in DB' }, { status: 404 });
    }

    // Insert contribution (ignore duplicate tx_hash)
    const isNew = await queryOne<{ id: string }>(
      `INSERT INTO contributions
         (campaign_id, backer_address, backer_user_id, amount_wei, tx_hash, block_number)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tx_hash) DO NOTHING
       RETURNING id`,
      [
        campaign.id,
        backerAddress.toLowerCase(),
        user?.id ?? null,
        amountWei,
        txHash,
        blockNumber ?? null,
      ],
    );

    if (!isNew) {
      return NextResponse.json({ message: 'duplicate' }, { status: 200 });
    }

    // Update campaign totals
    const newTotal = BigInt(campaign.total_contributed_wei ?? '0') + BigInt(amountWei);
    const goalWei  = BigInt(campaign.goal_wei ?? '0');
    const goalReached = newTotal >= goalWei;

    await query(
      `UPDATE campaigns SET
         total_contributed_wei = $1,
         backer_count          = backer_count + 1,
         goal_reached          = $2,
         status                = CASE WHEN $2 THEN 'funded' ELSE status END,
         updated_at            = NOW()
       WHERE id = $3`,
      [newTotal.toString(), goalReached, campaign.id],
    );

    return NextResponse.json({ message: 'recorded' }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/campaigns/contribute]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
