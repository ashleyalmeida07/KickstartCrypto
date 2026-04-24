export interface Campaign {
  address: string;
  title: string;
  description: string;
  shortDescription: string;
  creator: string;
  goal: bigint;
  totalContributed: bigint;
  deadline: bigint;
  category: string;
  imageUrl: string;
  backerCount: number;
  withdrawn: boolean;
  goalReached: boolean;
  milestones: Milestone[];
  rewardTiers: RewardTier[];
  updates: Update[];
}

export interface Milestone {
  id: number;
  title: string;
  description: string;
  percentage: number;
  estimatedDate: string;
  status: 'pending' | 'voting' | 'approved' | 'completed' | 'rejected';
  votesFor: number;
  votesAgainst: number;
  totalVoters: number;
}

export interface RewardTier {
  id: number;
  name: string;
  minContribution: string;
  description: string;
}

export interface Update {
  id: number;
  title: string;
  body: string;
  timestamp: number;
  ipfsCid?: string;
}

export interface BackerEntry {
  address: string;
  amount: bigint;
}

export type CampaignCategory = 'DeFi' | 'NFT' | 'DAO' | 'Infrastructure' | 'Gaming' | 'Other';
export type CampaignStatus = 'Active' | 'Funded' | 'Ended' | 'Failed';

export interface CreateCampaignFormData {
  // Step 1
  title: string;
  category: CampaignCategory;
  shortDescription: string;
  thumbnailFile: File | null;
  thumbnailPreview: string;
  // Step 2
  goalEth: string;
  durationDays: number;
  rewardTiers: RewardTier[];
  // Step 3
  milestones: Omit<Milestone, 'id' | 'status' | 'votesFor' | 'votesAgainst' | 'totalVoters'>[];
  // Step 4 (derived)
  thumbnailCid: string;
}
