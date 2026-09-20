'use client';

/**
 * MilestoneProofQueue — admin side of LangGraph Flow 3.
 *
 * Shows the proofs the flow could not decide on, with the full signal
 * breakdown behind each one, so an admin can see what the automated check
 * found before overriding it.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldQuestion, Loader2, CheckCircle2, XCircle, ExternalLink,
  ChevronDown, ChevronUp, RefreshCw, FileText, Link2, Image as ImageIcon,
  AlertTriangle,
} from 'lucide-react';
import { AGENT_URL } from '@/lib/agent';

interface QueuedProof {
  id:                    string;
  campaign_address:      string;
  campaign_title:        string | null;
  milestone_index:       number;
  milestone_title:       string | null;
  milestone_description: string | null;
  percentage:            number | null;
  submitted_by:          string;
  proof_type:            string;
  proof_url:             string | null;
  proof_text:            string | null;
  parsed_content:        string | null;
  claimed_spend_eth:     number | null;
  onchain_outflow_eth:   number | null;
  onchain_tx_count:      number | null;
  tranche_eth:           number | null;
  ocr_confidence:        number | null;
  spend_match_score:     number | null;
  consistency_score:     number | null;
  consistency_notes:     string | null;
  confidence:            number | null;
  reasons:               string[] | null;
  status:                string;
  verdict:               string | null;
  created_at:            string;
}

const TYPE_ICONS: Record<string, typeof FileText> = {
  image: ImageIcon, pdf: FileText, link: Link2, text: FileText,
};

function trunc(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }
function pct(v: number | null) { return v === null ? '—' : `${Math.round(v * 100)}%`; }

/** Colour a score by how much it supports approval. */
function scoreClass(v: number | null) {
  if (v === null) return 'text-zinc-400';
  if (v >= 0.75)  return 'text-emerald-600';
  if (v >= 0.45)  return 'text-amber-600';
  return 'text-red-600';
}

export function MilestoneProofQueue() {
  const [proofs, setProofs]   = useState<QueuedProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const fetchQueue = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${AGENT_URL}/milestone-proof/queue`);
      if (!res.ok) throw new Error(`Agent backend returned ${res.status}`);
      setProofs(await res.json());
    } catch {
      setError('Could not reach the agent backend — is it running on port 8001?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const handleResolve = async (proof: QueuedProof, action: 'approve' | 'reject') => {
    setResolving(proof.id);
    try {
      const res = await fetch(`${AGENT_URL}/milestone-proof/resolve/${proof.id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          review_notes: notes[proof.id] || null,
          reviewed_by:  'admin',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? 'Resolve failed');
      setProofs(prev => prev.filter(p => p.id !== proof.id));
    } catch (e) {
      alert(`Failed: ${(e as Error).message}`);
    } finally {
      setResolving(null);
    }
  };

  const pendingCount = proofs.filter(p => p.status === 'pending_review').length;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <ShieldQuestion className="w-4 h-4 text-amber-500" />
        <h2 className="text-base font-bold text-zinc-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          Milestone Proof Queue
        </h2>
        <span className="text-xs text-zinc-400 ml-auto">
          {pendingCount} awaiting review
        </span>
        <button onClick={fetchQueue} className="p-1.5 border border-zinc-200 hover:border-zinc-400 text-zinc-400 hover:text-zinc-700 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      <div className="border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center">
            <Loader2 className="w-7 h-7 animate-spin text-zinc-400 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">Loading proof queue…</p>
          </div>
        ) : proofs.length === 0 ? (
          <div className="p-10 text-center text-zinc-400 text-sm">
            No milestone proofs need attention.
          </div>
        ) : (
          <AnimatePresence>
            {proofs.map((p, i) => {
              const isExpanded = expanded === p.id;
              const Icon = TYPE_ICONS[p.proof_type] ?? FileText;
              const busy = p.status === 'pending' || p.status === 'running';

              return (
                <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ delay: i * 0.02 }}>

                  {/* ── Row ── */}
                  <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] items-center px-4 py-3.5 border-b border-zinc-100 last:border-0 gap-2 md:gap-0 hover:bg-zinc-50 transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span className="text-sm font-semibold text-zinc-900 truncate" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                          {p.campaign_title ?? trunc(p.campaign_address)}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5 truncate">
                        M{p.milestone_index + 1}: {p.milestone_title ?? '(untitled)'}
                        {p.percentage !== null && <span className="text-zinc-400"> · {p.percentage}%</span>}
                      </div>
                      <div className="text-xs text-zinc-400 font-mono">by {trunc(p.submitted_by)}</div>
                    </div>

                    <div className="text-xs">
                      <div className={`font-bold text-sm ${scoreClass(p.confidence)}`}>{pct(p.confidence)}</div>
                      <div className="text-zinc-400">confidence</div>
                    </div>

                    <div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 border uppercase tracking-wide ${
                        busy                           ? 'bg-sky-50 border-sky-200 text-sky-700' :
                        p.status === 'error'           ? 'bg-zinc-100 border-zinc-200 text-zinc-600' :
                                                         'bg-amber-50 border-amber-200 text-amber-700'
                      }`}>
                        {busy ? 'verifying' : p.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <a href={`/campaign/${p.campaign_address}`} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button onClick={() => setExpanded(isExpanded ? null : p.id)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 transition-colors">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* ── Expanded: the evidence and the scores behind it ── */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-b border-zinc-100">
                        <div className="px-4 py-5 bg-zinc-50 space-y-4">

                          {/* What was promised */}
                          <div>
                            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Milestone promised</div>
                            <div className="bg-white border border-zinc-200 p-3 text-xs text-zinc-700 leading-relaxed">
                              {p.milestone_description || '(no description in the campaign\'s milestone plan)'}
                            </div>
                          </div>

                          {/* Score breakdown */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                              { label: 'Confidence',  value: p.confidence },
                              { label: 'Legibility',  value: p.ocr_confidence },
                              { label: 'Spend match', value: p.spend_match_score },
                              { label: 'Consistency', value: p.consistency_score },
                            ].map(({ label, value }) => (
                              <div key={label} className="bg-white border border-zinc-200 p-3">
                                <div className={`text-lg font-bold ${scoreClass(value)}`} style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                                  {pct(value)}
                                </div>
                                <div className="text-[10px] text-zinc-400 uppercase tracking-wide">{label}</div>
                              </div>
                            ))}
                          </div>

                          {/* Money */}
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            {[
                              { label: 'Claimed spend',  val: p.claimed_spend_eth   !== null ? `${p.claimed_spend_eth.toFixed(4)} ETH` : 'not stated' },
                              { label: 'On-chain outflow', val: p.onchain_outflow_eth !== null ? `${p.onchain_outflow_eth.toFixed(4)} ETH (${p.onchain_tx_count ?? 0} tx)` : '—' },
                              { label: 'Tranche value',  val: p.tranche_eth         !== null ? `${p.tranche_eth.toFixed(4)} ETH` : '—' },
                            ].map(({ label, val }) => (
                              <div key={label} className="bg-white border border-zinc-200 p-3">
                                <div className="text-[10px] text-zinc-400 uppercase tracking-wide mb-0.5">{label}</div>
                                <div className="font-semibold text-zinc-800">{val}</div>
                              </div>
                            ))}
                          </div>

                          {/* Assessment */}
                          {p.consistency_notes && (
                            <div>
                              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Automated assessment</div>
                              <div className="bg-white border border-zinc-200 p-3 text-xs text-zinc-700 leading-relaxed">
                                {p.consistency_notes}
                              </div>
                            </div>
                          )}

                          {/* The proof itself */}
                          <div>
                            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Submitted proof ({p.proof_type})</div>
                            <div className="bg-white border border-zinc-200 p-3 space-y-2">
                              {p.proof_url && (
                                <a href={p.proof_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-800 transition-colors break-all">
                                  <ExternalLink className="w-3 h-3 shrink-0" /> {p.proof_url}
                                </a>
                              )}
                              {p.proof_text && (
                                <p className="text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap">{p.proof_text}</p>
                              )}
                              {p.parsed_content && (
                                <details className="text-xs">
                                  <summary className="cursor-pointer text-zinc-400 hover:text-zinc-700">Extracted content</summary>
                                  <pre className="mt-2 p-2 bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-600 whitespace-pre-wrap overflow-x-auto max-h-60">
                                    {p.parsed_content}
                                  </pre>
                                </details>
                              )}
                            </div>
                          </div>

                          {/* Flags */}
                          {!!p.reasons?.length && (
                            <div className="flex flex-wrap gap-1.5">
                              {p.reasons.map((r, ri) => (
                                <span key={ri} className="text-[10px] font-mono px-1.5 py-0.5 bg-white border border-zinc-200 text-zinc-500">
                                  {r}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Decision */}
                          {!busy && (
                            <div className="border-t border-zinc-200 pt-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                              <input
                                type="text"
                                placeholder="Review notes (optional)"
                                value={notes[p.id] ?? ''}
                                onChange={e => setNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                                className="input-crypto text-sm py-2 flex-1"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleResolve(p, 'approve')}
                                  disabled={resolving === p.id}
                                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-all disabled:opacity-50"
                                >
                                  {resolving === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleResolve(p, 'reject')}
                                  disabled={resolving === p.id}
                                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border bg-red-50 border-red-200 text-red-700 hover:bg-red-100 transition-all disabled:opacity-50"
                                >
                                  <XCircle className="w-4 h-4" /> Reject
                                </button>
                              </div>
                            </div>
                          )}
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

      <p className="text-xs text-zinc-400 mt-3">
        Approving marks the milestone verified and clears its tranche for release.
        Rejecting withholds it and lets the creator resubmit.
      </p>
    </div>
  );
}
