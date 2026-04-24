'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Home, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-md"
      >
        <div
          className="text-8xl font-black gradient-text mb-4"
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
        >
          404
        </div>
        <h1
          className="text-2xl font-bold text-slate-200 mb-3"
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
        >
          Campaign Not Found
        </h1>
        <p className="text-slate-500 mb-8">
          This campaign address doesn't exist on the current network, or it may have been deployed on a different chain.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/">
            <button className="btn-secondary flex items-center gap-2"><Home className="w-4 h-4" /> Home</button>
          </Link>
          <Link href="/explore">
            <button className="btn-primary flex items-center gap-2"><Search className="w-4 h-4" /> Explore</button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
