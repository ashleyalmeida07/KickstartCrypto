import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/campaigns/suspension-status?addresses=0x1,0x2,...
 * Returns suspension status + DB metadata for a batch of contract addresses.
 * Used by useCampaigns to hydrate titles/images without an on-chain metadataCid.
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
  }>(
    `SELECT contract_address, suspended, suspended_reason,
            title, short_description, category, image_cid
     FROM campaigns
     WHERE contract_address IN (${placeholders})`,
    addresses,
  );

  return NextResponse.json(rows, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
  });
}
