'use client';
import { use } from 'react';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import {
  ExternalLink, Users, Clock, Shield, Share2,
  AlertCircle, CheckCircle, Loader2, RefreshCw,
  XCircle, Zap, Settings, ChevronDown, ChevronUp,
} from 'lucide-react';
import Link from 'next/link';
import { formatEther } from 'viem';
import toast from 'react-hot-toast';
import { useCampaign } from '@/lib/useCampaigns';
import { CAMPAIGN_ABI } from '@/lib/contracts';
import { ContributeModal } from '@/components/ui/ContributeModal';
import { TxHashBadge } from '@/components/ui/TxHashBadge';
import { formatEthSmart } from '@/lib/utils';

type Tab = 'overview' | 'milestones' | 'refund' | 'support';
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
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variant === 'primary' ? 'btn-primary'
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
    address: campaignAddress,
    abi: CAMPAIGN_ABI,
    functionName: 'getMilestone',
    args: [BigInt(index)],
  });

  if (!milestoneRaw || !Array.isArray(milestoneRaw)) {
    return <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />;
  }

  // New contract: getMilestone returns (title, description, percentage, released)
  const [title, desc, percentage, released] =
    milestoneRaw as [string, string, number, boolean];

  const stateTag = released
    ? { label: 'Released', cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' }
    : { label: 'Pending', cls: 'bg-slate-100 border-slate-200 text-slate-500' };

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

// ─── Support Tab ─────────────────────────────────────────────────────────────
function SupportTab({
  campaignAddress,
  userAddress,
}: {
  campaignAddress: string;
  userAddress: `0x${string}` | undefined;
}) {
  const [message, setMessage] = useState('');
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [pollState, setPollState] = useState<'idle' | 'submitting' | 'polling' | 'done' | 'escalated' | 'error' | 'timeout'>('idle');
  const [response, setResponse] = useState<string | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  // Past tickets
  const [pastTickets, setPastTickets]       = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);

  const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_BACKEND_URL ?? 'http://localhost:8001';

  const fetchPastTickets = useCallback(async () => {
    if (!userAddress) return;
    setLoadingTickets(true);
    try {
      const res = await fetch(`${AGENT_URL}/donor-support/my-tickets?donor_address=${userAddress}`);
      if (res.ok) setPastTickets(await res.json());
    } catch { /* backend offline */ }
    finally { setLoadingTickets(false); }
  }, [userAddress, AGENT_URL]);

  useEffect(() => { fetchPastTickets(); }, [fetchPastTickets]);

  const submit = async () => {
    if (!message.trim() || !userAddress) {
      toast.error('Connect your wallet and enter a message first.');
      return;
    }
    setPollState('submitting');
    try {
      const res = await fetch(`${AGENT_URL}/donor-support/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donor_address: userAddress,
          campaign_address: campaignAddress,
          message: message.trim(),
        }),
      });
      if (!res.ok) throw new Error(`Agent responded ${res.status}`);
      const data = await res.json();
      setTicketId(data.ticket_id);
      setPollState('polling');
      setPollCount(0);

      // Poll every 3 seconds for up to 5 minutes
      let attempts = 0;
      const MAX = 100;
      const poll = async () => {
        if (attempts++ > MAX) { setPollState('timeout'); return; }
        setPollCount(attempts);
        const r = await fetch(`${AGENT_URL}/donor-support/ticket/${data.ticket_id}`);
        if (!r.ok) { setPollState('error'); return; }
        const t = await r.json();
        setIntent(t.intent);
        if (t.status === 'closed' || t.status === 'resolved') {
          setResponse(t.final_response || t.draft_response || 'No response generated.');
          setPollState('done');
          fetchPastTickets();
        } else if (t.status === 'escalated') {
          setResponse(t.draft_response);
          setPollState('escalated');
          fetchPastTickets();
        } else if (t.status === 'error') {
          setPollState('error');
        } else {
          setTimeout(poll, 3000);
        }
      };
      setTimeout(poll, 3000);
    } catch {
      setPollState('error');
    }
  };

  const INTENT_LABELS: Record<string, string> = {
    refund_request: 'Refund Request',
    status_inquiry: 'Status Inquiry',
    fraud_report: 'Fraud Report',
    general_question: 'General Question',
  };

  const STATUS_STYLES: Record<string, string> = {
    resolved:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    closed:    'bg-emerald-50 text-emerald-700 border-emerald-200',
    escalated: 'bg-amber-50 text-amber-700 border-amber-200',
    running:   'bg-sky-50 text-sky-700 border-sky-200',
    open:      'bg-zinc-50 text-zinc-600 border-zinc-200',
    error:     'bg-red-50 text-red-600 border-red-200',
  };


  return (
    <div className="space-y-5">
      {/* ── Compose new ticket ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
      <h3 className="font-bold text-slate-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
        Contact Support
      </h3>
      <p className="text-sm text-slate-500">
        Our AI support agent will review your message, check your contribution data, and reply in seconds.
        Fraud reports and complex cases are escalated to our team.
      </p>

      {pollState === 'idle' || pollState === 'submitting' ? (
        <div className="space-y-3">
          <textarea
            className="input-crypto resize-none w-full"
            rows={4}
            placeholder="e.g. Where did my money go? / I want a refund / This looks like a scam…"
            value={message}
            onChange={e => setMessage(e.target.value)}
            disabled={pollState === 'submitting'}
          />
          <button
            onClick={submit}
            disabled={pollState === 'submitting' || !message.trim() || !userAddress}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {!userAddress ? (
              <>Connect Wallet First</>
            ) : pollState === 'submitting' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            ) : (
              <><Zap className="w-4 h-4" /> Send to AI Support</>
            )}
          </button>
        </div>
      ) : pollState === 'polling' ? (
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 text-sm text-sky-600 font-semibold mb-1">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>AI is analysing your request…</span>
          </div>
          
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <motion.div 
              className="bg-sky-500 h-2.5 rounded-full" 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(95, (pollCount / 100) * 100)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="text-xs text-slate-500">
            This may take a few minutes as the AI reviews your transaction data and platform policies.
          </p>
          
          {ticketId && <p className="text-[11px] text-slate-400 font-mono mt-2">Ticket: {ticketId}</p>}
        </div>
      ) : pollState === 'timeout' ? (
        <div className="space-y-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2 text-red-600 font-bold">
            <AlertCircle className="w-5 h-5" />
            <span>AI Generation Timeout</span>
          </div>
          <p className="text-sm text-red-700">
            The AI is taking longer than expected to process your request. Your ticket has been logged and the AI is still working on it in the background. Please refresh the page in a few minutes.
          </p>
          <button onClick={() => setPollState('idle')} className="btn-primary w-full mt-2 bg-red-600 hover:bg-red-700 border-none">Dismiss</button>
        </div>
      ) : pollState === 'done' ? (
        <div className="space-y-4">
          {intent && (
            <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700">
              {INTENT_LABELS[intent] ?? intent}
            </span>
          )}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" /> AI Response
            </p>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{response}</p>
          </div>
          <button onClick={() => { setPollState('idle'); setMessage(''); setTicketId(null); setResponse(null); setIntent(null); }}
            className="text-xs text-sky-600 hover:underline">
            Ask another question
          </button>
        </div>
      ) : pollState === 'escalated' ? (
        <div className="space-y-4">
          {intent && (
            <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700">
              {INTENT_LABELS[intent] ?? intent} — Escalated to Human
            </span>
          )}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Escalated for Human Review
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              {response
                ? <span className="whitespace-pre-wrap">{response}</span>
                : 'Your case has been flagged for manual review by our team. We will reach out shortly.'
              }
            </p>
          </div>
          {ticketId && <p className="text-[11px] text-slate-400 font-mono">Ticket ID: {ticketId}</p>}
        </div>
      ) : (
        <div className="flex items-start gap-2 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Support unavailable</div>
            Agent backend is offline. Please try again later or email support@kickstartcrypto.app
          </div>
        </div>
      )}
      </div>

      {/* ── Past Tickets ── */}
      {userAddress && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 text-sm" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              Your Past Tickets
            </h3>
            <button onClick={fetchPastTickets} className="p-1.5 border border-zinc-200 hover:border-zinc-400 text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {loadingTickets ? (
            <div className="flex items-center gap-2 text-xs text-zinc-400 py-4">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading tickets...
            </div>
          ) : pastTickets.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-6">No support tickets yet.</p>
          ) : (
            <div className="space-y-2">
              {pastTickets.map((t) => (
                <div key={t.id} className="border border-zinc-100 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedTicket(expandedTicket === t.id ? null : t.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-700 font-medium truncate">{t.message}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {t.intent && <span className="ml-2 text-zinc-500">{INTENT_LABELS[t.intent] ?? t.intent}</span>}
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_STYLES[t.status] ?? STATUS_STYLES.open}`}>
                      {t.status}
                    </span>
                    {expandedTicket === t.id
                      ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      : <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                  </button>

                  {expandedTicket === t.id && (
                    <div className="px-4 pb-4 pt-1 border-t border-zinc-100 space-y-2">
                      {(t.final_response || t.draft_response) ? (
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-[10px] font-semibold text-slate-500 mb-1">AI Response</p>
                          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {t.final_response || t.draft_response}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-400 italic">No response yet.</p>
                      )}
                      {t.escalation_reason && (
                        <div className="bg-amber-50 rounded-lg p-3">
                          <p className="text-[10px] font-semibold text-amber-600 mb-1">Escalation Reason</p>
                          <p className="text-xs text-amber-800">{t.escalation_reason}</p>
                        </div>
                      )}
                      <p className="text-[10px] text-zinc-400 font-mono">ID: {t.id}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
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

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [contributeOpen, setContributeOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [actionPending, setActionPending] = useState(false);

  const refresh = () => setRefreshKey(k => k + 1);

  const { writeContract } = useWriteContract({
    mutation: {
      onSuccess: (h) => { setTxHash(h); setActionPending(true); toast.loading('Tx submitted!', { id: 'tx-toast' }); },
      onError: (e) => { setActionPending(false); toast.error(e.message.slice(0, 100)); },
    },
  });
  const { isSuccess: actionSuccess } = useWaitForTransactionReceipt({ hash: txHash, query: { enabled: !!txHash } });
  useEffect(() => {
    if (actionSuccess) { setActionPending(false); toast.success('Confirmed on-chain!'); refresh(); }
  }, [actionSuccess]);

  // Read milestone count
  const { data: milestoneCount } = useReadContract({
    address: addr,
    abi: CAMPAIGN_ABI,
    functionName: 'getMilestoneCount',
  });

  // Read user contribution — poll every 6s so it updates after a pending tx confirms
  const { data: myContribution } = useReadContract({
    address: addr,
    abi: CAMPAIGN_ABI,
    functionName: 'contributions',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress, refetchInterval: 6_000 },
  });

  const milestones = Array.from({ length: Number(milestoneCount ?? 0) }, (_, i) => i);
  const isCreator = campaign && userAddress
    ? campaign.creator.toLowerCase() === userAddress.toLowerCase()
    : false;
  const myContribEth = myContribution ? Number(formatEther(myContribution as bigint)) : 0;
  const isBacker = myContribEth > 0;
  const canClaimRefund =
    isBacker &&
    campaign &&
    (campaign.cancelled || (campaign.status === 'Failed'));

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="w-10 h-10 animate-spin text-zinc-900" />
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
    Active: 'bg-zinc-900 border-zinc-900 text-white',
    Funded: 'bg-zinc-100 border-zinc-200 text-zinc-900',
    Settled: 'bg-zinc-100 border-zinc-200 text-zinc-900',
    Failed: 'bg-white border-zinc-200 text-zinc-500',
    Ended: 'bg-zinc-100 border-zinc-200 text-zinc-500',
    Cancelled: 'bg-white border-zinc-200 text-zinc-500',
  };

  return (
    <div className="min-h-screen">
      {/* Hero banner */}
      <div className="relative h-64 sm:h-80 overflow-hidden bg-zinc-100 flex items-center justify-center">
        {campaign.imageUrl ? (
          <img
            src={campaign.imageUrl}
            alt={campaign.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full opacity-[0.03] flex flex-wrap gap-4 p-8 justify-center items-center">
            {[...Array(60)].map((_, i) => (
              <div key={i} className="w-8 h-8 rounded-full bg-black" />
            ))}
          </div>
        )}
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
                    <p className="text-xs text-slate-500">
                      {campaign.creatorName ? campaign.creatorName : 'Creator'}
                      {campaign.createdAt && ` • ${new Date(campaign.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                    </p>
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
                  {isCreator && (
                    <Link
                      href={`/manage/${addr}`}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-300 transition-all text-xs font-semibold"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Manage Campaign
                    </Link>
                  )}
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
                { id: 'overview' as Tab, label: 'Overview' },
                { id: 'milestones' as Tab, label: `Milestones (${milestones.length})` },
                { id: 'refund' as Tab, label: 'Refunds' },
                { id: 'support' as Tab, label: 'Support' },
              ]).map(({ id, label }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap -mb-px ${activeTab === id
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
                      {isCreator ? (
                        <p className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                          👋 <strong>You are the Creator!</strong> To unlock your funds for these milestones, please go to your <Link href={`/manage/${addr}`} className="underline font-semibold">Manage Dashboard</Link> and upload your proof documents.
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
                          📋 Milestones are informational. To receive funds, the Creator must go to their <strong>Manage Dashboard</strong> and submit proof of deliverables.
                        </p>
                      )}
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

              {/* ── SUPPORT TAB ── */}
              {activeTab === 'support' && (
                <SupportTab campaignAddress={addr} userAddress={userAddress} />
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
                      <div className="text-3xl font-black text-zinc-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
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
                  <div className="h-1 bg-zinc-100 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, campaign.progressPercent)}%` }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                      className="h-full bg-zinc-900"
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
                ) : canClaimRefund ? (
                  <button onClick={() => {
                    setActiveTab('refund');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                    className="w-full py-3.5 rounded-xl text-center text-base font-semibold bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm transition-all flex items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5" /> Claim Your Refund
                  </button>
                ) : (
                  <div className={`w-full py-3 rounded-xl text-center text-sm font-semibold ${campaign.goalReached
                    ? 'bg-zinc-100 border border-zinc-200 text-zinc-900'
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
