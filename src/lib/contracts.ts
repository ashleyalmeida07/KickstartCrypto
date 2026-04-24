// ─── Contract Addresses ───────────────────────────────────────────────────────
export const CAMPAIGN_FACTORY_ADDRESS = (
  process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000'
) as `0x${string}`;

// ─── CampaignFactory ABI ──────────────────────────────────────────────────────
export const CAMPAIGN_FACTORY_ABI = [
  {
    inputs: [
      { internalType: 'uint256',  name: '_goal',            type: 'uint256' },
      { internalType: 'uint256',  name: '_durationSeconds', type: 'uint256' },
      { internalType: 'string',   name: '_metadataCid',     type: 'string'  },
      { internalType: 'string[]', name: '_milestoneTitles', type: 'string[]'},
      { internalType: 'string[]', name: '_milestoneDescs',  type: 'string[]'},
      { internalType: 'uint8[]',  name: '_milestonePercs',  type: 'uint8[]' },
    ],
    name: 'createCampaign',
    outputs: [{ internalType: 'address', name: 'campaignAddress', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getCampaigns',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getCampaignCount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_creator', type: 'address' }],
    name: 'getCampaignsByCreator',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'campaigns',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: 'address', name: 'campaignAddress', type: 'address' },
      { indexed: true,  internalType: 'address', name: 'creator',         type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'goal',            type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'deadline',        type: 'uint256' },
      { indexed: false, internalType: 'string',  name: 'metadataCid',     type: 'string'  },
    ],
    name: 'CampaignCreated',
    type: 'event',
  },
] as const;

// ─── Campaign ABI — matches Campaign.sol exactly ──────────────────────────────
export const CAMPAIGN_ABI = [
  // ── Write ──
  { inputs: [], name: 'contribute',    outputs: [], stateMutability: 'payable',     type: 'function' },
  { inputs: [], name: 'claimRefund',   outputs: [], stateMutability: 'nonpayable',  type: 'function' },
  { inputs: [], name: 'cancelCampaign',outputs: [], stateMutability: 'nonpayable',  type: 'function' },
  {
    inputs: [{ internalType: 'uint256', name: '_milestoneIndex', type: 'uint256' }],
    name: 'requestPayout', outputs: [], stateMutability: 'nonpayable', type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: '_milestoneIndex', type: 'uint256' },
      { internalType: 'bool',    name: '_approve',        type: 'bool'    },
    ],
    name: 'vote', outputs: [], stateMutability: 'nonpayable', type: 'function',
  },
  // ── Read: getDetails — returns 9 values (exact match to contract) ──
  {
    inputs: [],
    name: 'getDetails',
    outputs: [
      { internalType: 'address', name: '_creator',          type: 'address' },
      { internalType: 'uint256', name: '_goal',             type: 'uint256' },
      { internalType: 'uint256', name: '_deadline',         type: 'uint256' },
      { internalType: 'uint256', name: '_totalContributed', type: 'uint256' },
      { internalType: 'uint256', name: '_balance',          type: 'uint256' },
      { internalType: 'bool',    name: '_goalReached',      type: 'bool'    },
      { internalType: 'bool',    name: '_cancelled',        type: 'bool'    },
      { internalType: 'uint256', name: '_backerCount',      type: 'uint256' },
      { internalType: 'string',  name: '_metadataCid',      type: 'string'  },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // ── Read: individual fields ──
  { inputs: [], name: 'creator',          outputs: [{ internalType: 'address', name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'goal',             outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'deadline',         outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalContributed', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'backerCount',      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'goalReached',      outputs: [{ internalType: 'bool',    name: '', type: 'bool'    }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'cancelled',        outputs: [{ internalType: 'bool',    name: '', type: 'bool'    }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'metadataCid',      outputs: [{ internalType: 'string',  name: '', type: 'string'  }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getMilestoneCount',outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'contributions',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '_index', type: 'uint256' }],
    name: 'getMilestone',
    outputs: [
      { internalType: 'string',  name: 'title',            type: 'string'  },
      { internalType: 'string',  name: 'description',      type: 'string'  },
      { internalType: 'uint8',   name: 'percentage',       type: 'uint8'   },
      { internalType: 'uint256', name: 'votes_for',        type: 'uint256' },
      { internalType: 'uint256', name: 'votes_against',    type: 'uint256' },
      { internalType: 'bool',    name: 'payout_requested', type: 'bool'    },
      { internalType: 'bool',    name: 'payout_released',  type: 'bool'    },
      { internalType: 'bool',    name: 'rejected',         type: 'bool'    },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
