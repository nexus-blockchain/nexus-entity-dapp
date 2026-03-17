/** Default fund warning threshold: 10 NEX (12 decimals) */
export const FUND_WARNING_THRESHOLD = BigInt('10000000000000');

/** Check if fund balance is below warning threshold */
export function isFundWarning(balance: bigint, threshold: bigint = FUND_WARNING_THRESHOLD): boolean {
  return balance < threshold;
}
