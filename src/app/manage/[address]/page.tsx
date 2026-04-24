'use client';

import { useState, use } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useWriteContract, useReadContracts, useWaitForTransactionReceipt, useBlock } from 'wagmi';
import { formatEther } from 'viem';
import Link from 'next/link';
import {
  Settings, Send, DollarSign, ArrowUpRight, Loader2, AlertCircle,
  CheckCircle, XCircle, Clock, Info, ExternalLink, Ban,
} from 'lucide-react';
import { useCampaign } from '@/lib/useCampaigns';
import { CAMPAIGN_ABI } from '@/lib/contracts';
import toast from 'react-hot-toast';

function trunc(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }

interface MilestoneOnChain {
  title:            string;
  description:      string;
  percentage:       number;
  votes_for:        bigint;
  votes_against:    bigint;
  payout_requested: boolean;
  payout_released:  boolean;
  rejected:         boolean;
}

export default function ManagePage({ params }: { params: Promise<{ address: string }> }) {
  const { address: contractAddress } = use(params);
  const { address: userAddress } = useAccount();

  const { campaign, isLoading } = useCampaign(contractAddress as `0x${string}`);

  // Fetch milestone count then all milestones
  const { data: milestonesRaw, refetch: refetchMilestones } = useReadContracts({
    contracts: Array.from({ length: 10 }, (_, i) => ({
      address:      contractAddress as `0x${string}`,
      abi:          CAMPAIGN_ABI,
      functionName: 'getMilestone' as const,
      args:         [BigInt(i)] as const,
    })),
    query: { enabled: !!contractAddress },
  });

  const milestones: (MilestoneOnChain & { index: number })[] = [];
  if (milestonesRaw) {
    for (let i = 0; i < milestonesRaw.length; i++) {
      const r = milestonesRaw[i];
      if (r?.status === 'success' && Array.isArray(r.result)) {
        const [title, description, percentage, votes_for, votes_against, payout_requested, payout_released, rejected] = r.result as [string, string, number, bigint, bigint, boolean, boolean, boolean];
        if (!title) break; // no more milestones
        milestones.push({ index: i, title, description, percentage, votes_for, votes_against, payout_requested, payout_released, rejected });
      }
    }
  }

  const { writeContract, isPending } = useWriteContract();
  const [lastTx, setLastTx] = useState<`0x${string}` | undefined>();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: lastTx, query: { enabled: !!lastTx } });

  if (txConfirmed && lastTx) {
    toast.success('Transaction confirmed!');
    refetchMilestones();
    setLastTx(undefined);
  }

  const [updateTitle, setUpdateTitle] = useState('');
  const [updateBody,  setUpdateBody]  = useState('');
  const [postingUpdate, setPostingUpdate] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-zinc-900 mb-2">Campaign not found</h2>
          <Link href="/dashboard" className="btn-primary">← Dashboard</Link>
        </div>
      </div>
    );
  }

  const isCreator  = userAddress?.toLowerCase() === campaign.creator.toLowerCase();
  const deadlineMs = Number(campaign.deadline) * 1000;

  // Use the REAL on-chain block timestamp to mirror exactly what the contract checks.
  // Date.now() can diverge from block.timestamp by minutes on testnets — causing
  // false "still active" reverts even when the deadline has visually passed.
  const { data: latestBlock } = useBlock({ watch: true });
  const onChainNow = latestBlock?.timestamp ?? BigInt(Math.floor(Date.now() / 1000));
  const isEnded    = onChainNow >= campaign.deadline;

  // Mirror the exact conditions the smart-contract checks for requestPayout:
  // 1. block.timestamp >= deadline  ("Campaign: still active")
  // 2. goalReached == true          ("Campaign: goal not met")
  const canRequestPayout = isCreator && isEnded && campaign.goalReached;

  const handleRequestPayout = (milestoneIndex: number) => {
    if (!isCreator) {
      toast.error('Only the campaign creator can request a payout.');
      return;
    }
    if (!isEnded) {
      // Show precise on-chain time remaining so user knows exactly when to retry
      const secsLeft = Number(campaign.deadline - onChainNow);
      const hLeft    = Math.floor(secsLeft / 3600);
      const mLeft    = Math.floor((secsLeft % 3600) / 60);
      const timeStr  = hLeft > 0 ? `~${hLeft}h ${mLeft}m` : `~${mLeft}m`;
      toast.error(`Campaign still active on-chain. Deadline in ${timeStr}. Retry after it passes.`);
      return;
    }
    if (!campaign.goalReached) {
      toast.error('Goal not reached. Payouts are only available when the funding goal is met.');
      return;
    }
    writeContract(
      {
        address:      contractAddress as `0x${string}`,
        abi:          CAMPAIGN_ABI,
        functionName: 'requestPayout',
        args:         [BigInt(milestoneIndex)],
      },
      {
        onSuccess: (hash) => {
          setLastTx(hash);
          toast.loading('Payout requested — awaiting confirmation', { id: 'payout-tx' });
        },
        onError: (e) => {
          // Surface readable on-chain revert reasons
          const msg = e.message ?? '';
          if (msg.includes('still active'))  toast.error('The campaign deadline has not passed on-chain yet.');
          else if (msg.includes('goal not met')) toast.error('The funding goal has not been reached on-chain.');
          else if (msg.includes('already requested')) toast.error('Payout already requested for this milestone.');
          else toast.error(msg.slice(0, 120));
        },
      },
    );
  };

  const handlePostUpdate = async () => {
    if (!updateTitle || !updateBody) return;
    setPostingUpdate(true);
    try {
      // Encode as IPFS-style metadata stored on-chain via postUpdate()
      const metadata = JSON.stringify({ title: updateTitle, body: updateBody, timestamp: Date.now() });
      writeContract(
        {
          address:      contractAddress as `0x${string}`,
          abi:          CAMPAIGN_ABI,
          functionName: 'postUpdate',
          args:         [metadata] as [string], // explicit cast: postUpdate takes string, not bigint like requestPayout
        },
        {
          onSuccess: (hash) => {
            setLastTx(hash);
            setUpdateTitle('');
            setUpdateBody('');
            toast.success('Update posted on-chain!');
          },
          onError: (e) => toast.error(e.message.slice(0, 120)),
        },
      );
    } finally {
      setPostingUpdate(false);
    }
  };

  const raisedEth   = Number(formatEther(campaign.balance));
  const goalEth     = Number(formatEther(campaign.goal));
  const progressPct = goalEth > 0 ? Math.min(100, (raisedEth / goalEth) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-28 pb-20">
      {/* Suspended banner */}
      {campaign.suspended && (
        <div className="flex items-start gap-3 p-4 mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl">
          <Ban className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Campaign Suspended</div>
            <div className="text-sm mt-0.5">
              This campaign has been suspended by the platform and is not visible to the public.
              {campaign.suspendedReason && <span> Reason: <em>{campaign.suspendedReason}</em></span>}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Settings className="w-4 h-4 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Campaign Management</span>
            </div>
            <h1 className="text-3xl font-bold text-zinc-900" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.03em' }}>
              {campaign.title}
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              Creator: <span className="font-mono text-zinc-400">{trunc(campaign.creator)}</span>
              <span className="mx-2">·</span>
              <span className={`font-semibold ${campaign.status === 'Active' ? 'text-emerald-600' : campaign.status === 'Funded' ? 'text-sky-600' : 'text-zinc-500'}`}>
                {campaign.status}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/campaign/${contractAddress}`}>
              <button className="btn-secondary flex items-center gap-2 text-sm py-2 px-4">
                View Public Page <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {[
            { label: 'Total Raised',   value: `${raisedEth.toFixed(3)} ETH` },
            { label: 'Goal',           value: `${goalEth.toFixed(2)} ETH` },
            { label: 'Backers',        value: campaign.backerCount.toString() },
            { label: '% Funded',       value: `${Math.round(progressPct)}%` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-zinc-200 p-4">
              <div className="text-xl font-bold text-zinc-900 mb-0.5" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{value}</div>
              <div className="text-xs text-zinc-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mt-4 bg-zinc-100 h-2 rounded-full overflow-hidden">
          <div className="h-full bg-zinc-900 transition-all duration-700" style={{ width: `${progressPct}%` }} />
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-7">
        {/* LEFT — actions */}
        <div className="lg:col-span-2 space-y-6">

          {/* Payout conditions info */}
          {isCreator && (
            <div className={`p-4 border text-sm ${canRequestPayout ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              <div className="font-semibold mb-2 flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0" />
                Payout Conditions
              </div>
              <ul className="space-y-1 text-xs">
                <li className="flex items-center gap-2">
                  {isEnded ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Clock className="w-3.5 h-3.5 text-amber-500" />}
                  Campaign deadline passed {!isEnded && `(${campaign.daysLeft}d remaining)`}
                </li>
                <li className="flex items-center gap-2">
                  {campaign.goalReached ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                  Funding goal reached ({Math.round(progressPct)}% funded)
                </li>
              </ul>
              {!canRequestPayout && (
                <p className="text-xs mt-2 opacity-80">
                  Both conditions must be met before requesting a payout.
                </p>
              )}
            </div>
          )}

          {/* Milestones — request payout */}
          <div className="bg-white border border-zinc-200 p-6">
            <h2 className="font-bold text-zinc-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              <DollarSign className="w-4 h-4 text-emerald-500" />
              Milestones &amp; Payouts
            </h2>

            {/* How payout works */}
            <div className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 p-3 rounded-lg mb-4 leading-relaxed">
              <strong>How it works:</strong> Once the campaign ends and the goal is reached, request a payout for each milestone.
              Backers vote to approve or reject. When &gt;50% of contributed ETH votes approve, funds are released automatically
              to your wallet (minus 2.5% platform fee).
            </div>

            <div className="space-y-3">
              {milestones.map(m => {
                const milestoneEth  = (m.percentage / 100) * raisedEth;
                const totalVotes    = m.votes_for + m.votes_against;
                const approvalPct   = totalVotes > 0n ? Number((m.votes_for * 100n) / totalVotes) : 0;
                const netPayout     = milestoneEth * 0.975; // after 2.5% fee

                return (
                  <div key={m.index} className={`border p-4 ${
                    m.payout_released ? 'border-emerald-200 bg-emerald-50' :
                    m.rejected        ? 'border-red-200 bg-red-50' :
                    m.payout_requested ? 'border-amber-200 bg-amber-50' :
                    'border-zinc-200'
                  }`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-sm font-semibold text-zinc-900">{m.title}</span>
                        <span className="text-xs text-zinc-400 ml-2">({m.percentage}%)</span>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 border uppercase tracking-wide shrink-0 ${
                        m.payout_released ? 'bg-emerald-100 border-emerald-200 text-emerald-700' :
                        m.rejected        ? 'bg-red-100 border-red-200 text-red-700' :
                        m.payout_requested ? 'bg-amber-100 border-amber-200 text-amber-700' :
                        'bg-zinc-100 border-zinc-200 text-zinc-500'
                      }`}>
                        {m.payout_released ? 'Released' : m.rejected ? 'Rejected' : m.payout_requested ? 'Voting' : 'Pending'}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-500 mb-3">
                      Funds: ~{milestoneEth.toFixed(4)} ETH → You receive: ~{netPayout.toFixed(4)} ETH (after 2.5% fee)
                    </div>

                    {m.payout_requested && !m.payout_released && !m.rejected && (
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-zinc-500 mb-1">
                          <span>Backer approval</span>
                          <span>{approvalPct}%</span>
                        </div>
                        <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${approvalPct}%` }} />
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">Releases automatically when &gt;50% of ETH approves</p>
                      </div>
                    )}

                    {isCreator && canRequestPayout && !m.payout_requested && !m.payout_released && !m.rejected && (
                      <button
                        onClick={() => handleRequestPayout(m.index)}
                        disabled={isPending}
                        className="w-full py-2 text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Submitting…</> : 'Request Payout'}
                      </button>
                    )}

                    {m.payout_released && (
                      <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold">
                        <CheckCircle className="w-3.5 h-3.5" /> Funds released to creator
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Post Update */}
          {isCreator && (
            <div className="bg-white border border-zinc-200 p-6">
              <h2 className="font-bold text-zinc-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                <Send className="w-4 h-4 text-sky-500" />
                Post an Update
              </h2>
              <div className="space-y-3">
                <input
                  id="update-title"
                  className="input-crypto"
                  placeholder="Update title"
                  value={updateTitle}
                  onChange={e => setUpdateTitle(e.target.value)}
                />
                <textarea
                  id="update-body"
                  className="input-crypto resize-none"
                  rows={4}
                  placeholder="Share progress with your backers…"
                  value={updateBody}
                  onChange={e => setUpdateBody(e.target.value)}
                />
                <button
                  onClick={handlePostUpdate}
                  disabled={postingUpdate || isPending || !updateTitle || !updateBody}
                  className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                >
                  {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</> : 'Post Update On-Chain'}
                </button>
                <p className="text-xs text-center text-zinc-400">Update metadata is stored on-chain via the Campaign contract.</p>
              </div>
            </div>
          )}

          {!isCreator && (
            <div className="bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Connect with the creator wallet to manage this campaign.
            </div>
          )}
        </div>

        {/* RIGHT — on-chain details */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white border border-zinc-200 p-6">
            <h2 className="font-bold text-zinc-900 mb-4" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              On-Chain Details
            </h2>
            <div className="space-y-0 divide-y divide-zinc-100">
              {[
                { label: 'Contract',   value: contractAddress, mono: true },
                { label: 'Creator',    value: campaign.creator, mono: true },
                { label: 'Goal',       value: `${goalEth.toFixed(4)} ETH` },
                { label: 'Raised',     value: `${raisedEth.toFixed(4)} ETH` },
                { label: 'Backers',    value: campaign.backerCount.toString() },
                { label: 'Deadline',   value: new Date(Number(campaign.deadline) * 1000).toLocaleString() },
                { label: 'Goal Reached', value: campaign.goalReached ? 'Yes ✅' : 'No' },
                { label: 'Cancelled',  value: campaign.cancelled ? 'Yes' : 'No' },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between items-center py-3 gap-4">
                  <span className="text-sm text-zinc-500 shrink-0">{label}</span>
                  <span className={`text-sm font-medium text-zinc-900 text-right truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
                </div>
              ))}
            </div>
            <a
              href={`https://sepolia.etherscan.io/address/${contractAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 mt-4 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View on Etherscan
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
