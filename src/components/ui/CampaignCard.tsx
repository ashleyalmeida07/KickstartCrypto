'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Users, Clock, ArrowRight, Ban } from 'lucide-react';
import type { OnChainCampaign } from '@/lib/useCampaigns';
import { formatEthSmart } from '@/lib/utils';

interface Props {
  campaign: OnChainCampaign;
  index?:   number;
  variant?: 'default' | 'featured';
}

const STATUS_STYLES: Record<string, string> = {
  Active: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  Funded: 'bg-zinc-900 border-zinc-900 text-white',
  Ended:  'bg-zinc-100 border-zinc-200 text-zinc-500',
  Failed: 'bg-red-50 border-red-200 text-red-600',
};

export function CampaignCard({ campaign, index = 0 }: Props) {
  const {
    address, title, description, category, imageUrl,
    progressPercent, raisedEth, goalEth,
    backerCount, daysLeft, status, suspended,
  } = campaign;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: 'easeOut' }}
      className="h-full"
    >
      <Link href={`/campaign/${address}`} className="block h-full group">
        <div className="bg-white border border-zinc-200 overflow-hidden hover:border-zinc-400 hover:shadow-md transition-all duration-200 h-full flex flex-col">

          {/* Thumbnail */}
          <div className="relative h-44 overflow-hidden bg-zinc-100 flex-shrink-0">
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  `https://picsum.photos/seed/${address.slice(2, 8)}/800/400`;
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />

            {/* Status + category badges */}
            <div className="absolute top-3 left-3 flex gap-1.5">
              <span className={`text-[10px] font-semibold px-2 py-0.5 border uppercase tracking-wide ${STATUS_STYLES[status] ?? STATUS_STYLES.Active}`}>
                {status}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-white/90 border border-zinc-200 text-zinc-600 uppercase tracking-wide">
                {category}
              </span>
            </div>

            {/* Urgency */}
            {status === 'Active' && daysLeft <= 3 && !suspended && (
              <div className="absolute top-3 right-3">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-red-600 text-white uppercase tracking-wide">
                  {daysLeft}d left
                </span>
              </div>
            )}

            {/* Suspended overlay — only visible to creator in dashboard */}
            {suspended && (
              <div className="absolute inset-0 bg-red-900/60 flex items-center justify-center">
                <div className="flex items-center gap-2 bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded">
                  <Ban className="w-3.5 h-3.5" /> SUSPENDED
                </div>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="p-5 flex flex-col flex-1">
            <h3
              className="font-bold text-sm text-zinc-900 mb-1.5 line-clamp-2 group-hover:text-zinc-600 transition-colors"
              style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}
            >
              {title}
            </h3>
            <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed mb-4 flex-1">
              {description || 'A blockchain campaign on the Sepolia testnet.'}
            </p>

            {/* Progress */}
            <div className="mb-3">
              <div className="h-1 bg-zinc-100 overflow-hidden">
                <motion.div
                  className="h-full bg-zinc-900"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, progressPercent)}%` }}
                  transition={{ duration: 0.9, delay: index * 0.06 + 0.25 }}
                />
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs font-bold text-zinc-900">
                  {formatEthSmart(raisedEth)} ETH
                </span>
                <span className="text-[11px] text-zinc-400">
                  of {formatEthSmart(goalEth)} ETH &middot; {Math.round(progressPercent)}%
                </span>
              </div>
            </div>

            {/* Meta */}
            <div className="flex items-center justify-between text-xs text-zinc-400 border-t border-zinc-100 pt-3">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {Number(backerCount).toLocaleString()} backers
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {status === 'Active' ? `${daysLeft}d left` : status}
              </span>
              <span className="flex items-center gap-1 text-zinc-700 font-semibold group-hover:gap-1.5 transition-all text-[11px]">
                View <ArrowRight className="w-3 h-3" />
              </span>
            </div>

            {/* Creator address */}
            <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-zinc-200 flex-shrink-0" />
              <span className="text-[11px] text-zinc-400 font-mono truncate">
                {campaign.creator.slice(0, 6)}…{campaign.creator.slice(-4)}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* Skeleton */
export function CampaignCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.04 }}
      className="bg-white border border-zinc-200 overflow-hidden h-full"
    >
      <div className="h-44 bg-zinc-100 shimmer" />
      <div className="p-5 space-y-3">
        <div className="h-4 bg-zinc-100 shimmer w-3/4" />
        <div className="h-3 bg-zinc-100 shimmer w-full" />
        <div className="h-3 bg-zinc-100 shimmer w-5/6" />
        <div className="h-1 bg-zinc-100 shimmer mt-4" />
        <div className="flex justify-between">
          <div className="h-3 bg-zinc-100 shimmer w-20" />
          <div className="h-3 bg-zinc-100 shimmer w-16" />
        </div>
      </div>
    </motion.div>
  );
}
