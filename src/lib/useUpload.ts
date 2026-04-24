'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

interface UploadResult {
  url: string;
  path: string;
}

/**
 * useUpload — reusable hook to upload files to Supabase Storage via /api/upload
 *
 * Usage:
 *   const { upload, uploading, progress } = useUpload();
 *   const result = await upload(file, { bucket: 'campaign-images', folder: 'my-campaign' });
 *   // result.url → public CDN URL
 */
export function useUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);

  const upload = async (
    file: File,
    options?: { bucket?: string; folder?: string }
  ): Promise<UploadResult | null> => {
    setUploading(true);
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (options?.bucket) formData.append('bucket', options.bucket);
      if (options?.folder) formData.append('folder', options.folder);

      setProgress(40);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      setProgress(80);

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Upload failed');
      }

      const data: UploadResult = await res.json();
      setProgress(100);
      return data;
    } catch (err) {
      toast.error((err as Error).message || 'Upload failed');
      return null;
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  return { upload, uploading, progress };
}
