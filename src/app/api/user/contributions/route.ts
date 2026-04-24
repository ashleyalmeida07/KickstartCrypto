import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/user/contributions?address=0x…
 * Returns all contribution records for a wallet address,
 * joined with campaign metadata from NeonDB.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address');
  if (!address) {
    return NextResponse.json({ error: 'address param required' }, { status: 400 });
  }

  try {
    const rows = await query<{
      tx_hash:          string;
      amount_wei:       string;
      created_at:       string;
      campaign_id:      string;
      contract_address: string;
      title:            string;
      category:         string;
      image_cid:        string;
      status:           string;
      goal_wei:         string;
      total_contributed_wei: string;
      deadline:         string;
    }>(
      `SELECT
         con.tx_hash,
         con.amount_wei,
         con.created_at,
         cam.id              AS campaign_id,
         cam.contract_address,
         cam.title,
         cam.category,
         cam.image_cid,
         cam.status,
         cam.goal_wei,
         cam.total_contributed_wei,
         cam.deadline
       FROM contributions con
       JOIN campaigns cam ON cam.id = con.campaign_id
       WHERE con.backer_address = $1
       ORDER BY con.created_at DESC`,
      [address.toLowerCase()],
    );

    return NextResponse.json({ contributions: rows });
  } catch (err) {
    console.error('[GET /api/user/contributions]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
