'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { createSiweMessage } from 'viem/siwe';
import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

export function useAuth() {
  const { data: session, status } = useSession();
  const { address, chain }        = useAccount();
  const { signMessageAsync }      = useSignMessage();
  const { disconnect }            = useDisconnect();
  const [loading, setLoading]     = useState(false);

  const isAuthenticated = status === 'authenticated';
  const isLoading       = status === 'loading' || loading;

  /**
   * Sign in with MetaMask using SIWE (Sign-In With Ethereum).
   * 1. Fetches nonce from /api/auth/nonce
   * 2. Builds SIWE message
   * 3. Prompts user to sign in MetaMask
   * 4. Verifies via next-auth credentials provider
   */
  const signInWithWallet = useCallback(async () => {
    if (!address) {
      toast.error('Connect your wallet first');
      return;
    }

    setLoading(true);
    try {
      // Step 1: get nonce
      const nonceRes = await fetch(`/api/auth/nonce?address=${address}`);
      if (!nonceRes.ok) throw new Error('Failed to fetch nonce');
      const { nonce } = await nonceRes.json();

      // Step 2: build SIWE message string
      const messageStr = createSiweMessage({
        domain:    window.location.host,
        address:   address as `0x${string}`,
        statement: 'Sign this message to log in to KickstartCrypto. This does not cost gas.',
        uri:       window.location.origin,
        version:   '1',
        chainId:   chain?.id ?? 11155111,
        nonce,
      });

      // Step 3: get signature from MetaMask
      const signature = await signMessageAsync({ message: messageStr });

      // Step 4: verify with NextAuth
      const result = await signIn('metamask', {
        message:    messageStr,
        signature,
        redirect:   false,
        callbackUrl: '/dashboard',
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      toast.success('Signed in with MetaMask!');
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Sign-in failed';
      if (!msg.includes('User rejected')) {
        toast.error(msg.slice(0, 80));
      }
    } finally {
      setLoading(false);
    }
  }, [address, chain, signMessageAsync]);

  /**
   * Sign in with Google OAuth.
   */
  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    try {
      await signIn('google', { callbackUrl: '/dashboard' });
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Sign out from both NextAuth and wagmi.
   */
  const logout = useCallback(async () => {
    await signOut({ redirect: false });
    disconnect();
    toast('Signed out');
  }, [disconnect]);

  return {
    session,
    isAuthenticated,
    isLoading,
    walletAddress: session?.user?.walletAddress ?? address,
    user:          session?.user,
    signInWithWallet,
    signInWithGoogle,
    logout,
  };
}
