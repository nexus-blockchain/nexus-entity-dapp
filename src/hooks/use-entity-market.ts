'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import type { MarketOrder, MarketStats, PriceProtectionConfig } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function parseMarketOrders(rawEntries: [any, any][]): MarketOrder[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([key, value]) => {
    const obj = value?.toJSON?.() ?? value;
    return {
      id: Number(key.args?.[1]?.toString() ?? key.args?.[0]?.toString() ?? obj.id ?? 0),
      entityId: Number(obj.entityId ?? obj.entity_id ?? key.args?.[0]?.toString() ?? 0),
      trader: String(obj.trader ?? ''),
      side: String(obj.side ?? 'Buy') as 'Buy' | 'Sell',
      price: BigInt(String(obj.price ?? 0)),
      amount: BigInt(String(obj.amount ?? 0)),
      filled: BigInt(String(obj.filled ?? 0)),
      createdAt: Number(obj.createdAt ?? obj.created_at ?? 0),
    };
  });
}

function parseMarketStats(raw: unknown): MarketStats | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  const pp = obj.priceProtection ?? {};
  return {
    twapPrice: BigInt(String(obj.twapPrice ?? obj.twap_price ?? 0)),
    lastPrice: BigInt(String(obj.lastPrice ?? obj.last_price ?? 0)),
    volume24h: BigInt(String(obj.volume24h ?? obj.volume_24h ?? 0)),
    circuitBreakerActive: Boolean(obj.circuitBreakerActive ?? obj.circuit_breaker_active),
    priceProtection: {
      maxDeviationBps: Number(pp.maxDeviationBps ?? pp.max_deviation_bps ?? 0),
      circuitBreakerThreshold: Number(pp.circuitBreakerThreshold ?? pp.circuit_breaker_threshold ?? 0),
      circuitBreakerDuration: Number(pp.circuitBreakerDuration ?? pp.circuit_breaker_duration ?? 0),
    },
  };
}

function parsePriceProtectionConfig(raw: unknown): PriceProtectionConfig | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    maxDeviationBps: Number(obj.maxDeviationBps ?? obj.max_deviation_bps ?? 0),
    circuitBreakerThreshold: Number(obj.circuitBreakerThreshold ?? obj.circuit_breaker_threshold ?? 0),
    circuitBreakerDuration: Number(obj.circuitBreakerDuration ?? obj.circuit_breaker_duration ?? 0),
  };
}

// ─── Hook ───────────────────────────────────────────────────

export function useEntityMarket() {
  const { entityId } = useEntityContext();

  // Query order book
  const orderBookQuery = useEntityQuery<MarketOrder[]>(
    ['entity', entityId, 'market', 'orderBook'],
    async (api) => {
      if (!hasPallet(api, 'entityMarket')) return [];
      const pallet = (api.query as any).entityMarket;
      // Try known storage names: orderBook, orders, sellOrders
      const storageFn = pallet.orderBook ?? pallet.orders ?? pallet.sellOrders;
      if (!storageFn?.entries) return [];
      const raw = await storageFn.entries();
      // Single-key StorageMap; filter by entityId client-side
      const filtered = (raw as [any, any][]).filter(([, value]) => {
        const obj = value?.toJSON?.() ?? value;
        const eid = Number(obj.entityId ?? obj.entity_id ?? 0);
        return eid === entityId;
      });
      return parseMarketOrders(filtered);
    },
    { staleTime: STALE_TIMES.orderBook },
  );

  // Query market stats
  const statsQuery = useEntityQuery<MarketStats | null>(
    ['entity', entityId, 'market', 'stats'],
    async (api) => {
      if (!hasPallet(api, 'entityMarket')) return null;
      const fn = (api.query as any).entityMarket.marketStats;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseMarketStats(raw);
    },
    { staleTime: STALE_TIMES.token },
  );

  // Query price protection config
  const priceProtectionQuery = useEntityQuery<PriceProtectionConfig | null>(
    ['entity', entityId, 'market', 'priceProtection'],
    async (api) => {
      if (!hasPallet(api, 'entityMarket')) return null;
      const fn = (api.query as any).entityMarket.priceProtectionConfig;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parsePriceProtectionConfig(raw);
    },
    { staleTime: STALE_TIMES.token },
  );

  // ─── Mutations ──────────────────────────────────────────

  const invalidateKeys = [['entity', entityId, 'market']];

  const placeSellOrder = useEntityMutation('entityMarket', 'placeSellOrder', { invalidateKeys });
  const placeBuyOrder = useEntityMutation('entityMarket', 'placeBuyOrder', { invalidateKeys });
  const marketBuy = useEntityMutation('entityMarket', 'marketBuy', { invalidateKeys });
  const marketSell = useEntityMutation('entityMarket', 'marketSell', { invalidateKeys });
  const cancelOrder = useEntityMutation('entityMarket', 'cancelOrder', { invalidateKeys });
  const takeOrder = useEntityMutation('entityMarket', 'takeOrder', { invalidateKeys });

  return {
    orders: orderBookQuery.data ?? [],
    stats: statsQuery.data ?? null,
    priceProtection: priceProtectionQuery.data ?? null,
    isLoading: orderBookQuery.isLoading || statsQuery.isLoading,
    error: orderBookQuery.error ?? statsQuery.error,
    placeSellOrder,
    placeBuyOrder,
    marketBuy,
    marketSell,
    cancelOrder,
    takeOrder,
  };
}
