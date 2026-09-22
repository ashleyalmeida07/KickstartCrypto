import { Web3Auth, decodeToken } from "@web3auth/single-factor-auth";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";

const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || "BPi5PB_UiIZ-cPz1GtV5i1I2iOSOHuimiXBI0e-Oe_u6X3oVAbCiWHZeR1-k57MtdQ4wR1-tO-HhO0f3BtvE4zE";
const verifier = process.env.NEXT_PUBLIC_WEB3AUTH_VERIFIER || "kickstart-google";

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

export const web3authSfa = new Web3Auth({
  clientId,
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
  usePnPKey: false,
  privateKeyProvider,
});

let isInitialized = false;

export async function connectSFA(idToken: string) {
  if (!isInitialized) {
    await web3authSfa.init();
    isInitialized = true;
  }
  
  if (web3authSfa.status === "connected") {
    return web3authSfa.provider;
  }

  const { payload } = decodeToken(idToken);
  
  if (!payload || !payload.sub) {
    throw new Error("Invalid idToken: missing sub field");
  }

  await web3authSfa.connect({
    verifier,
    verifierId: payload.sub, // Google uses 'sub' for the unique user ID
    idToken,
  });

  return web3authSfa.provider;
}
