'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiPromise } from '@polkadot/api';
import { useApi } from '@/lib/chain';
import { RETRY_CONFIG } from '@/lib/chain/constants';

/** Check if an error is a pallet-not-found TypeError (undefined is not an object/function) */
function isPalletMissing(err: unknown): boolean {
  if (err instanceof TypeError) {
    const msg = err.message;
    return (
      msg.includes('is not a function') ||
      msg.includes('is not an object') ||
      msg.includes('is undefined') ||
      msg.includes('Cannot read properties of undefined')
    );
  }
  return false;
}

/**
 * Check if a pallet exists on the connected chain.
 * Usage: `if (!hasPallet(api, 'entityMarket')) return [];`
 */
export function hasPallet(api: ApiPromise, palletName: string): boolean {
  return !!(api.query as any)[palletName];
}

/**
 * Generic hook for entity-scoped chain queries.
 * Automatically integrates with the shared ApiPromise instance.
 * Handles missing pallet gracefully (no retry, returns error).
 */
export function useEntityQuery<T>(
  queryKey: unknown[],
  queryFn: (api: ApiPromise) => Promise<T>,
  options?: {
    staleTime?: number;
    enabled?: boolean;
    refetchInterval?: number;
  },
): UseQueryResult<T> {
  const { api, isReady } = useApi();

  return useQuery<T>({
    queryKey,
    queryFn: () => {
      if (!api) throw new Error('API not ready');
      return queryFn(api);
    },
    enabled: isReady && !!api && (options?.enabled !== false),
    staleTime: options?.staleTime,
    refetchInterval: options?.refetchInterval,
    retry: (failureCount, error) => {
      if (isPalletMissing(error)) return false;
      return failureCount < RETRY_CONFIG.chainQuery.retry;
    },
    retryDelay: RETRY_CONFIG.chainQuery.retryDelay,
  });
}
