'use client';

import Link from 'next/link';
import { Globe, MessageCircle, Code2 } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';

const FOOTER_LINKS = [
  {
    title: 'Platform',
    links: [
      { label: 'Explore Campaigns', href: '/explore'        },
      { label: 'Start a Campaign',  href: '/create'         },
      { label: 'My Dashboard',      href: '/dashboard'      },
      { label: 'How It Works',      href: '/#how-it-works'  },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation',   href: '#' },
      { label: 'Smart Contracts', href: '#' },
      { label: 'Audit Reports',   href: '#' },
      { label: 'Bug Bounty',      href: '#' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'Discord',          href: '#' },
      { label: 'Governance Forum', href: '#' },
      { label: 'Twitter / X',      href: '#' },
      { label: 'Newsletter',       href: '#' },
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
    <footer className="border-t border-[#E5E5E5] bg-white">
      <div className="max-w-[1280px] mx-auto px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">

          {/* Brand column */}
          <div className="md:col-span-1">
            <Link href="/" className="inline-block mb-5">
              <Logo iconSize={22} />
            </Link>
            <p className="text-[14px] text-black/40 leading-relaxed mb-6">
              Trustless, transparent crowdfunding on Ethereum. Smart contracts hold escrow. Refunds are guaranteed.
            </p>
            <div className="flex gap-2">
              {SOCIAL.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="w-8 h-8 border border-[#E5E5E5] rounded-full flex items-center justify-center text-black/40 hover:text-black hover:border-black/30 transition-all"
                >
                  <Icon className="w-3.5 h-3.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {FOOTER_LINKS.map(({ title, links }) => (
            <div key={title}>
              <h4 className="section-eyebrow mb-5">{title}</h4>
              <ul className="space-y-3">
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="text-[14px] text-black/40 hover:text-black transition-colors"
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
        <div className="border-t border-[#E5E5E5] mt-16 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[12px] text-black/30">
            © 2025 KickstartCrypto — Open-source and permissionless. Deployed on Sepolia Testnet.
          </p>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
            <span className="text-[12px] text-black/30">Sepolia Testnet — All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
