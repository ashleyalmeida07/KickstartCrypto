'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  ShieldAlert, Search, Ban, CheckCircle2, ExternalLink,
  Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronUp,
  Users, TrendingUp, Activity, Lock,
} from 'lucide-react';
import { formatEther } from 'viem';

interface AdminCampaign {
  id:                string;
  contract_address:  string;
  title:             string;
  category:          string;
  status:            string;
  suspended:         boolean;
  suspended_at:      string | null;
  suspended_reason:  string | null;
  creator_address:   string;
  creator_name:      string | null;
  goal_wei:          string;
  total_contributed_wei: string;
  backer_count:      number;
  created_at:        string;
}

const ADMIN_ADDRESSES = (process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESSES ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);

function isAdminWallet(addr?: string) {
  return !!addr && ADMIN_ADDRESSES.includes(addr.toLowerCase());
}

function trunc(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }
function fmtEth(wei: string)  { return Number(formatEther(BigInt(wei || '0'))).toFixed(3); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

export default function AdminPage() {
  const { address } = useAccount();
  const { data: session } = useSession();

  const [campaigns, setCampaigns]   = useState<AdminCampaign[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [filterSuspended, setFilterSuspended] = useState<'all' | 'active' | 'suspended'>('all');
  const [suspending, setSuspending] = useState<string | null>(null);
  const [reasonMap, setReasonMap]   = useState<Record<string, string>>({});
  const [expanded, setExpanded]     = useState<string | null>(null);

  const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase());
  const userEmail  = session?.user?.email?.toLowerCase();
  const hasAccess  = isAdminWallet(address) || (!!userEmail && adminEmail.includes(userEmail));

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/campaigns?limit=100');
      if (res.status === 403) { setError('Access denied — admin only'); return; }
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    } catch {
      setError('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const handleToggleSuspend = async (campaign: AdminCampaign) => {
    const willSuspend = !campaign.suspended;
    const reason = willSuspend ? (reasonMap[campaign.contract_address] || 'Suspended by admin') : undefined;
    setSuspending(campaign.contract_address);
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractAddress: campaign.contract_address, suspend: willSuspend, reason }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setCampaigns(prev => prev.map(c =>
        c.contract_address === campaign.contract_address
          ? { ...c, suspended: willSuspend, suspended_reason: reason ?? null, suspended_at: willSuspend ? new Date().toISOString() : null }
          : c
      ));
    } catch (e) {
      alert(`Failed: ${(e as Error).message}`);
    } finally {
      setSuspending(null);
    }
  };

  const filtered = campaigns.filter(c => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.contract_address.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filterSuspended === 'all' || (filterSuspended === 'suspended' ? c.suspended : !c.suspended);
    return matchSearch && matchFilter;
  });

  const stats = {
    total:     campaigns.length,
    active:    campaigns.filter(c => !c.suspended && c.status === 'active').length,
    funded:    campaigns.filter(c => c.status === 'funded').length,
    suspended: campaigns.filter(c => c.suspended).length,
  };

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Admin Only</h1>
          <p className="text-zinc-500 text-sm mb-6">
            This area is restricted to platform administrators.<br />
            Connect your admin wallet or sign in with an admin account.
          </p>
          <Link href="/auth/login" className="btn-primary">Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <ShieldAlert className="w-5 h-5 text-red-500" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Admin Console</span>
        </div>
        <h1 className="text-3xl font-bold text-zinc-900" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.03em' }}>
          Campaign Management
        </h1>
        <p className="text-zinc-500 text-sm mt-1">Suspend or reinstate campaigns. Changes take effect immediately.</p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total Campaigns',  value: stats.total,     icon: Activity,   color: 'text-zinc-900' },
          { label: 'Active',           value: stats.active,    icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Funded',           value: stats.funded,    icon: TrendingUp, color: 'text-sky-600' },
          { label: 'Suspended',        value: stats.suspended, icon: Ban,        color: 'text-red-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-zinc-200 p-4">
            <div className={`text-2xl font-bold mb-0.5 ${color}`} style={{ fontFamily: 'var(--font-space-grotesk)' }}>{value}</div>
            <div className="text-xs text-zinc-500 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search campaigns…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-crypto pl-10 w-full"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'suspended'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterSuspended(f)}
              className={`px-4 py-2 text-xs font-semibold border transition-all capitalize ${
                filterSuspended === f
                  ? 'bg-zinc-900 border-zinc-900 text-white'
                  : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400'
              }`}
            >
              {f}
            </button>
          ))}
          <button onClick={fetchCampaigns} className="p-2 border border-zinc-200 hover:border-zinc-400 text-zinc-400 hover:text-zinc-700 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 text-red-700 text-sm mb-5">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {/* Table */}
      <div className="border border-zinc-200 overflow-hidden">
        {/* Header */}
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] text-xs font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-50 border-b border-zinc-200 px-4 py-2.5" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          <span>Campaign</span>
          <span>Category</span>
          <span>Goal / Raised</span>
          <span>Backers</span>
          <span>Status</span>
          <span>Action</span>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">Loading campaigns…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 text-sm">No campaigns match your filters.</div>
        ) : (
          <AnimatePresence>
            {filtered.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
              >
                <div
                  className={`grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] items-center px-4 py-3.5 border-b border-zinc-100 last:border-0 gap-2 md:gap-0 ${
                    c.suspended ? 'bg-red-50/40' : 'hover:bg-zinc-50'
                  } transition-colors`}
                >
                  {/* Title + Address */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {c.suspended && <Ban className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                      <span className="text-sm font-semibold text-zinc-900 truncate" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                        {c.title}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 font-mono">{trunc(c.contract_address)}</div>
                    {c.creator_name && <div className="text-xs text-zinc-400">by {c.creator_name}</div>}
                  </div>
                  <div className="text-xs text-zinc-500">{c.category}</div>
                  <div className="text-xs">
                    <div className="font-semibold text-zinc-900">{fmtEth(c.total_contributed_wei)} ETH</div>
                    <div className="text-zinc-400">of {fmtEth(c.goal_wei)} ETH</div>
                  </div>
                  <div className="text-sm font-medium text-zinc-700">{c.backer_count}</div>
                  <div>
                    {c.suspended ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 bg-red-100 border border-red-200 text-red-700 uppercase tracking-wide">Suspended</span>
                    ) : (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 border uppercase tracking-wide ${
                        c.status === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                        c.status === 'funded' ? 'bg-sky-50 border-sky-200 text-sky-700' :
                        'bg-zinc-100 border-zinc-200 text-zinc-500'
                      }`}>{c.status}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`/campaign/${c.contract_address}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-zinc-400 hover:text-zinc-700 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => setExpanded(expanded === c.contract_address ? null : c.contract_address)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 transition-colors"
                    >
                      {expanded === c.contract_address ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded suspend panel */}
                <AnimatePresence>
                  {expanded === c.contract_address && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-b border-zinc-100"
                    >
                      <div className="px-4 py-4 bg-zinc-50 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        {c.suspended ? (
                          <div className="flex-1 text-sm text-zinc-600">
                            <span className="font-semibold text-red-600">Suspended</span>
                            {c.suspended_at && <span className="ml-2 text-zinc-400">on {fmtDate(c.suspended_at)}</span>}
                            {c.suspended_reason && <div className="text-xs text-zinc-500 mt-0.5">Reason: {c.suspended_reason}</div>}
                          </div>
                        ) : (
                          <div className="flex-1 flex gap-2 items-center">
                            <input
                              type="text"
                              placeholder="Suspension reason (optional)"
                              value={reasonMap[c.contract_address] ?? ''}
                              onChange={e => setReasonMap(prev => ({ ...prev, [c.contract_address]: e.target.value }))}
                              className="input-crypto text-sm py-2 flex-1"
                            />
                          </div>
                        )}
                        <button
                          onClick={() => handleToggleSuspend(c)}
                          disabled={suspending === c.contract_address}
                          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border transition-all disabled:opacity-50 ${
                            c.suspended
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                          }`}
                        >
                          {suspending === c.contract_address
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : c.suspended
                              ? <><CheckCircle2 className="w-4 h-4" /> Reinstate</>
                              : <><Ban className="w-4 h-4" /> Suspend</>
                          }
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <p className="text-xs text-zinc-400 mt-4 text-center">
        Suspended campaigns are hidden from Explore but remain visible to their creator with a suspended notice.
      </p>
    </div>
  );
}
