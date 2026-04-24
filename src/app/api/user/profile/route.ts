import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { query, queryOne } from '@/lib/db';

/**
 * GET /api/user/profile
 * Returns the authenticated user's profile from the DB.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const user = await queryOne<{
      id: string; name: string; email: string; avatar_url: string;
      wallet_address: string; bio: string; auth_provider: string; created_at: string;
    }>(
      `SELECT id, name, email, avatar_url, wallet_address, bio, auth_provider, created_at
       FROM users WHERE id = $1`,
      [session.user.id]
    );

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json(user);
  } catch (err) {
    console.error('Profile GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/user/profile
 * Updates the authenticated user's profile.
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, bio } = body;

    if (name && (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 80)) {
      return NextResponse.json({ error: 'Name must be 1–80 characters' }, { status: 400 });
    }

    const updated = await queryOne<{ id: string; name: string; bio: string }>(
      `UPDATE users
       SET name = COALESCE($1, name),
           bio  = COALESCE($2, bio),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, bio`,
      [name?.trim() ?? null, bio?.trim() ?? null, session.user.id]
    );

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Profile PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
