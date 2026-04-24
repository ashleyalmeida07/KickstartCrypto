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
  backerCount:      bigint;
  metadataCid:      string;
  // Derived UI fields
  goalEth:          number;
  raisedEth:        number;
  progressPercent:  number;
  daysLeft:         number;
  status:           'Active' | 'Funded' | 'Failed' | 'Ended' | 'Cancelled';
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

function parseMetadata(raw: string): { title: string; description: string; category: string; image: string } {
  try {
    const p = JSON.parse(raw);
    return {
      title:       p.title       || 'Untitled Campaign',
      description: p.description || '',
      category:    p.category    || 'Other',
      image:       p.image       || '',
    };
  } catch {
    return { title: raw.slice(0, 60) || 'Campaign', description: '', category: 'Other', image: '' };
  }
}

function deriveStatus(
  deadline: bigint, goalReached: boolean, cancelled: boolean,
  totalContributed: bigint, goal: bigint,
): OnChainCampaign['status'] {
  if (cancelled) return 'Cancelled';
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (goalReached) return 'Funded';
  if (now > deadline && totalContributed < goal) return 'Failed';
  if (now > deadline) return 'Ended';
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
): OnChainCampaign {
  const creator          = raw[0] as `0x${string}`;
  const goal             = raw[1] as bigint;
  const deadline         = raw[2] as bigint;
  const totalContributed = raw[3] as bigint;
  const balance          = raw[4] as bigint;
  const goalReached      = raw[5] as boolean;
  const cancelled        = raw[6] as boolean;
  const backerCount      = raw[7] as bigint;
  const metadataCid      = raw[8] as string;

  const meta        = parseMetadata(metadataCid);
  const goalEth     = Number(formatEther(goal));
  const raisedEth   = Number(formatEther(balance));
  const progress    = goalEth > 0 ? Math.min(100, (raisedEth / goalEth) * 100) : 0;
  const fallbackImg = `https://picsum.photos/seed/${addr.slice(2, 10)}/800/400`;

  return {
    address: addr, creator, goal, deadline,
    totalContributed, balance, goalReached, cancelled, backerCount, metadataCid,
    goalEth, raisedEth,
    progressPercent: progress,
    daysLeft:        deriveDaysLeft(deadline),
    status:          deriveStatus(deadline, goalReached, cancelled, totalContributed, goal),
    title:           meta.title,
    description:     meta.description,
    category:        meta.category,
    imageUrl:        meta.image || fallbackImg,
    suspended,
    suspendedReason,
    _existsInDb:     existsInDb,
  };
}

// ─── Fetch suspension data from DB ────────────────────────────────────────────

interface DbSuspensionMap {
  [address: string]: { suspended: boolean; reason: string | null; existsInDb: boolean };
}

async function fetchSuspensionMap(addresses: string[]): Promise<DbSuspensionMap> {
  if (addresses.length === 0) return {};
  try {
    const res = await fetch(
      `/api/campaigns/suspension-status?addresses=${addresses.join(',')}`,
      { next: { revalidate: 60 } } as RequestInit,
    );
    if (!res.ok) return {};
    const data: Array<{ contract_address: string; suspended: boolean; suspended_reason: string | null }> = await res.json();
    return Object.fromEntries(data.map(r => [
      r.contract_address.toLowerCase(), 
      { suspended: r.suspended, reason: r.suspended_reason, existsInDb: true }
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

  const [suspensionMap, setSuspensionMap] = useState<DbSuspensionMap>({});

  useEffect(() => {
    if (addrs.length > 0) {
      fetchSuspensionMap(addrs).then(setSuspensionMap);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrs.join(',')]);

  const allCampaigns: OnChainCampaign[] = [];
  if (rawDetails) {
    for (let i = 0; i < addrs.length; i++) {
      const r = rawDetails[i];
      if (r?.status === 'success' && Array.isArray(r.result)) {
        try {
          const key  = addrs[i].toLowerCase();
          const susp = suspensionMap[key];
          allCampaigns.push(buildCampaign(addrs[i], r.result as readonly unknown[], susp?.suspended ?? false, susp?.reason ?? null, susp?.existsInDb ?? false));
        } catch (e) {
          console.warn('Failed to parse campaign', addrs[i], e);
        }
      }
    }
  }

  // For Explore: hide suspended campaigns AND hide orphaned on-chain campaigns (not in DB)
  const campaigns = allCampaigns.filter(c => !c.suspended && c._existsInDb);

  return {
    campaigns,          // filtered (no suspended)
    allCampaigns,       // includes suspended (for creator's dashboard)
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

  const [suspensionMap, setSuspensionMap] = useState<DbSuspensionMap>({});

  useEffect(() => {
    if (addrs.length > 0) {
      fetchSuspensionMap(addrs).then(setSuspensionMap);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrs.join(',')]);

  const campaigns: OnChainCampaign[] = [];
  if (rawDetails) {
    for (let i = 0; i < addrs.length; i++) {
      const r = rawDetails[i];
      if (r?.status === 'success' && Array.isArray(r.result)) {
        try {
          const key  = addrs[i].toLowerCase();
          const susp = suspensionMap[key];
          campaigns.push(buildCampaign(addrs[i], r.result as readonly unknown[], susp?.suspended ?? false, susp?.reason ?? null, susp?.existsInDb ?? false));
        } catch (e) {
          console.warn('Failed to parse campaign', addrs[i], e);
        }
      }
    }
  }

  return {
    campaigns,   // includes suspended (shown to creator with badge)
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
    query:        { enabled: !!address },
  });

  const [suspensionInfo, setSuspensionInfo] = useState<{ suspended: boolean; reason: string | null; existsInDb: boolean }>({ 
    suspended: false, reason: null, existsInDb: false 
  });

  useEffect(() => {
    if (address) {
      fetchSuspensionMap([address]).then(m => {
        const s = m[address.toLowerCase()];
        if (s) setSuspensionInfo(s);
      });
    }
  }, [address]);

  let campaign: OnChainCampaign | null = null;
  if (data && address && Array.isArray(data)) {
    try {
      campaign = buildCampaign(address, data as readonly unknown[], suspensionInfo.suspended, suspensionInfo.reason, suspensionInfo.existsInDb);
    } catch (e) {
      console.warn('useCampaign parse error', e);
    }
  }

  return { campaign, isLoading };
}
