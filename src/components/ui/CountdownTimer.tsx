'use client';

import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  deadline: bigint;
  className?: string;
}

export function CountdownTimer({ deadline, className = '' }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: false });

  useEffect(() => {
    function compute() {
      const now = Math.floor(Date.now() / 1000);
      const diff = Number(deadline) - now;
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
        return;
      }
      setTimeLeft({
        days: Math.floor(diff / 86400),
        hours: Math.floor((diff % 86400) / 3600),
        minutes: Math.floor((diff % 3600) / 60),
        seconds: diff % 60,
        expired: false,
      });
    }
    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (timeLeft.expired) {
    return <span className={`text-red-400 font-semibold text-sm ${className}`}>Campaign Ended</span>;
  }

  const units = [
    { label: 'd', value: timeLeft.days },
    { label: 'h', value: timeLeft.hours },
    { label: 'm', value: timeLeft.minutes },
    { label: 's', value: timeLeft.seconds },
  ];

  return (
    <div className={`flex items-center gap-1.5 ${className}`} suppressHydrationWarning>
      {units.map(({ label, value }, i) => (
        <span key={label} className="flex items-center gap-0.5" suppressHydrationWarning>
          <span className="font-mono font-bold text-sm text-slate-200" suppressHydrationWarning>
            {String(value).padStart(2, '0')}
          </span>
          <span className="text-xs text-slate-500">{label}</span>
          {i < 3 && <span className="text-slate-600 mx-0.5">:</span>}
        </span>
      ))}
    </div>
  );
}
