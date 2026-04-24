'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { CAMPAIGN_ABI } from '@/lib/contracts';
import type { OnChainCampaign } from '@/lib/useCampaigns';
import { TxHashBadge } from './TxHashBadge';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  campaign: OnChainCampaign;
  onSuccess?: () => void;
}

type TxStep = 'idle' | 'confirming' | 'pending' | 'success' | 'error';

const PRESETS = ['0.001', '0.005', '0.01', '0.05', '0.1'];

export function ContributeModal({ isOpen, onClose, campaign, onSuccess }: Props) {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState('');
  const [txStep, setTxStep] = useState<TxStep>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);

  const { writeContract } = useWriteContract({
    mutation: {
      onSuccess: (hash) => { setTxHash(hash); setTxStep('pending'); toast.loading('Transaction submitted!', { id: 'tx-toast' }); },
      onError: (err) => { setTxStep('error'); toast.error(err.message.slice(0, 100)); },
    },
  });

  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash, query: { enabled: !!txHash } });

  const ethValue = parseFloat(amount) || 0;

  // ✅ useEffect — no setState in render
  useEffect(() => {
    if (isSuccess && txStep === 'pending') {
      setTxStep('success');
      toast.success('Contribution confirmed on-chain! 🎉');

      // Save to NeonDB
      fetch('/api/campaigns/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractAddress: campaign.address,
          backerAddress: address ?? '',
          amountWei: (BigInt(Math.round(ethValue * 1e18))).toString(),
          txHash,
        }),
      })
        .then(r => r.json())
        .then(d => console.log('[DB] Contribution saved:', d))
        .catch(e => console.error('[DB] Contribution save failed:', e));

      onSuccess?.();
    }
  }, [isSuccess, txStep, onSuccess, campaign.address, address, ethValue, txHash]);

  const handleContribute = () => {
    if (!amount || ethValue <= 0) return;
    setTxStep('confirming');
    writeContract({
      address: campaign.address,
      abi: CAMPAIGN_ABI,
      functionName: 'contribute',
      value: parseEther(amount),
    });
  };

  const reset = () => { setTxStep('idle'); setAmount(''); setTxHash(undefined); onClose(); };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={reset} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          <motion.div initial={{ opacity: 0, scale: 0.92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-purple-600 flex items-center justify-center shadow">
                  <Zap className="w-4 h-4 text-white" fill="currentColor" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Back This Project</h3>
                  <p className="text-xs text-slate-500 truncate max-w-[200px]">{campaign.title}</p>
                </div>
              </div>
              <button onClick={reset} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6">
              {txStep === 'success' ? (
                <div className="text-center py-4">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                    className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-600" />
                  </motion.div>
                  <h4 className="font-bold text-lg text-slate-900 mb-1">Contribution Confirmed!</h4>
                  <p className="text-slate-500 text-sm mb-4">You backed <strong>{campaign.title}</strong> with {ethValue} ETH.</p>
                  {txHash && <TxHashBadge txHash={txHash} className="mx-auto" />}
                  <button onClick={reset} className="btn-primary mt-5 w-full">Done</button>
                </div>
              ) : txStep === 'pending' ? (
                <div className="text-center py-6">
                  <Loader2 className="w-12 h-12 animate-spin text-sky-500 mx-auto mb-4" />
                  <h4 className="font-bold text-slate-900 mb-1">Waiting for Confirmation…</h4>
                  <p className="text-slate-500 text-sm mb-4">Your transaction is being mined on Sepolia.</p>
                  {txHash && <TxHashBadge txHash={txHash} className="mx-auto" />}
                </div>
              ) : (
                <>
                  {/* Amount */}
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Amount (ETH)</label>
                    <div className="relative">
                      <input id="contribute-amount" type="number" step="0.001" min="0"
                        value={amount} onChange={e => setAmount(e.target.value)}
                        placeholder="0.000" className="input-crypto pr-14 text-xl font-bold" />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500 font-bold">ETH</span>
                    </div>
                    {ethValue > 0 && <p className="text-xs text-slate-400 mt-1">≈ ${(ethValue * 3200).toFixed(2)} USD</p>}
                  </div>

                  {/* Preset buttons */}
                  <div className="flex gap-2 mb-5 flex-wrap">
                    {PRESETS.map(p => (
                      <button key={p} onClick={() => setAmount(p)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${amount === p
                            ? 'bg-sky-50 border-sky-300 text-sky-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-700'
                          }`}>
                        {p} ETH
                      </button>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className="bg-slate-50 rounded-xl p-4 mb-5 text-sm space-y-2 border border-slate-100">
                    <div className="flex justify-between text-slate-600">
                      <span>Campaign goal</span>
                      <span className="font-semibold text-slate-800">{campaign.goalEth.toFixed(3)} ETH</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Raised so far</span>
                      <span className="font-semibold text-slate-800">{campaign.raisedEth.toFixed(3)} ETH</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Platform fee</span>
                      <span className="font-semibold text-slate-800">2.5%</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200">
                      <span className="font-semibold text-slate-700">You contribute</span>
                      <span className="font-black text-sky-600">{ethValue.toFixed(4)} ETH</span>
                    </div>
                  </div>

                  {!isConnected && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm mb-4">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" /> Connect your wallet to contribute
                    </div>
                  )}

                  <button id="contribute-submit" onClick={handleContribute}
                    disabled={!isConnected || ethValue <= 0 || txStep === 'confirming'}
                    className="btn-primary w-full py-3.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2">
                    {txStep === 'confirming'
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Confirm in MetaMask…</>
                      : `⚡ Contribute ${ethValue > 0 ? `${ethValue} ETH` : ''}`
                    }
                  </button>
                  <p className="text-xs text-center text-slate-400 mt-3">
                    ETH is held in smart contract escrow. Auto-refund if goal isn't met.
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
