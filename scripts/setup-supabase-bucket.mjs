/**
 * Run this once to create the campaign-images bucket in Supabase Storage.
 * node scripts/setup-supabase-bucket.mjs
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = 'https://lbznbjjmlbgcluieupqw.supabase.co';
const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY env var before running.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const BUCKETS = ['campaign-images', 'avatars', 'campaign-updates'];

for (const bucket of BUCKETS) {
  const { data, error } = await supabase.storage.createBucket(bucket, {
    public: true,            // files are publicly readable without auth
    fileSizeLimit: 10485760, // 10 MB limit per file
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  });

  if (error && error.message.includes('already exists')) {
    console.log(`✅ Bucket "${bucket}" already exists — skipping.`);
  } else if (error) {
    console.error(`❌ Failed to create "${bucket}":`, error.message);
  } else {
    console.log(`✅ Created public bucket "${bucket}".`);
  }
}

console.log('\nDone! Public URL format:');
console.log(`  ${supabaseUrl}/storage/v1/object/public/campaign-images/<path>`);
