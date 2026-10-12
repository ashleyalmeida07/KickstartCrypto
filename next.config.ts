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
      '@metamask/sdk-analytics': './src/lib/stubs/metamask-sdk-analytics.ts',
    },
  },

  // ── Webpack alias (production build + SSR) ────────────────────────────────
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@metamask/sdk-analytics': path.resolve(
        './src/lib/stubs/metamask-sdk-analytics.ts'
      ),
    };
    return config;
  },

  // ── Reverse Proxy for Agent Backend (Avoids Mixed Content on HTTPS) ───────
  async rewrites() {
    const backendUrl = (
      process.env.AGENT_BACKEND_URL ||
      process.env.NEXT_PUBLIC_AGENT_BACKEND_URL ||
      'http://localhost:8001'
    ).replace(/\/$/, '');

    return [
      {
        source: '/api/agent/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
