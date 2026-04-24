import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

/**
 * POST /api/campaigns/vote
 * Records a milestone vote in the DB.
 * Body: { contractAddress, milestoneIndex, voterAddress, approve, weightWei, txHash }
 */
export async function POST(req: NextRequest) {
  try {
    const { contractAddress, milestoneIndex, voterAddress, approve, weightWei, txHash } =
      await req.json();

    if (!contractAddress || milestoneIndex === undefined || !voterAddress || !txHash) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const campaign = await queryOne<{ id: string }>(
      `SELECT id FROM campaigns WHERE contract_address = $1`,
      [contractAddress.toLowerCase()],
    );
    if (!campaign) return NextResponse.json({ error: 'Campaign not in DB' }, { status: 404 });

    const milestone = await queryOne<{ id: string; votes_for_wei: string; votes_against_wei: string; total_voters: number }>(
      `SELECT id, votes_for_wei, votes_against_wei, total_voters
       FROM milestones WHERE campaign_id = $1 AND milestone_index = $2`,
      [campaign.id, milestoneIndex],
    );
    if (!milestone) return NextResponse.json({ error: 'Milestone not in DB' }, { status: 404 });

    // Upsert voter user
    await query(
      `INSERT INTO users (wallet_address, auth_provider) VALUES ($1,'wallet')
       ON CONFLICT (wallet_address) DO NOTHING`,
      [voterAddress.toLowerCase()],
    );
    const voter = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE wallet_address = $1`,
      [voterAddress.toLowerCase()],
    );

    // Insert vote (ignore duplicates)
    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO votes (milestone_id, voter_address, voter_user_id, approve, weight_wei, tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (milestone_id, voter_address) DO NOTHING
       RETURNING id`,
      [milestone.id, voterAddress.toLowerCase(), voter?.id ?? null, approve, weightWei ?? '0', txHash],
    );

    if (!inserted) return NextResponse.json({ message: 'duplicate' }, { status: 200 });

    // Update milestone vote tallies
    const weight = BigInt(weightWei ?? '0');
    const newFor     = approve ? BigInt(milestone.votes_for_wei) + weight     : BigInt(milestone.votes_for_wei);
    const newAgainst = approve ? BigInt(milestone.votes_against_wei) : BigInt(milestone.votes_against_wei) + weight;

    await query(
      `UPDATE milestones SET
         votes_for_wei     = $1,
         votes_against_wei = $2,
         total_voters      = total_voters + 1,
         status            = CASE
           WHEN $1 > (SELECT total_contributed_wei / 2 FROM campaigns WHERE id = campaign_id) THEN 'approved'
           WHEN $2 > (SELECT total_contributed_wei / 2 FROM campaigns WHERE id = campaign_id) THEN 'rejected'
           ELSE 'voting'
         END
       WHERE id = $3`,
      [newFor.toString(), newAgainst.toString(), milestone.id],
    );

    return NextResponse.json({ message: 'recorded' }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/campaigns/vote]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
