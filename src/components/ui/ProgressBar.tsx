'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface ProgressBarProps {
  value: number; // 0–100
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  showLabel = true,
  size = 'md',
  animate = true,
  className = '',
}: ProgressBarProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  const heights = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-3.5' };
  const clamped = Math.min(100, Math.max(0, value));

  const getColor = () => {
    if (clamped >= 100) return 'from-emerald-400 to-emerald-500';
    if (clamped >= 75) return 'from-cyan-400 to-purple-500';
    if (clamped >= 50) return 'from-cyan-400 to-cyan-600';
    return 'from-cyan-500 to-blue-500';
  };

  return (
    <div className={`w-full ${className}`}>
      <div className={`w-full ${heights[size]} rounded-full bg-white/[0.06] overflow-hidden`}>
        <motion.div
          initial={animate ? { width: 0 } : { width: `${clamped}%` }}
          animate={{ width: mounted ? `${clamped}%` : animate ? 0 : `${clamped}%` }}
          transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
          className={`h-full rounded-full bg-gradient-to-r ${getColor()}`}
          style={{
            boxShadow: clamped > 0 ? '0 0 10px rgba(0, 245, 255, 0.4)' : undefined,
          }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between items-center mt-1.5">
          <span className="text-xs text-slate-500">
            {clamped >= 100 ? '✓ Goal Reached!' : `${Math.round(clamped)}% funded`}
          </span>
          {clamped >= 100 && (
            <span className="text-xs text-emerald-400 font-semibold">Funded!</span>
          )}
        </div>
      )}
    </div>
  );
}
