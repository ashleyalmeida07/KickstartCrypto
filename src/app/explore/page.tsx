'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, X, ChevronDown, RefreshCw, AlertCircle, Rocket, Flame, CheckCircle2, Users } from 'lucide-react';
import { CampaignCard, CampaignCardSkeleton } from '@/components/ui/CampaignCard';
import { useCampaigns } from '@/lib/useCampaigns';
import { CATEGORIES } from '@/lib/data';

type SortOption = 'trending' | 'newest' | 'most-funded' | 'ending-soon';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'trending',    label: 'Trending'    },
  { value: 'newest',      label: 'Newest'      },
  { value: 'most-funded', label: 'Most Funded' },
  { value: 'ending-soon', label: 'Ending Soon' },
];

export default function ExplorePage() {
  const { campaigns, isLoading, error, count } = useCampaigns();

  const [search, setSearch]             = useState('');
  const [selectedCategory, setCategory] = useState('All');
  const [selectedStatus,   setStatus]   = useState('All');
  const [sortBy, setSortBy]             = useState<SortOption>('trending');
  const [sidebarOpen, setSidebarOpen]   = useState(false);

  const filtered = useMemo(() => {
    let list = [...campaigns];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
      );
    }
    if (selectedCategory !== 'All') list = list.filter(c => c.category === selectedCategory);
    if (selectedStatus   !== 'All') list = list.filter(c => c.status   === selectedStatus);
    switch (sortBy) {
      case 'most-funded':  list.sort((a, b) => b.progressPercent - a.progressPercent); break;
      case 'ending-soon':  list.sort((a, b) => a.daysLeft - b.daysLeft); break;
      case 'newest':       list.sort((a, b) => Number(b.deadline) - Number(a.deadline)); break;
      default:             list.sort((a, b) => Number(b.backerCount) - Number(a.backerCount));
    }
    return list;
  }, [campaigns, search, selectedCategory, selectedStatus, sortBy]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-4xl font-black text-slate-900 mb-1" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          Explore <span className="gradient-text">Campaigns</span>
        </h1>
        <p className="text-slate-500">
          {isLoading ? 'Loading campaigns from blockchain…' : `${filtered.length} of ${count} campaigns`}
        </p>
      </motion.div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-6">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Could not connect to the contract. Check your network or RPC settings.
        </div>
      )}

      {/* Search + Sort */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="explore-search"
            type="text"
            placeholder="Search campaigns…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-crypto"
            style={{ paddingLeft: '2.75rem' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="relative">
          <select
            id="explore-sort"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            className="input-crypto pr-10 appearance-none cursor-pointer min-w-[150px]"
          >
            {SORT_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <button
          id="filter-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="sm:hidden btn-secondary py-2.5 px-4"
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-7">
        {/* Sidebar */}
        <aside className={`flex-shrink-0 ${sidebarOpen ? 'block' : 'hidden'} sm:block w-full sm:w-56`}>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sticky top-24 space-y-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Filter className="w-4 h-4 text-sky-500" /> Filters
              </h3>
              <button
                onClick={() => { setCategory('All'); setStatus('All'); }}
                className="text-xs text-slate-400 hover:text-sky-600 transition-colors"
              >
                Reset
              </button>
            </div>

            {/* Category */}
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mb-2">Category</p>
              <div className="space-y-0.5">
                {['All', ...CATEGORIES].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedCategory === cat
                        ? 'bg-sky-50 border border-sky-200 text-sky-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                    {cat !== 'All' && (
                      <span className="float-right text-xs text-slate-400">
                        {campaigns.filter(c => c.category === cat).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mb-2">Status</p>
              <div className="space-y-0.5">
                {['All', 'Active', 'Funded', 'Failed', 'Ended'].map(s => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedStatus === s
                        ? 'bg-sky-50 border border-sky-200 text-sky-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Live stats */}
            <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-2">
              <p className="flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-orange-500" /> {campaigns.filter(c => c.status === 'Active').length} active</p>
              <p className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {campaigns.filter(c => c.status === 'Funded').length} funded</p>
              <p className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-blue-500" /> {campaigns.reduce((s, c) => s + Number(c.backerCount), 0).toLocaleString()} backers</p>
            </div>
          </div>
        </aside>

        {/* Grid */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => <CampaignCardSkeleton key={i} index={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
              <div className="flex justify-center mb-4">
                {count === 0 ? <Rocket className="w-12 h-12 text-slate-300" /> : <Search className="w-12 h-12 text-slate-300" />}
              </div>
              <h3 className="font-bold text-slate-800 mb-2 text-lg" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                {count === 0 ? 'No campaigns yet' : 'No campaigns match your filters'}
              </h3>
              <p className="text-slate-500 text-sm mb-5">
                {count === 0
                  ? 'Be the first to launch a campaign on KickstartCrypto!'
                  : 'Try adjusting your search or filters'}
              </p>
              {count === 0 && (
                <a href="/create" className="btn-primary inline-flex">Launch First Campaign</a>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((campaign, i) => (
                <CampaignCard key={campaign.address} campaign={campaign} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
