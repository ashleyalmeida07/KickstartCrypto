/**
 * Format an ETH value (as a number) with smart precision —
 * shows enough decimals to always display a non-zero value.
 */
export function formatEthSmart(val: number, minDecimals = 3): string {
  if (val === 0) return '0';
  if (val >= 1)    return val.toFixed(minDecimals);
  if (val >= 0.001) return val.toFixed(4);
  if (val >= 0.0001) return val.toFixed(5);
  if (val >= 0.00001) return val.toFixed(6);
  // Very small values — use up to 8 decimal places
  return val.toFixed(8).replace(/\.?0+$/, '');
}

/**
 * Upload a File via the server-side /api/upload route.
 * Uses the Supabase admin key (bypasses RLS). Returns the public CDN URL.
 */
export async function uploadCampaignImage(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  body.append('bucket', 'campaign-images');
  body.append('folder', 'campaigns');

  const res = await fetch('/api/upload', { method: 'POST', body });
  if (!res.ok) {
    const json = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Image upload failed: ${json.error ?? res.statusText}`);
  }

  const { url } = await res.json();
  return url;
}
