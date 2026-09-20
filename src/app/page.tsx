'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Shield, Zap, RefreshCw, TrendingUp, Users, Target, Award, Vote } from 'lucide-react';
import { CampaignCard, CampaignCardSkeleton } from '@/components/ui/CampaignCard';
import { useCampaigns } from '@/lib/useCampaigns';
import { CATEGORIES } from '@/lib/data';

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Create a Campaign',
    desc: 'Define your goal, set milestones, and deploy your campaign smart contract in one click. Our AI agent vets your submission before it goes live.',
  },
  {
    step: '02',
    title: 'Backers Contribute',
    desc: 'Crypto backers fund your campaign with ETH. All funds are held in a trustless smart contract — never by us, never at risk.',
  },
  {
    step: '03',
    title: 'Build & Deliver',
    desc: 'Complete milestones and request payouts. Smart contracts enforce accountability — funds release automatically when goals are met, and refunds trigger when they\'re not.',
  },
];

const FEATURES = [
  { icon: Shield,     title: 'Trustless Escrow',   desc: 'Smart contracts hold all funds. No company or person can touch them without backer approval.' },
  { icon: Vote,       title: 'Auto Settlement',     desc: 'Goal reached? Funds go to the creator. Goal missed? ETH returns automatically to every backer.' },
  { icon: RefreshCw,  title: 'Auto Refunds',        desc: "If a campaign fails or is cancelled, your ETH returns automatically. No claims, no waiting." },
  { icon: TrendingUp, title: 'Full Transparency',   desc: 'Every transaction is public and verifiable on Etherscan. Zero hidden fees, zero black boxes.' },
];

// Tech stack used — replaces fake client logos
const TECH_STACK = [
  { name: 'Ethereum' },
  { name: 'Solidity' },
  { name: 'Next.js' },
  { name: 'LangGraph' },
  { name: 'FastAPI' },
  { name: 'Sepolia' },
  { name: 'RainbowKit' },
  { name: 'Wagmi' },
];

// Stagger animation helper
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: 'easeOut' as const, delay },
});

const heroFade = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: 'easeOut' as const, delay },
});

export default function HomePage() {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const { campaigns, isLoading } = useCampaigns();

  const featured = campaigns
    .filter(c => c.status === 'Active')
    .sort((a, b) => b.progressPercent - a.progressPercent)
    .slice(0, 3);

  const totalRaisedEth = campaigns.reduce((s, c) => s + c.raisedEth, 0);
  const activeCount    = campaigns.filter(c => c.status === 'Active').length;
  const totalBackers   = campaigns.reduce((s, c) => s + Number(c.backerCount), 0);
  const funded         = campaigns.filter(c => c.status === 'Funded').length;
  const successRate    = campaigns.length > 0 ? Math.round((funded / campaigns.length) * 100) : 0;

  return (
    <div className="overflow-hidden bg-white">

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative min-h-screen flex items-center justify-center pt-32 pb-24 bg-white">
        <div className="relative z-10 max-w-[960px] mx-auto px-6 text-center">

          {/* Eyebrow */}
          <motion.div {...heroFade(0)}>
            <span className="section-eyebrow inline-flex items-center gap-2 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Now live on Sepolia Testnet
            </span>
          </motion.div>

          {/* Main headline */}
          <motion.h1
            {...heroFade(0.1)}
            className="text-[clamp(48px,8vw,96px)] font-normal leading-[1.02] tracking-[-0.04em] text-black mb-8"
            style={{ fontFamily: 'var(--font-inter)' }}
          >
            Fund the{' '}
            <em className="italic not-italic" style={{ fontStyle: 'italic' }}>Future</em>
            {' '}of<br />Blockchain
          </motion.h1>

          {/* Subheading */}
          <motion.p
            {...heroFade(0.2)}
            className="text-[18px] text-black/50 max-w-[540px] mx-auto leading-relaxed mb-12"
          >
            The trustless crowdfunding platform where smart contracts hold escrow,
            AI agents vet campaigns, and refunds are guaranteed — no middlemen, ever.
          </motion.p>

          {/* CTAs */}
          <motion.div {...heroFade(0.3)} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/explore" id="hero-explore-btn">
              <button className="btn-primary text-[14px] py-3.5 px-7 group">
                Explore Campaigns
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </Link>
            <Link href="/create" id="hero-create-btn">
              <button className="btn-secondary text-[14px] py-3.5 px-7">
                Launch a Campaign
              </button>
            </Link>
          </motion.div>
        </div>
      </section>
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━ BLACK BUILDERS SECTION ━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="bg-black">
        <div className="max-w-[1280px] mx-auto px-6 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
            {/* Left */}
            <div>
              <h2
                className="text-[clamp(32px,4vw,60px)] font-normal tracking-[-0.04em] leading-[1.05] text-white"
                style={{ fontFamily: 'var(--font-inter)' }}
              >
                A Platform Built by{' '}
                <em style={{ fontStyle: 'italic' }}>Builders</em>
              </h2>
            </div>

            {/* Right */}
            <div className="flex flex-col gap-8">
              <p className="text-[15px] text-white/60 leading-relaxed max-w-sm">
                We combine smart contract engineering with agentic AI to build a crowdfunding platform that users can actually trust.
              </p>
              <p className="text-[14px] text-white/30 leading-relaxed max-w-sm">
                From early-stage blockchain projects to established Web3 teams, we give creators accountability and backers the protection they deserve.
              </p>
              {/* Stats */}
              <div className="grid grid-cols-2 gap-8 pt-4 border-t border-white/10">
                <div>
                  <div
                    className="text-[clamp(36px,4vw,52px)] font-normal tracking-[-0.04em] text-white leading-none mb-1"
                    style={{ fontFamily: 'var(--font-inter)' }}
                  >
                    {totalBackers > 0 ? `${totalBackers}+` : '0'}
                  </div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/30">
                    Backers on Platform
                  </div>
                </div>
                <div>
                  <div
                    className="text-[clamp(36px,4vw,52px)] font-normal tracking-[-0.04em] text-white leading-none mb-1"
                    style={{ fontFamily: 'var(--font-inter)' }}
                  >
                    {totalRaisedEth > 0 ? `${totalRaisedEth.toFixed(1)} ETH` : '0 ETH'}
                  </div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/30">
                    Total Raised
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ TECH MARQUEE ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="border-t border-b border-[#E5E5E5] py-6 overflow-hidden bg-white">
        <div className="flex items-center gap-4 mb-3 justify-center">
          <span className="section-eyebrow">Built with</span>
        </div>
        <div className="relative w-full overflow-hidden">
          <div className="flex gap-16 animate-marquee w-max">
            {[...TECH_STACK, ...TECH_STACK].map((tech, i) => (
              <span
                key={i}
                className="text-[13px] font-medium text-black/30 uppercase tracking-[0.12em] whitespace-nowrap"
              >
                {tech.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ STATS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="max-w-[1280px] mx-auto px-6 py-24">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-[#E5E5E5] border border-[#E5E5E5] rounded-2xl overflow-hidden">
          {[
            { label: 'Total Raised',     value: `${totalRaisedEth.toFixed(2)} ETH` },
            { label: 'Active Campaigns', value: activeCount.toLocaleString() },
            { label: 'Total Backers',    value: totalBackers.toLocaleString() },
            { label: 'Success Rate',     value: `${successRate}%` },
          ].map(({ label, value }) => (
            <motion.div
              key={label}
              {...fadeUp(0.05)}
              className="text-center py-10 px-6"
            >
              <div
                className="text-[clamp(32px,4vw,48px)] font-normal tracking-[-0.04em] text-black leading-none mb-2"
                style={{ fontFamily: 'var(--font-inter)' }}
              >
                {value}
              </div>
              <div className="section-eyebrow">{label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━ FEATURED CAMPAIGNS ━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="max-w-[1280px] mx-auto px-6 pb-28">
        <div className="mb-4">
          <span className="section-eyebrow">Campaigns</span>
        </div>
        <div className="flex items-end justify-between mb-12">
          <h2
            className="text-[clamp(32px,4vw,52px)] font-normal tracking-[-0.04em] leading-[1.05] text-black max-w-md"
            style={{ fontFamily: 'var(--font-inter)' }}
          >
            Selected{' '}<em style={{ fontStyle: 'italic' }}>active</em>{' '}projects.
          </h2>
          <Link href="/explore" className="btn-secondary text-[13px] py-2.5 px-5 hidden sm:inline-flex">
            View All →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => <CampaignCardSkeleton key={i} index={i} />)
            : featured.length > 0
            ? featured.map((c, i) => <CampaignCard key={c.address} campaign={c} index={i} variant="featured" />)
            : (
              <div className="col-span-3 text-center py-20 border border-[#E5E5E5] rounded-2xl">
                <p className="text-4xl mb-4">🚀</p>
                <p className="font-medium text-black">No active campaigns yet.</p>
                <p className="text-sm text-black/40 mt-2">
                  Be the first to{' '}
                  <Link href="/create" className="underline underline-offset-4 hover:text-black transition-colors">
                    launch one
                  </Link>.
                </p>
              </div>
            )}
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ CATEGORIES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="border-t border-[#E5E5E5] max-w-[1280px] mx-auto px-6 py-16">
        <div className="mb-8">
          <span className="section-eyebrow">Browse by Category</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {['All', ...CATEGORIES].map((cat) => (
            <button
              key={cat}
              id={`category-${cat.toLowerCase()}`}
              onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2.5 rounded-full text-[13px] font-medium border transition-all duration-200 ${
                activeCategory === cat
                  ? 'bg-black text-white border-black'
                  : 'border-[#E5E5E5] text-black/60 hover:border-black/30 hover:text-black bg-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ HOW IT WORKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="how-it-works" className="border-t border-[#E5E5E5] max-w-[1280px] mx-auto px-6 py-28">
        <div className="mb-4">
          <span className="section-eyebrow">How It Works</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <h2
            className="text-[clamp(32px,4vw,56px)] font-normal tracking-[-0.04em] leading-[1.05] text-black max-w-lg"
            style={{ fontFamily: 'var(--font-inter)' }}
          >
            Three simple steps.{' '}<em style={{ fontStyle: 'italic' }}>Zero</em>{' '}middlemen.
          </h2>
          <p className="text-black/40 text-[15px] max-w-xs leading-relaxed">
            Complete transparency. Automatic accountability. No trust required.
          </p>
        </div>

        {/* Numbered step list */}
        <div className="border-t border-[#E5E5E5]">
          {HOW_IT_WORKS.map(({ step, title, desc }, i) => (
            <motion.div
              key={step}
              {...fadeUp(i * 0.1)}
              className="group flex items-start gap-8 md:gap-16 py-10 border-b border-[#E5E5E5] hover:bg-[#F7F7F7] transition-colors duration-200 px-4 -mx-4 rounded-xl cursor-default"
            >
              <span
                className="text-[clamp(28px,3vw,40px)] font-normal tracking-[-0.04em] text-black/20 shrink-0 leading-none w-12"
                style={{ fontFamily: 'var(--font-inter)' }}
              >
                {step}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <h3
                    className="text-[clamp(18px,2vw,24px)] font-normal tracking-[-0.02em] text-black group-hover:translate-x-1 transition-transform duration-200"
                    style={{ fontFamily: 'var(--font-inter)' }}
                  >
                    {title}
                  </h3>
                  <ArrowRight className="w-5 h-5 text-black/20 group-hover:text-black group-hover:translate-x-1 transition-all duration-200 shrink-0" />
                </div>
                <p className="text-black/40 text-[15px] leading-relaxed mt-2 max-w-xl">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ FEATURES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="border-t border-[#E5E5E5] bg-[#F7F7F7]">
        <div className="max-w-[1280px] mx-auto px-6 py-28">
          <div className="mb-4">
            <span className="section-eyebrow">Why KickstartCrypto</span>
          </div>
          <h2
            className="text-[clamp(32px,4vw,56px)] font-normal tracking-[-0.04em] leading-[1.05] text-black mb-16 max-w-xl"
            style={{ fontFamily: 'var(--font-inter)' }}
          >
            Everything Kickstarter promised,{' '}
            <em style={{ fontStyle: 'italic' }}>actually enforced</em>{' '}by code.
          </h2>

          <div className="border-t border-[#E5E5E5]">
            {FEATURES.map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                {...fadeUp(i * 0.08)}
                className="group flex items-start gap-8 md:gap-16 py-10 border-b border-[#E5E5E5] hover:bg-white transition-colors duration-200 px-4 -mx-4 rounded-xl cursor-default"
              >
                <div className="w-10 h-10 border border-[#E5E5E5] bg-white rounded-xl flex items-center justify-center shrink-0 group-hover:border-black/20 transition-colors">
                  <Icon className="w-4 h-4 text-black" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4">
                    <h3
                      className="text-[clamp(16px,1.5vw,20px)] font-normal tracking-[-0.02em] text-black group-hover:translate-x-1 transition-transform duration-200"
                      style={{ fontFamily: 'var(--font-inter)' }}
                    >
                      {title}
                    </h3>
                    <ArrowRight className="w-4 h-4 text-black/20 group-hover:text-black group-hover:translate-x-1 transition-all duration-200 shrink-0" />
                  </div>
                  <p className="text-black/40 text-[14px] leading-relaxed mt-1.5 max-w-xl">{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ FINAL CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="bg-black">
        <div className="max-w-[1280px] mx-auto px-6 py-28 text-center">
          <motion.div {...fadeUp()}>
            <span className="section-eyebrow text-white/30 mb-8 inline-block">
              Let's build something
            </span>
            <h2
              className="text-[clamp(36px,6vw,80px)] font-normal tracking-[-0.04em] leading-[1.02] text-white mb-8 max-w-3xl mx-auto"
              style={{ fontFamily: 'var(--font-inter)' }}
            >
              Ready to fund the{' '}
              <em style={{ fontStyle: 'italic' }}>future</em>?
            </h2>
            <p className="text-white/40 text-[17px] mb-12 max-w-md mx-auto leading-relaxed">
              Launch your blockchain project with full accountability, or back the next big idea with trustless protection.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/create">
                <button className="inline-flex items-center gap-2 bg-white text-black font-medium text-[14px] px-8 py-4 rounded-full hover:bg-white/90 transition-all group">
                  Start a Campaign
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
              <Link href="/explore">
                <button className="inline-flex items-center gap-2 border border-white/20 text-white font-medium text-[14px] px-8 py-4 rounded-full hover:border-white/50 hover:bg-white/5 transition-all">
                  Explore Projects
                </button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

    </div>
  );
}
