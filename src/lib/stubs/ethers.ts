// Client-side stub for ethers — the real ethers is a server-side dependency of siwe.
// This prevents Turbopack from failing when ethers is required in a client bundle.
export default {};
export const ethers = {};
export const utils = {};
export const providers = {};
export const Contract = class {};
export const BigNumber = { from: () => ({}) };
