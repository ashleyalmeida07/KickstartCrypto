'use client';

import Link from 'next/link';
import { Globe, MessageCircle, Code2 } from 'lucide-react';

const FOOTER_LINKS = [
  {
    title: 'Platform',
    links: [
      { label: 'Explore Campaigns', href: '/explore' },
      { label: 'Start a Campaign',  href: '/create'  },
      { label: 'My Dashboard',      href: '/dashboard'},
      { label: 'How It Works',      href: '/#how-it-works' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation',  href: '#' },
      { label: 'Smart Contracts',href: '#' },
      { label: 'Audit Reports',  href: '#' },
      { label: 'Bug Bounty',     href: '#' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'Discord',           href: '#' },
      { label: 'Governance Forum',  href: '#' },
      { label: 'Twitter / X',       href: '#' },
      { label: 'Newsletter',        href: '#' },
    ],
  },
];

const SOCIAL = [
  { icon: MessageCircle, href: '#', label: 'Twitter' },
  { icon: Code2,         href: '#', label: 'GitHub'  },
  { icon: Globe,         href: '#', label: 'Website' },
];

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 mt-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">

          {/* Brand column */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-zinc-900 flex items-center justify-center rounded-sm">
                <span className="text-white font-black text-[10px]" style={{ fontFamily: 'var(--font-space-grotesk)' }}>K</span>
              </div>
              <span className="font-bold text-sm text-zinc-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                Kickstart<span style={{ color: 'var(--color-accent)' }}>Crypto</span>
              </span>
            </Link>
            <p className="text-zinc-500 text-sm leading-relaxed">
              Trustless, transparent crowdfunding on Ethereum. Smart contracts hold escrow. Backers vote on milestones.
            </p>
            <div className="flex gap-2 mt-5">
              {SOCIAL.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="w-8 h-8 border border-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:border-zinc-400 transition-all rounded-sm"
                >
                  <Icon className="w-3.5 h-3.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {FOOTER_LINKS.map(({ title, links }) => (
            <div key={title}>
              <h4
                className="text-xs font-semibold text-zinc-900 mb-4 uppercase tracking-widest"
                style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '0.1em' }}
              >
                {title}
              </h4>
              <ul className="space-y-2.5">
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-zinc-200 mt-10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-400">
            © 2025 KickstartCrypto — Open-source and permissionless. Deployed on Sepolia Testnet.
          </p>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
            <span className="text-xs text-zinc-400">Sepolia Testnet — All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
