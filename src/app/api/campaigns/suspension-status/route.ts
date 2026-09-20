import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/campaigns/suspension-status?addresses=0x1,0x2,...
 * Returns suspension status + DB metadata (incl. vetting) for a batch of contract addresses.
 * Used by useCampaigns to hydrate titles/images/risk scores without an on-chain metadataCid.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('addresses') ?? '';
  const addresses = raw
    .split(',')
    .map(a => a.trim().toLowerCase())
    .filter(a => a.startsWith('0x'));

  if (addresses.length === 0) return NextResponse.json([]);

  const placeholders = addresses.map((_, i) => `$${i + 1}`).join(',');
  const rows = await query<{
    contract_address:  string;
    suspended:         boolean;
    suspended_reason:  string | null;
    title:             string | null;
    short_description: string | null;
    category:          string | null;
    image_cid:         string | null;
    vetting_status:    string | null;
    vetting_score:     number | null;
    creator_name:      string | null;
    created_at:        string;
  }>(
    `SELECT c.contract_address, c.suspended, c.suspended_reason,
            c.title, c.short_description, c.category, c.image_cid,
            c.vetting_status, c.vetting_score,
            u.name AS creator_name, c.created_at
     FROM campaigns c
     LEFT JOIN users u ON c.creator_id = u.id
     WHERE c.contract_address IN (${placeholders})`,
    addresses,
  );

  return NextResponse.json(rows, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
  });
}
