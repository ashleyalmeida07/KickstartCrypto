import { createConfig, http } from 'wagmi';
import { injected, coinbaseWallet } from 'wagmi/connectors';
import { sepolia, mainnet } from 'viem/chains';

/**
 * Wagmi config using native injected connector.
 *
 * - injected()       → detects MetaMask, Phantom, Brave Wallet, any window.ethereum provider
 * - coinbaseWallet() → Coinbase Wallet (has its own SDK, no WalletConnect needed)
 *
 * NO WalletConnect SDK is loaded here — MetaMask connects in < 1 second.
 * Add walletConnect() connector only after setting a valid NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.
 */
export const config = createConfig({
  chains: [sepolia, mainnet],
  ssr: true,
  connectors: [
    injected(),                       // MetaMask, Phantom, Brave, Frame, etc.
    coinbaseWallet({
      appName: 'Kickstart Crypto',
    }),
  ],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_ALCHEMY_SEPOLIA_URL),
    [mainnet.id]: http(process.env.NEXT_PUBLIC_ALCHEMY_MAINNET_URL),
  },
});
