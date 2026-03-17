/**
 * Shared formatting helpers for chain values with fixed-point precision.
 *
 * Precision conventions used in the Nexus runtime:
 *  - NEX balance / BalanceOf<T>: 10^12 (12 decimals)
 *  - USDT price (u64):           10^6  ( 6 decimals)
 *  - Entity token:               variable (usually 10^12, but depends on token config)
 */

const NEX_DECIMALS = 12;
const USDT_DECIMALS = 6;

function bigPow10(n: number): bigint {
  let result = BigInt(1);
  for (let i = 0; i < n; i++) result *= BigInt(10);
  return result;
}

/**
 * Generic fixed-point bigint → human-readable string.
 * @param value   raw chain value (bigint)
 * @param decimals  number of decimal places encoded in the value
 * @param display   max decimal digits to show (default 4)
 */
export function formatFixedPoint(value: bigint, decimals: number, display = 4): string {
  const divisor = bigPow10(decimals);
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const whole = abs / divisor;
  const remainder = abs % divisor;
  const sign = negative ? '-' : '';

  if (remainder === BigInt(0)) return `${sign}${whole.toLocaleString()}`;

  const fracStr = remainder.toString().padStart(decimals, '0').slice(0, display).replace(/0+$/, '');
  return fracStr ? `${sign}${whole.toLocaleString()}.${fracStr}` : `${sign}${whole.toLocaleString()}`;
}

/** Format NEX balance (precision 10^12) → e.g. "1,234.5678" */
export function formatNex(value: bigint): string {
  return formatFixedPoint(value, NEX_DECIMALS, 4);
}

/** Format USDT price (precision 10^6) → e.g. "0.5" */
export function formatUsdt(value: bigint): string {
  return formatFixedPoint(value, USDT_DECIMALS, 6);
}

/** Format token amount with variable decimals */
export function formatToken(value: bigint, decimals = 12): string {
  return formatFixedPoint(value, decimals, 4);
}
