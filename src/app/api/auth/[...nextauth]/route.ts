import NextAuth, { AuthOptions, Session, User } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { JWT } from 'next-auth/jwt';
import { parseSiweMessage } from 'viem/siwe';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { query, queryOne } from '@/lib/db';
import { sendWelcomeEmail } from '@/lib/email';

// Extend next-auth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      walletAddress?: string | null;
      authProvider?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    walletAddress?: string;
    authProvider?: string;
  }
}

export const authOptions: AuthOptions = {
  providers: [
    // ─────────────────────────────────────────────────────────────────
    //  1. GOOGLE OAUTH
    // ─────────────────────────────────────────────────────────────────
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // ─────────────────────────────────────────────────────────────────
    //  2. METAMASK / WALLET (SIWE — Sign-In With Ethereum)
    // ─────────────────────────────────────────────────────────────────
    CredentialsProvider({
      id:   'metamask',
      name: 'MetaMask',
      credentials: {
        message:   { label: 'SIWE Message', type: 'text' },
        signature: { label: 'Signature',    type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.message || !credentials?.signature) {
          throw new Error('Missing message or signature');
        }

        try {
          // Parse the SIWE message using viem
          const siweMessage = parseSiweMessage(credentials.message);

          if (!siweMessage.address) {
            throw new Error('Invalid SIWE message: missing address');
          }

          const address = siweMessage.address.toLowerCase();

          // Verify nonce matches what we issued
          const storedNonce = await queryOne<{ nonce: string }>(
            'SELECT nonce FROM users WHERE wallet_address = $1',
            [address]
          );

          if (!storedNonce || storedNonce.nonce !== siweMessage.nonce) {
            throw new Error('Invalid or expired nonce');
          }

          // Verify the signature using viem public client
          // Uses Alchemy RPC for speed & reliability (falls back to public RPC in dev)
          const publicClient = createPublicClient({
            chain: sepolia,
            transport: http(process.env.ALCHEMY_SEPOLIA_URL),
          });

          const valid = await publicClient.verifyMessage({
            address:   siweMessage.address as `0x${string}`,
            message:   credentials.message,
            signature: credentials.signature as `0x${string}`,
          });

          if (!valid) {
            throw new Error('Invalid SIWE signature');
          }

          // Upsert user — clear nonce after successful auth
          const user = await queryOne<{
            id: string; name: string; avatar_url: string; email: string;
          }>(
            `INSERT INTO users (wallet_address, auth_provider, nonce)
             VALUES ($1, 'wallet', NULL)
             ON CONFLICT (wallet_address)
             DO UPDATE SET nonce = NULL, updated_at = NOW()
             RETURNING id, name, avatar_url, email`,
            [address]
          );

          if (!user) throw new Error('Failed to upsert user');

          return {
            id:            user.id,
            name:          user.name || `${address.slice(0, 6)}…${address.slice(-4)}`,
            email:         user.email,
            image:         user.avatar_url,
            walletAddress: address,
          } as User & { walletAddress: string };
        } catch (err) {
          console.error('SIWE authorize error:', err);
          throw new Error((err as Error).message || 'Authentication failed');
        }
      },
    }),
  ],

  // Use JWT strategy (no DB adapter needed for sessions)
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },

  callbacks: {
    // ─────────────────────────────────────────────────────────────────
    //  JWT: attach extra fields on sign-in
    // ─────────────────────────────────────────────────────────────────
    async jwt({ token, user, account }) {
      if (user) {
        token.userId = user.id;
        token.authProvider = account?.provider ?? 'metamask';

        const extUser = user as typeof user & { walletAddress?: string };
        if (extUser.walletAddress) {
          token.walletAddress = extUser.walletAddress;
        }
      }

      // For Google sign-in: upsert into our users table
      if (account?.provider === 'google' && user?.email) {
        try {
          const dbUser = await queryOne<{ id: string; created_at: string }>(
            `INSERT INTO users (email, name, avatar_url, auth_provider)
             VALUES ($1, $2, $3, 'google')
             ON CONFLICT (email)
             DO UPDATE SET name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url,
                           updated_at = NOW()
             RETURNING id,
               (xmax = 0) AS is_new_user,
               created_at`,
            [user.email, user.name, user.image]
          );
          if (dbUser) {
            token.userId = dbUser.id;
            // xmax = 0 means INSERT (new row) — send welcome email
            const isNew = (dbUser as unknown as { is_new_user: boolean }).is_new_user;
            if (isNew && user.email) {
              sendWelcomeEmail(user.email, user.name ?? '');
            }
          }
        } catch (e) {
          console.error('Google upsert error:', e);
        }
      }

      return token;
    },

    // ─────────────────────────────────────────────────────────────────
    //  Session: expose userId, walletAddress in the session object
    // ─────────────────────────────────────────────────────────────────
    async session({ session, token }: { session: Session; token: JWT }) {
      if (token) {
        session.user.id            = token.userId   as string;
        session.user.walletAddress = token.walletAddress as string | undefined;
        session.user.authProvider  = token.authProvider as string | undefined;
      }
      return session;
    },
  },

  pages: {
    signIn: '/auth/login',
    error:  '/auth/login',
  },

  secret: process.env.NEXTAUTH_SECRET || 'kickstart-crypto-dev-secret-change-in-production',
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
