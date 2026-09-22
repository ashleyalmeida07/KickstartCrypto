import { Web3Auth } from "@web3auth/modal";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { Web3AuthConnector } from "@web3auth/web3auth-wagmi-connector";

const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || "BPi5PB_UiIZ-cPz1GtV5i1I2iOSOHuimiXBI0e-Oe_u6X3oVAbCiWHZeR1-k57MtdQ4wR1-tO-HhO0f3BtvE4zE";

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: "0xaa36a7", // Sepolia hex
  rpcTarget: process.env.NEXT_PUBLIC_ALCHEMY_SEPOLIA_URL || "https://rpc2.sepolia.org",
  displayName: "Sepolia Testnet",
  blockExplorerUrl: "https://sepolia.etherscan.io",
  ticker: "ETH",
  tickerName: "Ethereum",
};

const privateKeyProvider = new EthereumPrivateKeyProvider({
  config: { chainConfig },
});

const web3auth = new Web3Auth({
  clientId,
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
  privateKeyProvider,
});

export { web3auth };

// RainbowKit wallet wrapper removed due to type mismatches.
// Wagmi handles the connector natively via Web3AuthConnector instead.
