'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import type { MarketOrder, MarketStats, PriceProtectionConfig } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function parseOrderIds(raw: unknown): number[] {
  if (!raw) return [];
  const plain = (raw as { toJSON?: () => unknown }).toJSON?.() ?? raw;
  if (Array.isArray(plain)) {
    return plain.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  }
  if (typeof plain === 'object' && plain !== null) {
    const obj = plain as Record<string, unknown>;
    const ids = obj.orderIds ?? obj.orders ?? obj.ids;
    if (Array.isArray(ids)) {
      return ids.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    }
  }
  return [];
}

function parseMarketOrder(raw: unknown, orderId: number, fallbackEntityId: number): MarketOrder | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as { toJSON?: () => unknown }).toJSON?.() ?? unwrapped;
  if (!obj || typeof obj !== 'object') return null;

  const data = obj as Record<string, unknown>;
  const amount = BigInt(String(data.tokenAmount ?? data.token_amount ?? data.amount ?? 0));
  const filled = BigInt(String(data.filledAmount ?? data.filled_amount ?? data.filled ?? 0));

  return {
    id: orderId,
    entityId: Number(data.entityId ?? data.entity_id ?? fallbackEntityId),
    trader: String(data.maker ?? data.trader ?? data.owner ?? ''),
    side: String(data.side ?? 'Buy') as 'Buy' | 'Sell',
    price: BigInt(String(data.price ?? 0)),
    amount,
    filled,
    createdAt: Number(data.createdAt ?? data.created_at ?? 0),
    depositWaived: Boolean(data.depositWaived ?? data.deposit_waived ?? false),
  };
}

function unwrapToPlain(raw: unknown): any {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  return (unwrapped as any).toJSON?.() ?? unwrapped;
}

function parsePriceProtectionConfig(raw: unknown): PriceProtectionConfig | null {
  const obj = unwrapToPlain(raw);
  if (!obj || typeof obj !== 'object') return null;
  return {
    maxDeviationBps: Number(obj.maxPriceDeviation ?? obj.max_price_deviation ?? 0),
    circuitBreakerThreshold: Number(obj.circuitBreakerThreshold ?? obj.circuit_breaker_threshold ?? 0),
    circuitBreakerDuration: Number(obj.circuitBreakerUntil ?? obj.circuit_breaker_until ?? 0),
  };
}

function parseTwapInfo(raw: unknown): { twapPrice: bigint; lastPrice: bigint } {
  const obj = unwrapToPlain(raw);
  if (!obj || typeof obj !== 'object') return { twapPrice: BigInt(0), lastPrice: BigInt(0) };
  const currentCumulative = BigInt(String(obj.currentCumulative ?? obj.current_cumulative ?? 0));
  const currentBlock = BigInt(String(obj.currentBlock ?? obj.current_block ?? 0));
  const lastPrice = BigInt(String(obj.lastPrice ?? obj.last_price ?? 0));
  const twapPrice = currentBlock > BigInt(0) ? currentCumulative / currentBlock : BigInt(0);
  return { twapPrice, lastPrice };
}

// ─── Hook ───────────────────────────────────────────────────

export function useEntityMarket() {
  const { entityId } = useEntityContext();

  // Query order book
  const orderBookQuery = useEntityQuery<MarketOrder[]>(
    ['entity', entityId, 'market', 'orderBook'],
    async (api) => {
      if (!hasPallet(api, 'entityMarket')) return [];
      // Use entitySellOrders + entityBuyOrders → then orders(orderId)
      const pallet = (api.query as any).entityMarket;
      const sellOrdersFn = pallet.entitySellOrders;
      const buyOrdersFn = pallet.entityBuyOrders;
      if (!sellOrdersFn && !buyOrdersFn) return [];

      const orderIds = new Set<number>();
      // Collect sell order IDs
      if (sellOrdersFn) {
        const raw = await sellOrdersFn(entityId);
        parseOrderIds(raw).forEach((id) => orderIds.add(id));
      }
      // Collect buy order IDs
      if (buyOrdersFn) {
        const raw = await buyOrdersFn(entityId);
        parseOrderIds(raw).forEach((id) => orderIds.add(id));
      }

      const ids = Array.from(orderIds);
      if (ids.length === 0) return [];

      // Fetch full order data
      const ordersFn = pallet.orders;
      if (!ordersFn) return [];
      const results = await Promise.all(ids.map((id) => ordersFn(id)));
      return results
        .map((raw, i) => parseMarketOrder(raw, ids[i], entityId))
        .filter((o): o is MarketOrder => o !== null);
    },
    { staleTime: STALE_TIMES.orderBook },
  );

  // Query market stats
  const statsQuery = useEntityQuery<MarketStats | null>(
    ['entity', entityId, 'market', 'stats'],
    async (api) => {
      if (!hasPallet(api, 'entityMarket')) return null;
      const pallet = (api.query as any).entityMarket;
      const statsFn = pallet.marketStatsStorage;
      if (!statsFn) return null;
      const [rawStats, rawTwap, rawLastPrice, rawProtection] = await Promise.all([
        statsFn(entityId),
        pallet.twapAccumulators ? pallet.twapAccumulators(entityId) : Promise.resolve(null),
        pallet.lastTradePrice ? pallet.lastTradePrice(entityId) : Promise.resolve(null),
        pallet.priceProtection ? pallet.priceProtection(entityId) : Promise.resolve(null),
      ]);

      const statsObj = unwrapToPlain(rawStats);
      const { twapPrice, lastPrice: twapLastPrice } = parseTwapInfo(rawTwap);
      const lastPriceRaw = unwrapToPlain(rawLastPrice);
      const protection = parsePriceProtectionConfig(rawProtection);

      return {
        twapPrice,
        lastPrice: BigInt(String(lastPriceRaw ?? twapLastPrice ?? 0)),
        volume24h: BigInt(String(statsObj?.totalVolumeNex ?? statsObj?.total_volume_nex ?? 0)),
        circuitBreakerActive: Boolean(
          (unwrapToPlain(rawProtection) as any)?.circuitBreakerActive ??
          (unwrapToPlain(rawProtection) as any)?.circuit_breaker_active ??
          false,
        ),
        priceProtection: protection ?? { maxDeviationBps: 0, circuitBreakerThreshold: 0, circuitBreakerDuration: 0 },
      };
    },
    { staleTime: STALE_TIMES.token },
  );

  // Query price protection config
  const priceProtectionQuery = useEntityQuery<PriceProtectionConfig | null>(
    ['entity', entityId, 'market', 'priceProtection'],
    async (api) => {
      if (!hasPallet(api, 'entityMarket')) return null;
      const fn = (api.query as any).entityMarket.priceProtection;
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
