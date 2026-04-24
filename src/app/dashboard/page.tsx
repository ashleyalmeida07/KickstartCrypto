'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useReadContracts } from 'wagmi';
import { useSession } from 'next-auth/react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { formatEther } from 'viem';
import {
  LayoutDashboard, Layers, Vote, Wallet2, TrendingUp,
  Plus, Settings, ArrowUpRight, ExternalLink,
  XCircle, Clock, RefreshCw, AlertCircle,
} from 'lucide-react';
import { useCampaigns, useMyCampaigns } from '@/lib/useCampaigns';
import { CampaignCard, CampaignCardSkeleton } from '@/components/ui/CampaignCard';
import { CAMPAIGN_ABI } from '@/lib/contracts';

type DashTab = 'campaigns' | 'contributions' | 'voting';

interface DbContribution {
  tx_hash:               string;
  amount_wei:            string;
  created_at:            string;
  campaign_id:           string;
  contract_address:      string;
  title:                 string;
  category:              string;
  image_cid:             string;
  status:                string;
  goal_wei:              string;
  total_contributed_wei: string;
  deadline:              string;
}

function trunc(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }
function fmtEth(wei: string)  { return Number(formatEther(BigInt(wei || '0'))).toFixed(4); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Wallet connect nudge ──────────────────────────────────────────────────────

function WalletNudge({ onConnect }: { onConnect: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 border border-amber-200 bg-amber-50 px-5 py-4 mb-6 text-sm"
    >
      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1">
        <span className="font-semibold text-amber-800">Wallet not connected — </span>
        <span className="text-amber-700">campaigns, contributions and votes require a wallet. </span>
        <button
          onClick={onConnect}
          className="font-semibold text-amber-900 underline underline-offset-2 hover:text-zinc-900 transition-colors"
        >
          Connect wallet
        </button>
      </div>
    </motion.div>
  );
}

// ── Contributions tab ─────────────────────────────────────────────────────────

function ContributionsTab({ address, onConnect }: { address?: string; onConnect: () => void }) {
  const [contributions, setContributions] = useState<DbContribution[]>([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`/api/user/contributions?address=${address}`)
      .then(r => r.json())
      .then(d => { setContributions(d.contributions ?? []); setError(''); })
      .catch(() => setError('Failed to load contributions'))
      .finally(() => setLoading(false));
  }, [address]);

  if (!address) return (
    <EmptyState
      icon={<Wallet2 className="w-10 h-10 text-zinc-300" />}
      title="Wallet not connected"
      description="Connect your wallet to see campaigns you have backed on-chain."
      action={
        <button onClick={onConnect} className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
          <Wallet2 className="w-4 h-4" /> Connect Wallet
        </button>
      }
    />
  );

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 bg-zinc-100 shimmer rounded-none" />
      ))}
    </div>
  );

  if (error) return (
    <div className="border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-center gap-3">
      <XCircle className="w-5 h-5 shrink-0" />{error}
    </div>
  );

  if (contributions.length === 0) return (
    <EmptyState
      icon={<Wallet2 className="w-10 h-10 text-zinc-300" />}
      title="No contributions yet"
      description="You haven't backed any campaigns. Explore active campaigns and support projects you believe in."
      action={
        <Link href="/explore">
          <button className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
            <ArrowUpRight className="w-4 h-4" /> Explore Campaigns
          </button>
        </Link>
      }
    />
  );

  const totalEthBacked = contributions.reduce((s, c) => s + BigInt(c.amount_wei || '0'), 0n);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Campaigns Backed', value: contributions.length.toString() },
          { label: 'Total ETH Backed', value: `${Number(formatEther(totalEthBacked)).toFixed(4)} ETH` },
          { label: 'Unique Projects',  value: new Set(contributions.map(c => c.contract_address)).size.toString() },
        ].map(({ label, value }) => (
          <div key={label} className="border border-zinc-200 bg-white p-4">
            <div className="text-xl font-bold text-zinc-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{value}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="border border-zinc-200 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_auto] text-xs font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-50 border-b border-zinc-200 px-4 py-2.5" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          <span>Campaign</span><span>Amount</span><span>Status</span><span>Date</span><span />
        </div>
        {contributions.map((c, i) => (
          <motion.div
            key={c.tx_hash}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] items-center px-4 py-3.5 border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors gap-1 sm:gap-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-zinc-100 shrink-0 overflow-hidden">
                {c.image_cid && (
                  <img src={c.image_cid} alt="" className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900 truncate" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  {c.title || 'Untitled Campaign'}
                </div>
                <div className="text-xs text-zinc-400 font-mono">{trunc(c.contract_address)}</div>
              </div>
            </div>
            <div className="text-sm font-bold text-zinc-900">{fmtEth(c.amount_wei)} ETH</div>
            <div>
              <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 border ${
                c.status === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                c.status === 'funded' ? 'border-zinc-900 bg-zinc-900 text-white' :
                'bg-zinc-100 border-zinc-200 text-zinc-500'
              }`}>{c.status}</span>
            </div>
            <div className="text-xs text-zinc-400">{fmtDate(c.created_at)}</div>
            <div className="flex gap-2">
              <Link href={`/campaign/${c.contract_address}`}>
                <button className="text-xs text-zinc-500 hover:text-zinc-900 border border-zinc-200 hover:border-zinc-400 px-2 py-1 transition-colors">View</button>
              </Link>
              <a href={`https://sepolia.etherscan.io/tx/${c.tx_hash}`} target="_blank" rel="noopener noreferrer"
                className="text-zinc-400 hover:text-zinc-700 transition-colors p-1" title="View on Etherscan">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Voting tab ────────────────────────────────────────────────────────────────

interface PendingVote {
  campaignAddress: `0x${string}`;
  title:           string;
  milestoneIndex:  number;
  milestoneTitle:  string;
  milestonePerc:   number;
}

function VotingTab({ address, campaigns, onConnect }: {
  address?:  string;
  campaigns: ReturnType<typeof useCampaigns>['campaigns'];
  onConnect: () => void;
}) {
  const activeCampaigns = campaigns.filter(c => c.status === 'Active' || c.status === 'Funded');

  const { data: milestoneResults, isLoading } = useReadContracts({
    contracts: activeCampaigns.flatMap(c =>
      Array.from({ length: 5 }, (_, i) => ({
        address:      c.address,
        abi:          CAMPAIGN_ABI,
        functionName: 'getMilestone' as const,
        args:         [BigInt(i)] as const,
      }))
    ),
    query: { enabled: activeCampaigns.length > 0 },
  });

  const pendingVotes: PendingVote[] = [];
  if (milestoneResults && activeCampaigns.length > 0) {
    activeCampaigns.forEach((campaign, ci) => {
      for (let mi = 0; mi < 5; mi++) {
        const r = milestoneResults[ci * 5 + mi];
        if (r?.status === 'success' && Array.isArray(r.result)) {
          const [title, , perc, , , payoutRequested, payoutReleased, rejected] =
            r.result as [string, string, number, bigint, bigint, boolean, boolean, boolean];
          if (!title) break;
          if (payoutRequested && !payoutReleased && !rejected) {
            pendingVotes.push({ campaignAddress: campaign.address, title: campaign.title, milestoneIndex: mi, milestoneTitle: title, milestonePerc: perc });
          }
        }
      }
    });
  }

  if (!address) return (
    <EmptyState
      icon={<Vote className="w-10 h-10 text-zinc-300" />}
      title="Wallet not connected"
      description="Connect your wallet to see milestone votes you can cast as a backer."
      action={
        <button onClick={onConnect} className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
          <Wallet2 className="w-4 h-4" /> Connect Wallet
        </button>
      }
    />
  );

  if (isLoading) return (
    <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-zinc-100 shimmer" />)}</div>
  );

  if (pendingVotes.length === 0) return (
    <EmptyState
      icon={<Vote className="w-10 h-10 text-zinc-300" />}
      title="No pending votes"
      description="When a campaign you backed requests a milestone payout, it will appear here for you to approve or reject."
      hint="Votes are weighted by your contribution — the more you backed, the more your vote counts."
    />
  );

  return (
    <div className="space-y-3">
      {pendingVotes.map((v, i) => (
        <motion.div
          key={`${v.campaignAddress}-${v.milestoneIndex}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }}
          className="border border-amber-200 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-zinc-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{v.title}</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Milestone {v.milestoneIndex + 1}: <span className="font-medium text-zinc-700">{v.milestoneTitle}</span>
                <span className="ml-2 text-zinc-400">({v.milestonePerc}% of funds)</span>
              </div>
            </div>
          </div>
          <Link href={`/campaign/${v.campaignAddress}`}>
            <button className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5 shrink-0">
              Cast Vote <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { data: session }        = useSession();
  const { openConnectModal }     = useConnectModal();
  const [activeTab, setActiveTab] = useState<DashTab>('campaigns');

  const { campaigns: myCampaigns, isLoading, refetch } = useMyCampaigns(address);
  const { campaigns: allCampaigns }                     = useCampaigns();

  const isAuth = isConnected || !!session;

  const totalRaisedWei = myCampaigns.reduce((s, c) => s + c.totalContributed, 0n);
  const activeCount    = myCampaigns.filter(c => c.status === 'Active').length;
  const fundedCount    = myCampaigns.filter(c => c.status === 'Funded').length;
  const displayName    = session?.user?.name || (address ? trunc(address) : 'My Dashboard');

  const TABS: { id: DashTab; label: string; icon: React.ElementType }[] = [
    { id: 'campaigns',     label: 'My Campaigns',  icon: Layers  },
    { id: 'contributions', label: 'Contributions', icon: Wallet2 },
    { id: 'voting',        label: 'Pending Votes', icon: Vote    },
  ];

  // Not authenticated at all — sign-in gate
  if (!isAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-zinc-200 shadow-sm p-12 text-center max-w-md w-full"
        >
          <div className="w-14 h-14 bg-zinc-900 flex items-center justify-center mx-auto mb-6">
            <Wallet2 className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-3" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Sign In to Continue
          </h2>
          <p className="text-zinc-500 text-sm leading-relaxed mb-7">
            Connect your wallet or sign in with Google to view your campaigns, contributions and votes.
          </p>
          <Link href="/auth/login">
            <button className="btn-primary w-full">Sign In</button>
          </Link>
        </motion.div>
      </div>
    );
  }

  // Show nudge if signed in via Google but wallet not connected
  const showWalletNudge = !!session && !isConnected;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-20">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LayoutDashboard className="w-5 h-5 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Dashboard</span>
            </div>
            <h1 className="text-3xl font-bold text-zinc-900" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.03em' }}>
              {displayName}
            </h1>
            {address
              ? <p className="text-xs text-zinc-400 font-mono mt-1">{address}</p>
              : session?.user?.email && <p className="text-xs text-zinc-400 mt-1">{session.user.email}</p>
            }
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="p-2 border border-zinc-200 hover:border-zinc-400 text-zinc-400 hover:text-zinc-700 transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
            <Link href="/settings">
              <button className="btn-secondary py-2 px-4 text-sm flex items-center gap-2">
                <Settings className="w-4 h-4" /> Settings
              </button>
            </Link>
            <Link href="/create">
              <button className="btn-primary flex items-center gap-2 py-2 px-4 text-sm">
                <Plus className="w-4 h-4" /> Launch Campaign
              </button>
            </Link>
          </div>
        </div>

        {/* Wallet nudge — only for email-only sessions */}
        {showWalletNudge && <WalletNudge onConnect={() => openConnectModal?.()} />}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Campaigns Created', value: !address ? '—' : isLoading ? '…' : myCampaigns.length.toString() },
            { label: 'Active',            value: !address ? '—' : isLoading ? '…' : activeCount.toString() },
            { label: 'Funded',            value: !address ? '—' : isLoading ? '…' : fundedCount.toString() },
            { label: 'Total Raised',      value: !address ? '—' : isLoading ? '…' : `${Number(formatEther(totalRaisedWei)).toFixed(3)} ETH` },
          ].map(({ label, value }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white border border-zinc-200 p-4 hover:border-zinc-400 transition-colors"
            >
              <div className="text-2xl font-bold text-zinc-900 mb-0.5" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{value}</div>
              <div className="text-xs text-zinc-500">{label}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 mb-8 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`dash-tab-${id}`}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap -mb-px ${
              activeTab === id ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700 hover:border-zinc-300'
            }`}
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === 'campaigns' && (
            <>
              {!address ? (
                <EmptyState
                  icon={<Wallet2 className="w-10 h-10 text-zinc-300" />}
                  title="Wallet not connected"
                  description="Connect your wallet to see campaigns you've deployed on-chain."
                  action={
                    <button onClick={() => openConnectModal?.()} className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
                      <Wallet2 className="w-4 h-4" /> Connect Wallet
                    </button>
                  }
                />
              ) : isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 3 }).map((_, i) => <CampaignCardSkeleton key={i} index={i} />)}
                </div>
              ) : myCampaigns.length === 0 ? (
                <EmptyState
                  icon={<TrendingUp className="w-10 h-10 text-zinc-300" />}
                  title="No campaigns yet"
                  description="You haven't launched any campaigns. Deploy your first one and start raising funds on-chain."
                  action={
                    <Link href="/create">
                      <button className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
                        <Plus className="w-4 h-4" /> Launch Your First Campaign
                      </button>
                    </Link>
                  }
                  hint={`Campaigns deployed from ${trunc(address)} will appear here.`}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myCampaigns.map((c, i) => (
                    <div key={c.address} className="relative group">
                      <CampaignCard campaign={c} index={i} />
                      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/manage/${c.address}`}>
                          <button className="text-xs bg-white border border-zinc-200 hover:border-zinc-400 px-2.5 py-1 font-semibold text-zinc-700 transition-colors shadow-sm">
                            Manage
                          </button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'contributions' && (
            <ContributionsTab address={address} onConnect={() => openConnectModal?.()} />
          )}

          {activeTab === 'voting' && (
            <VotingTab address={address} campaigns={allCampaigns} onConnect={() => openConnectModal?.()} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  icon, title, description, action, hint,
}: {
  icon:        React.ReactNode;
  title:       string;
  description: string;
  action?:     React.ReactNode;
  hint?:       string;
}) {
  return (
    <div className="border border-zinc-200 bg-white p-12 text-center">
      <div className="flex justify-center mb-5 opacity-60">{icon}</div>
      <h3 className="text-base font-bold text-zinc-800 mb-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{title}</h3>
      <p className="text-zinc-500 text-sm max-w-sm mx-auto mb-5">{description}</p>
      {action && <div className="flex justify-center mb-4">{action}</div>}
      {hint && <p className="text-xs text-zinc-400 bg-zinc-50 border border-zinc-200 px-4 py-2.5 inline-block">{hint}</p>}
    </div>
  );
}
