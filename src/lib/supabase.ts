import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Singleton guard — prevents "Multiple GoTrueClient instances" warning
// when Next.js hot-reloads cause this module to re-execute.
declare global {
  // eslint-disable-next-line no-var
  var __supabase: SupabaseClient | undefined;
}

/**
 * Browser client — uses anon key, respects RLS policies.
 * Safe for client-side use. For server-only admin access, use @/lib/supabase-admin.
 */
export const supabase: SupabaseClient =
  globalThis.__supabase ?? (globalThis.__supabase = createClient(url, key));

// ─── Storage bucket names ─────────────────────────────────────
export const BUCKETS = {
  campaigns: 'campaign-images',  // banner images, thumbnails
  avatars:   'avatars',           // user profile pictures
  updates:   'campaign-updates',  // milestone update media
} as const;

/**
 * Build the public CDN URL for a stored file.
 */
export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
