import { Campaign, CampaignCategory } from './types';

// Realistic mock campaign data for UI demonstration
export const MOCK_CAMPAIGNS: Campaign[] = [
  {
    address: '0x1A2b3C4d5E6f7A8B9C0d1E2f3A4B5C6D7E8F9a0b',
    title: 'ZeroGrav DEX Protocol',
    description: `## ZeroGrav: The Next Generation DEX

ZeroGrav is a **zero-slippage, intent-based decentralized exchange** built on Ethereum Layer 2. By leveraging ZK-proof order matching, we eliminate MEV attacks entirely while providing near-instant settlement.

### Why ZeroGrav?
Traditional AMMs suffer from impermanent loss and front-running. ZeroGrav uses a novel **Proof of Intent** mechanism where trades are matched off-chain and settled on-chain in batches, giving users the best execution price with cryptographic guarantees.

### Technical Architecture
- ZK-SNARK based order matching engine
- EIP-4844 blob transactions for ultra-cheap calldata
- Cross-chain liquidity aggregation via canonical bridges
- Gasless meta-transactions for retail users

### Team
We're a team of 6 with ex-Uniswap, ex-Aave, and ZK-circuit engineering backgrounds. Previously built a DEX aggregator that processed $200M in volume.`,
    shortDescription: 'Zero-slippage intent-based DEX with ZK proof order matching — eliminating MEV forever.',
    creator: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    goal: BigInt('50000000000000000000'), // 50 ETH
    totalContributed: BigInt('37500000000000000000'), // 37.5 ETH
    deadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 18),
    category: 'DeFi',
    imageUrl: 'https://images.unsplash.com/photo-1639762681057-408e52192e55?w=800&q=80',
    backerCount: 284,
    withdrawn: false,
    goalReached: false,
    milestones: [
      { id: 1, title: 'Core Matching Engine', description: 'ZK circuit design and off-chain order matching prototype', percentage: 25, estimatedDate: '2025-03-01', status: 'completed', votesFor: 240, votesAgainst: 12, totalVoters: 260 },
      { id: 2, title: 'Testnet Deployment', description: 'Deploy to Sepolia, stress test with 10k simulated trades', percentage: 25, estimatedDate: '2025-05-01', status: 'voting', votesFor: 180, votesAgainst: 25, totalVoters: 284 },
      { id: 3, title: 'Mainnet Beta', description: 'Guarded launch with $5M TVL cap, audit complete', percentage: 30, estimatedDate: '2025-07-01', status: 'pending', votesFor: 0, votesAgainst: 0, totalVoters: 0 },
      { id: 4, title: 'Full Launch', description: 'Remove TVL cap, launch governance token, open-source all code', percentage: 20, estimatedDate: '2025-09-01', status: 'pending', votesFor: 0, votesAgainst: 0, totalVoters: 0 },
    ],
    rewardTiers: [
      { id: 1, name: 'Early Believer', minContribution: '0.1', description: 'Protocol NFT badge + early access to beta' },
      { id: 2, name: 'Liquidity Pioneer', minContribution: '1', description: 'Zero fee trading for 1 year + governance voting rights' },
      { id: 3, name: 'Genesis Validator', minContribution: '5', description: 'All above + protocol revenue share (0.01%) for life' },
    ],
    updates: [
      { id: 1, title: 'ZK Circuit Design Complete!', body: 'We\'ve finalized our Groth16-based circuit for order matching. Proving time is under 200ms on consumer hardware — way ahead of schedule!', timestamp: Date.now() - 86400000 * 5 },
      { id: 2, title: 'Security Audit Partner Announced', body: 'Trail of Bits has agreed to audit our smart contracts. Audit begins Month 4. Additionally, we\'ve opened a $50K bug bounty on ImmuneFi.', timestamp: Date.now() - 86400000 * 12 },
    ],
  },
  {
    address: '0x2B3c4D5e6F7a8B9c0D1e2F3a4B5c6D7e8F9a0B1c',
    title: 'Tessera NFT Marketplace',
    description: `## Tessera: NFTs Meet Fractional Ownership

Tessera enables **fractional ownership of blue-chip NFTs** through an innovative sharding protocol. Split a CryptoPunk or Bored Ape into 10,000 "shards" — each shard is an ERC-1155 token tradeable on any DEX.

### The Problem
High-value NFTs are illiquid and inaccessible to most collectors. A BAYC costs ~$30K — most people can't participate in this market.

### Our Solution
- Deposit NFT → receive 10,000 shard tokens
- Shards trade on Uniswap v4 pools with deep liquidity
- Shard holders govern the NFT (loan it, sell it, display it)
- Buyout mechanism: accumulate 51% of shards to claim the NFT`,
    shortDescription: 'Fractional NFT ownership — split blue-chip NFTs into tradeable ERC-1155 shards.',
    creator: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
    goal: BigInt('30000000000000000000'), // 30 ETH
    totalContributed: BigInt('30000000000000000000'), // 30 ETH — fully funded
    deadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 5),
    category: 'NFT',
    imageUrl: 'https://images.unsplash.com/photo-1645731190655-b42ef2a83c96?w=800&q=80',
    backerCount: 512,
    withdrawn: false,
    goalReached: true,
    milestones: [
      { id: 1, title: 'Smart Contract Architecture', description: 'ERC-1155 shard contract + vault contract design', percentage: 30, estimatedDate: '2025-02-15', status: 'completed', votesFor: 490, votesAgainst: 8, totalVoters: 512 },
      { id: 2, title: 'DEX Integration', description: 'Uniswap v4 hook for shard liquidity pools', percentage: 35, estimatedDate: '2025-04-15', status: 'approved', votesFor: 480, votesAgainst: 15, totalVoters: 512 },
      { id: 3, title: 'Marketplace UI', description: 'Browse, shard, trade, and buyout interface', percentage: 35, estimatedDate: '2025-06-15', status: 'pending', votesFor: 0, votesAgainst: 0, totalVoters: 0 },
    ],
    rewardTiers: [
      { id: 1, name: 'Shard Collector', minContribution: '0.05', description: '100 platform credit shards + whitelist for first NFT drop' },
      { id: 2, name: 'Vault Builder', minContribution: '0.5', description: 'Zero platform fees for 6 months + governance NFT' },
    ],
    updates: [],
  },
  {
    address: '0x3C4d5E6f7A8b9C0d1E2f3A4b5C6d7E8f9A0b1C2d',
    title: 'NovaMesh DAO Governance',
    description: `## NovaMesh: On-Chain DAO Infrastructure

NovaMesh is a **modular DAO framework** that gives communities drag-and-drop governance tooling — no Solidity knowledge required.

### Key Modules
- **Treasury Module**: Multi-sig + time-lock for fund management
- **Voting Module**: Quadratic, conviction, or token-weighted voting
- **Reputation Module**: Soulbound NFT-based contribution scoring
- **Grant Module**: One-click grant proposal and distribution

### Use Cases
DeFi protocols, NFT communities, open-source projects, and city DAOs can deploy a full governance stack in under 10 minutes.`,
    shortDescription: 'Modular DAO framework — drag-and-drop on-chain governance for any community.',
    creator: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    goal: BigInt('20000000000000000000'), // 20 ETH
    totalContributed: BigInt('8000000000000000000'), // 8 ETH
    deadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
    category: 'DAO',
    imageUrl: 'https://images.unsplash.com/photo-1620321023374-d1a68fbc720d?w=800&q=80',
    backerCount: 97,
    withdrawn: false,
    goalReached: false,
    milestones: [
      { id: 1, title: 'Core Module Contracts', description: 'Treasury, voting, and reputation smart contracts', percentage: 40, estimatedDate: '2025-06-01', status: 'pending', votesFor: 0, votesAgainst: 0, totalVoters: 0 },
      { id: 2, title: 'No-Code Builder UI', description: 'Drag and drop DAO configuration wizard', percentage: 35, estimatedDate: '2025-08-01', status: 'pending', votesFor: 0, votesAgainst: 0, totalVoters: 0 },
      { id: 3, title: 'SDK & Documentation', description: 'TypeScript SDK, tutorials, and 50-page docs site', percentage: 25, estimatedDate: '2025-10-01', status: 'pending', votesFor: 0, votesAgainst: 0, totalVoters: 0 },
    ],
    rewardTiers: [
      { id: 1, name: 'Community Builder', minContribution: '0.1', description: 'Founding Member NFT + beta access' },
      { id: 2, name: 'Protocol Architect', minContribution: '1', description: 'All above + co-design session with core team' },
    ],
    updates: [],
  },
  {
    address: '0x4D5e6F7a8B9c0D1e2F3a4B5c6D7e8F9a0B1c2D3e',
    title: 'ChainLink Oracle Network V2',
    description: `## Decentralized Oracle Network for IoT Data

A next-gen oracle network bringing **real-world IoT sensor data** on-chain with cryptographic proofs. Think Chainlink, but for your smart devices — weather stations, supply chain sensors, energy grids.`,
    shortDescription: 'Decentralized oracle network bringing verifiable IoT sensor data on-chain.',
    creator: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    goal: BigInt('75000000000000000000'), // 75 ETH
    totalContributed: BigInt('62000000000000000000'), // 62 ETH
    deadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
    category: 'Infrastructure',
    imageUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80',
    backerCount: 743,
    withdrawn: false,
    goalReached: false,
    milestones: [
      { id: 1, title: 'Node Software', description: 'Rust-based oracle node with TLS attestation', percentage: 35, estimatedDate: '2025-04-01', status: 'completed', votesFor: 710, votesAgainst: 20, totalVoters: 743 },
      { id: 2, title: 'On-Chain Aggregation', description: 'Byzantine fault tolerant aggregation contract', percentage: 35, estimatedDate: '2025-06-01', status: 'voting', votesFor: 600, votesAgainst: 50, totalVoters: 743 },
      { id: 3, title: 'Mainnet Launch', description: '100 node network, 50+ data feeds live', percentage: 30, estimatedDate: '2025-08-01', status: 'pending', votesFor: 0, votesAgainst: 0, totalVoters: 0 },
    ],
    rewardTiers: [
      { id: 1, name: 'Data Subscriber', minContribution: '0.2', description: 'Access to all oracle feeds for 1 year' },
      { id: 2, name: 'Node Operator', minContribution: '3', description: 'Early access to run a node + fee distribution' },
    ],
    updates: [],
  },
  {
    address: '0x5E6f7A8b9C0d1E2f3A4b5C6d7E8f9A0b1C2d3E4f',
    title: 'MetaRealm: On-Chain RPG',
    description: `## Fully On-Chain Role Playing Game

MetaRealm is an **entirely on-chain RPG** where all game logic, character state, and world events live in smart contracts. No centralized servers — the game runs forever.

### Features
- Character NFTs with on-chain attributes (fully on SVG)
- Dungeon exploration via Chainlink VRF randomness
- Guild DAOs for coordinated raids
- In-game economy with deflationary REALM token`,
    shortDescription: 'Fully on-chain RPG — all game logic in smart contracts, no centralized servers ever.',
    creator: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
    goal: BigInt('15000000000000000000'), // 15 ETH
    totalContributed: BigInt('14800000000000000000'), // 14.8 ETH
    deadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 2),
    category: 'Gaming',
    imageUrl: 'https://images.unsplash.com/photo-1614294148960-9aa740632a87?w=800&q=80',
    backerCount: 1205,
    withdrawn: false,
    goalReached: false,
    milestones: [
      { id: 1, title: 'Character System', description: 'On-chain SVG character NFTs with attribute generation', percentage: 25, estimatedDate: '2025-03-01', status: 'completed', votesFor: 1180, votesAgainst: 10, totalVoters: 1205 },
      { id: 2, title: 'World Engine', description: 'Dungeon map contracts with VRF exploration', percentage: 35, estimatedDate: '2025-05-01', status: 'completed', votesFor: 1150, votesAgainst: 30, totalVoters: 1205 },
      { id: 3, title: 'Economy & Token', description: 'REALM token with burn mechanics, marketplace', percentage: 40, estimatedDate: '2025-07-01', status: 'voting', votesFor: 900, votesAgainst: 100, totalVoters: 1205 },
    ],
    rewardTiers: [
      { id: 1, name: 'Adventurer', minContribution: '0.05', description: 'Starter character NFT + 500 REALM tokens' },
      { id: 2, name: 'Champion', minContribution: '0.25', description: 'Rare character NFT + 3000 REALM + guild founding rights' },
      { id: 3, name: 'Legend', minContribution: '1', description: 'Legendary character + 15000 REALM + name a dungeon' },
    ],
    updates: [],
  },
  {
    address: '0x6F7a8B9c0D1e2F3a4B5c6D7e8F9a0B1c2D3e4F5a',
    title: 'StealthPay Privacy Layer',
    description: `## Stealth Addresses & Private Transfers for EVM

StealthPay implements **ERC-5564 stealth addresses** natively in a user-friendly interface, bringing Monero-level privacy to Ethereum without breaking composability.`,
    shortDescription: 'ERC-5564 stealth addresses — Monero-level privacy for every EVM transaction.',
    creator: '0x3f5CE5FBFe3E9af3971dD833D26BA9b5C936f0bE',
    goal: BigInt('25000000000000000000'), // 25 ETH
    totalContributed: BigInt('3000000000000000000'), // 3 ETH
    deadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 45),
    category: 'Infrastructure',
    imageUrl: 'https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=800&q=80',
    backerCount: 45,
    withdrawn: false,
    goalReached: false,
    milestones: [],
    rewardTiers: [],
    updates: [],
  },
];

export const PLATFORM_STATS = {
  totalRaised: '847.3',
  activeCampaigns: 127,
  totalBackers: 14203,
  successRate: 78,
};

export const CATEGORIES: CampaignCategory[] = ['DeFi', 'NFT', 'DAO', 'Infrastructure', 'Gaming', 'Other'];

export function getCampaignStatus(campaign: Campaign): string {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (campaign.goalReached && campaign.withdrawn) return 'Completed';
  if (campaign.goalReached) return 'Funded';
  if (now > campaign.deadline) return 'Ended';
  return 'Active';
}

export function getProgressPercent(campaign: Campaign): number {
  if (campaign.goal === BigInt(0)) return 0;
  return Math.min(100, Number((campaign.totalContributed * BigInt(100)) / campaign.goal));
}

export function getDaysLeft(deadline: bigint): number {
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(deadline) - now;
  return Math.max(0, Math.floor(diff / 86400));
}

export function formatEth(wei: bigint, decimals = 4): string {
  const eth = Number(wei) / 1e18;
  return eth.toFixed(decimals);
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getEtherscanUrl(txHash: string, network: 'sepolia' | 'mainnet' = 'sepolia'): string {
  const base = network === 'sepolia' ? 'https://sepolia.etherscan.io' : 'https://etherscan.io';
  return `${base}/tx/${txHash}`;
}

export function getEtherscanAddressUrl(address: string, network: 'sepolia' | 'mainnet' = 'sepolia'): string {
  const base = network === 'sepolia' ? 'https://sepolia.etherscan.io' : 'https://etherscan.io';
  return `${base}/address/${address}`;
}
