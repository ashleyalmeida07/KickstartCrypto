'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider, lightTheme, connectorsForWallets, AvatarComponent } from '@rainbow-me/rainbowkit';
import { injectedWallet, coinbaseWallet } from '@rainbow-me/rainbowkit/wallets';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { config } from '@/lib/wagmi';
import { Toaster } from 'react-hot-toast';
import { useState, useEffect } from 'react';

// ── Known MetaMask / analytics hostnames to silently block ───────────────────
const BLOCKED_HOSTNAMES = new Set([
  'analytics-api.metafox.io',
  'metametrics.metamask.io',
  'analytics.metamask.io',
  'api.segment.io',
  'in.segment.com',
  'cdn-settings.segment.com',
  'analytics.segment.com',
  'events.segment.com',
  'api.mixpanel.com',
  'api2.amplitude.com',
]);

// Suffix patterns — catches all subdomains
const BLOCKED_SUFFIXES = [
  '.metafox.io',
  '.metamask.io',
  '.segment.io',
  '.segment.com',
];

function isAnalyticsUrl(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl);
    return (
      BLOCKED_HOSTNAMES.has(hostname) ||
      BLOCKED_SUFFIXES.some((sfx) => hostname.endsWith(sfx))
    );
  } catch {
    return false;
  }
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL)     return input.href;
  return (input as Request).url;
}

const FAKE_OK = () =>
  new Response('{}', {
    status:  200,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * Three-layer suppression for MetaMask analytics network noise:
 *
 * 1. window.fetch patch   — intercept all fetch calls; block analytics URLs.
 * 2. navigator.sendBeacon — analytics sometimes uses beacon API instead.
 * 3. console.error filter — fallback for any path that bypasses fetch
 *                           (e.g. pre-bundled IIFE using its own fetch copy,
 *                            or a different SDK version).
 */
function installAnalyticsGuard() {
  if (typeof window === 'undefined') return;
  const win = window as Window & { __analyticsGuarded?: boolean };
  if (win.__analyticsGuarded) return;
  win.__analyticsGuarded = true;

  // ── 1. Patch window.fetch ───────────────────────────────────────────────
  const originalFetch = window.fetch.bind(window);
  window.fetch = function guardedFetch(input, init) {
    if (isAnalyticsUrl(resolveUrl(input))) return Promise.resolve(FAKE_OK());
    return originalFetch(input, init);
  };

  // ── 2. Patch navigator.sendBeacon ──────────────────────────────────────
  if (navigator.sendBeacon) {
    const originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function guardedBeacon(url, data) {
      if (isAnalyticsUrl(String(url))) return true; // pretend success
      return originalBeacon(url, data);
    };
  }

  // ── 3. Filter console.error for Analytics SDK messages ─────────────────
  // This is the guaranteed fallback: even if the SDK uses a bundled fetch copy
  // or a code path we can't intercept, the error never surfaces in the console.
  //
  // Also suppress next-auth CLIENT_FETCH_ERROR — these fire whenever the session
  // is polled on a page where the user is not signed in (non-fatal, expected).
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const first = String(args[0] ?? '');
    if (
      first.includes('Analytics SDK')          ||
      first.includes('AnalyticsSDKApi')         ||
      first.includes('metafox.io')              ||
      first.includes('MetaMask analytics')      ||
      // next-auth: non-fatal session-fetch noise on unauthenticated pages
      first.includes('CLIENT_FETCH_ERROR')      ||
      first.includes('client_fetch_error')      ||
      first.includes('[next-auth]')             ||
      // next.js / turbopack / wallet extension COOP check noise
      first.includes('Cross-Origin-Opener-Policy')
    ) {
      return;
    }
    originalError(...args);
  };
}

// Install immediately at module evaluation — before any SDK code executes
installAnalyticsGuard();

// ── Wallet connectors ─────────────────────────────────────────────────────────
const walletList = connectorsForWallets(
  [{ groupName: 'Your Wallets', wallets: [injectedWallet, coinbaseWallet] }],
  {
    appName:   'Kickstart Crypto',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'none',
  }
);

// ── Custom Avatar ─────────────────────────────────────────────────────────────
const CustomAvatar: AvatarComponent = ({ address, ensImage, size }) => {
  return ensImage ? (
    <img
      src={ensImage}
      alt="ENS Avatar"
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
    />
  ) : (
    <div
      style={{
        backgroundColor: '#09090b',
        color: '#ffffff',
        borderRadius: '50%',
        height: size,
        width: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.45),
        fontWeight: 700,
        fontFamily: 'var(--font-space-grotesk)',
      }}
    >
      {address.slice(2, 4).toUpperCase()}
    </div>
  );
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));

  // Re-run after hydration — covers SDKs that initialise lazily
  useEffect(() => { installAnalyticsGuard(); }, []);

  return (
    <SessionProvider
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            avatar={CustomAvatar}
            theme={lightTheme({
              accentColor:           '#00C896',
              accentColorForeground: '#ffffff',
              borderRadius:          'small',
              fontStack:             'system',
            })}
            modalSize="compact"
          >
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background:   '#ffffff',
                  color:        '#09090B',
                  border:       '1px solid #E4E4E7',
                  borderRadius: '4px',
                  fontSize:     '13px',
                  fontFamily:   'var(--font-inter)',
                  boxShadow:    '0 4px 16px rgba(0,0,0,0.08)',
                },
                success: { iconTheme: { primary: '#00C896', secondary: '#ffffff' } },
                error:   { iconTheme: { primary: '#DC2626', secondary: '#ffffff' } },
              }}
            />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </SessionProvider>
  );
}
