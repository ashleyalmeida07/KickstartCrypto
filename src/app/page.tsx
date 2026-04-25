'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Shield, Zap, Vote, RefreshCw, TrendingUp, Users, Target, Award } from 'lucide-react';
import { CampaignCard, CampaignCardSkeleton } from '@/components/ui/CampaignCard';
import { useCampaigns } from '@/lib/useCampaigns';
import { CATEGORIES } from '@/lib/data';

const HOW_IT_WORKS = [
  {
    step: '01', icon: Target, title: 'Create a Campaign',
    desc: 'Define your goal, set milestones, and upload your pitch. Deploy your campaign contract in one click.',
    color: 'from-sky-500 to-blue-600',
  },
  {
    step: '02', icon: Zap, title: 'Backers Contribute',
    desc: 'Crypto backers fund your campaign with ETH. All funds are held in a trustless smart contract — never by us.',
    color: 'from-purple-500 to-pink-500',
  },
  {
    step: '03', icon: Shield, title: 'Build & Deliver',
    desc: 'Complete milestones, request payouts, and let your community vote. Funds release only when backers approve.',
    color: 'from-emerald-500 to-teal-500',
  },
];

const FEATURES = [
  { icon: Shield,    title: 'Trustless Escrow',    desc: 'Smart contracts hold all funds. No company or person can touch them.',         color: 'text-sky-500'     },
  { icon: Vote,      title: 'Backer Voting',       desc: 'Token-weighted on-chain voting controls every milestone payout.',              color: 'text-purple-500'  },
  { icon: RefreshCw, title: 'Auto Refunds',        desc: "If goal isn't met or a milestone fails, your ETH returns automatically.",      color: 'text-emerald-500' },
  { icon: TrendingUp,title: 'Full Transparency',   desc: 'Every transaction is public and verifiable on Etherscan.',                     color: 'text-amber-500'   },
];

export default function HomePage() {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const { campaigns, isLoading } = useCampaigns();

  // Featured = top 3 most-funded active campaigns, fallback to newest
  const featured = campaigns
    .filter(c => c.status === 'Active')
    .sort((a, b) => b.progressPercent - a.progressPercent)
    .slice(0, 3);

  // Platform stats derived from live data
  const totalRaisedEth = campaigns.reduce((s, c) => s + c.raisedEth, 0);
  const activeCount    = campaigns.filter(c => c.status === 'Active').length;
  const totalBackers   = campaigns.reduce((s, c) => s + Number(c.backerCount), 0);
  const funded         = campaigns.filter(c => c.status === 'Funded').length;
  const successRate    = campaigns.length > 0 ? Math.round((funded / campaigns.length) * 100) : 0;

  return (
    <div className="overflow-hidden">
      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center justify-center pt-24 pb-16 bg-gradient-to-br from-sky-50 via-white to-purple-50">

        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-300/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-300/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="badge badge-active mb-6 inline-flex">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse mr-1.5" />
              Now live on Sepolia Testnet
            </span>

            <h1
              className="text-5xl sm:text-6xl md:text-7xl font-black leading-none tracking-tight mb-6 text-slate-900"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              Fund the{' '}
              <span className="gradient-text">Future</span>
              <br />of Blockchain
            </h1>

            <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed mb-10">
              The world's first <strong className="text-slate-800 font-bold">trustless crowdfunding platform</strong> where smart contracts hold escrow, backers vote on milestones, and refunds are guaranteed — no middlemen, ever.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/explore" id="hero-explore-btn">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="btn-primary flex items-center gap-2 text-base px-8 py-3.5">
                  Explore Campaigns <ArrowRight className="w-4 h-4" />
                </motion.button>
              </Link>
              <Link href="/create" id="hero-create-btn">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="btn-secondary flex items-center gap-2 text-base px-8 py-3.5">
                  <Zap className="w-4 h-4" /> Launch a Campaign
                </motion.button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 -mt-6 mb-20">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 divide-x-0 md:divide-x divide-slate-100">
            {[
              { label: 'Total Raised',      value: `${totalRaisedEth.toFixed(2)} ETH`, icon: TrendingUp, color: 'text-sky-500' },
              { label: 'Active Campaigns',  value: activeCount.toLocaleString(),         icon: Target,     color: 'text-purple-500' },
              { label: 'Total Backers',     value: totalBackers.toLocaleString(),        icon: Users,      color: 'text-pink-500' },
              { label: 'Success Rate',      value: `${successRate}%`,                   icon: Award,      color: 'text-emerald-500' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="text-center md:px-6 first:pl-0 last:pr-0">
                <Icon className={`w-6 h-6 ${color} mx-auto mb-2`} />
                <div className="text-2xl sm:text-3xl font-black gradient-text" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  {value}
                </div>
                <div className="text-xs text-slate-500 mt-1 uppercase tracking-widest">{label}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── FEATURED CAMPAIGNS ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mb-24">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              Featured <span className="gradient-text">Campaigns</span>
            </h2>
            <p className="text-slate-500 mt-1.5">Handpicked high-impact blockchain projects</p>
          </div>
          <Link href="/explore" className="btn-secondary text-sm py-2 px-5 hidden sm:block">View All →</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => <CampaignCardSkeleton key={i} index={i} />)
            : featured.length > 0
            ? featured.map((c, i) => <CampaignCard key={c.address} campaign={c} index={i} variant="featured" />)
            : (
              <div className="col-span-3 text-center py-16 text-slate-500">
                <p className="text-4xl mb-3">🚀</p>
                <p className="font-semibold text-slate-700">No active campaigns yet</p>
                <p className="text-sm mt-1">Be the first to <a href="/create" className="text-sky-600 hover:underline">launch one</a>!</p>
              </div>
            )
          }
        </div>
      </section>

      {/* ── CATEGORIES ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mb-24">
        <h2 className="text-2xl font-bold text-slate-900 mb-6" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          Browse by Category
        </h2>
        <div className="flex flex-wrap gap-3">
          {['All', ...CATEGORIES].map((cat) => (
            <motion.button
              key={cat}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              id={`category-${cat.toLowerCase()}`}
              onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                activeCategory === cat
                  ? 'bg-sky-500 border-sky-500 text-white shadow-md'
                  : 'border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-600 bg-white'
              }`}
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              {cat}
            </motion.button>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 mb-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            How It <span className="gradient-text">Works</span>
          </h2>
          <p className="text-slate-600 max-w-xl mx-auto">Three simple steps. Complete transparency. Zero trust required.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map(({ step, icon: Icon, title, desc, color }, i) => (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="bg-white border border-slate-200 shadow-sm rounded-2xl p-7 relative overflow-hidden card-lift hover:shadow-md hover:border-sky-200 transition-all"
            >
              <div className="absolute top-4 right-4 text-6xl font-black text-slate-100 select-none" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                {step}
              </div>
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-5 shadow-md`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-xl text-slate-900 mb-3" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{title}</h3>
              <p className="text-slate-600 leading-relaxed text-sm">{desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mb-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Why <span className="gradient-text-warm">KickstartCrypto</span>?
          </h2>
          <p className="text-slate-600 max-w-xl mx-auto">
            Everything Kickstarter promised but never delivered — now actually enforced by code.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {FEATURES.map(({ icon: Icon, title, desc, color }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 flex gap-5 card-lift hover:shadow-md hover:border-sky-200 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 mb-1.5" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{title}</h4>
                <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mb-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-sky-600 via-blue-700 to-purple-700 shadow-2xl"
        >
          <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
          <div className="relative z-10 text-center py-16 px-6">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              Ready to Fund the Future?
            </h2>
            <p className="text-sky-100 mb-8 max-w-md mx-auto">
              Launch your blockchain project with full accountability or back the next big idea with trustless protection.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/create">
                <button className="bg-white text-sky-700 font-bold px-8 py-3.5 rounded-xl hover:bg-sky-50 transition-all shadow-md">
                  Start a Campaign
                </button>
              </Link>
              <Link href="/explore">
                <button className="border border-white/40 text-white font-bold px-8 py-3.5 rounded-xl hover:bg-white/10 transition-all">
                  Explore Projects
                </button>
              </Link>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
