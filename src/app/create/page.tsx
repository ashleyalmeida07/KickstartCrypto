'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { useRouter } from 'next/navigation';
import {
  Upload, Plus, Trash2, ChevronLeft, ChevronRight,
  Loader2, CheckCircle, AlertCircle, Info, Rocket
} from 'lucide-react';
import toast from 'react-hot-toast';
import { CAMPAIGN_FACTORY_ADDRESS, CAMPAIGN_FACTORY_ABI } from '@/lib/contracts';
import { CampaignCategory } from '@/lib/types';
import { CATEGORIES } from '@/lib/data';
import { TxHashBadge } from '@/components/ui/TxHashBadge';
import { uploadCampaignImage } from '@/lib/utils';

const STEPS = ['Basic Info', 'Funding', 'Milestones', 'Review & Deploy'];

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
  const { address, isConnected } = useAccount();

  const [step, setStep]       = useState(0);
  const [form, setForm]       = useState<FormData>(DEFAULT_FORM);
  const [deploying, setDeploying] = useState(false);
  const [txHash, setTxHash]   = useState<`0x${string}` | undefined>(undefined);
  const [deployed, setDeployed] = useState(false);

  const { writeContract } = useWriteContract({
    mutation: {
      onSuccess: (hash) => {
        setTxHash(hash);
        toast.success('Transaction submitted — awaiting confirmation.');
      },
      onError: (err) => {
        setDeploying(false);
        toast.error(err.message.slice(0, 120));
      },
    },
  });

  const { isSuccess } = useWaitForTransactionReceipt({
    hash:  txHash,
    query: { enabled: !!txHash },
  });

  // After on-chain confirm — register in DB then redirect
  useEffect(() => {
    if (isSuccess && !deployed) {
      setDeployed(true);
      setDeploying(false);
      toast.success('Campaign deployed on-chain.');

      // Server resolves the contract address from the tx receipt log
      fetch('/api/campaigns/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash,
          creatorAddress:  address,
          title:           form.title,
          description:     form.shortDescription,
          category:        form.category,
          imageUrl:        form.thumbnailCid,
          goalEth:         form.goalEth,
          durationDays:    form.durationDays,
          milestones:      form.milestones,
          rewardTiers:     form.rewardTiers,
        }),
      })
        .then(r => r.json())
        .then(d => console.log('[DB] Campaign registered:', d))
        .catch(e => console.error('[DB] Register failed:', e));

      setTimeout(() => router.push('/explore'), 3500);
    }
  }, [isSuccess, deployed, router, address, form, txHash]);

  /* ── Derived ── */
  const totalMilestonePercent = form.milestones.reduce((s, m) => s + Number(m.percentage), 0);
  const isStep0Valid = form.title.length > 3 && form.shortDescription.length > 10;
  const isStep1Valid = parseFloat(form.goalEth) > 0 && form.durationDays >= 1;
  const isStep2Valid = form.milestones.length > 0 && totalMilestonePercent === 100 && form.milestones.every(m => m.title.trim());
  const canDeploy    = isConnected && isStep0Valid && isStep1Valid && isStep2Valid;

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

    // 1️⃣  Upload thumbnail to Supabase Storage (if the user selected one)
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

    // 2️⃣  Store metadata as JSON in the metadataCid field on-chain
    const metadataCid = JSON.stringify({
      title:       form.title,
      description: form.shortDescription,
      category:    form.category,
      image:       imageUrl,
    });

    writeContract({
      address:      CAMPAIGN_FACTORY_ADDRESS,
      abi:          CAMPAIGN_FACTORY_ABI,
      functionName: 'createCampaign',
      args: [
        parseEther(form.goalEth),
        BigInt(form.durationDays * 86400),
        metadataCid,
        form.milestones.map(m => m.title.trim()),
        form.milestones.map(m => m.description.trim()),
        form.milestones.map(m => Number(m.percentage)),
      ],
    });
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
                <label className={label}>Campaign Duration: <span className="text-sky-600">{form.durationDays} days</span></label>
                <input id="create-duration" type="range" min="7" max="90"
                  value={form.durationDays}
                  onChange={e => updateForm({ durationDays: parseInt(e.target.value) })}
                  className="w-full accent-sky-500 h-2 rounded-lg cursor-pointer" />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>7 days</span><span>90 days</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className={label + ' mb-0'}>Reward Tiers <span className="text-slate-400 font-normal normal-case tracking-normal">— optional</span></label>
                  <button onClick={addTier} className="text-xs text-sky-600 hover:text-sky-800 flex items-center gap-1 font-semibold">
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
                <button onClick={addMilestone} className="text-xs text-sky-600 hover:text-sky-800 flex items-center gap-1 font-semibold">
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
                  {totalMilestonePercent !== 100 && ` — must equal 100%`}
                </span>
                {totalMilestonePercent === 100 && <CheckCircle className="w-4 h-4 ml-auto flex-shrink-0" />}
              </div>

              <div className="space-y-4">
                {form.milestones.map((m, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-xl p-5 space-y-3 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-sky-600" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
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

          {/* ── STEP 3: Review & Deploy ── */}
          {step === 3 && (
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
                    <p className="text-xs text-center text-zinc-400">
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
          {step < STEPS.length - 1 && (
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
