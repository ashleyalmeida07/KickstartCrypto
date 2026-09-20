'use client';

/**
 * MilestoneProofModal — creator-facing entry point for LangGraph Flow 3.
 *
 * The creator picks a proof type, uploads or links the evidence, and submits.
 * The agent backend returns 202 immediately and verifies in the background, so
 * this polls for the verdict and shows the score breakdown behind it — a
 * creator sent to the admin queue should be able to see why.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Upload, Link2, FileText, Image as ImageIcon, Loader2,
  CheckCircle, AlertTriangle, XCircle, ShieldCheck, ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useUpload } from '@/lib/useUpload';
import { BUCKETS } from '@/lib/supabase';
import { AGENT_URL } from '@/lib/agent';

type ProofType = 'image' | 'pdf' | 'link' | 'text';

interface ProofResult {
  proof_id:            string;
  status:              string;
  verdict:             string | null;
  confidence:          number | null;
  ocr_confidence:      number | null;
  spend_match_score:   number | null;
  consistency_score:   number | null;
  consistency_notes:   string | null;
  onchain_outflow_eth: number | null;
  claimed_spend_eth:   number | null;
  tranche_eth:         number | null;
  payout_status:       string | null;
  reasons:             string[] | null;
}

interface Props {
  isOpen:          boolean;
  onClose:         () => void;
  contractAddress: string;
  creatorAddress:  string;
  milestone:       { index: number; title: string; percentage: number };
  trancheEth?:     number;
  onResolved?:     () => void;
}

const PROOF_TYPES: {
  value: ProofType;
  label: string;
  hint: string;
  icon: typeof ImageIcon;
}[] = [
  { value: 'image', label: 'Image',  hint: 'Receipts, photos of physical progress or deliverables', icon: ImageIcon },
  { value: 'pdf',   label: 'PDF',    hint: 'Invoices, contracts, official documents',               icon: FileText  },
  { value: 'link',  label: 'Link',   hint: 'GitHub commit, deployed app URL, video',                icon: Link2     },
  { value: 'text',  label: 'Text',   hint: 'Your own written explanation, on its own',              icon: FileText  },
];

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS  = 120_000;

function pct(v: number | null | undefined) {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
}

export function MilestoneProofModal({
  isOpen, onClose, contractAddress, creatorAddress, milestone, trancheEth, onResolved,
}: Props) {
  const { upload, uploading } = useUpload();

  const [proofType, setProofType]   = useState<ProofType>('image');
  const [proofUrl, setProofUrl]     = useState('');
  const [fileName, setFileName]     = useState('');
  const [linkUrl, setLinkUrl]       = useState('');
  const [description, setDescription] = useState('');
  const [claimedSpend, setClaimedSpend] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying]   = useState(false);
  const [result, setResult]         = useState<ProofResult | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  // ── Cleanup: never leave a poll running after unmount ──────────────────────
  useEffect(() => () => {
    cancelled.current = true;
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  const reset = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setProofType('image');
    setProofUrl(''); setFileName(''); setLinkUrl('');
    setDescription(''); setClaimedSpend('');
    setSubmitting(false); setVerifying(false); setResult(null);
    onClose();
  }, [onClose]);

  const handleFile = async (file: File | null) => {
    if (!file) return;

    const isPdf = file.type === 'application/pdf';
    if (proofType === 'pdf' && !isPdf) {
      toast.error('Please choose a PDF file, or switch the proof type to Image.');
      return;
    }
    if (proofType === 'image' && !file.type.startsWith('image/')) {
      toast.error('Please choose an image file, or switch the proof type to PDF.');
      return;
    }

    const uploaded = await upload(file, {
      bucket: BUCKETS.updates,
      folder: `proofs/${contractAddress}/m${milestone.index}`,
    });
    if (uploaded) {
      setProofUrl(uploaded.url);
      setFileName(file.name);
      toast.success('Proof uploaded.');
    }
  };

  // ── Poll until the graph reaches a terminal state ──────────────────────────
  const pollProof = useCallback((proofId: string, startedAt: number) => {
    const tick = async () => {
      if (cancelled.current) return;

      try {
        const res = await fetch(`${AGENT_URL}/milestone-proof/${proofId}`);
        if (res.ok) {
          const data: ProofResult = await res.json();
          const done = !['pending', 'running'].includes(data.status);

          if (done) {
            setResult(data);
            setVerifying(false);
            onResolved?.();
            if (data.status === 'auto_approved')      toast.success('Milestone verified — tranche cleared.');
            else if (data.status === 'pending_review') toast('Proof sent to admin review.', { icon: '⏳' });
            else if (data.status === 'rejected')       toast.error('Proof was rejected.');
            else                                       toast.error('Verification could not complete.');
            return;
          }
        }
      } catch {
        // Transient — the timeout below is the real backstop
      }

      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setVerifying(false);
        toast.error('Verification is taking longer than expected. Check back shortly.');
        return;
      }
      pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
    };

    pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
  }, [onResolved]);

  const handleSubmit = async () => {
    const url = proofType === 'link' ? linkUrl.trim() : proofUrl;

    if (proofType === 'text' && !description.trim()) {
      toast.error('Add a description — it is the only proof being submitted.');
      return;
    }
    if (proofType !== 'text' && !url) {
      toast.error(proofType === 'link' ? 'Paste the link to your proof.' : 'Upload your proof file first.');
      return;
    }

    setSubmitting(true);
    cancelled.current = false;

    try {
      const res = await fetch(`${AGENT_URL}/milestone-proof/submit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_address:  contractAddress,
          milestone_index:   milestone.index,
          submitted_by:      creatorAddress,
          proof_type:        proofType,
          proof_url:         proofType === 'text' ? null : url,
          proof_text:        description.trim() || null,
          claimed_spend_eth: claimedSpend ? Number(claimedSpend) : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail ?? 'Submission failed');
      }

      setVerifying(true);
      pollProof(data.proof_id, Date.now());
    } catch (err) {
      toast.error((err as Error).message.slice(0, 160));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const activeType = PROOF_TYPES.find(t => t.value === proofType)!;
  const tranche    = trancheEth ?? result?.tranche_eth ?? null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm overflow-y-auto"
        onClick={reset}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          onClick={e => e.stopPropagation()}
          className="relative w-full max-w-lg bg-white border border-zinc-200 shadow-2xl my-8"
        >
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-4 border-b border-zinc-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 text-sm" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Submit Milestone Proof
                </h3>
                <p className="text-xs text-zinc-500">
                  Milestone {milestone.index + 1}: {milestone.title} · {milestone.percentage}%
                  {tranche !== null && <> · ~{tranche.toFixed(4)} ETH</>}
                </p>
              </div>
            </div>
            <button onClick={reset} className="w-8 h-8 hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6">

            {/* ── Verifying ──────────────────────────────────────────────── */}
            {verifying && (
              <div className="text-center py-8">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto mb-4" />
                <h4 className="font-bold text-zinc-900 mb-1" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Verifying your proof…
                </h4>
                <p className="text-zinc-500 text-sm max-w-xs mx-auto leading-relaxed">
                  Reading the document, comparing your claimed spend against on-chain
                  activity, and checking it against what this milestone promised.
                </p>
              </div>
            )}

            {/* ── Result ─────────────────────────────────────────────────── */}
            {!verifying && result && (
              <div>
                {(() => {
                  const map = {
                    auto_approved:  { Icon: CheckCircle,   cls: 'text-emerald-600 bg-emerald-50 border-emerald-200', title: 'Milestone Verified',   copy: 'The proof checks out. This tranche is cleared for release.' },
                    approved:       { Icon: CheckCircle,   cls: 'text-emerald-600 bg-emerald-50 border-emerald-200', title: 'Milestone Verified',   copy: 'An admin approved this proof. The tranche is cleared for release.' },
                    pending_review: { Icon: AlertTriangle, cls: 'text-amber-600 bg-amber-50 border-amber-200',       title: 'Sent for Review',      copy: 'The check was not conclusive, so a platform admin will make the call.' },
                    rejected:       { Icon: XCircle,       cls: 'text-red-600 bg-red-50 border-red-200',             title: 'Proof Rejected',       copy: 'This proof does not evidence the milestone as described.' },
                    error:          { Icon: AlertTriangle, cls: 'text-zinc-600 bg-zinc-50 border-zinc-200',          title: 'Verification Failed',  copy: 'Something went wrong on our side. An admin will follow up.' },
                  } as const;
                  const v = map[result.status as keyof typeof map] ?? map.error;
                  return (
                    <div className={`flex items-start gap-3 p-4 border mb-5 ${v.cls}`}>
                      <v.Icon className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-sm">{v.title}</div>
                        <div className="text-xs mt-0.5 leading-relaxed opacity-90">{v.copy}</div>
                      </div>
                    </div>
                  );
                })()}

                {/* Score breakdown */}
                <div className="border border-zinc-200 divide-y divide-zinc-100 text-xs mb-4">
                  {[
                    { label: 'Overall confidence',  value: pct(result.confidence), strong: true },
                    { label: 'Proof legibility',    value: pct(result.ocr_confidence) },
                    { label: 'On-chain spend match', value: pct(result.spend_match_score) },
                    { label: 'Milestone consistency', value: pct(result.consistency_score) },
                  ].map(({ label, value, strong }) => (
                    <div key={label} className="flex justify-between items-center px-3 py-2">
                      <span className="text-zinc-500">{label}</span>
                      <span className={strong ? 'font-bold text-zinc-900' : 'font-medium text-zinc-700'}>{value}</span>
                    </div>
                  ))}
                  {result.claimed_spend_eth !== null && (
                    <div className="flex justify-between items-center px-3 py-2">
                      <span className="text-zinc-500">Claimed vs on-chain outflow</span>
                      <span className="font-medium text-zinc-700">
                        {result.claimed_spend_eth.toFixed(4)} / {(result.onchain_outflow_eth ?? 0).toFixed(4)} ETH
                      </span>
                    </div>
                  )}
                </div>

                {result.consistency_notes && (
                  <div className="bg-zinc-50 border border-zinc-200 p-3 text-xs text-zinc-600 leading-relaxed mb-4">
                    <span className="font-semibold text-zinc-700">Assessment: </span>
                    {result.consistency_notes}
                  </div>
                )}

                {!!result.reasons?.length && (
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {result.reasons.slice(0, 12).map((r, i) => (
                      <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 text-zinc-500">
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                <button onClick={reset} className="btn-primary w-full">Done</button>
              </div>
            )}

            {/* ── Form ───────────────────────────────────────────────────── */}
            {!verifying && !result && (
              <>
                {/* Proof type */}
                <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2">
                  Proof type
                </label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {PROOF_TYPES.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => { setProofType(value); setProofUrl(''); setFileName(''); }}
                      className={`flex flex-col items-center gap-1.5 py-3 text-xs font-semibold border transition-all ${
                        proofType === value
                          ? 'bg-zinc-900 border-zinc-900 text-white'
                          : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-zinc-400 mb-5">{activeType.hint}</p>

                {/* Evidence input */}
                {(proofType === 'image' || proofType === 'pdf') && (
                  <div className="mb-5">
                    <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-1.5">
                      Upload {proofType === 'pdf' ? 'document' : 'image'}
                    </label>
                    <label className={`flex items-center justify-center gap-2 border border-dashed p-6 cursor-pointer transition-colors ${
                      proofUrl ? 'border-emerald-300 bg-emerald-50' : 'border-zinc-300 hover:border-zinc-400 bg-zinc-50'
                    }`}>
                      <input
                        type="file"
                        accept={proofType === 'pdf' ? 'application/pdf' : 'image/*'}
                        className="hidden"
                        onChange={e => handleFile(e.target.files?.[0] ?? null)}
                      />
                      {uploading ? (
                        <><Loader2 className="w-4 h-4 animate-spin text-zinc-400" /><span className="text-sm text-zinc-500">Uploading…</span></>
                      ) : proofUrl ? (
                        <><CheckCircle className="w-4 h-4 text-emerald-600" /><span className="text-sm text-emerald-700 font-medium truncate max-w-[220px]">{fileName}</span></>
                      ) : (
                        <><Upload className="w-4 h-4 text-zinc-400" /><span className="text-sm text-zinc-500">Choose a file (max 10 MB)</span></>
                      )}
                    </label>
                    {proofUrl && (
                      <a href={proofUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 mt-2 transition-colors">
                        <ExternalLink className="w-3 h-3" /> Preview upload
                      </a>
                    )}
                  </div>
                )}

                {proofType === 'link' && (
                  <div className="mb-5">
                    <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-1.5">
                      Proof link
                    </label>
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={e => setLinkUrl(e.target.value)}
                      placeholder="https://github.com/you/repo/commit/abc123"
                      className="input-crypto placeholder:text-zinc-400"
                    />
                    <p className="text-xs text-zinc-400 mt-1.5">
                      GitHub commits, PRs and repos are read through the GitHub API. Video and
                      Drive links can be recorded but not verified automatically.
                    </p>
                  </div>
                )}

                {/* Description — allowed alongside any type */}
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-1.5">
                    Your description {proofType === 'text' ? '(required)' : '(optional)'}
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Explain what this proof shows and how it completes the milestone…"
                    className="input-crypto resize-none placeholder:text-zinc-400"
                  />
                </div>

                {/* Claimed spend */}
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-1.5">
                    Amount spent (optional)
                  </label>
                  <div className="relative">
                    <input
                      type="number" step="0.0001" min="0"
                      value={claimedSpend}
                      onChange={e => setClaimedSpend(e.target.value)}
                      placeholder="0.0000"
                      className="input-crypto pr-14"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-400 font-bold">ETH</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1.5">
                    Compared against actual outflow from your wallet since the last verified milestone.
                  </p>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={submitting || uploading}
                  className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                    : <><ShieldCheck className="w-4 h-4" /> Submit for Verification</>}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
