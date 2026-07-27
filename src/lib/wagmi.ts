// Wagmi config for Celo + MiniPay integration

import { http, createConfig } from "wagmi";
import { celo, celoSepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const config = createConfig({
  chains: [celo, celoSepolia],
  connectors: [injected()],
  transports: {
    [celo.id]: http("https://forno.celo.org"),
    [celoSepolia.id]: http("https://forno.celo-sepolia.org"),
  },
  multiInjectedProviderDiscovery: false,
});

// Server-side viem clients (for treasury operations + receipt verification)
import { createPublicClient, createWalletClient, http as viemHttp, custom } from "viem";
import { celo as celoChain, celoSepolia as celoSepoliaChain } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

export function getPublicClient(chainId: number = 42220) {
  const chain = chainId === 11142220 ? celoSepoliaChain : celoChain;
  const transport =
    chainId === 11142220
      ? viemHttp("https://forno.celo-sepolia.org")
      : viemHttp("https://forno.celo.org");
  return createPublicClient({ chain, transport });
}

export function getServerWalletClient(chainId: number = 42220) {
  const privateKey = process.env.TURBOPAY_TREASURY_PRIVATE_KEY;
  if (!privateKey) throw new Error("TURBOPAY_TREASURY_PRIVATE_KEY not set");
  const chain = chainId === 11142220 ? celoSepoliaChain : celoChain;
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport =
    chainId === 11142220
      ? viemHttp("https://forno.celo-sepolia.org")
      : viemHttp("https://forno.celo.org");
  return createWalletClient({ chain, transport, account });
}

export function hasTreasuryKey(): boolean {
  return !!process.env.TURBOPAY_TREASURY_PRIVATE_KEY;
}
