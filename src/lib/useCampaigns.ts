'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { CAMPAIGN_FACTORY_ADDRESS, CAMPAIGN_FACTORY_ABI, CAMPAIGN_ABI } from './contracts';
import { formatEther } from 'viem';
import { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnChainCampaign {
  address:          `0x${string}`;
  creator:          `0x${string}`;
  goal:             bigint;
  deadline:         bigint;
  totalContributed: bigint;
  balance:          bigint;
  goalReached:      boolean;
  cancelled:        boolean;
  settled:          boolean;   // NEW: true once settle() has been called
  backerCount:      bigint;
  // Derived UI fields
  goalEth:          number;
  raisedEth:        number;
  progressPercent:  number;
  daysLeft:         number;
  status:           'Active' | 'Funded' | 'Settled' | 'Failed' | 'Cancelled';
  title:            string;
  description:      string;
  category:         string;
  imageUrl:         string;
  // DB fields
  suspended:        boolean;
  suspendedReason:  string | null;
  _existsInDb:      boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveStatus(
  deadline: bigint,
  goalReached: boolean,
  cancelled: boolean,
  settled: boolean,
): OnChainCampaign['status'] {
  if (cancelled) return 'Cancelled';
  if (settled)   return 'Settled';
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (goalReached) return 'Funded';
  if (now > deadline) return 'Failed';
  return 'Active';
}

function deriveDaysLeft(deadline: bigint): number {
  const now  = BigInt(Math.floor(Date.now() / 1000));
  const diff = Number(deadline - now);
  return Math.max(0, Math.ceil(diff / 86400));
}

function buildCampaign(
  addr: `0x${string}`,
  raw: readonly unknown[],
  suspended = false,
  suspendedReason: string | null = null,
  existsInDb = false,
  dbMeta?: { title?: string; description?: string; category?: string; imageUrl?: string },
): OnChainCampaign {
  // New getDetails returns: creator, goal, deadline, totalContributed, balance,
  //                          goalReached, cancelled, settled, backerCount
  const creator          = raw[0] as `0x${string}`;
  const goal             = raw[1] as bigint;
  const deadline         = raw[2] as bigint;
  const totalContributed = raw[3] as bigint;
  const balance          = raw[4] as bigint;
  const goalReached      = raw[5] as boolean;
  const cancelled        = raw[6] as boolean;
  const settled          = raw[7] as boolean;
  const backerCount      = raw[8] as bigint;

  const goalEth     = Number(formatEther(goal));
  const raisedEth   = Number(formatEther(totalContributed));
  const progress    = goalEth > 0 ? Math.min(100, (raisedEth / goalEth) * 100) : 0;
  const fallbackImg = `https://picsum.photos/seed/${addr.slice(2, 10)}/800/400`;

  return {
    address: addr, creator, goal, deadline,
    totalContributed, balance, goalReached, cancelled, settled, backerCount,
    goalEth, raisedEth,
    progressPercent: progress,
    daysLeft:        deriveDaysLeft(deadline),
    status:          deriveStatus(deadline, goalReached, cancelled, settled),
    title:           dbMeta?.title       ?? 'Campaign',
    description:     dbMeta?.description ?? '',
    category:        dbMeta?.category    ?? 'Other',
    imageUrl:        dbMeta?.imageUrl    ?? fallbackImg,
    suspended,
    suspendedReason,
    _existsInDb:     existsInDb,
  };
}

// ─── Fetch DB metadata + suspension data ──────────────────────────────────────

interface DbInfo {
  suspended:        boolean;
  reason:           string | null;
  existsInDb:       boolean;
  title?:           string;
  description?:     string;
  category?:        string;
  imageUrl?:        string;
}

async function fetchDbInfo(addresses: string[]): Promise<Record<string, DbInfo>> {
  if (addresses.length === 0) return {};
  try {
    const res  = await fetch(`/api/campaigns/suspension-status?addresses=${addresses.join(',')}`, { next: { revalidate: 60 } } as RequestInit);
    if (!res.ok) return {};
    const data: Array<{
      contract_address: string;
      suspended:        boolean;
      suspended_reason: string | null;
      title?:           string;
      short_description?: string;
      category?:        string;
      image_cid?:       string;
    }> = await res.json();
    return Object.fromEntries(data.map(r => [
      r.contract_address.toLowerCase(),
      {
        suspended:   r.suspended,
        reason:      r.suspended_reason,
        existsInDb:  true,
        title:       r.title,
        description: r.short_description,
        category:    r.category,
        imageUrl:    r.image_cid,
      },
    ]));
  } catch {
    return {};
  }
}

// ─── Hook: all campaigns ──────────────────────────────────────────────────────

export function useCampaigns() {
  const {
    data: addresses,
    isLoading: addrLoading,
    error: addrError,
    refetch,
  } = useReadContract({
    address:      CAMPAIGN_FACTORY_ADDRESS,
    abi:          CAMPAIGN_FACTORY_ABI,
    functionName: 'getCampaigns',
  });

  const addrs = (addresses as `0x${string}`[] | undefined) ?? [];

  const { data: rawDetails, isLoading: detailsLoading } = useReadContracts({
    contracts: addrs.map(addr => ({
      address:      addr,
      abi:          CAMPAIGN_ABI,
      functionName: 'getDetails',
    } as const)),
    query: { enabled: addrs.length > 0 },
  });

  const [dbMap, setDbMap] = useState<Record<string, DbInfo>>({});

  useEffect(() => {
    if (addrs.length > 0) fetchDbInfo(addrs).then(setDbMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrs.join(',')]);

  const allCampaigns: OnChainCampaign[] = [];
  if (rawDetails) {
    for (let i = 0; i < addrs.length; i++) {
      const r = rawDetails[i];
      if (r?.status === 'success' && Array.isArray(r.result)) {
        try {
          const key = addrs[i].toLowerCase();
          const db  = dbMap[key];
          allCampaigns.push(buildCampaign(addrs[i], r.result as readonly unknown[], db?.suspended ?? false, db?.reason ?? null, db?.existsInDb ?? false, db));
        } catch (e) {
          console.warn('Failed to parse campaign', addrs[i], e);
        }
      }
    }
  }

  // Explore: hide suspended + orphaned (not in DB)
  const campaigns = allCampaigns.filter(c => !c.suspended && c._existsInDb);

  return {
    campaigns,
    allCampaigns,
    isLoading: addrLoading || (addrs.length > 0 && detailsLoading),
    error:     addrError,
    count:     addrs.length,
    refetch,
  };
}

// ─── Hook: campaigns by creator ───────────────────────────────────────────────

export function useMyCampaigns(creatorAddress?: `0x${string}`) {
  const {
    data: addresses,
    isLoading: addrLoading,
    refetch,
  } = useReadContract({
    address:      CAMPAIGN_FACTORY_ADDRESS,
    abi:          CAMPAIGN_FACTORY_ABI,
    functionName: 'getCampaignsByCreator',
    args:         creatorAddress ? [creatorAddress] : undefined,
    query:        { enabled: !!creatorAddress },
  });

  const addrs = (addresses as `0x${string}`[] | undefined) ?? [];

  const { data: rawDetails, isLoading: detailsLoading } = useReadContracts({
    contracts: addrs.map(addr => ({
      address:      addr,
      abi:          CAMPAIGN_ABI,
      functionName: 'getDetails',
    } as const)),
    query: { enabled: addrs.length > 0 },
  });

  const [dbMap, setDbMap] = useState<Record<string, DbInfo>>({});

  useEffect(() => {
    if (addrs.length > 0) fetchDbInfo(addrs).then(setDbMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrs.join(',')]);

  const campaigns: OnChainCampaign[] = [];
  if (rawDetails) {
    for (let i = 0; i < addrs.length; i++) {
      const r = rawDetails[i];
      if (r?.status === 'success' && Array.isArray(r.result)) {
        try {
          const key = addrs[i].toLowerCase();
          const db  = dbMap[key];
          campaigns.push(buildCampaign(addrs[i], r.result as readonly unknown[], db?.suspended ?? false, db?.reason ?? null, db?.existsInDb ?? false, db));
        } catch (e) {
          console.warn('Failed to parse campaign', addrs[i], e);
        }
      }
    }
  }

  return {
    campaigns,
    isLoading: addrLoading || (addrs.length > 0 && detailsLoading),
    count:     addrs.length,
    refetch,
  };
}

// ─── Hook: single campaign ────────────────────────────────────────────────────

export function useCampaign(address?: `0x${string}`) {
  const { data, isLoading } = useReadContract({
    address,
    abi:          CAMPAIGN_ABI,
    functionName: 'getDetails',
    query:        { enabled: !!address, refetchInterval: 10_000 },
  });

  const [dbInfo, setDbInfo] = useState<DbInfo>({ suspended: false, reason: null, existsInDb: false });

  useEffect(() => {
    if (address) fetchDbInfo([address]).then(m => {
      const s = m[address.toLowerCase()];
      if (s) setDbInfo(s);
    });
  }, [address]);

  let campaign: OnChainCampaign | null = null;
  if (data && address && Array.isArray(data)) {
    try {
      campaign = buildCampaign(address, data as readonly unknown[], dbInfo.suspended, dbInfo.reason, dbInfo.existsInDb, dbInfo);
    } catch (e) {
      console.warn('useCampaign parse error', e);
    }
  }

  return { campaign, isLoading };
}
