import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { generateSiweNonce } from 'viem/siwe';

/**
 * GET /api/auth/nonce?address=0x...
 * Issues a one-time SIWE nonce for the given wallet address.
 * Stores nonce in the users table (creates user row if needed).
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.toLowerCase();

  if (!address || !/^0x[0-9a-f]{40}$/i.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const nonce = generateSiweNonce();

  try {
    // Upsert user with nonce
    await query(
      `INSERT INTO users (wallet_address, auth_provider, nonce)
       VALUES ($1, 'wallet', $2)
       ON CONFLICT (wallet_address)
       DO UPDATE SET nonce = $2, updated_at = NOW()`,
      [address, nonce]
    );

    return NextResponse.json({ nonce }, { status: 200 });
  } catch (err) {
    console.error('Nonce generation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
