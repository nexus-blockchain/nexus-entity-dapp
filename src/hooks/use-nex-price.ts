'use client';

import { useMemo } from 'react';
import { useEntityQuery, hasPallet } from './use-entity-query';
import { useCurrentBlock } from './use-current-block';

/** Price source, ordered by confidence (high → low) */
type RateSource = 'twap' | 'lastPrice' | 'lastTradePrice' | 'initialPrice';

interface NexUsdtPriceResult {
  /** USDT per NEX price (chain precision 10^6). e.g. 10 means 0.00001 USDT/NEX. null if unavailable */
  usdtPerNex: bigint | null;
  /** Which price source is being used */
  rateSource: RateSource | null;
  isLoading: boolean;
}

/** Raw TWAP accumulator data from chain */
interface TwapAccData {
  currentCumulative: bigint;
  currentBlock: number;
  lastPrice: bigint;
  hourSnapshotCumulative: bigint;
  hourSnapshotBlock: number;
}

/** All price sources fetched in a single query */
interface ChainPriceData {
  twapAcc: TwapAccData | null;
  lastTradePrice: bigint | null;
  initialPrice: bigint | null;
}

/**
 * Replicate on-chain `calculate_twap(OneHour)` in frontend.
 *
 * Algorithm (from pallet-nex-market):
 *   blocks_since = current_block - acc.current_block
 *   live_cumulative = acc.current_cumulative + acc.last_price * blocks_since
 *   block_diff = current_block - hour_snapshot.block_number
 *   if block_diff == 0: return acc.last_price
 *   twap = (live_cumulative - hour_snapshot.cumulative_price) / block_diff
 */
function calculateTwap1h(acc: TwapAccData, currentBlock: number): bigint | null {
  if (currentBlock <= 0) return null;

  const blocksSince = currentBlock - acc.currentBlock;
  if (blocksSince < 0) return null;

  const liveCumulative = acc.currentCumulative + acc.lastPrice * BigInt(blocksSince);

  const blockDiff = currentBlock - acc.hourSnapshotBlock;
  if (blockDiff <= 0) {
    // Same as chain: if block_diff == 0, return last_price
    return acc.lastPrice > BigInt(0) ? acc.lastPrice : null;
  }

  const cumulativeDiff = liveCumulative - acc.hourSnapshotCumulative;
  if (cumulativeDiff <= BigInt(0)) return null;

  const twap = cumulativeDiff / BigInt(blockDiff);
  return twap > BigInt(0) ? twap : null;
}

/**
 * Hook to get global NEX/USDT exchange rate.
 *
 * Returns `usdtPerNex` — price of 1 NEX in USDT, with 10^6 precision.
 * Example: 0.00001 USDT/NEX → usdtPerNex = 10n
 *
 * Priority (mirrors on-chain PricingProvider):
 *   1. 1h TWAP (calculated from twapAccumulatorStore + current block)
 *   2. twapAccumulatorStore.lastPrice (latest traded price)
 *   3. LastTradePrice storage
 *   4. PriceProtectionStore.initialPrice (governance cold-start)
 *
 * Chain data refreshes every 15s; current block updates every 6s.
 * TWAP is recomputed on every render via useMemo (pure arithmetic, no RPC).
 */
export function useNexUsdtPrice(_entityId?: number): NexUsdtPriceResult {
  const currentBlock = useCurrentBlock();

  const query = useEntityQuery<ChainPriceData | null>(
    ['nexPrice', 'rate'],
    async (api) => {
      if (!hasPallet(api, 'nexMarket')) return null;
      const pallet = (api.query as any).nexMarket;

      const result: ChainPriceData = {
        twapAcc: null,
        lastTradePrice: null,
        initialPrice: null,
      };

      // 1. Read twapAccumulatorStore (single RPC, contains all TWAP fields)
      const twapFn = pallet.twapAccumulatorStore;
      if (twapFn) {
        try {
          const raw = await twapFn();
          const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
          const obj = (unwrapped as any)?.toJSON?.() ?? unwrapped;
          if (obj && typeof obj === 'object') {
            const hs = (obj as any).hourSnapshot ?? (obj as any).hour_snapshot;
            result.twapAcc = {
              currentCumulative: BigInt(String(obj.currentCumulative ?? obj.current_cumulative ?? 0)),
              currentBlock: Number(obj.currentBlock ?? obj.current_block ?? 0),
              lastPrice: BigInt(String(obj.lastPrice ?? obj.last_price ?? 0)),
              hourSnapshotCumulative: BigInt(String(hs?.cumulativePrice ?? hs?.cumulative_price ?? 0)),
              hourSnapshotBlock: Number(hs?.blockNumber ?? hs?.block_number ?? 0),
            };
          }
        } catch {
          // ignore
        }
      }

      // 2. Read LastTradePrice (USDT/NEX, 10^6)
      const ltpFn = pallet.lastTradePrice;
      if (ltpFn) {
        try {
          const raw = await ltpFn();
          if (raw && !(raw as { isNone?: boolean }).isNone) {
            const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
            if (unwrapped) {
              const val = (unwrapped as any).toJSON?.() ?? unwrapped;
              const num = BigInt(String(val ?? 0));
              if (num > BigInt(0)) result.lastTradePrice = num;
            }
          }
        } catch {
          // ignore
        }
      }

      // 3. Read PriceProtectionStore.initialPrice (USDT/NEX, 10^6)
      const ppFn = pallet.priceProtectionStore;
      if (ppFn) {
        try {
          const raw = await ppFn();
          const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
          const obj = (unwrapped as any)?.toJSON?.() ?? unwrapped;
          if (obj && typeof obj === 'object') {
            const ip = BigInt(String(obj.initialPrice ?? obj.initial_price ?? 0));
            if (ip > BigInt(0)) result.initialPrice = ip;
          }
        } catch {
          // ignore
        }
      }

      return result;
    },
    { staleTime: 15_000, refetchInterval: 15_000 },
  );

  // Compute final price with priority chain — re-runs when currentBlock or chain data updates
  const resolved = useMemo((): { usdtPerNex: bigint | null; rateSource: RateSource | null } => {
    const data = query.data;
    if (!data) return { usdtPerNex: null, rateSource: null };

    // Priority 1: 1h TWAP (matches on-chain PricingProvider)
    if (data.twapAcc) {
      const twap = calculateTwap1h(data.twapAcc, currentBlock);
      if (twap) return { usdtPerNex: twap, rateSource: 'twap' };
    }

    // Priority 2: lastPrice from TWAP accumulator
    if (data.twapAcc && data.twapAcc.lastPrice > BigInt(0)) {
      return { usdtPerNex: data.twapAcc.lastPrice, rateSource: 'lastPrice' };
    }

    // Priority 3: LastTradePrice storage
    if (data.lastTradePrice) {
      return { usdtPerNex: data.lastTradePrice, rateSource: 'lastTradePrice' };
    }

    // Priority 4: initialPrice (governance cold-start)
    if (data.initialPrice) {
      return { usdtPerNex: data.initialPrice, rateSource: 'initialPrice' };
    }

    return { usdtPerNex: null, rateSource: null };
  }, [query.data, currentBlock]);

  return {
    usdtPerNex: resolved.usdtPerNex,
    rateSource: resolved.rateSource,
    isLoading: query.isLoading,
  };
}
