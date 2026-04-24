'use client';

import { Suspense, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Zap, ArrowRight, Shield, AlertCircle, Loader2, CheckCircle, UserPlus, LogIn, Wallet } from 'lucide-react';
import { useAccount, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAuth } from '@/lib/useAuth';

type AuthMode = 'choose' | 'wallet';
type PageMode = 'signin' | 'signup';

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const errorParam = searchParams.get('error');
  const modeParam = searchParams.get('mode');

  const { isAuthenticated, signInWithWallet, signInWithGoogle, isLoading } = useAuth();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { openConnectModal } = useConnectModal();

  const [pageMode, setPageMode] = useState<PageMode>(modeParam === 'signup' ? 'signup' : 'signin');
  const [mode, setMode] = useState<AuthMode>('choose');
  const [walletStep, setWalletStep] = useState<'connect' | 'sign' | 'done'>('connect');

  useEffect(() => {
    if (isAuthenticated) router.push(callbackUrl);
  }, [isAuthenticated, callbackUrl, router]);

  useEffect(() => {
    if (isConnected && mode === 'wallet') setWalletStep('sign');
  }, [isConnected, mode]);

  // Open RainbowKit modal — supports MetaMask, Phantom, Coinbase, WalletConnect, and any injected wallet
  const handleConnectAnyWallet = () => {
    setMode('wallet');
    if (openConnectModal) {
      openConnectModal();
    } else {
      // Fallback: connect first available connector (injected)
      const c = connectors[0] ?? injected();
      connect({ connector: c });
    }
  };

  const handleWalletSignIn = async () => {
    const redirectTo = pageMode === 'signup' ? '/settings' : callbackUrl;
    await signInWithWallet();
    setWalletStep('done');
    router.push(redirectTo);
  };

  const handleGoogleSignIn = async () => {
    await signInWithGoogle();
  };

  const isSignUp = pageMode === 'signup';

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/40 to-purple-50/30">
      {/* Soft orbs */}
      <div className="absolute top-[-15%] left-[-8%] w-[500px] h-[500px] bg-sky-200/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-8%] w-[400px] h-[400px] bg-purple-200/25 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
          {/* Top colour strip */}
          <div className="h-1 bg-gradient-to-r from-sky-500 via-cyan-400 to-purple-600" />

          {/* Sign In / Sign Up tab toggle */}
          <div className="flex border-b border-slate-100">
            <button
              onClick={() => { setPageMode('signin'); setMode('choose'); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-all ${!isSignUp
                  ? 'text-sky-600 border-b-2 border-sky-500 bg-sky-50/60'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
            <button
              onClick={() => { setPageMode('signup'); setMode('choose'); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-all ${isSignUp
                  ? 'text-purple-600 border-b-2 border-purple-500 bg-purple-50/60'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              <UserPlus className="w-4 h-4" />
              Sign Up
            </button>
          </div>

          <div className="px-8 pt-6 pb-8">
            {/* Heading */}
            <AnimatePresence mode="wait">
              <motion.div
                key={pageMode}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="mb-5"
              >
                <h1 className="text-xl font-black text-slate-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  {mode === 'wallet'
                    ? 'Connect Your Wallet'
                    : isSignUp
                      ? 'Create your account'
                      : 'Welcome back'}
                </h1>
                <p className="text-slate-500 text-sm mt-0.5">
                  {mode === 'wallet'
                    ? 'Verify your wallet to continue — no gas needed'
                    : isSignUp
                      ? 'Join KickstartCrypto and start funding the future'
                      : 'Choose how you want to sign in to KickstartCrypto'}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Error banner */}
            {errorParam && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm mb-5">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  {errorParam === 'OAuthSignin' && 'Google sign-in failed. Try again.'}
                  {errorParam === 'Callback' && 'Auth callback error. Try again.'}
                  {!['OAuthSignin', 'Callback'].includes(errorParam) && 'Authentication error. Please try again.'}
                </span>
              </div>
            )}

            <AnimatePresence mode="wait">
              {/* ── CHOOSE PROVIDER ── */}
              {mode === 'choose' && (
                <motion.div
                  key={`choose-${pageMode}`}
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  className="space-y-3"
                >
                  {/* Any Wallet — via RainbowKit modal */}
                  <button
                    id="login-wallet"
                    onClick={handleConnectAnyWallet}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/60 transition-all group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-md">
                      <Wallet className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-bold text-slate-800 text-sm group-hover:text-sky-600 transition-colors" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                        Connect Wallet
                      </div>
                      <div className="text-xs text-slate-500">
                        MetaMask, Phantom, Coinbase, Brave, Rainbow &amp; more
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-sky-500 group-hover:translate-x-1 transition-all" />
                  </button>

                  {/* Divider */}
                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-xs text-slate-400 font-medium">or</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>

                  {/* Google */}
                  <button
                    id="login-google"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-all group disabled:opacity-50"
                  >
                    <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-bold text-slate-800 text-sm" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                        {isLoading ? 'Redirecting…' : 'Google'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {isSignUp ? 'Create account with Google' : 'Continue with your Google account'}
                      </div>
                    </div>
                    {isLoading
                      ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      : <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-all" />
                    }
                  </button>

                  {/* Info note */}
                  <div className="flex items-start gap-2 pt-1 text-xs text-slate-400">
                    <Shield className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>
                      {isSignUp
                        ? 'Your wallet IS your account — no password required. Already have an account? '
                        : 'No passwords stored. Your wallet is your identity. New here? '}
                      <button
                        onClick={() => setPageMode(isSignUp ? 'signin' : 'signup')}
                        className="text-sky-600 hover:underline font-medium"
                      >
                        {isSignUp ? 'Sign in instead' : 'Create an account'}
                      </button>
                    </span>
                  </div>
                </motion.div>
              )}

              {/* ── WALLET SIGN STEP (after wallet connected via RainbowKit) ── */}
              {mode === 'wallet' && (
                <motion.div
                  key="wallet"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  className="space-y-4"
                >
                  {[
                    { step: 1, label: 'Connect wallet', done: isConnected },
                    { step: 2, label: 'Sign message (no gas)', done: walletStep === 'done' },
                  ].map(({ step, label, done }) => (
                    <div key={step} className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${done
                        ? 'border-emerald-300 bg-emerald-50'
                        : step === 1 && !isConnected
                          ? 'border-sky-300 bg-sky-50'
                          : 'border-slate-200 opacity-40'
                      }`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                        }`}>
                        {done ? <CheckCircle className="w-4 h-4" /> : step}
                      </div>
                      <span className={`text-sm font-medium ${done ? 'text-emerald-700' : 'text-slate-700'}`}>
                        {label}
                      </span>
                    </div>
                  ))}

                  {isConnected && address && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 font-mono break-all">
                      {address}
                    </div>
                  )}

                  {!isConnected ? (
                    <button
                      id="wallet-connect-btn"
                      onClick={() => openConnectModal?.()}
                      className="btn-primary w-full py-3.5 flex items-center justify-center gap-2"
                    >
                      <Wallet className="w-4 h-4" /> Open Wallet Selector
                    </button>
                  ) : (
                    <button
                      id="wallet-sign-btn"
                      onClick={handleWalletSignIn}
                      disabled={isLoading}
                      className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {isLoading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Waiting for signature…</>
                        : <><Shield className="w-4 h-4" /> {isSignUp ? 'Create Account & Sign' : 'Sign to Authenticate'}</>
                      }
                    </button>
                  )}

                  <p className="text-xs text-center text-slate-400">
                    Signing is free — zero gas required.
                  </p>
                  <button
                    onClick={() => { setMode('choose'); setWalletStep('connect'); }}
                    className="w-full text-sm text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    ← Back to options
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-5">
          By continuing you agree to our{' '}
          <Link href="#" className="text-sky-600 hover:underline">Terms</Link> and{' '}
          <Link href="#" className="text-sky-600 hover:underline">Privacy Policy</Link>.
        </p>
      </motion.div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /></div>}>
      <AuthContent />
    </Suspense>
  );
}
