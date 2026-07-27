// MiniPay / Celo integration — detection, chain config, token addresses, helpers

// Celo chain IDs
export const CELO_MAINNET_CHAIN_ID = 42220;
export const CELO_SEPOLIA_CHAIN_ID = 11142220;

// RPC URLs (public)
export const CELO_RPC = "https://forno.celo.org";
export const CELO_SEPOLIA_RPC = "https://forno.celo-sepolia.org";

// Block explorers
export const CELO_EXPLORER = "https://celoscan.io";
export const CELO_SEPOLIA_EXPLORER = "https://sepolia.celoscan.io";

// Treasury address (server-side wallet for withdrawals) — set via env
export const TREASURY_ADDRESS =
  process.env.TURBOPAY_TREASURY_ADDRESS ?? "0x0000000000000000000000000000000000000000";

// Token addresses — Celo MAINNET (chain 42220)
export const CELO_TOKENS_MAINNET = {
  USDm: {
    address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    decimals: 18,
    symbol: "USDm",
    name: "Mento Dollar",
  },
  USDC: {
    address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin",
  },
  USDT: {
    address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    decimals: 6,
    symbol: "USDT",
    name: "Tether USD",
  },
  NGNm: {
    address: "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71",
    decimals: 18,
    symbol: "NGNm",
    name: "Mento Naira",
  },
  CELO: {
    address: "0x471EcE3750Da237f93B8E339C536989b8978a438",
    decimals: 18,
    symbol: "CELO",
    name: "Celo",
  },
} as const;

// Token addresses — Celo SEPOLIA testnet (chain 11142220)
export const CELO_TOKENS_SEPOLIA = {
  USDm: {
    address: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b",
    decimals: 18,
    symbol: "USDm",
    name: "Mento Dollar",
  },
  USDC: {
    address: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin",
  },
  USDT: {
    address: "0xd077A400968890Eacc75cdc901F0356c943e4fDb",
    decimals: 6,
    symbol: "USDT",
    name: "Tether USD",
  },
  NGNm: {
    address: "0x3d5ae86F34E2a82771496D140daFAEf3789dF888",
    decimals: 18,
    symbol: "NGNm",
    name: "Mento Naira",
  },
  CELO: {
    // Celo native token contract on Sepolia testnet.
    // Per Celo docs: https://docs.celo.org/developer/setup#about-test-networks
    // This is the canonical ERC-20 wrapper for the native CELO token on testnet.
    address: "0xF194afDf50B03e69Bd7D057c1Aa94410DaedAC57",
    decimals: 18,
    symbol: "CELO",
    name: "Celo",
  },
} as const;

export type CeloTokenSymbol = keyof typeof CELO_TOKENS_MAINNET;

export function getTokens(chainId: number): any {
  return chainId === CELO_SEPOLIA_CHAIN_ID ? CELO_TOKENS_SEPOLIA : CELO_TOKENS_MAINNET;
}

export function getToken(symbol: string, chainId: number = CELO_MAINNET_CHAIN_ID) {
  const tokens = getTokens(chainId);
  return (tokens as any)[symbol] ?? null;
}

// Detect if running inside MiniPay
export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  const eth = (window as any).ethereum;
  return !!eth && eth.isMiniPay === true;
}

// Get the injected EIP-1193 provider (only valid inside MiniPay)
export function getEthereumProvider(): any {
  if (typeof window === "undefined") return null;
  return (window as any).ethereum ?? null;
}

// Get the connected MiniPay address
export async function getMiniPayAddress(): Promise<`0x${string}` | null> {
  if (!isMiniPay()) return null;
  try {
    const provider = getEthereumProvider();
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

// Validate an Ethereum address
export function isValidAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

// Validate a transaction hash
export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

// Truncate an address for display: 0x1234...5678
export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// Get explorer URL for an address or tx hash
export function getExplorerUrl(
  hashOrAddress: string,
  chainId: number = CELO_MAINNET_CHAIN_ID
): string {
  const base = chainId === CELO_SEPOLIA_CHAIN_ID ? CELO_SEPOLIA_EXPLORER : CELO_EXPLORER;
  const type = hashOrAddress.length === 42 ? "address" : "tx";
  return `${base}/${type}/${hashOrAddress}`;
}

// MiniPay deeplinks
export const MINIPAY_DEEPLINKS = {
  addCash: (tokens?: string) =>
    `https://link.minipay.xyz/add_cash${tokens ? `?tokens=${tokens}` : ""}`,
  browse: (url: string) => `https://link.minipay.xyz/browse?url=${encodeURIComponent(url)}`,
  discover: "https://link.minipay.xyz/discover",
  receipt: (tx: string, celebrate = false) =>
    `https://link.minipay.xyz/receipt?tx=${tx}${celebrate ? "&celebrate" : ""}`,
  qr: "https://link.minipay.xyz/qr",
  inviteFriends: "https://link.minipay.xyz/invite_friends",
  balance: "https://link.minipay.xyz/balance",
} as const;

// Seed CeloTokenConfig table
import { db } from "@/lib/db";

export async function seedCeloTokens(): Promise<void> {
  const tokens = [
    ...Object.values(CELO_TOKENS_MAINNET).map((t) => ({
      ...t,
      chainId: CELO_MAINNET_CHAIN_ID,
      isBridgeable: t.symbol === "USDm" || t.symbol === "NGNm",
    })),
    ...Object.values(CELO_TOKENS_SEPOLIA).map((t) => ({
      ...t,
      chainId: CELO_SEPOLIA_CHAIN_ID,
      isBridgeable: t.symbol === "USDm" || t.symbol === "NGNm",
    })),
  ];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    await db.celoTokenConfig.upsert({
      where: { symbol_chainId: { symbol: t.symbol, chainId: t.chainId } },
      create: {
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
        chainId: t.chainId,
        isActive: true,
        isBridgeable: t.isBridgeable,
        displayOrder: i,
      },
      update: {},
    });
  }
}
