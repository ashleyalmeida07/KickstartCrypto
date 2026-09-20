import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { query } from '@/lib/db';

const ADMIN_ADDRESSES = (process.env.ADMIN_WALLET_ADDRESSES ?? '')
  .split(',').map(a => a.trim().toLowerCase()).filter(Boolean);

function isAdmin(session: { user?: { walletAddress?: string; email?: string } } | null): boolean {
  if (!session?.user) return false;
  const wallet = session.user.walletAddress?.toLowerCase();
  if (wallet && ADMIN_ADDRESSES.includes(wallet)) return true;
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase());
  return !!(session.user.email && adminEmails.includes(session.user.email.toLowerCase()));
}

/**
 * GET /api/admin/backers?campaign=0x…
 * Returns all backers for a specific campaign (admin only).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session as Parameters<typeof isAdmin>[0])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const campaignAddress = req.nextUrl.searchParams.get('campaign');
  if (!campaignAddress) {
    return NextResponse.json({ error: 'campaign param required' }, { status: 400 });
  }

  try {
    const contributions = await query<{
      backer_address: string;
      amount_wei:     string;
      tx_hash:        string;
      refunded:       boolean;
      created_at:     string;
      user_name:      string | null;
      user_email:     string | null;
    }>(
      `SELECT
         con.backer_address,
         con.amount_wei,
         con.tx_hash,
         con.refunded,
         con.created_at,
         u.name  AS user_name,
         u.email AS user_email
       FROM contributions con
       JOIN campaigns cam ON cam.id = con.campaign_id
       LEFT JOIN users u ON u.wallet_address = con.backer_address
       WHERE LOWER(cam.contract_address) = LOWER($1)
       ORDER BY con.amount_wei::numeric DESC`,
      [campaignAddress],
    );

    return NextResponse.json({ contributions });
  } catch (err) {
    console.error('[GET /api/admin/backers]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
