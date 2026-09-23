'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ShieldAlert, Search, Ban, CheckCircle2, ExternalLink,
  Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronUp,
  Users, TrendingUp, Activity, Lock, BarChart3, Wallet,
  Target, Calendar, ArrowUpRight, BrainCircuit, Sparkles, FileText,
  Zap, CircleDot, CheckCircle, XCircle, Database, BarChart2, Bot, PenLine,
} from 'lucide-react';
import { formatEther } from 'viem';
import { MilestoneProofQueue } from '@/components/ui/MilestoneProofQueue';

interface AdminCampaign {
  id:                    string;
  contract_address:      string;
  title:                 string;
  category:              string;
  status:                string;
  suspended:             boolean;
  suspended_at:          string | null;
  suspended_reason:      string | null;
  creator_address:       string;
  creator_name:          string | null;
  goal_wei:              string;
  total_contributed_wei: string;
  backer_count:          number;
  created_at:            string;
}

interface Backer {
  backer_address: string;
  amount_wei:     string;
  tx_hash:        string;
  created_at:     string;
}

const ADMIN_ADDRESSES = (process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESSES ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);

function isAdminWallet(addr?: string) {
  return !!addr && ADMIN_ADDRESSES.includes(addr.toLowerCase());
}

function trunc(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }
function fmtEth(wei: string)  { return Number(formatEther(BigInt(wei || '0'))).toFixed(4); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

// ── Inline SVG Bar Chart ──────────────────────────────────────────────────────
function BarChart({ data, color = '#0EA5E9' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1.5 h-24 w-full">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="w-full rounded-t-sm transition-all" style={{ height: `${(d.value / max) * 80}px`, background: color, opacity: 0.85 + (i / data.length) * 0.15 }} />
          <span className="text-[9px] text-zinc-400 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({ slices }: { slices: { value: number; color: string; label: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const size = 80; const r = 30; const cx = size / 2; const cy = size / 2;
  let offset = -Math.PI / 2;
  const paths = slices.map(s => {
    const angle = (s.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(offset);
    const y1 = cy + r * Math.sin(offset);
    offset += angle;
    const x2 = cx + r * Math.cos(offset);
    const y2 = cy + r * Math.sin(offset);
    const large = angle > Math.PI ? 1 : 0;
    return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`, color: s.color, label: s.label, value: s.value };
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-20 h-20">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={2} />
      {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} opacity={0.85} />)}
      <circle cx={cx} cy={cy} r={16} fill="white" />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="bold" fill="#0f172a">{total}</text>
    </svg>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ values, color = '#0EA5E9' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 120; const h = 32;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function AdminPage() {
  const { address }       = useAccount();
  const { data: session } = useSession();

  const [campaigns, setCampaigns]   = useState<AdminCampaign[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'suspended' | 'funded'>('all');
  const [suspending, setSuspending] = useState<string | null>(null);
  const [reasonMap, setReasonMap]   = useState<Record<string, string>>({});
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [backers, setBackers]       = useState<Record<string, Backer[]>>({});
  const [backersLoading, setBackersLoading] = useState<string | null>(null);

  // ── AI Report state ─────────────────────────────────────────────────────────
  const [reports, setReports]             = useState<{ id: string; created_at: string; report_markdown: string }[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [generating, setGenerating]       = useState(false);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [reportMsg, setReportMsg]         = useState('');
  const [agentStep, setAgentStep]         = useState(-1);

  const CREW_AGENTS = [
    { Icon: Database,  name: 'Data Collector', desc: 'Fetching platform stats, campaign data & backer records...' },
    { Icon: BarChart2, name: 'Analytics Agent', desc: 'Calculating funding rates, growth metrics & anomalies...' },
    { Icon: Bot,       name: 'Risk Analyst',    desc: 'Cross-referencing campaign health & flagging risks...' },
    { Icon: PenLine,   name: 'Report Writer',  desc: 'Compiling findings into a structured AI report...' },
  ];
  const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_BACKEND_URL ?? 'http://localhost:8001';

  // ── Settlement engine state ──────────────────────────────────────────────────
  const [settleStatus, setSettleStatus]   = useState<any>(null);
  const [settling, setSettling]           = useState(false);

  const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase());
  const userEmail  = session?.user?.email?.toLowerCase();
  const hasAccess  = isAdminWallet(address) || (!!userEmail && adminEmail.includes(userEmail));

  const fetchCampaigns = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/campaigns?limit=100');
      if (res.status === 403) { setError('Access denied — admin only'); return; }
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    } catch { setError('Failed to load campaigns'); }
    finally { setLoading(false); }
  }, []);

  const fetchBackers = useCallback(async (contractAddress: string) => {
    if (backers[contractAddress] !== undefined) return; // already loaded
    setBackersLoading(contractAddress);
    try {
      const res = await fetch(`/api/admin/backers?campaign=${contractAddress}`);
      if (res.ok) {
        const data = await res.json();
        setBackers(prev => ({ ...prev, [contractAddress]: data.contributions ?? [] }));
      } else {
        setBackers(prev => ({ ...prev, [contractAddress]: [] }));
      }
    } catch {
      setBackers(prev => ({ ...prev, [contractAddress]: [] }));
    } finally { setBackersLoading(null); }
  }, [backers]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  // ── AI Report helpers ───────────────────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const res = await fetch(`${AGENT_URL}/admin/reports`);
      if (res.ok) setReports(await res.json());
    } catch { /* backend may not be running */ }
    finally { setReportsLoading(false); }
  }, [AGENT_URL]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const fetchSettleStatus = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/admin/settle/status`);
      if (res.ok) setSettleStatus(await res.json());
    } catch { /* backend may not be running */ }
  }, [AGENT_URL]);

  useEffect(() => { fetchSettleStatus(); }, [fetchSettleStatus]);

  const handleRunSettle = async () => {
    setSettling(true);
    try {
      await fetch(`${AGENT_URL}/admin/settle/run`, { method: 'POST' });
      // Poll for result after 3s
      setTimeout(async () => { await fetchSettleStatus(); setSettling(false); }, 3000);
    } catch { setSettling(false); }
  };
  const handleGenerateReport = async () => {
    setGenerating(true);
    setReportMsg('');
    setAgentStep(0);
    const initialReportCount = reports.length;
    
    try {
      const res = await fetch(`${AGENT_URL}/admin/report/generate`, { method: 'POST' });
      if (res.ok) {
        // Animate through agent steps every ~8s
        let step = 0;
        const stepTimer = setInterval(() => {
          step++;
          if (step < 4) setAgentStep(step);
          else clearInterval(stepTimer);
        }, 8000);

        // Poll for completed report every 8s for up to 96s
        let tries = 0;
        const poll = setInterval(async () => {
          tries++;
          
          try {
            const currentRes = await fetch(`${AGENT_URL}/admin/reports`);
            if (currentRes.ok) {
              const currentReports = await currentRes.json();
              setReports(currentReports);
              
              // If we found a new report, stop polling early!
              if (currentReports.length > initialReportCount) {
                clearInterval(poll);
                clearInterval(stepTimer);
                setGenerating(false);
                setAgentStep(-1);
                setReportMsg('');
                return;
              }
            }
          } catch { /* ignore network errors during polling */ }

          if (tries >= 12) {
            clearInterval(poll);
            clearInterval(stepTimer);
            setGenerating(false);
            setAgentStep(-1);
            setReportMsg('');
          }
        }, 8000);
      } else {
        setReportMsg('Failed to start report generation.');
        setGenerating(false);
        setAgentStep(-1);
      }
    } catch {
      setReportMsg('Agent backend offline.');
      setGenerating(false);
      setAgentStep(-1);
    }
  };


  const handleExpand = (addr: string) => {
    const newExpanded = expanded === addr ? null : addr;
    setExpanded(newExpanded);
    if (newExpanded) fetchBackers(newExpanded);
  };

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
    } catch (e) { alert(`Failed: ${(e as Error).message}`); }
    finally { setSuspending(null); }
  };

  const filtered = campaigns.filter(c => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.contract_address.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filterStatus === 'all' ? true :
      filterStatus === 'suspended' ? c.suspended :
      filterStatus === 'funded' ? c.status === 'funded' :
      (!c.suspended && c.status === 'active');
    return matchSearch && matchFilter;
  });

  // ── Analytics computations ─────────────────────────────────────────────────
  const analytics = useMemo(() => {
    const totalRaisedWei = campaigns.reduce((s, c) => s + BigInt(c.total_contributed_wei || '0'), 0n);
    const totalGoalWei   = campaigns.reduce((s, c) => s + BigInt(c.goal_wei || '0'), 0n);
    const totalBackers   = campaigns.reduce((s, c) => s + c.backer_count, 0);

    // Category breakdown
    const byCat: Record<string, number> = {};
    campaigns.forEach(c => { byCat[c.category] = (byCat[c.category] || 0) + 1; });
    const categoryData = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }));

    // Monthly campaign creation trend (last 6 months)
    const now = new Date();
    const monthlyData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      const value = campaigns.filter(c => {
        const cd = new Date(c.created_at);
        return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
      }).length;
      return { label, value };
    });

    // Status donut
    const donutSlices = [
      { label: 'Active',    value: campaigns.filter(c => !c.suspended && c.status === 'active').length,  color: '#10b981' },
      { label: 'Funded',    value: campaigns.filter(c => c.status === 'funded').length,                   color: '#0ea5e9' },
      { label: 'Suspended', value: campaigns.filter(c => c.suspended).length,                             color: '#ef4444' },
      { label: 'Ended',     value: campaigns.filter(c => c.status === 'ended' || c.status === 'cancelled').length, color: '#94a3b8' },
    ].filter(s => s.value > 0);

    // Top campaigns by raised
    const topByRaised = [...campaigns]
      .sort((a, b) => Number(BigInt(b.total_contributed_wei || '0') - BigInt(a.total_contributed_wei || '0')))
      .slice(0, 5);

    // Raised sparkline (campaigns sorted by date)
    const raisedSparkline = [...campaigns]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map(c => Number(formatEther(BigInt(c.total_contributed_wei || '0'))));

    return { totalRaisedWei, totalGoalWei, totalBackers, categoryData, monthlyData, donutSlices, topByRaised, raisedSparkline };
  }, [campaigns]);

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

  const statCards = [
    { label: 'Total Campaigns',  value: campaigns.length,                                                    icon: Activity,   color: 'text-zinc-900',    bg: 'bg-zinc-50' },
    { label: 'Total Raised',     value: `${Number(formatEther(analytics.totalRaisedWei)).toFixed(3)} ETH`,   icon: TrendingUp, color: 'text-sky-600',     bg: 'bg-sky-50'  },
    { label: 'Total Backers',    value: analytics.totalBackers.toLocaleString(),                             icon: Users,      color: 'text-purple-600',  bg: 'bg-purple-50' },
    { label: 'Suspended',        value: campaigns.filter(c => c.suspended).length,                           icon: Ban,        color: 'text-red-500',     bg: 'bg-red-50'  },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-24">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <ShieldAlert className="w-5 h-5 text-red-500" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Admin Console</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.03em' }}>
              Platform Analytics
            </h1>
            <p className="text-zinc-500 text-sm mt-1">Live overview of all campaigns, backers, and platform health.</p>
          </div>
          <button onClick={fetchCampaigns} className="p-2 border border-zinc-200 hover:border-zinc-400 text-zinc-400 hover:text-zinc-700 transition-colors mt-1">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {statCards.map(({ label, value, icon: Icon, color, bg }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="bg-white border border-zinc-200 p-4 hover:border-zinc-300 transition-colors">
            <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-2xl font-bold ${color} mb-0.5`} style={{ fontFamily: 'var(--font-space-grotesk)' }}>{value}</div>
            <div className="text-xs text-zinc-500">{label}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Analytics Charts ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">

        {/* Campaign creation trend */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white border border-zinc-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-sky-500" />
            <span className="text-sm font-semibold text-zinc-800" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Campaign Growth</span>
            <span className="ml-auto text-xs text-zinc-400">Last 6 months</span>
          </div>
          <BarChart data={analytics.monthlyData} color="#0ea5e9" />
        </motion.div>

        {/* Status donut */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white border border-zinc-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-semibold text-zinc-800" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Status Breakdown</span>
          </div>
          <div className="flex items-center gap-5">
            <DonutChart slices={analytics.donutSlices} />
            <div className="space-y-1.5 flex-1">
              {analytics.donutSlices.map(s => (
                <div key={s.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    <span className="text-zinc-600">{s.label}</span>
                  </div>
                  <span className="font-semibold text-zinc-800">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Category breakdown */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white border border-zinc-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-semibold text-zinc-800" style={{ fontFamily: 'var(--font-space-grotesk)' }}>By Category</span>
          </div>
          <div className="space-y-2">
            {analytics.categoryData.slice(0, 5).map(({ label, value }) => {
              const max = analytics.categoryData[0]?.value || 1;
              return (
                <div key={label}>
                  <div className="flex justify-between text-xs text-zinc-500 mb-0.5">
                    <span className="truncate max-w-[120px]">{label}</span>
                    <span className="font-semibold text-zinc-800">{value}</span>
                  </div>
                  <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" style={{ width: `${(value / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* ── Settlement Engine Status ────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
        className="bg-white border border-zinc-200 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-zinc-800" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Auto-Settlement Engine
          </span>
          {settleStatus ? (
            settleStatus.engine_active
              ? <span className="ml-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                  <CircleDot className="w-2.5 h-2.5" /> Active
                </span>
              : <span className="ml-1 flex items-center gap-1 text-[10px] font-semibold text-zinc-500 bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded-full">
                  <CircleDot className="w-2.5 h-2.5" /> No Key Set
                </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={fetchSettleStatus} className="p-1.5 border border-zinc-200 hover:border-zinc-400 text-zinc-400 hover:text-zinc-700 transition-colors">
              <RefreshCw className="w-3 h-3" />
            </button>
            <button
              onClick={handleRunSettle}
              disabled={settling || !settleStatus?.engine_active}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {settling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Run Sweep Now
            </button>
          </div>
        </div>

        {!settleStatus && (
          <p className="text-xs text-zinc-400">Agent backend offline or not reachable.</p>
        )}

        {settleStatus && !settleStatus.engine_active && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-700 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>PLATFORM_PRIVATE_KEY</strong> is not set in <code>agent_backend/.env</code>.
              Run <code>python gen_wallet.py</code> to generate one, fund it with Sepolia ETH, then restart the backend.
            </span>
          </div>
        )}

        {settleStatus?.engine_active && settleStatus.last_sweep && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Campaigns Checked', value: settleStatus.last_sweep.swept ?? '—', icon: Activity, color: 'text-zinc-700' },
              { label: 'Auto-Settled', value: settleStatus.last_sweep.settled ?? '—', icon: CheckCircle, color: 'text-emerald-600' },
              { label: 'Skipped', value: settleStatus.last_sweep.skipped ?? '—', icon: CircleDot, color: 'text-zinc-400' },
              { label: 'Errors', value: settleStatus.last_sweep.errors?.length ?? '—', icon: XCircle, color: 'text-red-500' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-zinc-50 border border-zinc-100 p-3">
                <div className={`flex items-center gap-1.5 mb-1 ${color}`}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
                </div>
                <div className="text-xl font-bold text-zinc-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {settleStatus?.engine_active && settleStatus.last_sweep?.status === 'not_run_yet' && (
          <p className="text-xs text-zinc-400">First sweep hasn&apos;t run yet — click &ldquo;Run Sweep Now&rdquo; to test.</p>
        )}

        {settleStatus?.last_sweep?.timestamp && (
          <p className="text-[10px] text-zinc-400 mt-3">
            Last sweep: {new Date(settleStatus.last_sweep.timestamp).toLocaleString()}
            {settleStatus.interval_seconds && ` · Runs every ${settleStatus.interval_seconds / 60} min`}
          </p>
        )}
      </motion.div>

      {/* Top campaigns */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="bg-white border border-zinc-200 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-sky-500" />
          <span className="text-sm font-semibold text-zinc-800" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Top Campaigns by Funds Raised</span>
        </div>
        <div className="space-y-2">
          {analytics.topByRaised.map((c, i) => {
            const pct = Math.min(100, (Number(BigInt(c.total_contributed_wei || '0')) / Math.max(1, Number(BigInt(c.goal_wei || '1')))) * 100);
            return (
              <div key={c.id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-zinc-400 w-4 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-zinc-800 truncate max-w-[200px]">{c.title}</span>
                    <span className="text-xs font-bold text-sky-600 ml-2 shrink-0">{fmtEth(c.total_contributed_wei)} ETH</span>
                  </div>
                  <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? '#10b981' : '#0ea5e9' }} />
                  </div>
                </div>
                <a href={`/campaign/${c.contract_address}`} target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-sky-500 transition-colors">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            );
          })}
          {analytics.topByRaised.length === 0 && <p className="text-xs text-zinc-400 text-center py-4">No data yet.</p>}
        </div>
      </motion.div>

      {/* ── Milestone Proof Queue (LangGraph Flow 3) ──────────────────────────── */}
      <div className="mt-8">
        <MilestoneProofQueue />
      </div>

      {/* ── CrewAI Reporting Section ─────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <BrainCircuit className="w-4 h-4 text-purple-500" />
          <h2 className="text-base font-bold text-zinc-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>AI Platform Reports</h2>
          <span className="ml-1 text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">CrewAI</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={fetchReports} className="p-2 border border-zinc-200 hover:border-zinc-400 text-zinc-400 hover:text-zinc-700 transition-colors" title="Refresh reports">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleGenerateReport}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {generating ? 'Generating...' : 'Generate New Report'}
            </button>
          </div>
        </div>

        {generating && agentStep >= 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 border border-purple-200 bg-purple-50 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
              <span className="text-sm font-semibold text-purple-800">CrewAI agents are working…</span>
              <span className="ml-auto text-xs text-purple-400">~30s</span>
            </div>
            <div className="space-y-2">
              {CREW_AGENTS.map((agent, i) => {
                const isDone    = i < agentStep;
                const isActive  = i === agentStep;
                const isPending = i > agentStep;
                return (
                  <motion.div
                    key={agent.name}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: isPending ? 0.35 : 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
                      isActive  ? 'bg-white border-purple-300 shadow-sm' :
                      isDone    ? 'bg-purple-100 border-purple-100' :
                                  'bg-white/40 border-transparent'
                    }`}
                  >
                    <div className={`w-6 h-6 flex items-center justify-center shrink-0 ${isActive ? 'text-purple-500' : isDone ? 'text-purple-400' : 'text-zinc-300'}`}>
                      <agent.Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${
                          isActive ? 'text-purple-700' : isDone ? 'text-purple-500' : 'text-zinc-400'
                        }`}>{agent.name}</span>
                        {isDone   && <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">Done</span>}
                        {isActive && <span className="text-[10px] font-semibold text-purple-600 bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded-full flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse inline-block" />Running</span>}
                      </div>
                      {(isActive || isDone) && (
                        <p className="text-[11px] text-zinc-500 truncate mt-0.5">{agent.desc}</p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {reportsLoading && reports.length === 0 && (
          <div className="p-8 text-center border border-zinc-200 bg-white">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-300 mx-auto mb-2" />
            <p className="text-xs text-zinc-400">Loading reports...</p>
          </div>
        )}

        {!reportsLoading && reports.length === 0 && (
          <div className="p-10 text-center border border-dashed border-zinc-200 bg-white">
            <BrainCircuit className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-zinc-500 mb-1">No reports yet</p>
            <p className="text-xs text-zinc-400">Click &ldquo;Generate New Report&rdquo; to have your AI crew analyse the platform.</p>
          </div>
        )}

        <div className="space-y-3">
          {reports.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="border border-zinc-200 bg-white overflow-hidden">
              <button
                onClick={() => setExpandedReport(expandedReport === r.id ? null : r.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors"
              >
                <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                <div className="flex-1 text-left">
                  <span className="text-sm font-semibold text-zinc-800" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Platform Report</span>
                  <span className="text-xs text-zinc-400 ml-3">{new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {expandedReport === r.id ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
              </button>

              <AnimatePresence>
                {expandedReport === r.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-6 pt-2 border-t border-zinc-100 prose prose-sm prose-zinc max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.report_markdown}</ReactMarkdown>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ── Campaign Management Table ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 mt-8">
        <ShieldAlert className="w-4 h-4 text-red-500" />
        <h2 className="text-base font-bold text-zinc-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Campaign Management</h2>
        <span className="text-xs text-zinc-400 ml-auto">{filtered.length} of {campaigns.length}</span>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input type="text" placeholder="Search campaigns…" value={search} onChange={e => setSearch(e.target.value)} className="input-crypto pl-10 w-full" />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'funded', 'suspended'] as const).map(f => (
            <button key={f} onClick={() => setFilterStatus(f)}
              className={`px-3 py-2 text-xs font-semibold border transition-all capitalize ${
                filterStatus === f ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400'
              }`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      <div className="border border-zinc-200 overflow-hidden">
        {/* Table header */}
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] text-xs font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-50 border-b border-zinc-200 px-4 py-2.5" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          <span>Campaign</span>
          <span>Category</span>
          <span>Goal / Raised</span>
          <span>Backers</span>
          <span>Status</span>
          <span>Actions</span>
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
            {filtered.map((c, i) => {
              const pct = Math.min(100, (Number(BigInt(c.total_contributed_wei || '0')) / Math.max(1, Number(BigInt(c.goal_wei || '1')))) * 100);
              const campaignBackers = backers[c.contract_address] ?? [];
              const isExpanded = expanded === c.contract_address;

              return (
                <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>

                  {/* ── Row ── */}
                  <div className={`grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] items-center px-4 py-3.5 border-b border-zinc-100 last:border-0 gap-2 md:gap-0 ${
                    c.suspended ? 'bg-red-50/40' : 'hover:bg-zinc-50'
                  } transition-colors`}>

                    {/* Title */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {c.suspended && <Ban className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                        <span className="text-sm font-semibold text-zinc-900 truncate" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{c.title}</span>
                      </div>
                      <div className="text-xs text-zinc-400 font-mono">{trunc(c.contract_address)}</div>
                      {c.creator_name && <div className="text-xs text-zinc-400">by {c.creator_name}</div>}
                      {/* Mini progress bar */}
                      <div className="h-1 bg-zinc-100 rounded-full overflow-hidden mt-1.5 w-32">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? '#10b981' : '#0ea5e9' }} />
                      </div>
                    </div>

                    <div className="text-xs text-zinc-500">{c.category}</div>

                    <div className="text-xs">
                      <div className="font-semibold text-zinc-900">{fmtEth(c.total_contributed_wei)} ETH</div>
                      <div className="text-zinc-400">of {fmtEth(c.goal_wei)} ETH</div>
                      <div className="text-zinc-400">{pct.toFixed(0)}% funded</div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-sm font-medium text-zinc-700">{c.backer_count}</span>
                    </div>

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

                    <div className="flex items-center gap-1">
                      <a href={`/campaign/${c.contract_address}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-zinc-400 hover:text-zinc-700 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button onClick={() => handleExpand(c.contract_address)} className="p-1.5 text-zinc-400 hover:text-zinc-700 transition-colors">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* ── Expanded panel — backer info + suspend ── */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-b border-zinc-100">
                        <div className="px-4 py-5 bg-zinc-50 space-y-5">

                          {/* Campaign meta row */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                              { icon: Calendar,  label: 'Created',      val: fmtDate(c.created_at) },
                              { icon: Wallet,    label: 'Creator',       val: trunc(c.creator_address) },
                              { icon: Target,    label: 'Goal',          val: `${fmtEth(c.goal_wei)} ETH` },
                              { icon: TrendingUp,label: 'Raised',        val: `${fmtEth(c.total_contributed_wei)} ETH` },
                            ].map(({ icon: Icon, label, val }) => (
                              <div key={label} className="bg-white border border-zinc-200 rounded-lg p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Icon className="w-3.5 h-3.5 text-zinc-400" />
                                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">{label}</span>
                                </div>
                                <div className="text-sm font-semibold text-zinc-800">{val}</div>
                              </div>
                            ))}
                          </div>

                          {/* Backers list */}
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Users className="w-3.5 h-3.5 text-purple-500" />
                              <span className="text-xs font-semibold text-zinc-700">Backers ({c.backer_count})</span>
                            </div>
                            {backersLoading === c.contract_address ? (
                              <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading backer data…
                              </div>
                            ) : campaignBackers.length > 0 ? (
                              <div className="border border-zinc-200 overflow-hidden rounded-lg">
                                <div className="grid grid-cols-[2fr_1fr_1fr_auto] text-[10px] font-semibold text-zinc-400 uppercase tracking-wide bg-zinc-100 px-3 py-1.5">
                                  <span>Wallet</span><span>Amount</span><span>Date</span><span />
                                </div>
                                {campaignBackers.slice(0, 10).map((b, bi) => (
                                  <div key={bi} className="grid grid-cols-[2fr_1fr_1fr_auto] items-center px-3 py-2 border-t border-zinc-100 hover:bg-white transition-colors">
                                    <span className="text-xs font-mono text-zinc-600">{trunc(b.backer_address)}</span>
                                    <span className="text-xs font-semibold text-sky-600">{formatEther(BigInt(b.amount_wei || '0'))} ETH</span>
                                    <span className="text-xs text-zinc-400">{fmtDate(b.created_at)}</span>
                                    <a href={`https://sepolia.etherscan.io/tx/${b.tx_hash}`} target="_blank" rel="noopener noreferrer"
                                      className="text-zinc-300 hover:text-sky-500 transition-colors">
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                ))}
                                {campaignBackers.length > 10 && (
                                  <div className="px-3 py-2 text-xs text-zinc-400 border-t border-zinc-100 text-center">
                                    +{campaignBackers.length - 10} more backers
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-zinc-400 py-2">
                                {c.backer_count > 0 ? 'Backer details stored on-chain. View on Etherscan.' : 'No backers yet.'}
                              </p>
                            )}
                          </div>

                          {/* Suspend/Reinstate */}
                          <div className="border-t border-zinc-200 pt-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Admin Action</span>
                            {c.suspended ? (
                              <div className="flex-1 text-sm text-zinc-600">
                                <span className="font-semibold text-red-600">Suspended</span>
                                {c.suspended_at && <span className="ml-2 text-zinc-400">on {fmtDate(c.suspended_at)}</span>}
                                {c.suspended_reason && <div className="text-xs text-zinc-500 mt-0.5">Reason: {c.suspended_reason}</div>}
                              </div>
                            ) : (
                              <div className="flex-1 flex gap-2 items-center">
                                <input type="text" placeholder="Suspension reason (optional)"
                                  value={reasonMap[c.contract_address] ?? ''}
                                  onChange={e => setReasonMap(prev => ({ ...prev, [c.contract_address]: e.target.value }))}
                                  className="input-crypto text-sm py-2 flex-1" />
                              </div>
                            )}
                            <button onClick={() => handleToggleSuspend(c)} disabled={suspending === c.contract_address}
                              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border transition-all disabled:opacity-50 ${
                                c.suspended
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                              }`}>
                              {suspending === c.contract_address
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : c.suspended
                                  ? <><CheckCircle2 className="w-4 h-4" /> Reinstate</>
                                  : <><Ban className="w-4 h-4" /> Suspend</>
                              }
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <p className="text-xs text-zinc-400 mt-4 text-center">
        Suspended campaigns are hidden from Explore but remain accessible to their creator with a notice.
      </p>
    </div>
  );
}
