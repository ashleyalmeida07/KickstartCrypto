'use client';
import { use } from 'react';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import {
  ExternalLink, Users, Clock, Shield, Share2,
  AlertCircle, CheckCircle, Loader2, RefreshCw,
  XCircle, Zap
} from 'lucide-react';
import Link from 'next/link';
import { formatEther } from 'viem';
import toast from 'react-hot-toast';
import { useCampaign } from '@/lib/useCampaigns';
import { CAMPAIGN_ABI } from '@/lib/contracts';
import { ContributeModal } from '@/components/ui/ContributeModal';
import { TxHashBadge } from '@/components/ui/TxHashBadge';
import { formatEthSmart } from '@/lib/utils';

type Tab = 'overview' | 'milestones' | 'refund';
const PIE_COLORS = ['#0EA5E9', '#7C3AED', '#EC4899', '#10B981', '#F59E0B'];

// ─── Tiny TxButton — handles write + wait + toast ────────────────────────────
function TxButton({
  label, loadingLabel, onClick, disabled = false, variant = 'primary', icon,
}: {
  label: string; loadingLabel: string; onClick: () => void;
  disabled?: boolean; variant?: 'primary' | 'secondary' | 'danger'; icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
        variant === 'primary' ? 'btn-primary'
        : variant === 'danger'
          ? 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'
          : 'btn-secondary'
      }`}
    >
      {disabled && loadingLabel !== label ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {disabled ? loadingLabel : label}
    </button>
  );
}

// ─── Milestone row — simplified, no voting (auto-settle contract) ─────────────
function MilestoneRow({
  campaignAddress, index,
}: {
  campaignAddress: `0x${string}`;
  index: number;
}) {
  const { data: milestoneRaw } = useReadContract({
    address:      campaignAddress,
    abi:          CAMPAIGN_ABI,
    functionName: 'getMilestone',
    args:         [BigInt(index)],
  });

  if (!milestoneRaw || !Array.isArray(milestoneRaw)) {
    return <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />;
  }

  // New contract: getMilestone returns (title, description, percentage, released)
  const [title, desc, percentage, released] =
    milestoneRaw as [string, string, number, boolean];

  const stateTag = released
    ? { label: 'Released', cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' }
    : { label: 'Pending',  cls: 'bg-slate-100 border-slate-200 text-slate-500'      };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold text-slate-900 text-sm" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              Milestone {index + 1}: {title}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${stateTag.cls}`}>
              {stateTag.label}
            </span>
          </div>
          {desc && <p className="text-xs text-slate-500 mt-1">{desc}</p>}
        </div>
        <span className="text-lg font-black text-sky-600 flex-shrink-0" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          {percentage}%
        </span>
      </div>
      {released && (
        <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-3">
          <CheckCircle className="w-3.5 h-3.5" /> Funds automatically released to creator via settle()
        </p>
      )}
    </div>
  );
}

// ─── Main Campaign Page ───────────────────────────────────────────────────────
export default function CampaignDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: rawAddress } = use(params);
  const addr = rawAddress as `0x${string}`;
  const { address: userAddress, isConnected } = useAccount();
  const { campaign, isLoading } = useCampaign(addr);

  const [activeTab,      setActiveTab]      = useState<Tab>('overview');
  const [contributeOpen, setContributeOpen] = useState(false);
  const [refreshKey,     setRefreshKey]     = useState(0);
  const [txHash,         setTxHash]         = useState<`0x${string}` | undefined>(undefined);
  const [actionPending,  setActionPending]  = useState(false);

  const refresh = () => setRefreshKey(k => k + 1);

  const { writeContract } = useWriteContract({
    mutation: {
      onSuccess: (h) => { setTxHash(h); setActionPending(true); toast.loading('Tx submitted!', { id: 'tx-toast' }); },
      onError:   (e) => { setActionPending(false); toast.error(e.message.slice(0, 100)); },
    },
  });
  const { isSuccess: actionSuccess } = useWaitForTransactionReceipt({ hash: txHash, query: { enabled: !!txHash } });
  useEffect(() => {
    if (actionSuccess) { setActionPending(false); toast.success('Confirmed on-chain!'); refresh(); }
  }, [actionSuccess]);

  // Read milestone count
  const { data: milestoneCount } = useReadContract({
    address:      addr,
    abi:          CAMPAIGN_ABI,
    functionName: 'getMilestoneCount',
  });

  // Read user contribution — poll every 6s so it updates after a pending tx confirms
  const { data: myContribution } = useReadContract({
    address:      addr,
    abi:          CAMPAIGN_ABI,
    functionName: 'contributions',
    args:         userAddress ? [userAddress] : undefined,
    query:        { enabled: !!userAddress, refetchInterval: 6_000 },
  });

  const milestones    = Array.from({ length: Number(milestoneCount ?? 0) }, (_, i) => i);
  const isCreator     = campaign && userAddress
    ? campaign.creator.toLowerCase() === userAddress.toLowerCase()
    : false;
  const myContribEth  = myContribution ? Number(formatEther(myContribution as bigint)) : 0;
  const isBacker      = myContribEth > 0;
  const canClaimRefund =
    isBacker &&
    campaign &&
    (campaign.cancelled || (campaign.status === 'Failed'));

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="w-10 h-10 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center pt-20 gap-4">
        <AlertCircle className="w-12 h-12 text-slate-300" />
        <h2 className="text-xl font-bold text-slate-700">Campaign not found</h2>
        <p className="text-slate-500 text-sm">This address doesn't match any deployed campaign.</p>
        <Link href="/explore" className="btn-primary mt-2">Browse Campaigns</Link>
      </div>
    );
  }

  const STATUS_STYLES: Record<string, string> = {
    Active:    'bg-emerald-50 border-emerald-200 text-emerald-700',
    Funded:    'bg-sky-50    border-sky-200    text-sky-700',
    Failed:    'bg-red-50    border-red-200    text-red-600',
    Ended:     'bg-slate-100 border-slate-200  text-slate-500',
    Cancelled: 'bg-orange-50 border-orange-200 text-orange-600',
  };

  return (
    <div className="min-h-screen">
      {/* Hero banner */}
      <div className="relative h-64 sm:h-80 overflow-hidden bg-gradient-to-br from-sky-100 to-purple-100">
        <img
          src={campaign.imageUrl || `https://picsum.photos/seed/${addr.slice(2, 10)}/1200/400`}
          alt={campaign.title}
          className="w-full h-full object-cover"
          onError={e => { (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${addr.slice(2, 10)}/1200/400`; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-white/80 via-transparent to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 -mt-12 relative z-10 pb-24">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* ── LEFT COLUMN ── */}
          <div className="flex-1 min-w-0">
            {/* Title block */}
            <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
              <div className="flex flex-wrap gap-2 mb-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLES[campaign.status]}`}>
                  {campaign.status}
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-700">
                  {campaign.category}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                {campaign.title}
              </h1>
              <p className="text-slate-600 leading-relaxed mb-4">{campaign.description || 'A blockchain campaign on Sepolia Testnet.'}</p>

              {/* Creator row */}
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-purple-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Creator</p>
                    <a href={`https://sepolia.etherscan.io/address/${campaign.creator}`} target="_blank" rel="noopener noreferrer"
                      className="text-sky-600 hover:text-sky-800 font-mono text-xs flex items-center gap-1">
                      {campaign.creator.slice(0, 6)}…{campaign.creator.slice(-4)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <Shield className="w-4 h-4" />
                  <span className="text-xs font-semibold">Verified Contract</span>
                </div>
                <div className="ml-auto flex gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Link copied!'); }}
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:border-sky-300 hover:text-sky-600 transition-all">
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Contract address */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                <span>Contract:</span>
                <a href={`https://sepolia.etherscan.io/address/${addr}`} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-sky-600 hover:underline flex items-center gap-1">
                  {addr.slice(0, 10)}…{addr.slice(-6)} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
              {([
                { id: 'overview'   as Tab, label: 'Overview'   },
                { id: 'milestones' as Tab, label: `Milestones (${milestones.length})` },
                { id: 'refund'     as Tab, label: 'Refunds'    },
              ]).map(({ id, label }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap -mb-px ${
                    activeTab === id
                      ? 'border-sky-500 text-sky-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Tab bodies */}
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>

              {/* ── OVERVIEW ── */}
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  {/* Milestone allocation pie (simple list) */}
                  {milestones.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                      <h3 className="font-bold text-slate-900 mb-4" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                        Funding Allocation
                      </h3>
                      <div className="space-y-3">
                        {milestones.map((idx) => (
                          <MilestoneAllocationBar key={idx} campaignAddress={addr} index={idx} colors={PIE_COLORS} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Your contribution */}
                  {isBacker && (
                    <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5">
                      <p className="text-sm font-semibold text-sky-800 mb-1">Your Contribution</p>
                      <p className="text-2xl font-black text-sky-600" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                        {formatEthSmart(myContribEth)} ETH
                      </p>
                      <p className="text-xs text-sky-600 mt-0.5">
                        {campaign.status === 'Active' ? 'Campaign is active — thank you for backing!' :
                         campaign.status === 'Funded' ? 'Goal reached! Milestone payouts begin.' :
                         canClaimRefund ? 'You can claim your refund below.' : ''}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── MILESTONES ── */}
              {activeTab === 'milestones' && (
                <div className="space-y-4">
                  {milestones.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">No milestones defined for this campaign.</div>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
                        📋 Milestones are informational. To receive funds, the Creator must go to their <strong>Manage Dashboard</strong> and click <strong>Settle</strong> once the goal is reached or the deadline passes.
                      </p>
                      {milestones.map(idx => (
                        <MilestoneRow
                          key={idx}
                          campaignAddress={addr}
                          index={idx}
                        />
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* ── REFUNDS ── */}
              {activeTab === 'refund' && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
                  <h3 className="font-bold text-slate-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                    Refund Policy
                  </h3>
                  <div className="space-y-3 text-sm text-slate-600">
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-emerald-600 text-xs font-bold">✓</span>
                      </div>
                      <p>If the funding goal is <strong>not met</strong> by the deadline, all backers receive a full refund.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-emerald-600 text-xs font-bold">✓</span>
                      </div>
                      <p>If the creator <strong>cancels</strong> the campaign, all backers receive a full refund.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-amber-600 text-xs font-bold">!</span>
                      </div>
                      <p>If a milestone vote is <strong>rejected</strong>, the remaining funds can be refunded.</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-5">
                    {!isConnected ? (
                      <div className="text-center text-slate-500 text-sm py-4">Connect your wallet to check refund eligibility.</div>
                    ) : !isBacker ? (
                      <div className="text-center text-slate-500 text-sm py-4">You have no contributions to this campaign.</div>
                    ) : canClaimRefund ? (
                      <div className="space-y-4">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700">
                          ✅ You are eligible for a refund of <strong>{formatEthSmart(myContribEth)} ETH</strong>.
                        </div>
                        {actionPending ? (
                          <div className="flex items-center gap-2 text-sky-600 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" /> Processing refund…
                            {txHash && <TxHashBadge txHash={txHash} />}
                          </div>
                        ) : (
                          <button id="claim-refund-btn"
                            onClick={() => writeContract({ address: addr, abi: CAMPAIGN_ABI, functionName: 'claimRefund' })}
                            className="btn-primary flex items-center gap-2">
                            <RefreshCw className="w-4 h-4" /> Claim Refund ({formatEthSmart(myContribEth)} ETH)
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-center text-slate-500 text-sm py-4 bg-slate-50 rounded-xl border border-slate-200">
                        <p>No refund available at this time.</p>
                        <p className="text-xs mt-1 text-slate-400">Campaign status: <span className="font-semibold">{campaign.status}</span></p>
                      </div>
                    )}
                  </div>

                  {/* Creator: cancel campaign */}
                  {isCreator && campaign.status === 'Active' && (
                    <div className="border-t border-slate-100 pt-5">
                      <p className="text-xs text-slate-500 mb-3">⚠️ Cancelling will allow all backers to claim refunds.</p>
                      <button
                        onClick={() => writeContract({ address: addr, abi: CAMPAIGN_ABI, functionName: 'cancel' })}
                        disabled={actionPending}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-all disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" /> Cancel Campaign
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div className="lg:w-80 xl:w-96 flex-shrink-0">
            <div className="sticky top-24 space-y-4">
              {/* Contribute card */}
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-md p-6">

                {/* Stats */}
                <div className="mb-5">
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <div className="text-3xl font-black gradient-text" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                        {formatEthSmart(campaign.raisedEth)} ETH
                      </div>
                      <div className="text-sm text-slate-500 mt-0.5">raised of {formatEthSmart(campaign.goalEth)} ETH</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-slate-900">{Math.round(campaign.progressPercent)}%</div>
                      <div className="text-xs text-slate-500">funded</div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, campaign.progressPercent)}%` }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-sky-500 to-purple-600 rounded-full"
                    />
                  </div>
                </div>

                {/* Mini stats */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <Users className="w-4 h-4 text-purple-500 mx-auto mb-1" />
                    <div className="font-bold text-slate-900 text-sm">{Number(campaign.backerCount).toLocaleString()}</div>
                    <div className="text-xs text-slate-500">Backers</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <Clock className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                    <div className="font-bold text-slate-900 text-sm">{campaign.daysLeft}d</div>
                    <div className="text-xs text-slate-500">Remaining</div>
                  </div>
                </div>

                {/* CTA button */}
                {campaign.status === 'Active' && !campaign.goalReached ? (
                  <button id="contribute-btn" onClick={() => setContributeOpen(true)}
                    className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2">
                    <Zap className="w-5 h-5" fill="currentColor" /> Back This Project
                  </button>
                ) : (
                  <div className={`w-full py-3 rounded-xl text-center text-sm font-semibold ${
                    campaign.goalReached
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                      : STATUS_STYLES[campaign.status] ?? 'bg-slate-100 text-slate-500'
                  }`}>
                    {campaign.goalReached ? '✓ Goal Reached — Awaiting Settlement' : `Campaign ${campaign.status}`}
                  </div>
                )}

                <p className="text-xs text-center text-slate-400 mt-3">
                  ETH held in smart contract. Auto-refund if goal not met.
                </p>

                {/* Contract info */}
                <div className="border-t border-slate-100 pt-4 mt-4 space-y-2 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Network</span>
                    <span className="font-semibold text-slate-700">Sepolia Testnet</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Platform fee</span>
                    <span className="font-semibold text-slate-700">2.5%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Contract</span>
                    <a href={`https://sepolia.etherscan.io/address/${addr}`} target="_blank" rel="noopener noreferrer"
                      className="text-sky-600 font-mono hover:underline flex items-center gap-1">
                      {addr.slice(0, 6)}…{addr.slice(-4)} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Contribute modal */}
      {campaign.status === 'Active' && (
        <ContributeModal
          isOpen={contributeOpen}
          onClose={() => setContributeOpen(false)}
          campaign={campaign}
          onSuccess={() => { setContributeOpen(false); refresh(); toast.success('Your contribution is live!'); }}
        />
      )}
    </div>
  );
}

// ─── Simple allocation bar (reads milestone title + % from chain) ─────────────
function MilestoneAllocationBar({ campaignAddress, index, colors }: {
  campaignAddress: `0x${string}`; index: number; colors: string[];
}) {
  const { data } = useReadContract({
    address: campaignAddress, abi: CAMPAIGN_ABI, functionName: 'getMilestone', args: [BigInt(index)],
  });
  if (!data || !Array.isArray(data)) return <div className="h-8 bg-slate-100 rounded shimmer" />;
  const [title, , percentage] = (data as unknown) as [string, string, number, ...unknown[]];
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600 mb-1">
        <span className="font-medium">Milestone {index + 1}: {title}</span>
        <span className="font-bold" style={{ color: colors[index % colors.length] }}>{percentage}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${percentage}%`, background: colors[index % colors.length] }} />
      </div>
    </div>
  );
}
