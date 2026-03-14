'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { STALE_TIMES } from '@/lib/chain/constants';

type RateSource = 'twap' | 'lastPrice' | 'initialPrice';

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
 * Lightweight hook to get NEX/USDT exchange rate for a given entity.
 * Priority: twapPrice > lastPrice > initialPrice.
 * All return 0 → rate unavailable (null).
 */
export function useNexUsdtPrice(entityId: number): NexUsdtPriceResult {
  const query = useEntityQuery<RateData | null>(
    ['entity', entityId, 'nexPrice', 'rate'],
    async (api) => {
      if (!hasPallet(api, 'nexMarket')) return null;
      const pallet = (api.query as any).nexMarket;

      // 1. Try marketStats for twapPrice / lastPrice
      const statsFn = pallet.marketStats;
      if (statsFn) {
        const raw = await statsFn(entityId);
        if (raw && !(raw as { isNone?: boolean }).isNone) {
          const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
          if (unwrapped) {
            const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
            const twap = BigInt(String(obj.twapPrice ?? obj.twap_price ?? 0));
            if (twap > BigInt(0)) {
              return { nexPerUsdt: twap, rateSource: 'twap' as const };
            }
            const last = BigInt(String(obj.lastPrice ?? obj.last_price ?? 0));
            if (last > BigInt(0)) {
              return { nexPerUsdt: last, rateSource: 'lastPrice' as const };
            }
          }
        }
      }

      // 2. Fallback to initialPrice
      const initFn = pallet.initialPrice ?? pallet.initPrice ?? pallet.basePrice
        ?? pallet.initialPrices ?? pallet.nexPrice ?? pallet.price;
      if (initFn) {
        let raw: unknown;
        try {
          raw = await initFn(entityId);
        } catch {
          try { raw = await initFn(); } catch { return null; }
        }
        if (raw && !(raw as { isNone?: boolean }).isNone) {
          const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
          if (unwrapped) {
            const val = (unwrapped as any).toJSON?.() ?? unwrapped;
            const num = BigInt(String(val ?? 0));
            if (num > BigInt(0)) {
              return { nexPerUsdt: num, rateSource: 'initialPrice' as const };
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
