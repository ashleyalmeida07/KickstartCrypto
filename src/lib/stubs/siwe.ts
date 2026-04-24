// Client-side stub for siwe — the real siwe runs server-side only via next-auth.
// This prevents Turbopack from bundling siwe's ethers dependency into client chunks.
export default {};
export const SiweMessage = class {};
export const generateNonce = () => '';
export const generateSiweNonce = () => '';
