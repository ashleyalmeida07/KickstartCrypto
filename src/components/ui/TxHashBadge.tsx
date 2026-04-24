'use client';

import { ExternalLink } from 'lucide-react';
import { getEtherscanUrl } from '@/lib/data';

interface TxHashBadgeProps {
  txHash: string;
  network?: 'sepolia' | 'mainnet';
  label?: string;
  className?: string;
}

export function TxHashBadge({ txHash, network = 'sepolia', label, className = '' }: TxHashBadgeProps) {
  const short = `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;
  const url = getEtherscanUrl(txHash, network);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 text-xs font-mono hover:bg-cyan-400/20 hover:border-cyan-400/40 transition-all ${className}`}
      title={`View on Etherscan: ${txHash}`}
    >
      <span>{label || short}</span>
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}
