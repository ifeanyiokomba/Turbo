// TurboCore — Transaction.type → ContractName + status-poll method dispatcher.
//
// The stuck-tx cron and webhook receiver both need to ask a provider
// "what's the current status of this providerRef?" The adapter method
// differs per contract (getTransferStatus / queryBillPayment / verifyCharge /
// getStatus), so this module maps and calls the right one.
//
// Returns the provider-reported status string upper-cased ("SUCCESS" |
// "PENDING" | "FAILED" | unknown). On adapter errors, returns "UNKNOWN"
// so the caller treats it as still-pending and retries later.

import { registry } from "./registry";
import { ContractName } from "./result";
import type { ProviderResult } from "./result";

/** Map a Transaction.type to the TurboCore ContractName. */
export function contractForTxType(txType: string): ContractName | null {
  switch (txType) {
    case "VIRTUAL_ACCOUNT":
    case "FUNDING":
      return ContractName.VIRTUAL_ACCOUNT;
    case "CARD_PAYMENT":
    case "CARD_FUND":
    case "CARD_WITHDRAW":
      return ContractName.CARD_PAYMENT;
    case "TRANSFER":
    case "BANK_TRANSFER":
      return ContractName.BANK_TRANSFER;
    case "BILL":
    case "BILL_PAYMENT":
      return ContractName.BILL_PAYMENT;
    case "AIRTIME":
    case "DATA":
      return ContractName.AIRTIME;
    case "INTERNATIONAL_TRANSFER":
      return ContractName.INTERNATIONAL_TRANSFER;
    case "MOBILE_MONEY":
      return ContractName.MOBILE_MONEY;
    default:
      return null;
  }
}

/**
 * Poll a provider for the current status of `providerRef` on contract
 * `contract` routed via `providerCode`. Returns upper-cased status string
 * or "UNKNOWN" if we can't determine it (adapter not registered, call
 * failed, response shape unexpected).
 */
export async function pollProviderStatus(
  contract: ContractName,
  providerCode: string,
  providerRef: string,
): Promise<string> {
  let adapter: any;
  try {
    adapter = await registry.resolve(contract, providerCode);
  } catch (e) {
    console.warn(`[poll] adapter not registered for ${contract}:${providerCode}`, e);
    return "UNKNOWN";
  }

  let result: ProviderResult<any>;
  try {
    switch (contract) {
      case ContractName.BANK_TRANSFER:
      case ContractName.INTERNATIONAL_TRANSFER:
        result = await adapter.getTransferStatus(providerRef);
        break;
      case ContractName.BILL_PAYMENT:
        result = await adapter.queryBillPayment(providerRef);
        break;
      case ContractName.AIRTIME:
      case ContractName.MOBILE_MONEY:
        result = await adapter.getStatus(providerRef);
        break;
      case ContractName.CARD_PAYMENT:
        result = await adapter.verifyCharge(providerRef);
        break;
      case ContractName.VIRTUAL_ACCOUNT:
        result = await adapter.getAccountStatus(providerRef);
        break;
      default:
        return "UNKNOWN";
    }
  } catch (e) {
    console.warn(`[poll] ${contract}:${providerCode} threw for ${providerRef}:`, e);
    return "UNKNOWN";
  }

  if (!result || !result.ok) {
    // PROVIDER_DOWN / circuit open / network error — treat as still-pending
    // so the next cron tick can retry. Don't reverse based on a transient
    // adapter error.
    return "UNKNOWN";
  }

  const status = (result.data?.status ?? "").toString().toUpperCase();
  if (!status) return "UNKNOWN";
  return status;
}
