'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Clock, ThumbsUp, ThumbsDown, Lock, AlertTriangle } from 'lucide-react';
import { Milestone } from '@/lib/types';

interface MilestoneTimelineProps {
  milestones: Milestone[];
  canVote?: boolean;
  onVote?: (milestoneId: number, approve: boolean) => void;
}

const STATUS_ICONS = {
  completed: CheckCircle2,
  approved: CheckCircle2,
  voting: Clock,
  pending: Circle,
  rejected: AlertTriangle,
};

const STATUS_COLORS = {
  completed: 'text-emerald-400',
  approved: 'text-emerald-400',
  voting: 'text-amber-400',
  pending: 'text-slate-600',
  rejected: 'text-red-400',
};

const STATUS_BG = {
  completed: 'bg-emerald-400/10 border-emerald-400/30',
  approved: 'bg-emerald-400/10 border-emerald-400/30',
  voting: 'bg-amber-400/10 border-amber-400/30',
  pending: 'bg-white/5 border-white/10',
  rejected: 'bg-red-400/10 border-red-400/30',
};

export function MilestoneTimeline({ milestones, canVote = false, onVote }: MilestoneTimelineProps) {
  if (!milestones || milestones.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <Lock className="w-8 h-8 mx-auto mb-3 opacity-40" />
        <p>No milestones defined for this campaign.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {milestones.map((milestone, idx) => {
        const Icon = STATUS_ICONS[milestone.status];
        const colorClass = STATUS_COLORS[milestone.status];
        const bgClass = STATUS_BG[milestone.status];
        const totalVotes = milestone.votesFor + milestone.votesAgainst;
        const approvePercent = totalVotes > 0 ? Math.round((milestone.votesFor / totalVotes) * 100) : 0;
        const isVoting = milestone.status === 'voting';

        return (
          <motion.div
            key={milestone.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="flex gap-4"
          >
            {/* Connector line */}
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${bgClass}`}>
                <Icon className={`w-5 h-5 ${colorClass}`} />
              </div>
              {idx < milestones.length - 1 && (
                <div className="w-0.5 flex-1 my-1 bg-gradient-to-b from-white/10 to-transparent" />
              )}
            </div>

            {/* Content */}
            <div className={`flex-1 mb-6 p-4 rounded-xl border ${bgClass} glass`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <span className="text-xs text-slate-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                    Milestone {idx + 1}
                  </span>
                  <h4 className="font-bold text-slate-100 mt-0.5" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                    {milestone.title}
                  </h4>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-bold gradient-text">{milestone.percentage}%</div>
                  <div className="text-xs text-slate-500">of funds</div>
                </div>
              </div>

              <p className="text-sm text-slate-400 leading-relaxed mb-3">{milestone.description}</p>

              <div className="text-xs text-slate-500 mb-3">
                📅 Estimated: {milestone.estimatedDate}
              </div>

              {/* Vote section */}
              {(milestone.status === 'voting' || milestone.status === 'completed' || milestone.status === 'approved') && milestone.totalVoters > 0 && (
                <div className="mt-3 pt-3 border-t border-white/[0.05]">
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="w-3 h-3 text-emerald-400" />
                      {milestone.votesFor.toLocaleString()} approve ({approvePercent}%)
                    </span>
                    <span className="flex items-center gap-1">
                      {(100 - approvePercent)}% reject
                      <ThumbsDown className="w-3 h-3 text-red-400" />
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${approvePercent}%` }}
                      transition={{ duration: 1, delay: idx * 0.1 + 0.3 }}
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                    />
                  </div>
                  <div className="text-xs text-slate-600 mt-1">{totalVotes.toLocaleString()} / {milestone.totalVoters.toLocaleString()} voters cast</div>

                  {/* Vote buttons */}
                  {canVote && isVoting && (
                    <div className="flex gap-2 mt-3">
                      <button
                        id={`vote-approve-${milestone.id}`}
                        onClick={() => onVote?.(milestone.id, true)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-400/20 transition-all"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        id={`vote-reject-${milestone.id}`}
                        onClick={() => onVote?.(milestone.id, false)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-red-400/10 border border-red-400/20 text-red-400 text-sm font-semibold hover:bg-red-400/20 transition-all"
                      >
                        <ThumbsDown className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
