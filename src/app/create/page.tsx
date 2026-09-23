'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { parseEther } from 'viem';
import { sepolia } from 'viem/chains';
import { useRouter } from 'next/navigation';
import {
  Upload, Plus, Trash2, ChevronLeft, ChevronRight,
  Loader2, CheckCircle, AlertCircle, Info, Rocket,
  ShieldCheck, ShieldAlert, ShieldX, Wallet, FileText,
  RefreshCw, AlertTriangle, Search, Cpu, BarChart3,
  Clock, Hash, Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { CAMPAIGN_FACTORY_ADDRESS, CAMPAIGN_FACTORY_ABI } from '@/lib/contracts';
import { CampaignCategory } from '@/lib/types';
import { CATEGORIES } from '@/lib/data';
import { TxHashBadge } from '@/components/ui/TxHashBadge';
import { uploadCampaignImage } from '@/lib/utils';
import { useDeployment } from '@/context/DeploymentContext';

const STEPS = ['Basic Info', 'Funding', 'Milestones', 'AI Risk Check', 'Review & Deploy'];

type Milestone  = { title: string; description: string; percentage: number; estimatedDate: string };
type RewardTier = { id: number; name: string; minContribution: string; description: string };

interface FormData {
  title: string; category: string; shortDescription: string;
  thumbnailFile: File | null; thumbnailPreview: string; thumbnailCid: string;
  goalEth: string; durationDays: number;
  rewardTiers: RewardTier[];
  milestones: Milestone[];
}

const DEFAULT_FORM: FormData = {
  title: '', category: 'DeFi', shortDescription: '',
  thumbnailFile: null, thumbnailPreview: '', thumbnailCid: '',
  goalEth: '', durationDays: 30,
  rewardTiers: [{ id: 1, name: '', minContribution: '', description: '' }],
  milestones: [{ title: '', description: '', percentage: 100, estimatedDate: '' }],
};

export default function CreatePage() {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: session } = useSession();

  const [step, setStep]   = useState(0);
  const [form, setForm]   = useState<FormData>(DEFAULT_FORM);
  const [deploying, setDeploying] = useState(false);

  // Global deployment tracker — survives navigation
  const deployment = useDeployment();
  const txHash  = deployment.deploy.txHash;
  const deployed = deployment.deploy.status === 'done';

  // Pre-vet state
  type PreVetResult = {
    risk_score: number; verdict: string; wallet_score: number | null;
    content_score: number | null; reasons: string[];
    wallet_age_days: number | null; wallet_tx_count: number | null;
    wallet_on_blocklist: boolean | null; can_deploy: boolean;
  };
  type NodeState = 'idle' | 'running' | 'done' | 'skipped';
  const [preVetState, setPreVetState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [preVetResult, setPreVetResult] = useState<PreVetResult | null>(null);
  const [preVetError, setPreVetError]   = useState('');
  // Per-node live state for the detailed pipeline view
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({
    wallet: 'idle', content: 'idle', score: 'idle',
  });
  const setNodeState = (node: string, s: NodeState) =>
    setNodeStates(prev => ({ ...prev, [node]: s }));
  // Step 3: expanded node detail panel — hoisted here to obey Rules of Hooks
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const toggleExpand = (id: string) =>
    setExpandedNode(prev => prev === id ? null : id);

  const { writeContract } = useWriteContract({
    mutation: {
      onSuccess: (hash) => {
        deployment.setTxHash(hash);
        toast.success('Transaction submitted!');
      },
      onError: (err) => {
        setDeploying(false);
        const errorString = err.message.toLowerCase();
        let displayError = err.message.slice(0, 120);
        
        if (errorString.includes('insufficient funds')) {
          displayError = "You don't have enough ETH in your wallet to cover the transaction and gas fees. Please fund your wallet and try again!";
        } else if (errorString.includes('user rejected') || errorString.includes('user denied')) {
          displayError = "Transaction was rejected in your wallet.";
        }

        deployment.setError(displayError);
        toast.error(displayError, { duration: 6000 });
      },
    },
  });


  /* ── Derived ── */
  const totalMilestonePercent = form.milestones.reduce((s, m) => s + Number(m.percentage), 0);
  const isStep0Valid = form.title.length > 3 && form.shortDescription.length > 10;
  const isStep1Valid = parseFloat(form.goalEth) > 0 && form.durationDays >= 1;
  const isStep2Valid = form.milestones.length > 0 && totalMilestonePercent === 100 && form.milestones.every(m => m.title.trim());
  // Step 3 is valid when vet is done (pass or error/offline) and not blocked
  const isStep3Valid = preVetState === 'done' || preVetState === 'error';
  const canDeploy    = isConnected && isStep0Valid && isStep1Valid && isStep2Valid
    && (preVetResult === null || preVetResult.can_deploy);

  /* ── Pre-vet runner with per-node live state ── */
  const runPreVet = useCallback(async () => {
    if (!address || !isStep0Valid || !isStep1Valid) return;
    setPreVetState('running');
    setPreVetResult(null);
    setPreVetError('');
    setNodeStates({ wallet: 'running', content: 'idle', score: 'idle' });
    try {
      // Simulate staggered node progression for live UX
      const walletTimer = setTimeout(() => setNodeState('content', 'running'), 2000);
      const contentTimer = setTimeout(() => setNodeState('score', 'running'), 5000);

      const res = await fetch('http://localhost:8001/pre-vet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:           form.title,
          description:     form.shortDescription,
          goal_eth:        parseFloat(form.goalEth) || 0,
          category:        form.category,
          creator_address: address,
        }),
      });
      clearTimeout(walletTimer);
      clearTimeout(contentTimer);

      if (!res.ok) throw new Error(`Agent responded ${res.status}`);
      const data: PreVetResult = await res.json();
      setNodeStates({ wallet: 'done', content: 'done', score: 'done' });
      setPreVetResult(data);
      setPreVetState('done');
    } catch (e) {
      setNodeStates({ wallet: 'done', content: 'done', score: 'done' });
      setPreVetError((e as Error).message);
      setPreVetState('error');
    }
  }, [address, form.title, form.shortDescription, form.goalEth, form.category, isStep0Valid, isStep1Valid]);

  // Auto-run pre-vet when user arrives at step 3 (AI Risk Check)
  useEffect(() => {
    if (step === 3 && preVetState === 'idle') {
      runPreVet();
    }
  }, [step, preVetState, runPreVet]);


  /* ── Helpers ── */
  const updateForm = (u: Partial<FormData>) => setForm(prev => ({ ...prev, ...u }));

  const handleThumbnail = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    updateForm({ thumbnailFile: file, thumbnailPreview: URL.createObjectURL(file) });
  };

  const addTier    = () => updateForm({ rewardTiers: [...form.rewardTiers, { id: Date.now(), name: '', minContribution: '', description: '' }] });
  const removeTier = (id: number) => updateForm({ rewardTiers: form.rewardTiers.filter(t => t.id !== id) });
  const updateTier = (id: number, field: string, value: string) =>
    updateForm({ rewardTiers: form.rewardTiers.map(t => t.id === id ? { ...t, [field]: value } : t) });

  const addMilestone    = () => updateForm({ milestones: [...form.milestones, { title: '', description: '', percentage: 0, estimatedDate: '' }] });
  const removeMilestone = (i: number) => updateForm({ milestones: form.milestones.filter((_, idx) => idx !== i) });
  const updateMilestone = (i: number, field: string, value: string | number) =>
    updateForm({ milestones: form.milestones.map((m, idx) => idx === i ? { ...m, [field]: value } : m) });

  const handleDeploy = async () => {
    if (totalMilestonePercent !== 100) { toast.error('Milestone percentages must add up to 100%'); return; }
    if (form.milestones.some(m => !m.title.trim())) { toast.error('All milestones need a title'); return; }
    setDeploying(true);
    // 1ï¸âƒ£  Upload thumbnail to Supabase Storage (if the user selected one)
    let imageUrl = form.thumbnailCid || '';
    if (form.thumbnailFile && !imageUrl) {
      const uploadToast = toast.loading('Uploading image to Supabase…');
      try {
        imageUrl = await uploadCampaignImage(form.thumbnailFile);
        updateForm({ thumbnailCid: imageUrl });
        toast.success('Image uploaded!', { id: uploadToast });
      } catch (err) {
        toast.error(`Image upload failed: ${(err as Error).message}`, { id: uploadToast });
        // Continue without image rather than blocking deploy
        imageUrl = '';
      }
    }

    // 2ï¸âƒ£  Store metadata as JSON in the metadataCid field on-chain
    const metadataCid = JSON.stringify({
      title:       form.title,
      description: form.shortDescription,
      category:    form.category,
      image:       imageUrl,
    });

    deployment.startDeployment(form.title, {
      creatorAddress: address,
      creatorEmail: session?.user?.email ?? null,
      title: form.title,
      description: form.shortDescription,
      category: form.category,
      imageUrl: imageUrl,
      goalEth: form.goalEth,
      durationDays: form.durationDays,
      milestones: form.milestones,
      rewardTiers: form.rewardTiers,
    });

    try {
      writeContract({
        address:      CAMPAIGN_FACTORY_ADDRESS,
        abi:          CAMPAIGN_FACTORY_ABI,
        functionName: 'createCampaign',
        args: [
          parseEther(form.goalEth || '0'),
          BigInt((form.durationDays || 0) * 86400),
          form.milestones.map(m => m.title.trim()),
          form.milestones.map(m => m.description.trim()),
          form.milestones.map(m => Number(m.percentage)),
        ],
      });
    } catch (err) {
      setDeploying(false);
      toast.error(`Setup error: ${(err as Error).message}`);
    }
  };

  /* ── Shared label style ── */
  const label = 'block text-xs font-semibold text-zinc-600 uppercase tracking-widest mb-1.5';
  const hint  = 'text-xs text-zinc-400 mt-1';
  const card  = 'bg-white border border-zinc-200 p-7 space-y-5';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest" style={{ fontFamily: 'var(--font-space-grotesk)' }}>New Campaign</span>
        </div>
        <h1 className="text-4xl font-bold text-zinc-900 mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.03em' }}>
          Launch a Campaign
        </h1>
        <p className="text-zinc-500 text-sm">Deploy your crowdfunding to Sepolia in 4 steps.</p>
      </motion.div>

      {/* Step indicator */}
      <div className="flex items-center justify-between mb-10 relative">
        <div className="absolute left-0 right-0 top-4 h-px bg-zinc-200 -z-0" />
        <div
          className="absolute left-0 top-4 h-px bg-zinc-900 transition-all duration-400 -z-0"
          style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
        />
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-col items-center z-10" style={{ width: `${100 / STEPS.length}%` }}>
            <div
              className={`w-8 h-8 border-2 flex items-center justify-center font-bold text-xs transition-all ${
                i < step
                  ? 'bg-zinc-900 border-zinc-900 text-white'
                  : i === step
                  ? 'border-zinc-900 text-zinc-900 bg-white'
                  : 'border-zinc-300 text-zinc-400 bg-white'
              }`}
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-xs mt-2 hidden sm:block font-semibold ${
              i === step ? 'text-zinc-900' : i < step ? 'text-zinc-500' : 'text-zinc-400'
            }`} style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          {/* ── STEP 0: Basic Info ── */}
          {step === 0 && (
            <div className={card}>
              <h2 className="font-bold text-xl text-slate-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                Basic Information
              </h2>

              <div>
                <label className={label}>Campaign Title *</label>
                <input id="create-title" className="input-crypto"
                  placeholder="e.g., ZeroGrav DEX Protocol"
                  value={form.title} onChange={e => updateForm({ title: e.target.value })} />
                <p className={hint}>{form.title.length}/80 characters</p>
              </div>

              <div>
                <label className={label}>Category *</label>
                <select id="create-category" className="input-crypto"
                  value={form.category} onChange={e => updateForm({ category: e.target.value as CampaignCategory })}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className={label}>Short Description *</label>
                <textarea id="create-short-desc" className="input-crypto resize-none" rows={3}
                  placeholder="One-line pitch for your campaign (shown on cards)"
                  value={form.shortDescription} onChange={e => updateForm({ shortDescription: e.target.value })} />
                <p className={hint}>{form.shortDescription.length}/200 characters</p>
              </div>

              <div>
                <label className={label}>Thumbnail Image <span className="text-slate-400 font-normal normal-case tracking-normal">— optional</span></label>
                <div
                  className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-sky-400 hover:bg-sky-50/40 transition-all"
                  onClick={() => document.getElementById('thumbnail-input')?.click()}
                >
                  {form.thumbnailPreview ? (
                    <img src={form.thumbnailPreview} alt="preview" className="w-full h-40 object-cover rounded-lg" />
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-600 font-medium">Click to upload thumbnail</p>
                      <p className={hint}>JPEG, PNG, WebP — max 10 MB</p>
                    </>
                  )}
                </div>
                <input id="thumbnail-input" type="file" accept="image/*" className="hidden" onChange={handleThumbnail} />
              </div>
            </div>
          )}

          {/* ── STEP 1: Funding ── */}
          {step === 1 && (
            <div className={card}>
              <h2 className="font-bold text-xl text-slate-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                Funding Details
              </h2>

              <div>
                <label className={label}>Funding Goal (ETH) *</label>
                <div className="relative">
                  <input id="create-goal" type="number" step="0.001" min="0.001"
                    className="input-crypto pr-14"
                    placeholder="e.g., 5"
                    value={form.goalEth} onChange={e => updateForm({ goalEth: e.target.value })} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500 font-bold">ETH</span>
                </div>
                {form.goalEth && (
                  <p className={hint}>≈ ${(parseFloat(form.goalEth) * 3200).toLocaleString(undefined, { maximumFractionDigits: 0 })} USD at current rates</p>
                )}
              </div>

              <div>
                <label className={label}>Campaign Duration: <span className="text-zinc-900 font-bold">{form.durationDays} days</span></label>
                <input id="create-duration" type="range" min="7" max="365"
                  value={form.durationDays}
                  onChange={e => updateForm({ durationDays: parseInt(e.target.value) })}
                  className="w-full accent-black h-2 rounded-lg cursor-pointer" />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>7 days</span><span>1 year</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className={label + ' mb-0'}>Reward Tiers <span className="text-slate-400 font-normal normal-case tracking-normal">— optional</span></label>
                  <button onClick={addTier} className="text-xs text-black hover:text-zinc-600 flex items-center gap-1 font-semibold">
                    <Plus className="w-3.5 h-3.5" /> Add Tier
                  </button>
                </div>
                <div className="space-y-3">
                  {form.rewardTiers.map(tier => (
                    <div key={tier.id} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
                      <div className="flex gap-2">
                        <input className="input-crypto flex-1 bg-white" placeholder="Tier name (e.g., Early Supporter)"
                          value={tier.name} onChange={e => updateTier(tier.id, 'name', e.target.value)} />
                        <div className="relative w-36">
                          <input type="number" step="0.001" className="input-crypto pr-12 bg-white"
                            placeholder="Min ETH"
                            value={tier.minContribution} onChange={e => updateTier(tier.id, 'minContribution', e.target.value)} />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">ETH</span>
                        </div>
                        <button onClick={() => removeTier(tier.id)} className="p-2.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea className="input-crypto resize-none bg-white" rows={2}
                        placeholder="What does this backer receive?"
                        value={tier.description} onChange={e => updateTier(tier.id, 'description', e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Milestones ── */}
          {step === 2 && (
            <div className={card}>
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-xl text-slate-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Milestones</h2>
                <button onClick={addMilestone} className="text-xs text-black hover:text-zinc-600 flex items-center gap-1 font-semibold">
                  <Plus className="w-3.5 h-3.5" /> Add Milestone
                </button>
              </div>

              {/* Percentage tracker */}
              <div className={`flex items-center gap-3 p-3.5 border text-sm ${
                totalMilestonePercent === 100
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                <Info className="w-4 h-4 flex-shrink-0" />
                <span>
                  Total milestone percentage: <strong>{totalMilestonePercent}%</strong>
                  {totalMilestonePercent !== 100 && ` - must equal 100%`}
                </span>
                {totalMilestonePercent === 100 && <CheckCircle className="w-4 h-4 ml-auto flex-shrink-0" />}
              </div>

              <div className="space-y-4">
                {form.milestones.map((m, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-xl p-5 space-y-3 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-black" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                        Milestone {idx + 1}
                      </span>
                      {form.milestones.length > 1 && (
                        <button onClick={() => removeMilestone(idx)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <input className="input-crypto flex-1 bg-white" placeholder="Milestone title (e.g., MVP Launch)"
                        value={m.title} onChange={e => updateMilestone(idx, 'title', e.target.value)} />
                      <div className="relative w-28">
                        <input type="number" min="1" max="100" className="input-crypto pr-7 bg-white" placeholder="25"
                          value={m.percentage || ''}
                          onChange={e => updateMilestone(idx, 'percentage', parseInt(e.target.value) || 0)} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold">%</span>
                      </div>
                    </div>
                    <textarea className="input-crypto resize-none bg-white" rows={2}
                      placeholder="What will be delivered at this milestone?"
                      value={m.description} onChange={e => updateMilestone(idx, 'description', e.target.value)} />
                    <div>
                      <label className={hint + ' mb-1 block'}>Estimated completion date (optional)</label>
                      <input type="date" className="input-crypto bg-white"
                        value={m.estimatedDate} onChange={e => updateMilestone(idx, 'estimatedDate', e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 3: AI Risk Check ── */}
          {step === 3 && (() => {
            const score    = preVetResult?.risk_score ?? 0;
            const pct      = Math.round(score * 100);
            const barColor = score < 0.3 ? '#10b981' : score < 0.65 ? '#f59e0b' : '#ef4444';

            const NodeStatusIcon = ({ state }: { state: string }) =>
              state === 'running' ? <Loader2 className="w-4 h-4 animate-spin text-sky-500" /> :
              state === 'done'    ? <CheckCircle className="w-4 h-4 text-emerald-500" /> :
                                   <div className="w-4 h-4 rounded-full border-2 border-zinc-300" />;

            const Tag = ({ label, color }: { label: string; color: string }) => (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${color}`}>
                {label}
              </span>
            );

            const nodes = [
              {
                id: 'wallet',
                icon: Wallet,
                label: 'Node 1 — Wallet History Check',
                method: { label: 'Etherscan API', color: 'bg-zinc-100 border-zinc-200 text-zinc-900' },
                desc: `Querying Etherscan Sepolia for ${address ? `${address.slice(0,6)}…${address.slice(-4)}` : 'your wallet'}`,
                inputs: [
                  { label: 'Wallet Address', value: address ?? 'Not connected',           type: 'Address' },
                  { label: 'Network',         value: 'Sepolia Testnet',                    type: 'Config'  },
                  { label: 'Data Source',     value: 'Etherscan API (txlist endpoint)',    type: 'API'     },
                  { label: 'Checks',          value: 'Age · Tx count · Known fraud lists', type: 'Logic'  },
                  { label: 'Blocklist DB',    value: 'Internal flagged-address registry',  type: 'DB'     },
                ],
                outputs: nodeStates.wallet === 'done' && preVetResult ? [
                  { label: 'Wallet Age',   value: preVetResult.wallet_age_days  !== null ? `${preVetResult.wallet_age_days} days`         : '—', good: (preVetResult.wallet_age_days  ?? 0) > 30  },
                  { label: 'Tx Count',     value: preVetResult.wallet_tx_count  !== null ? `${preVetResult.wallet_tx_count} transactions`  : '—', good: (preVetResult.wallet_tx_count  ?? 0) > 5   },
                  { label: 'Blocklist',    value: preVetResult.wallet_on_blocklist === true ? 'Flagged' : 'Clean',                               good: !preVetResult.wallet_on_blocklist            },
                  { label: 'Wallet Score', value: preVetResult.wallet_score  !== null ? `${Math.round((preVetResult.wallet_score  ?? 0) * 100)}%` : '—', good: (preVetResult.wallet_score  ?? 0) > 0.5 },
                ] : [],
                scoring: 'Weight: 50% of final risk score. Age < 7 days or tx count < 2 adds risk.',
              },
              {
                id: 'content',
                icon: FileText,
                label: 'Node 2 — Content Authenticity Analysis',
                method: { label: 'LLM (OpenRouter)', color: 'bg-zinc-100 border-zinc-200 text-zinc-900' },
                desc: `Analysing "${form.title.slice(0, 40)}${form.title.length > 40 ? '…' : ''}" for fraud signals`,
                inputs: [
                  { label: 'Campaign Title', value: form.title || '—',                                                                             type: 'Text'   },
                  { label: 'Description',    value: `${form.shortDescription.slice(0, 80)}${form.shortDescription.length > 80 ? '…' : ''}`,        type: 'Text'   },
                  { label: 'Category',       value: form.category,                                                                                  type: 'Meta'   },
                  { label: 'Funding Goal',   value: form.goalEth ? `${form.goalEth} ETH` : '—',                                                     type: 'Number' },
                  { label: 'LLM Model',      value: 'nvidia/nemotron-3.5-lightning:free (OpenRouter)',                                                   type: 'Model'  },
                  { label: 'Checks',         value: 'Realistic promises · Coherence · Plagiarism · Urgency pressure',                               type: 'Logic'  },
                ],
                outputs: nodeStates.content === 'done' && preVetResult ? [
                  { label: 'Content Score', value: `${Math.round((preVetResult.content_score ?? 0) * 100)}%`, good: (preVetResult.content_score ?? 0) > 0.5 },
                  { label: 'Flags',         value: preVetResult.reasons.filter(r => !['wallet','blocklist'].some(w => r.includes(w))).join(', ').replace(/_/g, ' ') || 'None', good: preVetResult.reasons.length === 0 },
                ] : [],
                scoring: 'Weight: 50% of final risk score. Measures authenticity 0–1 (1 = clean). Flags like URGENCY_PRESSURE or PLAGIARISM_SIGNALS reduce this score.',
              },
              {
                id: 'score',
                icon: BarChart3,
                label: 'Node 3 — Risk Score Computation',
                method: { label: 'Algorithm', color: 'bg-zinc-100 border-zinc-200 text-zinc-900' },
                desc: 'Combines wallet + content signals into a single 0–100 risk score',
                inputs: [
                  { label: 'Wallet Score',     value: preVetResult ? `${Math.round((preVetResult.wallet_score  ?? 0) * 100)}%` : 'Pending', type: 'Input'  },
                  { label: 'Content Score',    value: preVetResult ? `${Math.round((preVetResult.content_score ?? 0) * 100)}%` : 'Pending', type: 'Input'  },
                  { label: 'Formula',          value: 'risk = 1 − (wallet × 0.5 + content × 0.5)',                                          type: 'Logic'  },
                  { label: 'Low threshold',    value: '< 30 → Auto-Approved',                                                               type: 'Config' },
                  { label: 'Medium threshold', value: '30–65 → Flagged for Review',                                                         type: 'Config' },
                  { label: 'High threshold',   value: '> 65 → Auto-Rejected',                                                               type: 'Config' },
                ],
                outputs: nodeStates.score === 'done' && preVetResult ? [
                  { label: 'Risk Score', value: `${pct} / 100`,                                                                                                                            good: pct < 30                              },
                  { label: 'Verdict',    value: preVetResult.verdict === 'auto_approve' ? 'Auto-Approved' : preVetResult.verdict === 'flag_for_review' ? 'Flagged for Review' : 'Rejected', good: preVetResult.verdict === 'auto_approve' },
                  { label: 'Can Deploy', value: preVetResult.can_deploy ? 'Yes' : 'Blocked',                                                                                               good: preVetResult.can_deploy                },
                ] : [],
                scoring: 'The final score gates deployment. > 65 = blocked. 30–65 = deployed with a manual review flag. < 30 = auto-approved.',
              },
            ];

            return (
              <div className="space-y-4">
                {/* Header card */}
                <div className={card}>
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="font-bold text-xl text-slate-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                      AI Risk Analysis
                    </h2>
                    {(preVetState === 'done' || preVetState === 'error') && (
                      <button onClick={() => { setPreVetState('idle'); setNodeStates({ wallet: 'idle', content: 'idle', score: 'idle' }); setExpandedNode(null); runPreVet(); }}
                        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 border border-zinc-200 px-2.5 py-1.5 rounded-lg transition-all">
                        <RefreshCw className="w-3 h-3" /> Re-run
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-zinc-500">
                    Three independent checks run before you deploy — wallet reputation, content authenticity, and combined risk scoring.
                    Click <span className="font-semibold text-zinc-700">···</span> on any node to see exactly what data the flow is using.
                  </p>

                  {/* Pipeline flow */}
                  <div className="mt-5 space-y-1">
                    {nodes.map((node, i) => {
                      const ns = nodeStates[node.id];
                      const isOpen = expandedNode === node.id;
                      return (
                        <div key={node.id}>
                          <motion.div
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className={`border rounded-2xl overflow-hidden transition-all duration-300 ${
                              ns === 'running' ? 'border-black bg-zinc-50 shadow-sm' :
                              ns === 'done'    ? 'border-zinc-300 bg-white' :
                              'border-zinc-200 bg-zinc-50/40'
                            }`}
                          >
                            {/* Node header row */}
                            <div className="flex items-center gap-3 px-4 py-3">
                              <NodeStatusIcon state={ns} />
                              <node.icon className={`w-4 h-4 shrink-0 ${ns === 'running' ? 'text-black' : ns === 'done' ? 'text-zinc-800' : 'text-zinc-400'}`} />
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm font-semibold ${ns === 'running' ? 'text-black' : ns === 'done' ? 'text-zinc-800' : 'text-zinc-400'}`}
                                  style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                                  {node.label}
                                </div>
                                <div className="text-[11px] text-zinc-400 truncate mt-0.5">{node.desc}</div>
                              </div>
                              <Tag label={node.method.label} color={node.method.color} />
                              {ns === 'running' && (
                                <div className="flex gap-1 ml-1">
                                  {[0,1,2].map(d => (
                                    <div key={d} className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                                  ))}
                                </div>
                              )}
                              <button
                                onClick={() => toggleExpand(node.id)}
                                className={`p-1.5 rounded-lg transition-all text-xs font-bold tracking-widest ${
                                  isOpen ? 'bg-zinc-100 text-zinc-700' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'
                                }`}
                                title="Show data details"
                              >
                                {isOpen ? '▲' : '···'}
                              </button>
                            </div>

                            {/* Expandable: Input Data panel */}
                            <AnimatePresence>
                              {isOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.25 }}
                                  className="overflow-hidden"
                                >
                                  <div className="border-t border-zinc-100 px-4 pt-3 pb-1">
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                                      Input Data
                                    </p>
                                    <div className="space-y-1.5">
                                      {node.inputs.map(inp => (
                                        <div key={inp.label} className="flex items-start gap-2">
                                          <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                                            inp.type === 'API'    ? 'bg-sky-50 text-sky-600 border border-sky-200' :
                                            inp.type === 'LLM' || inp.type === 'Model'   ? 'bg-purple-50 text-purple-600 border border-purple-200' :
                                            inp.type === 'DB'    ? 'bg-orange-50 text-orange-600 border border-orange-200' :
                                            inp.type === 'Logic' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                                            inp.type === 'Input' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                                            inp.type === 'Config'? 'bg-zinc-100 text-zinc-600 border border-zinc-200' :
                                            'bg-zinc-50 text-zinc-500 border border-zinc-200'
                                          }`}>
                                            {inp.type}
                                          </span>
                                          <div className="flex-1 flex items-baseline justify-between gap-2 min-w-0">
                                            <span className="text-xs text-zinc-500 shrink-0">{inp.label}</span>
                                            <span className="text-xs font-semibold text-zinc-800 truncate text-right">{inp.value}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="mt-3 p-2.5 bg-zinc-50 border border-zinc-100 rounded-lg">
                                      <p className="text-[10px] text-zinc-400">
                                        <span className="font-semibold text-zinc-500">Scoring note: </span>
                                        {node.scoring}
                                      </p>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Output data */}
                            <AnimatePresence>
                              {ns === 'running' && isOpen && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="border-t border-zinc-100 px-4 py-3"
                                  >
                                    <div className="flex items-center gap-2 mb-3">
                                      <Loader2 className="w-3 h-3 text-black animate-spin" />
                                      <p className="text-[10px] font-bold text-zinc-900 uppercase tracking-widest">
                                        Computing Output…
                                      </p>
                                    </div>
                                    <div className="space-y-2.5 opacity-60">
                                      <div className="h-2 bg-zinc-200 rounded w-full animate-pulse" />
                                      <div className="h-2 bg-zinc-200 rounded w-3/4 animate-pulse" />
                                      <div className="h-2 bg-zinc-200 rounded w-1/2 animate-pulse" />
                                    </div>
                                  </motion.div>
                              )}
                              {ns === 'done' && node.outputs.length > 0 && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.3 }}
                                  className="border-t border-emerald-100 px-4 py-3"
                                >
                                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">
                                    Output
                                  </p>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                    {node.outputs.map(({ label, value, good }) => (
                                      <div key={label} className="flex items-center justify-between text-xs">
                                        <span className="text-zinc-400 font-medium">{label}</span>
                                        <span className={`font-semibold ${good ? 'text-emerald-600' : 'text-red-500'}`}>{value}</span>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>

                          {/* Connector line */}
                          {i < nodes.length - 1 && (
                            <div className="flex justify-center py-1">
                              <div className={`w-0.5 h-4 rounded-full transition-colors duration-500 ${
                                nodeStates[nodes[i+1].id] !== 'idle' ? 'bg-black' : 'bg-zinc-200'
                              }`} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Final result card */}
                <AnimatePresence>
                  {preVetState === 'done' && preVetResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="border rounded-xl p-5 space-y-4 bg-white border-zinc-200"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {preVetResult.verdict === 'auto_approve'    && <ShieldCheck className="w-5 h-5 text-zinc-900" />}
                          {preVetResult.verdict === 'flag_for_review' && <ShieldAlert className="w-5 h-5 text-zinc-900" />}
                          {preVetResult.verdict === 'auto_reject'     && <ShieldX className="w-5 h-5 text-zinc-900" />}
                          <div>
                            <div className="font-bold text-sm text-zinc-900">
                              {preVetResult.verdict === 'auto_approve' ? 'Low Risk — Ready to Deploy' :
                               preVetResult.verdict === 'flag_for_review' ? 'Medium Risk — Will be manually reviewed' :
                               'High Risk — Deployment Blocked'}
                            </div>
                            <div className="text-xs text-zinc-400 mt-0.5">Analysis complete</div>
                          </div>
                        </div>
                        <div className="text-3xl font-black text-zinc-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                          {pct}<span className="text-sm font-normal text-zinc-400">/100</span>
                        </div>
                      </div>

                      <div>
                        <div className="h-1 bg-zinc-100 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            className="h-full bg-zinc-900"
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-zinc-400 mt-2">
                          <span>0 — Safe</span><span>65 — Review</span><span>100 — Blocked</span>
                        </div>
                      </div>

                      {preVetResult.reasons.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Flags</p>
                          {preVetResult.reasons.map(r => (
                            <div key={r} className="flex items-center gap-1.5 text-xs text-zinc-600">
                              <div className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                              {r.replace(/_/g, ' ')}
                            </div>
                          ))}
                        </div>
                      )}

                      {preVetResult.can_deploy ? (
                        <button onClick={() => setStep(4)} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                          <ChevronRight className="w-4 h-4" /> Continue to Review &amp; Deploy
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                            <ShieldX className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                            <div>
                              <div className="font-semibold mb-0.5">Deployment blocked</div>
                              Your campaign scored too high on risk. Please go back and update your title, description, or reduce your funding goal to a realistic amount.
                            </div>
                          </div>
                          <button 
                            onClick={() => setStep(4)} 
                            className="w-full py-2 text-xs font-semibold text-zinc-500 bg-zinc-50 hover:bg-zinc-100 transition-colors border border-dashed border-zinc-300 flex items-center justify-center gap-2"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Force Continue to Step 4 (Just for Development)
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Agent offline fallback */}
                {preVetState === 'error' && (
                  <div className="border border-zinc-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-sm text-zinc-700">Risk check unavailable</div>
                      <div className="text-xs text-zinc-500 mt-0.5">Agent backend is offline. You can still proceed — your campaign will be reviewed manually after deployment.</div>
                      <button onClick={() => setStep(4)} className="btn-primary mt-3 px-4 py-2 text-sm flex items-center gap-2">
                        <ChevronRight className="w-4 h-4" /> Continue Anyway
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}          {/* ── STEP 4: Review & Deploy ── */}
          {step === 4 && (
            <div className="space-y-5">
              <div className={card}>
                <h2 className="font-bold text-xl text-slate-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Review & Deploy
                </h2>

                {deployed ? (
                  <div className="text-center py-8">
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      className="w-14 h-14 bg-zinc-900 flex items-center justify-center mx-auto mb-5">
                      <CheckCircle className="w-7 h-7 text-white" />
                    </motion.div>
                    <h3 className="font-bold text-xl text-zinc-900 mb-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                      Campaign Deployed
                    </h3>
                    <p className="text-zinc-500 text-sm mb-4">Your campaign is live on Sepolia. Redirecting to Explore…</p>
                    {txHash && <TxHashBadge txHash={txHash} label="View on Etherscan" className="mx-auto" />}
                  </div>
                ) : (
                  <>
                    {/* Risk score summary badge */}
                    {preVetResult && (
                      <div className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-white border border-zinc-200">
                        {preVetResult.verdict === 'auto_approve'
                          ? <ShieldCheck className="w-4 h-4 text-zinc-900 shrink-0" />
                          : <ShieldAlert className="w-4 h-4 text-zinc-900 shrink-0" />}
                        <div className="flex-1 text-xs">
                          <span className="font-semibold">AI Risk Score: {Math.round(preVetResult.risk_score * 100)}/100</span>
                          <span className="text-zinc-500 ml-2">Â·</span>
                          <span className="ml-2 text-zinc-500">
                            {preVetResult.verdict === 'auto_approve' ? 'Low risk — auto approved' : 'Medium risk — will be reviewed after deployment'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Summary table */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      {[
                        { label: 'Title',         value: form.title || '—'                                },
                        { label: 'Category',      value: form.category                                   },
                        { label: 'Goal',          value: form.goalEth ? `${form.goalEth} ETH` : '—'      },
                        { label: 'Duration',      value: `${form.durationDays} days`                     },
                        { label: 'Milestones',    value: `${form.milestones.length} defined`             },
                        { label: 'Reward Tiers',  value: `${form.rewardTiers.length} defined`            },
                        { label: 'Creator',       value: address ? `${address.slice(0,6)}…${address.slice(-4)}` : 'Not connected' },
                        { label: 'Network',       value: 'Sepolia Testnet'                               },
                        { label: 'Platform Fee',  value: '2.5%'                                          },
                      ].map(({ label, value }, i) => (
                        <div key={label} className={`flex justify-between items-center px-4 py-3 text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                          <span className="text-slate-500 font-medium">{label}</span>
                          <span className="text-slate-800 font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Validation warnings */}
                    {!isStep0Valid && (
                      <div className="flex items-center gap-2 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        Complete Step 1: add a title and description.
                      </div>
                    )}
                    {!isStep1Valid && (
                      <div className="flex items-center gap-2 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        Complete Step 2: set a valid funding goal.
                      </div>
                    )}
                    {!isStep2Valid && (
                      <div className="flex items-center gap-2 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        Milestone percentages must total 100% and each must have a title.
                      </div>
                    )}
                    {!isConnected && (
                      <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        Connect your wallet to deploy the campaign contract.
                      </div>
                    )}

                    {/* Pending tx badge */}
                    {txHash && !deployed && (
                      <div className="p-4 bg-zinc-50 border border-zinc-200">
                        <p className="text-xs text-zinc-600 font-semibold mb-2 flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" /> Transaction submitted — waiting for on-chain confirmation…
                        </p>
                        <TxHashBadge txHash={txHash} />
                      </div>
                    )}

                    {/* Deploy button */}
                    {chainId !== sepolia.id ? (
                      <button
                        onClick={() => switchChain?.({ chainId: sepolia.id })}
                        className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700"
                      >
                        <RefreshCw className="w-4 h-4" /> Switch to Sepolia Testnet
                      </button>
                    ) : (
                      <button
                        id="deploy-btn"
                        onClick={handleDeploy}
                        disabled={!canDeploy || deploying}
                        className="btn-primary w-full py-3.5 text-base disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                      >
                        {deploying
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Deploying Contract…</>
                          : <><Rocket className="w-4 h-4" /> Deploy Campaign Contract</>
                        }
                      </button>
                    )}

                    {/* Dev Mode Force Launch */}
                    {preVetResult && !preVetResult.can_deploy && (
                      <button
                        onClick={handleDeploy}
                        disabled={deploying || !isConnected}
                        className="w-full py-2 text-xs font-semibold text-zinc-500 bg-zinc-50 hover:bg-zinc-100 transition-colors border border-dashed border-zinc-300 flex items-center justify-center gap-2 mt-2"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Force Launch (Just for Development)
                      </button>
                    )}

                    <p className="text-xs text-center text-zinc-400 mt-4">
                      Calls <code className="bg-zinc-100 px-1.5 py-0.5 text-zinc-600">CampaignFactory.createCampaign()</code> on Sepolia Testnet
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      {!deployed && (
        <div className="flex justify-between mt-6">
          <button
            id="prev-step"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="btn-secondary flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          {/* Step 3 (AI Check) uses its own CTA buttons — hide generic Next */}
          {step < STEPS.length - 1 && step !== 3 && (
            <button
              id="next-step"
              onClick={() => setStep(s => s + 1)}
              disabled={step === 0 ? !isStep0Valid : step === 1 ? !isStep1Valid : step === 2 ? !isStep2Valid : false}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

