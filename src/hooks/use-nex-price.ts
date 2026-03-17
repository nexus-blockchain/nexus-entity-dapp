'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { STALE_TIMES } from '@/lib/chain/constants';

type RateSource = 'twap' | 'lastPrice' | 'lastTradePrice';

interface NexUsdtPriceResult {
  /** 1 USDT = how many NEX (chain precision 12 decimals). null if rate unavailable */
  nexPerUsdt: bigint | null;
  /** Which price source is being used */
  rateSource: RateSource | null;
  isLoading: boolean;
}

interface RateData {
  nexPerUsdt: bigint;
  rateSource: RateSource;
}

/**
 * Lightweight hook to get global NEX/USDT exchange rate.
 * Priority: marketStatsStore.twapPrice > marketStatsStore.lastPrice > lastTradePrice/depositExchangeRate.
 * `_entityId` is kept only for backward compatibility with existing callers.
 */
export function useNexUsdtPrice(_entityId?: number): NexUsdtPriceResult {
  const query = useEntityQuery<RateData | null>(
    ['nexPrice', 'rate'],
    async (api) => {
      if (!hasPallet(api, 'nexMarket')) return null;
      const pallet = (api.query as any).nexMarket;

      // 1. Try TWAP accumulator (global)
      const twapFn = pallet.twapAccumulatorStore;
      if (twapFn) {
        try {
          const raw = await twapFn();
          const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
          const obj = (unwrapped as any)?.toJSON?.() ?? unwrapped;
          if (obj && typeof obj === 'object') {
            const currentCumulative = BigInt(String(obj.currentCumulative ?? obj.current_cumulative ?? 0));
            const currentBlock = BigInt(String(obj.currentBlock ?? obj.current_block ?? 0));
            const twap = currentBlock > BigInt(0) ? currentCumulative / currentBlock : BigInt(0);
            if (twap > BigInt(0)) {
              return { nexPerUsdt: twap, rateSource: 'twap' as const };
            }
            const last = BigInt(String(obj.lastPrice ?? obj.last_price ?? 0));
            if (last > BigInt(0)) {
              return { nexPerUsdt: last, rateSource: 'lastPrice' as const };
            }
          }
        } catch {
          // ignore
        }
      }

      // 2. Fallback to lastTradePrice / depositExchangeRate (global)
      const ltpFn = pallet.lastTradePrice ?? pallet.depositExchangeRate;
      if (ltpFn) {
        let raw: unknown;
        try {
          raw = await ltpFn();
        } catch {
          return null;
        }
        if (raw && !(raw as { isNone?: boolean }).isNone) {
          const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
          if (unwrapped) {
            const val = (unwrapped as any).toJSON?.() ?? unwrapped;
            const num = BigInt(String(val ?? 0));
            if (num > BigInt(0)) {
              return { nexPerUsdt: num, rateSource: 'lastTradePrice' as const };
            }
          }
        }
      }

      return null;
    },
    { staleTime: STALE_TIMES.token },
  );

  return {
    nexPerUsdt: query.data?.nexPerUsdt ?? null,
    rateSource: query.data?.rateSource ?? null,
    isLoading: query.isLoading,
  };
}
