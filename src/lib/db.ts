import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_K1GyJAWLo2Ob@ep-icy-term-am0wfqqn-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// Singleton pool — reuse across hot-reload in dev
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

if (!global._pgPool) {
  global._pgPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,                        // NeonDB serverless: keep low to avoid exhaustion
    idleTimeoutMillis: 10_000,     // release idle connections faster (serverless wakes cold)
    connectionTimeoutMillis: 10_000, // longer wait — Neon can take ~5s on cold start
    allowExitOnIdle: true,
  });

  // Surface pool-level errors without crashing the process
  global._pgPool.on('error', (err) => {
    console.error('[pg pool] Unexpected error:', err.message);
  });
}

export const pool = global._pgPool!;

/**
 * Execute a query with automatic retry on connection errors.
 * Neon serverless computes can time out on first connection after idle — a single
 * retry covers the "cold wake" case without adding meaningful latency.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
  retries = 1,
): Promise<T[]> {
  try {
    const client = await pool.connect();
    try {
      const res = await client.query(text, params);
      return res.rows as T[];
    } finally {
      client.release();
    }
  } catch (err) {
    const isConnectionErr =
      err instanceof Error &&
      (err.message.includes('Connection terminated') ||
       err.message.includes('connection timeout') ||
       err.message.includes('ECONNRESET') ||
       err.message.includes('ETIMEDOUT'));

    if (isConnectionErr && retries > 0) {
      console.warn('[db] Connection error — retrying once:', (err as Error).message);
      // Brief pause lets Neon's pooler recover
      await new Promise(r => setTimeout(r, 500));
      return query<T>(text, params, retries - 1);
    }
    throw err;
  }
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
