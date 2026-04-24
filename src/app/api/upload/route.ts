import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { BUCKETS } from '@/lib/supabase';

/**
 * POST /api/upload
 * Accepts a multipart/form-data file upload.
 * Body fields:
 *   - file: File (required)
 *   - bucket: 'campaign-images' | 'avatars' | 'campaign-updates' (optional, default: campaign-images)
 *   - folder: string — sub-path within the bucket (optional)
 *
 * Returns: { url: string }  — the accessible URL of the uploaded file
 */
export async function POST(req: NextRequest) {
  // Must be authenticated
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file     = formData.get('file') as File | null;
    const bucket   = (formData.get('bucket') as string) || BUCKETS.campaigns;
    const folder   = (formData.get('folder') as string) || session.user.id;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed. Use JPG, PNG, WebP or GIF.' }, { status: 400 });
    }

    // Validate file size (max 10 MB)
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });
    }

    // Build unique storage path: folder/timestamp-filename
    const timestamp = Date.now();
    const safeName  = file.name.replace(/[^a-z0-9.\-_]/gi, '_').slice(0, 80);
    const filePath  = `${folder}/${timestamp}-${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabaseAdmin
      .storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Try public URL first (works if bucket is set to public in Supabase dashboard).
    // Falls back to a 10-year signed URL for private buckets — no dashboard change needed.
    const { data: publicData } = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath);

    // Probe whether the public URL is actually accessible
    const probe = await fetch(publicData.publicUrl, { method: 'HEAD' }).catch(() => null);
    if (probe?.ok) {
      return NextResponse.json({ url: publicData.publicUrl, path: filePath });
    }

    // Bucket is private — fall back to a long-lived signed URL (10 years)
    const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
    const { data: signedData, error: signedError } = await supabaseAdmin
      .storage
      .from(bucket)
      .createSignedUrl(filePath, TEN_YEARS);

    if (signedError || !signedData?.signedUrl) {
      console.error('Signed URL error:', signedError);
      return NextResponse.json({ error: 'Failed to generate image URL' }, { status: 500 });
    }

    return NextResponse.json({ url: signedData.signedUrl, path: filePath });

  } catch (err) {
    console.error('Upload route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
