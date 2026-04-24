import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },

  // ── Turbopack alias (dev server) ──────────────────────────────────────────
  turbopack: {
    resolveAlias: {
      'siwe':                    './src/lib/stubs/siwe.ts',
      'ethers':                  './src/lib/stubs/ethers.ts',
      '@metamask/sdk-analytics': './src/lib/stubs/metamask-sdk-analytics.ts',
    },
  },

  // ── Webpack alias (production build + SSR) ────────────────────────────────
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      // Prevent the real analytics package from loading on either client or server
      '@metamask/sdk-analytics': path.resolve(
        './src/lib/stubs/metamask-sdk-analytics.ts'
      ),
    };
    return config;
  },
};

export default nextConfig;
