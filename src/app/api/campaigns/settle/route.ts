import { NextRequest, NextResponse } from 'next/server';
import { formatEther } from 'viem';
import { query, queryOne } from '@/lib/db';
import { sendCampaignFundedEmail, sendContributorRefundEmail } from '@/lib/email';

/**
 * POST /api/campaigns/settle
 * Called after the settle() tx confirms on-chain.
 * Updates campaign status in DB and sends payout email to creator.
 *
 * Body: { contractAddress, totalContributed, goalReached }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contractAddress, totalContributed, goalReached } = body;

    if (!contractAddress) {
      return NextResponse.json({ error: 'Missing contractAddress' }, { status: 400 });
    }

    const addr = contractAddress.toLowerCase();

    // ── 1. Update campaign status in DB ─────────────────────────────────────
    const newStatus = goalReached ? 'settled' : 'failed';
    await query(
      `UPDATE campaigns SET status = $1, updated_at = NOW() WHERE contract_address = $2`,
      [newStatus, addr],
    );

    // ── 2. Send email to creator (only if goal was reached = payout) ─────────
    if (goalReached) {
      try {
        const campaign = await queryOne<{
          title: string;
          creator_address: string;
          creator_email: string | null;
        }>(
          `SELECT title, creator_address, creator_email FROM campaigns WHERE contract_address = $1`,
          [addr],
        );

        if (campaign) {
          const creatorEmail = campaign.creator_email ?? null;

          if (creatorEmail) {
            const raisedEth = totalContributed
              ? Number(formatEther(BigInt(totalContributed))).toFixed(4)
              : '?';
            await sendCampaignFundedEmail(creatorEmail, campaign.title, contractAddress, raisedEth);
            console.log(`[settle] Funded email sent to ${creatorEmail}`);
          }
        }
      } catch (emailErr) {
        console.warn('[settle] Funded email send failed (non-fatal):', emailErr);
      }
    } else {
      // Goal NOT reached → refund all contributors
      try {
        const campaign = await queryOne<{ title: string }>(
          `SELECT title FROM campaigns WHERE contract_address = $1`, [addr],
        );
        if (campaign) {
          // Fetch all contributors who have an email
          const contributors = await query<{ email: string; amount_wei: string }>(
            `SELECT u.email, c.amount_wei
             FROM contributions c
             JOIN users u ON u.wallet_address = c.backer_address
             WHERE c.campaign_id = (SELECT id FROM campaigns WHERE contract_address = $1)
               AND u.email IS NOT NULL`,
            [addr],
          );
          for (const backer of contributors) {
            const refundEth = Number(formatEther(BigInt(backer.amount_wei))).toFixed(4);
            await sendContributorRefundEmail(backer.email, campaign.title, contractAddress, refundEth);
          }
          console.log(`[settle] Refund emails sent to ${contributors.length} contributors`);
        }
      } catch (emailErr) {
        console.warn('[settle] Refund emails failed (non-fatal):', emailErr);
      }
    }

    console.log(`[settle] Campaign ${addr} marked as ${newStatus}`);
    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error('[POST /api/campaigns/settle]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
