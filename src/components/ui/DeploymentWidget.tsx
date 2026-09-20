'use client';
/**
 * DeploymentWidget — persistent floating panel (bottom-right).
 *
 * Rendered in providers.tsx so it survives any page navigation.
 * Shows live deployment progress: Submitting → Confirming on-chain → Registering → Done.
 */
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Loader2, CheckCircle, AlertCircle, Rocket,
  X, ExternalLink, ChevronRight, Clock,
} from 'lucide-react';
import { useDeployment } from '@/context/DeploymentContext';

const SEPOLIA_ETHERSCAN = 'https://sepolia.etherscan.io/tx/';

export function DeploymentWidget() {
  const { deploy, dismiss } = useDeployment();
  const { status, txHash, campaignTitle, campaignAddress, errorMsg } = deploy;

  const isVisible = status !== 'idle';

  const steps = [
    { id: 'submitting',  label: 'Submitting transaction',    done: status !== 'submitting' },
    { id: 'confirming',  label: 'Waiting for on-chain confirmation', done: ['registering','done','error'].includes(status) },
    { id: 'registering', label: 'Registering in database',  done: status === 'done' || status === 'error' },
  ];

  const currentStepIdx =
    status === 'submitting'  ? 0 :
    status === 'confirming'  ? 1 :
    status === 'registering' ? 2 : 3;

  const isDone  = status === 'done';
  const isError = status === 'error';

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="deploy-widget"
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-6 right-6 z-[9999] w-80 shadow-2xl rounded-2xl overflow-hidden"
          style={{ fontFamily: 'var(--font-inter)' }}
        >
          {/* Header bar */}
          <div className={`px-4 py-3 flex items-center gap-3 ${
            isDone  ? 'bg-emerald-600' :
            isError ? 'bg-red-600' :
            'bg-zinc-900'
          }`}>
            <div className="flex-1 flex items-center gap-2">
              {isDone  && <CheckCircle className="w-4 h-4 text-white shrink-0" />}
              {isError && <AlertCircle className="w-4 h-4 text-white shrink-0" />}
              {!isDone && !isError && <Loader2 className="w-4 h-4 text-white shrink-0 animate-spin" />}
              <span className="text-white text-sm font-semibold truncate" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                {isDone  ? 'Campaign Deployed!' :
                 isError ? 'Deployment Failed' :
                 'Deploying Campaign…'}
              </span>
            </div>
            {(isDone || isError) && (
              <button onClick={dismiss}
                className="text-white/70 hover:text-white transition-colors p-0.5 rounded-md">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="bg-white px-4 py-3 space-y-3">
            {/* Campaign title */}
            {campaignTitle && (
              <p className="text-xs text-zinc-500 truncate">
                <span className="font-medium text-zinc-700">Campaign:</span> {campaignTitle}
              </p>
            )}

            {/* Step tracker — only while in progress */}
            {!isDone && !isError && (
              <div className="space-y-2">
                {steps.map((step, i) => {
                  const isActive = i === currentStepIdx;
                  const isPast   = i < currentStepIdx;
                  return (
                    <div key={step.id} className="flex items-center gap-2.5">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        isPast   ? 'bg-emerald-500' :
                        isActive ? 'bg-zinc-900' :
                        'bg-zinc-100 border border-zinc-200'
                      }`}>
                        {isPast   && <CheckCircle className="w-3 h-3 text-white" />}
                        {isActive && <Loader2 className="w-3 h-3 text-white animate-spin" />}
                        {!isPast && !isActive && <div className="w-1.5 h-1.5 rounded-full bg-zinc-300" />}
                      </div>
                      <span className={`text-xs ${
                        isPast   ? 'text-emerald-600 font-medium' :
                        isActive ? 'text-zinc-900 font-semibold' :
                        'text-zinc-400'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tx hash link */}
            {txHash && (
              <a
                href={`${SEPOLIA_ETHERSCAN}${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] font-mono text-sky-600 hover:text-sky-800 transition-colors bg-sky-50 rounded-lg px-3 py-2"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="truncate">Tx: {txHash.slice(0, 10)}…{txHash.slice(-6)}</span>
              </a>
            )}

            {/* Done state */}
            {isDone && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-xs text-emerald-700 font-medium">All 3 steps complete</span>
                </div>
                {campaignAddress && (
                  <Link
                    href={`/campaign/${campaignAddress}`}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900 text-white text-xs font-semibold rounded-xl hover:bg-zinc-700 transition-colors"
                    onClick={dismiss}
                  >
                    <span>View Campaign</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                )}
                <Link
                  href="/explore"
                  className="flex items-center justify-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 transition-colors py-1"
                  onClick={dismiss}
                >
                  Browse all campaigns
                </Link>
              </div>
            )}

            {/* Error state */}
            {isError && (
              <div className="p-3 bg-red-50 rounded-xl">
                <p className="text-xs text-red-600 font-medium">Deployment failed</p>
                {errorMsg && <p className="text-[11px] text-red-500 mt-1">{errorMsg.slice(0, 120)}</p>}
              </div>
            )}

            {/* Progress hint while running */}
            {!isDone && !isError && (
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                <Clock className="w-3 h-3 shrink-0" />
                You can browse away — this will stay open.
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
