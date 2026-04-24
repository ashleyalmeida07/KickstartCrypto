'use client';

import { useState, use, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useWriteContract, useReadContracts, useWaitForTransactionReceipt, useBlock } from 'wagmi';
import { formatEther } from 'viem';
import Link from 'next/link';
import {
  Settings, Send, DollarSign, ArrowUpRight, Loader2, AlertCircle,
  CheckCircle, XCircle, Clock, Info, ExternalLink, Ban, Zap, RotateCcw,
} from 'lucide-react';
import { useCampaign } from '@/lib/useCampaigns';
import { CAMPAIGN_ABI } from '@/lib/contracts';
import toast from 'react-hot-toast';

function trunc(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }

interface MilestoneOnChain {
  title:       string;
  description: string;
  percentage:  number;
  released:    boolean;
  index:       number;
}

export default function ManagePage({ params }: { params: Promise<{ address: string }> }) {
  const { address: contractAddress } = use(params);
  const { address: userAddress }     = useAccount();

  const { campaign, isLoading } = useCampaign(contractAddress as `0x${string}`);

  // Fetch milestones (up to 10)
  const { data: milestonesRaw, refetch: refetchMilestones } = useReadContracts({
    contracts: Array.from({ length: 10 }, (_, i) => ({
      address:      contractAddress as `0x${string}`,
      abi:          CAMPAIGN_ABI,
      functionName: 'getMilestone' as const,
      args:         [BigInt(i)] as const,
    })),
    query: { enabled: !!contractAddress },
  });

  const milestones: MilestoneOnChain[] = [];
  if (milestonesRaw) {
    for (let i = 0; i < milestonesRaw.length; i++) {
      const r = milestonesRaw[i];
      if (r?.status === 'success' && Array.isArray(r.result)) {
        const [title, description, percentage, released] =
          r.result as [string, string, number, boolean];
        if (!title) break;
        milestones.push({ index: i, title, description, percentage, released });
      }
    }
  }

  const { writeContract, isPending } = useWriteContract();
  const [lastTx, setLastTx] = useState<`0x${string}` | undefined>();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: lastTx, query: { enabled: !!lastTx } });

  useEffect(() => {
    if (txConfirmed && lastTx) {
      toast.dismiss();
      toast.success('Transaction confirmed!');
      refetchMilestones();
      setLastTx(undefined);
    }
  }, [txConfirmed, lastTx, refetchMilestones]);

  const [updateTitle, setUpdateTitle] = useState('');
  const [updateBody,  setUpdateBody]  = useState('');
  const [postingUpdate, setPostingUpdate] = useState(false);

  // ── On-chain clock ──────────────────────────────────────────────────────────
  const { data: latestBlock } = useBlock({ watch: true });
  const onChainNow = latestBlock?.timestamp ?? BigInt(Math.floor(Date.now() / 1000));

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

  const isCreator   = userAddress?.toLowerCase() === campaign.creator.toLowerCase();
  const isEnded     = onChainNow >= campaign.deadline;
  const secsLeft    = isEnded ? 0 : Number(campaign.deadline - onChainNow);
  const hLeft       = Math.floor(secsLeft / 3600);
  const mLeft       = Math.floor((secsLeft % 3600) / 60);
  const sLeft       = secsLeft % 60;
  const countdown   = secsLeft > 0 ? `${hLeft}h ${mLeft}m ${sLeft}s` : 'Deadline passed';

  // Settle is available if: goal reached (immediate) OR deadline passed
  const canSettle      = (campaign.goalReached || isEnded) && !campaign.settled && !campaign.cancelled;
  const canClaimRefund = (campaign.settled || isEnded) && !campaign.goalReached && !campaign.cancelled;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSettle = () => {
    if (!canSettle) return;
    writeContract(
      {
        address:      contractAddress as `0x${string}`,
        abi:          CAMPAIGN_ABI,
        functionName: 'settle',
        args:         [],
      },
      {
        onSuccess: (hash) => {
          setLastTx(hash);
          toast.loading(
            campaign.goalReached
              ? 'Settling — sending funds to creator…'
              : 'Settling — refunding all backers…',
            { id: 'settle-tx' },
          );
          // Notify backend to update DB status + send email
          fetch('/api/campaigns/settle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contractAddress,
              totalContributed: campaign.totalContributed.toString(),
              goalReached: campaign.goalReached,
            }),
          }).catch(e => console.warn('[settle API]', e));
        },
        onError: (e) => {
          const msg = e.message ?? '';
          if (msg.includes('still active')) toast.error('Campaign deadline has not passed on-chain yet.');
          else if (msg.includes('already settled')) toast.error('Campaign already settled.');
          else toast.error(msg.slice(0, 120));
        },
      },
    );
  };

  const handleClaimRefund = () => {
    writeContract(
      {
        address:      contractAddress as `0x${string}`,
        abi:          CAMPAIGN_ABI,
        functionName: 'claimRefund',
        args:         [],
      },
      {
        onSuccess: (hash) => { setLastTx(hash); toast.loading('Refund submitted…', { id: 'refund-tx' }); },
        onError: (e) => {
          const msg = e.message ?? '';
          if (msg.includes('nothing to refund')) toast.error('No contribution found for your wallet.');
          else if (msg.includes('goal reached'))  toast.error('Campaign reached its goal — no refunds available.');
          else toast.error(msg.slice(0, 120));
        },
      },
    );
  };

  const handleCancel = () => {
    writeContract(
      {
        address:      contractAddress as `0x${string}`,
        abi:          CAMPAIGN_ABI,
        functionName: 'cancel',
        args:         [],
      },
      {
        onSuccess: (hash) => { setLastTx(hash); toast.loading('Cancellation submitted…', { id: 'cancel-tx' }); },
        onError:   (e)    => toast.error(e.message.slice(0, 120)),
      },
    );
  };

  const handlePostUpdate = async () => {
    if (!updateTitle || !updateBody) return;
    setPostingUpdate(true);
    try {
      const metadata = JSON.stringify({ title: updateTitle, body: updateBody, timestamp: Date.now() });
      writeContract(
        {
          address:      contractAddress as `0x${string}`,
          abi:          CAMPAIGN_ABI,
          functionName: 'postUpdate',
          args:         [metadata] as [string],
        },
        {
          onSuccess: (hash) => { setLastTx(hash); setUpdateTitle(''); setUpdateBody(''); toast.success('Update posted!'); },
          onError:   (e)    => toast.error(e.message.slice(0, 120)),
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
        <div className="flex items-start gap-3 p-4 mb-6 bg-red-50 border border-red-200 text-red-700">
          <Ban className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Campaign Suspended</div>
            <div className="text-sm mt-0.5">
              This campaign has been suspended and is hidden from the public.
              {campaign.suspendedReason && <span> Reason: <em>{campaign.suspendedReason}</em></span>}
            </div>
          </div>
        </div>
      )}

      {/* Settled banner */}
      {campaign.settled && (
        <div className={`flex items-start gap-3 p-4 mb-6 border ${
          campaign.goalReached
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-zinc-50 border-zinc-200 text-zinc-700'
        }`}>
          <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Campaign Settled</div>
            <div className="text-sm mt-0.5">
              {campaign.goalReached
                ? 'Funds have been automatically sent to the creator (minus 2.5% platform fee).'
                : 'Goal was not reached. All backers have been automatically refunded.'}
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
              <span className={`font-semibold ${
                campaign.status === 'Active'   ? 'text-emerald-600' :
                campaign.status === 'Funded'   ? 'text-sky-600' :
                campaign.status === 'Settled'  ? 'text-emerald-700' :
                campaign.status === 'Failed'   ? 'text-red-600' :
                'text-zinc-500'
              }`}>{campaign.status}</span>
            </p>
          </div>
          <Link href={`/campaign/${contractAddress}`}>
            <button className="btn-secondary flex items-center gap-2 text-sm py-2 px-4">
              View Public Page <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {[
            { label: 'Total Raised', value: `${raisedEth.toFixed(3)} ETH` },
            { label: 'Goal',         value: `${goalEth.toFixed(2)} ETH` },
            { label: 'Backers',      value: campaign.backerCount.toString() },
            { label: '% Funded',     value: `${Math.round(progressPct)}%` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-zinc-200 p-4">
              <div className="text-xl font-bold text-zinc-900 mb-0.5" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{value}</div>
              <div className="text-xs text-zinc-500">{label}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 bg-zinc-100 h-2 overflow-hidden">
          <div className="h-full bg-zinc-900 transition-all duration-700" style={{ width: `${progressPct}%` }} />
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-7">
        {/* LEFT — actions */}
        <div className="lg:col-span-2 space-y-5">

          {/* ── Live On-Chain Clock ── */}
          <div className="border border-zinc-200 bg-white p-5 text-xs space-y-2">
            <div className="font-semibold text-zinc-700 flex items-center gap-2 mb-3">
              <Zap className="w-3.5 h-3.5 text-sky-500" /> Live On-Chain State
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Block timestamp</span>
              <span className="font-mono text-zinc-800">{onChainNow.toString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Deadline</span>
              <span className="font-mono text-zinc-800">{campaign.deadline.toString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Time remaining</span>
              <span className={`font-semibold ${isEnded ? 'text-emerald-600' : 'text-amber-600'}`}>
                {isEnded ? '✓ Deadline passed' : countdown}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Goal reached</span>
              <span className={campaign.goalReached ? 'text-emerald-600 font-semibold' : 'text-zinc-500'}>
                {campaign.goalReached ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Settled</span>
              <span className={campaign.settled ? 'text-emerald-600 font-semibold' : 'text-zinc-500'}>
                {campaign.settled ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          {/* ── Settle button — the main action ── */}
          {canSettle && (
            <div className={`border p-5 ${campaign.goalReached ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-start gap-2 mb-3">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-zinc-500" />
                <p className="text-xs text-zinc-600 leading-relaxed">
                  {campaign.goalReached
                    ? <><strong>Goal reached!</strong> Calling settle() will automatically send <strong>{(raisedEth * 0.975).toFixed(4)} ETH</strong> to your wallet and 2.5% fee to the platform treasury.</>
                    : <><strong>Goal not reached.</strong> Calling settle() will automatically refund <strong>all {campaign.backerCount.toString()} backers</strong> their full contribution.</>
                  }
                  {' '}Anyone can trigger this.
                </p>
              </div>
              <button
                onClick={handleSettle}
                disabled={isPending}
                className={`w-full py-3 text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                  campaign.goalReached
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-zinc-900 hover:bg-zinc-700 text-white'
                }`}
              >
                {isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                  : <><Zap className="w-4 h-4" /> {campaign.goalReached ? 'Settle — Receive Funds' : 'Settle — Refund Backers'}</>
                }
              </button>
            </div>
          )}

          {/* ── Not yet ended info ── */}
          {!isEnded && !campaign.settled && !campaign.cancelled && (
            <div className="border border-amber-200 bg-amber-50 p-4 text-sm">
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-800 mb-1">Campaign still active</div>
                  <div className="text-xs text-amber-700">
                    settle() becomes available when the countdown reaches zero.
                    Anyone — creator, backer, or platform — can call it once the deadline passes.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Individual refund fallback ── */}
          {canClaimRefund && (
            <div className="bg-red-50 border border-red-200 p-5">
              <h2 className="font-bold text-red-800 mb-2 flex items-center gap-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                <RotateCcw className="w-4 h-4" /> Claim Individual Refund
              </h2>
              <p className="text-xs text-red-700 mb-4 leading-relaxed">
                If settle() was already called but your refund failed (e.g. smart-contract wallet), claim it here.
              </p>
              <button
                onClick={handleClaimRefund}
                disabled={isPending}
                className="w-full py-2.5 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Processing…</> : <><RotateCcw className="w-3.5 h-3.5" />Claim My Refund</>}
              </button>
            </div>
          )}

          {/* ── Milestones display (informational) ── */}
          {milestones.length > 0 && (
            <div className="bg-white border border-zinc-200 p-6">
              <h2 className="font-bold text-zinc-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                <DollarSign className="w-4 h-4 text-emerald-500" />
                Milestones
              </h2>
              <div className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 p-3 mb-4 leading-relaxed">
                Milestones are <strong>informational</strong>. Funds are released automatically when you call Settle after the deadline.
              </div>
              <div className="space-y-3">
                {milestones.map(m => {
                  const milestoneEth = (m.percentage / 100) * raisedEth;
                  return (
                    <div key={m.index} className={`border p-4 ${m.released ? 'border-emerald-200 bg-emerald-50' : 'border-zinc-200'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-sm font-semibold text-zinc-900">{m.title}</span>
                          <span className="text-xs text-zinc-400 ml-2">({m.percentage}%)</span>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 border uppercase tracking-wide shrink-0 ${
                          m.released ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-zinc-100 border-zinc-200 text-zinc-500'
                        }`}>
                          {m.released ? 'Released' : 'Pending'}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        ~{milestoneEth.toFixed(4)} ETH (after 2.5% fee: ~{(milestoneEth * 0.975).toFixed(4)} ETH)
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Cancel campaign ── */}
          {isCreator && !isEnded && !campaign.settled && !campaign.cancelled && (
            <div className="border border-red-100 p-4">
              <h3 className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5" /> Cancel Campaign
              </h3>
              <p className="text-xs text-zinc-500 mb-3">
                Cancelling before the deadline will auto-refund all backers immediately.
              </p>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="w-full py-2 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {isPending ? 'Submitting…' : 'Cancel & Refund All Backers'}
              </button>
            </div>
          )}

          {/* ── Post Update ── */}
          {isCreator && (
            <div className="bg-white border border-zinc-200 p-6">
              <h2 className="font-bold text-zinc-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                <Send className="w-4 h-4 text-sky-500" />
                Post an Update
              </h2>
              <div className="space-y-3">
                <input
                  id="update-title"
                  className="input-crypto placeholder:text-zinc-500"
                  placeholder="Update title"
                  value={updateTitle}
                  onChange={e => setUpdateTitle(e.target.value)}
                />
                <textarea
                  id="update-body"
                  className="input-crypto resize-none placeholder:text-zinc-500"
                  rows={4}
                  placeholder="Share progress with your backers…"
                  value={updateBody}
                  onChange={e => setUpdateBody(e.target.value)}
                />
                <button
                  onClick={handlePostUpdate}
                  disabled={postingUpdate || isPending || !updateTitle || !updateBody}
                  className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</> : 'Post Update On-Chain'}
                </button>
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
                { label: 'Contract',      value: contractAddress,                                                  mono: true  },
                { label: 'Creator',       value: campaign.creator,                                                 mono: true  },
                { label: 'Goal',          value: `${goalEth.toFixed(4)} ETH` },
                { label: 'Raised',        value: `${raisedEth.toFixed(4)} ETH` },
                { label: 'Backers',       value: campaign.backerCount.toString() },
                { label: 'Block Time',    value: new Date(Number(onChainNow) * 1000).toLocaleTimeString() },
                { label: 'Deadline',      value: new Date(Number(campaign.deadline) * 1000).toLocaleString() },
                { label: 'Goal Reached',  value: campaign.goalReached ? 'Yes' : 'No' },
                { label: 'Settled',       value: campaign.settled     ? 'Yes' : 'No' },
                { label: 'Cancelled',     value: campaign.cancelled   ? 'Yes' : 'No' },
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
              <ExternalLink className="w-3.5 h-3.5" /> View on Etherscan
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
