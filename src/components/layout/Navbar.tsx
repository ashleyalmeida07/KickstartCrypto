'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Menu, X, LogOut, User, ChevronDown, Settings, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { useAccount } from 'wagmi';
import { Logo } from '@/components/ui/Logo';

const NAV_LINKS = [
  { href: '/explore', label: 'Explore' },
  { href: '/create', label: 'Launch' },
  { href: '/dashboard', label: 'Dashboard' },
];

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const { isAuthenticated, user, logout } = useAuth();
  const { isConnected, address } = useAccount();

  const sessionReady = useAuth().session !== undefined || !isConnected;
  const showSignInBtn = !isAuthenticated && sessionReady && !isConnected;

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
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 bg-white transition-all duration-200 ${scrolled ? 'border-b border-[#E5E5E5]' : ''
        }`}
    >
      <div className="max-w-[1280px] mx-auto px-6 py-5 flex items-center justify-between gap-8">

        {/* ── Logo (left) ── */}
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        {/* ── Center nav links ── */}
        <nav className="hidden md:flex items-center gap-8" aria-label="Main navigation">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`text-[13px] font-medium uppercase tracking-[0.08em] transition-opacity duration-150 ${active ? 'text-black opacity-100' : 'text-black opacity-50 hover:opacity-100'
                  }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* ── Right: wallet + auth + Launch CTA ── */}
        <div className="flex items-center gap-3">


          {/* User menu (authenticated) */}
          {isAuthenticated && (
            <div className="relative hidden md:block">
              <button
                id="user-menu-btn"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-full border border-[#E5E5E5] hover:border-black/30 transition-all text-sm"
              >
                {user?.image ? (
                  <img src={user.image} alt="" className="w-5 h-5 rounded-full" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
                    <User className="w-3 h-3 text-white" />
                  </div>
                )}
                <span className="text-[13px] text-black max-w-[80px] truncate">
                  {user?.name || (user?.walletAddress ? `${user.walletAddress.slice(0, 6)}…` : 'Account')}
                </span>
                <ChevronDown className={`w-3 h-3 text-black/40 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-12 w-52 bg-white rounded-2xl border border-[#E5E5E5] shadow-lg p-1.5 z-50"
                  >
                    {user?.email && (
                      <div className="px-3 py-2 text-xs text-black/40 border-b border-[#E5E5E5] mb-1 truncate">
                        {user.email}
                      </div>
                    )}
                    {user?.walletAddress && (
                      <div className="px-3 py-2 text-xs text-black/40 border-b border-[#E5E5E5] mb-1 font-mono truncate">
                        {user.walletAddress.slice(0, 10)}…
                      </div>
                    )}
                    <Link href="/dashboard" onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-black hover:bg-[#F7F7F7] transition-colors rounded-xl">
                      <User className="w-3.5 h-3.5 text-black/40" /> My Dashboard
                    </Link>
                    <Link href="/wallet" onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-black hover:bg-[#F7F7F7] transition-colors rounded-xl">
                      <ShieldAlert className="w-3.5 h-3.5 text-black/40" /> My Wallet
                    </Link>
                    <Link href="/settings" onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-black hover:bg-[#F7F7F7] transition-colors rounded-xl">
                      <Settings className="w-3.5 h-3.5 text-black/40" /> Settings
                    </Link>
                    {isAdmin && (
                      <Link href="/admin" onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-purple-700 hover:bg-purple-50 transition-colors rounded-xl font-medium">
                        <ShieldAlert className="w-3.5 h-3.5 text-purple-500" /> Admin Console
                      </Link>
                    )}
                    <div className="border-t border-[#E5E5E5] mt-1 pt-1">
                      <button id="logout-btn"
                        onClick={() => { logout(); setUserMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 transition-colors rounded-xl">
                        <LogOut className="w-3.5 h-3.5" /> Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Login button (unauthenticated) */}
          {!isAuthenticated && (
            <div className="hidden md:block">
              <Link href="/auth/login">
                <button id="signin-btn" className="btn-secondary text-[13px] py-2.5 px-5">
                  Sign In
                </button>
              </Link>
            </div>
          )}

          {/* Primary CTA — black pill */}
          <Link href="/create" className="hidden md:block">
            <button className="btn-primary text-[13px] py-2.5 px-5">
              Launch a Campaign
            </button>
          </Link>

          {/* Mobile hamburger */}
          <button
            id="mobile-menu-btn"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-black/50 hover:text-black transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-t border-[#E5E5E5] overflow-hidden"
          >
            <div className="px-6 py-6 flex flex-col gap-1">
              <Link href="/" onClick={() => setMobileOpen(false)}
                className={`py-3 text-sm font-medium uppercase tracking-[0.08em] border-b border-[#E5E5E5] transition-colors ${pathname === '/' ? 'text-black' : 'text-black/50'
                  }`}>
                Home
              </Link>
              {NAV_LINKS.map(({ href, label }) => (
                <Link key={href} href={href} onClick={() => setMobileOpen(false)}
                  className={`py-3 text-sm font-medium uppercase tracking-[0.08em] border-b border-[#E5E5E5] transition-colors ${pathname === href ? 'text-black' : 'text-black/50'
                    }`}>
                  {label}
                </Link>
              ))}

              <div className="pt-5 space-y-3">

                {isAuthenticated ? (
                  <>
                    <Link href="/settings" onClick={() => setMobileOpen(false)}>
                      <button className="w-full btn-secondary text-sm py-3 justify-center">
                        <Settings className="w-4 h-4" /> Settings
                      </button>
                    </Link>
                    <button onClick={() => { logout(); setMobileOpen(false); }}
                      className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 rounded-full flex items-center gap-2 transition-colors">
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </>
                ) : (
                  <Link href="/auth/login" onClick={() => setMobileOpen(false)} className="block">
                    <button className="w-full btn-primary text-sm py-3 justify-center">Sign In / Sign Up</button>
                  </Link>
                )}
                <Link href="/create" onClick={() => setMobileOpen(false)} className="block">
                  <button className="w-full btn-primary text-sm py-3 justify-center">Launch a Campaign</button>
                </Link>
                {isAdmin && (
                  <Link href="/admin" onClick={() => setMobileOpen(false)}>
                    <button className="w-full bg-purple-50 text-purple-700 border border-purple-200 text-sm py-3 rounded-full flex items-center justify-center gap-2 font-medium">
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
