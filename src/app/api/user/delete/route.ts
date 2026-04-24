import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { query } from '@/lib/db';

/**
 * DELETE /api/user/delete
 * Permanently deletes the authenticated user's account and associated DB data.
 * On-chain campaign contracts cannot be removed — they stay on the blockchain.
 */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const walletAddress = (session.user as { walletAddress?: string }).walletAddress?.toLowerCase();
  const email         = session.user.email?.toLowerCase();

  if (!walletAddress && !email) {
    return NextResponse.json({ error: 'No identifier found for user' }, { status: 400 });
  }

  try {
    // Find the user row
    const whereClause = walletAddress ? 'wallet_address = $1' : 'email = $1';
    const identifier  = walletAddress ?? email!;

    const rows = await query<{ id: string }>(
      `SELECT id FROM users WHERE ${whereClause}`,
      [identifier],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = rows[0].id;

    // Delete in FK-safe order using the correct column names from schema.sql:
    // contributions.backer_user_id, votes.voter_user_id
    // campaign_updates has no user FK — no action needed
    // campaigns.creator_id — orphan rather than delete (on-chain data stays)
    await query(`DELETE FROM contributions WHERE backer_user_id = $1`, [userId]);
    await query(`DELETE FROM votes         WHERE voter_user_id  = $1`, [userId]);
    await query(`UPDATE campaigns SET creator_id = NULL WHERE creator_id = $1`, [userId]);
    await query(`DELETE FROM users WHERE id = $1`, [userId]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/user/delete]', err);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
