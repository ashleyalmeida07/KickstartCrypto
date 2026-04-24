/**
 * No-op stub for @metamask/sdk-analytics.
 *
 * The real package fires background fetch() calls to MetaMask's analytics
 * endpoint during dev, producing "Analytics SDK: TypeError: Failed to fetch"
 * console errors. This stub replaces the entire module with harmless no-ops
 * so the rest of @metamask/sdk still compiles without issue.
 *
 * NOTE: Turbopack requires named exports to be statically unambiguous.
 * Keep `analytics` (lowercase) as a named export — that is what the SDK imports.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noop = (..._args: any[]) => {};

export const analytics = {
  send: noop,
  track: noop,
  identify: noop,
  page: noop,
  reset: noop,
};

export class Analytics {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(_options?: any) {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(_event: any) {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  track(_event: any) {}
}

export default Analytics;
