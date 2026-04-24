import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { query, queryOne } from '@/lib/db';
import { sendCampaignSuspendedEmail } from '@/lib/email';

const ADMIN_ADDRESSES = (process.env.ADMIN_WALLET_ADDRESSES ?? '')
  .split(',')
  .map(a => a.trim().toLowerCase())
  .filter(Boolean);

function isAdmin(session: { user?: { walletAddress?: string; email?: string } } | null): boolean {
  if (!session?.user) return false;
  const wallet = session.user.walletAddress?.toLowerCase();
  if (wallet && ADMIN_ADDRESSES.includes(wallet)) return true;
  // Also check ADMIN_EMAIL env for Google-auth admins
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase());
  return !!(session.user.email && adminEmails.includes(session.user.email.toLowerCase()));
}

/**
 * GET /api/admin/campaigns — list all campaigns (including suspended)
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session as Parameters<typeof isAdmin>[0])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const page  = parseInt(searchParams.get('page') ?? '1', 10);
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const offset = (page - 1) * limit;

  const campaigns = await query(
    `SELECT c.id, c.contract_address, c.title, c.category, c.status,
            c.suspended, c.suspended_at, c.suspended_reason,
            c.creator_address, c.goal_wei, c.total_contributed_wei,
            c.backer_count, c.created_at,
            u.name AS creator_name
     FROM campaigns c
     LEFT JOIN users u ON u.id = c.creator_id
     ORDER BY c.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  const [{ count }] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM campaigns`,
    [],
  );

  return NextResponse.json({ campaigns, total: parseInt(count, 10), page, limit });
}

/**
 * PATCH /api/admin/campaigns — suspend or unsuspend a campaign
 * Body: { contractAddress: string; suspend: boolean; reason?: string }
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session as Parameters<typeof isAdmin>[0])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { contractAddress, suspend, reason } = await req.json();
  if (!contractAddress || typeof suspend !== 'boolean') {
    return NextResponse.json({ error: 'contractAddress and suspend (boolean) required' }, { status: 400 });
  }

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM campaigns WHERE contract_address = $1`,
    [contractAddress.toLowerCase()],
  );
  if (!existing) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  await query(
    `UPDATE campaigns
     SET suspended        = $1,
         suspended_at     = $2,
         suspended_reason = $3,
         updated_at       = NOW()
     WHERE contract_address = $4`,
    [
      suspend,
      suspend ? new Date().toISOString() : null,
      suspend ? (reason ?? 'Suspended by admin') : null,
      contractAddress.toLowerCase(),
    ],
  );

  // Send suspension email to creator (fire-and-forget)
  if (suspend) {
    const campaignRow = await queryOne<{ title: string; creator_id: string | null }>(
      `SELECT title, creator_id FROM campaigns WHERE contract_address = $1`,
      [contractAddress.toLowerCase()],
    );
    if (campaignRow?.creator_id) {
      const creator = await queryOne<{ email: string; name: string }>(
        `SELECT email, name FROM users WHERE id = $1`,
        [campaignRow.creator_id],
      );
      if (creator?.email) {
        sendCampaignSuspendedEmail(
          creator.email,
          campaignRow.title,
          contractAddress,
          reason ?? null,
        );
      }
    }
  }

  return NextResponse.json({ success: true, suspended: suspend });
}
