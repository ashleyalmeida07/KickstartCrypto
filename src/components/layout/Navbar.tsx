'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Menu, X, LogOut, User, ChevronDown, Settings, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { useAccount } from 'wagmi';

const NAV_LINKS = [
  { href: '/',          label: 'Home' },
  { href: '/explore',   label: 'Explore' },
  { href: '/create',    label: 'Launch' },
  { href: '/dashboard', label: 'Dashboard' },
];

export function Navbar() {
  const pathname  = usePathname();
  const [scrolled,     setScrolled]     = useState(false);
  const [mobileOpen,   setMobileOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const { isAuthenticated, user, logout } = useAuth();
  const { isConnected, address } = useAccount();

  // Hide auth buttons during session loading to prevent flash of sign-in button
  const sessionReady   = useAuth().session !== undefined || !isConnected;
  const showSignInBtn  = !isAuthenticated && sessionReady && !isConnected;

  // Admin Check
  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase());
  const adminWallets = (process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESSES ?? '').split(',').map(w => w.trim().toLowerCase());
  
  const isAdmin = 
    (user?.email && adminEmails.includes(user.email.toLowerCase())) ||
    (user?.walletAddress && adminWallets.includes(user.walletAddress.toLowerCase())) ||
    (address && adminWallets.includes(address.toLowerCase()));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        scrolled
          ? 'bg-white border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] py-3'
          : 'bg-white/95 py-4'
      }`}
      style={{ backdropFilter: scrolled ? 'none' : 'blur(8px)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">

        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <div className="w-7 h-7 bg-zinc-900 flex items-center justify-center rounded-sm">
            <span className="text-white font-black text-xs" style={{ fontFamily: 'var(--font-space-grotesk)' }}>K</span>
          </div>
          <span
            className="font-bold text-base tracking-tight text-zinc-900"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Kickstart<span style={{ color: 'var(--color-accent)' }}>Crypto</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5" aria-label="Main navigation">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative px-3.5 py-2 text-sm font-medium transition-colors duration-150 rounded-sm ${
                  active
                    ? 'text-zinc-900 bg-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                }`}
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
                aria-current={active ? 'page' : undefined}
              >
                {label}
                {active && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute bottom-0 left-3.5 right-3.5 h-0.5 bg-zinc-900 rounded-full"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right: wallet + session */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />
          </div>

          {isAuthenticated ? (
            <div className="relative hidden sm:block">
              <button
                id="user-menu-btn"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-sm border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-all text-sm"
              >
                {user?.image ? (
                  <img src={user.image} alt="" className="w-5 h-5 rounded-full" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-zinc-900 flex items-center justify-center">
                    <User className="w-3 h-3 text-white" />
                  </div>
                )}
                <span className="text-sm text-zinc-700 max-w-[90px] truncate" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  {user?.name || (user?.walletAddress ? `${user.walletAddress.slice(0, 6)}…` : 'Account')}
                </span>
                <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-11 w-52 bg-white rounded-sm border border-zinc-200 shadow-lg p-1 z-50"
                  >
                    {user?.email && (
                      <div className="px-3 py-2 text-xs text-zinc-400 border-b border-zinc-100 mb-1 truncate">
                        {user.email}
                      </div>
                    )}
                    {user?.walletAddress && (
                      <div className="px-3 py-2 text-xs text-zinc-400 border-b border-zinc-100 mb-1 font-mono truncate">
                        {user.walletAddress.slice(0, 10)}…
                      </div>
                    )}
                    <Link
                      href="/dashboard"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors rounded-sm"
                    >
                      <User className="w-3.5 h-3.5 text-zinc-400" /> My Dashboard
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors rounded-sm"
                    >
                      <Settings className="w-3.5 h-3.5 text-zinc-400" /> Settings
                    </Link>
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-sm text-purple-700 hover:bg-purple-50 transition-colors rounded-sm font-medium"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-purple-500" /> Admin Console
                      </Link>
                    )}
                    <div className="border-t border-zinc-100 mt-1 pt-1">
                      <button
                        id="logout-btn"
                        onClick={() => { logout(); setUserMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors rounded-sm"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : showSignInBtn ? (
            <div className="hidden sm:flex items-center gap-2">
              <Link href="/auth/login">
                <button id="signin-btn" className="btn-primary py-2 px-4 text-sm font-semibold tracking-wide">
                  Sign In / Sign Up
                </button>
              </Link>
            </div>
          ) : null}

          {/* Mobile hamburger */}
          <button
            id="mobile-menu-btn"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-sm transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-t border-zinc-200 overflow-hidden"
          >
            <div className="px-4 py-4 flex flex-col gap-0.5">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`px-3 py-2.5 text-sm font-medium rounded-sm transition-colors ${
                    pathname === href
                      ? 'text-zinc-900 bg-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                  }`}
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  {label}
                </Link>
              ))}

              <div className="pt-3 mt-1 border-t border-zinc-100 space-y-2">
                <ConnectButton accountStatus="full" chainStatus="full" showBalance />
                {isAuthenticated ? (
                  <>
                    <Link href="/settings" onClick={() => setMobileOpen(false)}>
                      <button className="w-full btn-secondary text-sm py-2.5 flex items-center justify-center gap-2">
                        <Settings className="w-4 h-4" /> Settings
                      </button>
                    </Link>
                    <button
                      onClick={() => { logout(); setMobileOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 rounded-sm"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </>
                ) : (
                  <div className="flex">
                    <Link href="/auth/login" onClick={() => setMobileOpen(false)} className="flex-1">
                      <button className="w-full btn-primary text-sm py-2.5 font-semibold tracking-wide">Sign In / Sign Up</button>
                    </Link>
                  </div>
                )}
                {isAdmin && (
                  <Link href="/admin" onClick={() => setMobileOpen(false)}>
                    <button className="w-full bg-purple-50 text-purple-700 border border-purple-200 text-sm py-2.5 flex items-center justify-center gap-2 font-medium mt-2">
                      <ShieldAlert className="w-4 h-4" /> Admin Console
                    </button>
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
