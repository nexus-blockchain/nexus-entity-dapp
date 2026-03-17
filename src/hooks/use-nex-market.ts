'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { STALE_TIMES } from '@/lib/chain/constants';
import { useWalletStore } from '@/stores/wallet-store';
import type { MarketOrder, MarketStats, PriceProtectionConfig } from '@/lib/types/models';

type OrderSide = 'Buy' | 'Sell';

function unwrap(raw: unknown): unknown | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  return (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
}

function toPlain(raw: unknown): any {
  const value = unwrap(raw);
  if (value == null) return null;
  return (value as { toJSON?: () => unknown }).toJSON?.() ?? value;
}

function parseOrderIds(raw: unknown): number[] {
  const value = toPlain(raw);
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const ids = obj.orderIds ?? obj.orders ?? obj.ids;
    if (Array.isArray(ids)) {
      return ids.map((item) => Number(item)).filter((item) => Number.isFinite(item));
    }
  }
  return [];
}

function parseOrderRefsFromEntries(entries: [any, any][], side: OrderSide): Array<{ id: number; side: OrderSide }> {
  const refs: Array<{ id: number; side: OrderSide }> = [];
  for (const [key, value] of entries) {
    const keyId = Number(key.args?.[0]?.toString() ?? key.args?.[1]?.toString() ?? NaN);
    if (Number.isFinite(keyId)) {
      refs.push({ id: keyId, side });
    }
    parseOrderIds(value).forEach((id) => refs.push({ id, side }));
  }
  return refs;
}

async function collectGlobalOrderRefs(pallet: any): Promise<Array<{ id: number; side: OrderSide }>> {
  const refs = new Map<number, OrderSide>();

  for (const [storageName, side] of [['buyOrders', 'Buy'], ['sellOrders', 'Sell']] as const) {
    const fn = pallet[storageName];
    if (!fn) continue;
    let collected = false;

    try {
      const ids = parseOrderIds(await fn());
      if (ids.length > 0) {
        ids.forEach((id) => refs.set(id, side));
        collected = true;
      }
    } catch {
      // ignore and fall back to entries()
    }

    if (!collected && fn.entries) {
      try {
        parseOrderRefsFromEntries(await fn.entries(), side).forEach(({ id, side: orderSide }) => refs.set(id, orderSide));
      } catch {
        // ignore
      }
    }
  }

  return Array.from(refs.entries()).map(([id, side]) => ({ id, side }));
}

function parseMarketStats(raw: unknown): MarketStats | null {
  const obj = toPlain(raw);
  if (!obj || typeof obj !== 'object') return null;
  const value = obj as Record<string, unknown>;
  return {
    twapPrice: BigInt(0),
    lastPrice: BigInt(0),
    volume24h: BigInt(String(value.totalVolumeUsdt ?? value.total_volume_usdt ?? 0)),
    circuitBreakerActive: false,
    priceProtection: { maxDeviationBps: 0, circuitBreakerThreshold: 0, circuitBreakerDuration: 0 },
  };
}

function parseTwapInfo(raw: unknown): { twapPrice: bigint; lastPrice: bigint } {
  const obj = toPlain(raw);
  if (!obj || typeof obj !== 'object') return { twapPrice: BigInt(0), lastPrice: BigInt(0) };
  const value = obj as Record<string, unknown>;
  const currentCumulative = BigInt(String(value.currentCumulative ?? value.current_cumulative ?? 0));
  const currentBlock = BigInt(String(value.currentBlock ?? value.current_block ?? 0));
  const lastPrice = BigInt(String(value.lastPrice ?? value.last_price ?? 0));
  const twapPrice = currentBlock > BigInt(0) ? currentCumulative / currentBlock : BigInt(0);
  return {
    twapPrice,
    lastPrice,
  };
}

function parsePriceProtectionConfig(raw: unknown): PriceProtectionConfig | null {
  const obj = toPlain(raw);
  if (!obj || typeof obj !== 'object') return null;
  const value = obj as Record<string, unknown>;
  return {
    maxDeviationBps: Number(value.maxPriceDeviation ?? value.max_price_deviation ?? 0),
    circuitBreakerThreshold: Number(value.circuitBreakerThreshold ?? value.circuit_breaker_threshold ?? 0),
    circuitBreakerDuration: Number(value.circuitBreakerUntil ?? value.circuit_breaker_until ?? 0),
  };
}

function parseMarketOrder(raw: unknown, id: number, fallbackSide: OrderSide): MarketOrder | null {
  const obj = toPlain(raw);
  if (!obj || typeof obj !== 'object') return null;
  const value = obj as Record<string, unknown>;
  const amount = BigInt(String(value.amount ?? value.nexAmount ?? value.nex_amount ?? value.totalAmount ?? value.total_amount ?? 0));
  const remaining = value.remainingAmount ?? value.remaining_amount;
  const explicitFilled = value.filled ?? value.filledAmount ?? value.filled_amount;
  const filled = explicitFilled != null
    ? BigInt(String(explicitFilled))
    : remaining != null
      ? amount - BigInt(String(remaining))
      : BigInt(0);

  return {
    id,
    entityId: 0,
    trader: String(value.maker ?? value.trader ?? value.owner ?? value.buyer ?? value.seller ?? ''),
    side: String(value.side ?? fallbackSide) as OrderSide,
    price: BigInt(String(value.price ?? value.usdtPrice ?? value.usdt_price ?? 0)),
    amount,
    filled: filled > BigInt(0) ? filled : BigInt(0),
    createdAt: Number(value.createdAt ?? value.created_at ?? value.blockNumber ?? value.block_number ?? 0),
    depositWaived: Boolean(value.depositWaived ?? value.deposit_waived ?? false),
  };
}

export function useNexMarket() {
  const address = useWalletStore((s) => s.address);

  const orderBookQuery = useEntityQuery<MarketOrder[]>(
    ['nexMarket', 'orderBook'],
    async (api) => {
      if (!hasPallet(api, 'nexMarket')) return [];
      const pallet = (api.query as any).nexMarket;
      const ordersFn = pallet.orders;
      if (!ordersFn) return [];

      const refs = await collectGlobalOrderRefs(pallet);
      if (refs.length > 0) {
        const raws = await Promise.all(refs.map(({ id }) => ordersFn(id)));
        return raws
          .map((raw, index) => parseMarketOrder(raw, refs[index].id, refs[index].side))
          .filter((order): order is MarketOrder => order !== null);
      }

      if (!ordersFn.entries) return [];
      const entries = await ordersFn.entries();
      return (entries as [any, any][])
        .map(([key, value]) => parseMarketOrder(value, Number(key.args?.[0]?.toString() ?? 0), 'Buy'))
        .filter((order): order is MarketOrder => order !== null);
    },
    { staleTime: STALE_TIMES.orderBook },
  );

  const statsQuery = useEntityQuery<MarketStats | null>(
    ['nexMarket', 'stats'],
    async (api) => {
      if (!hasPallet(api, 'nexMarket')) return null;
      const pallet = (api.query as any).nexMarket;
      const statsFn = pallet.marketStatsStore;
      if (!statsFn) return null;
      const [rawStats, rawTwap, rawLastPrice, rawProtection] = await Promise.all([
        statsFn(),
        pallet.twapAccumulatorStore ? pallet.twapAccumulatorStore() : Promise.resolve(null),
        pallet.lastTradePrice ? pallet.lastTradePrice() : Promise.resolve(null),
        pallet.priceProtectionStore ? pallet.priceProtectionStore() : Promise.resolve(null),
      ]);
      const stats = parseMarketStats(rawStats);
      const twap = parseTwapInfo(rawTwap);
      const lastTradePrice = toPlain(rawLastPrice);
      const protection = parsePriceProtectionConfig(rawProtection);
      const protectionObj = (toPlain(rawProtection) ?? {}) as Record<string, unknown>;
      return {
        twapPrice: twap.twapPrice,
        lastPrice: BigInt(String(lastTradePrice ?? twap.lastPrice ?? 0)),
        volume24h: stats?.volume24h ?? BigInt(0),
        circuitBreakerActive: Boolean(protectionObj.circuitBreakerActive ?? protectionObj.circuit_breaker_active ?? false),
        priceProtection: protection ?? { maxDeviationBps: 0, circuitBreakerThreshold: 0, circuitBreakerDuration: 0 },
      };
    },
    { staleTime: STALE_TIMES.token },
  );

  const priceProtectionQuery = useEntityQuery<PriceProtectionConfig | null>(
    ['nexMarket', 'priceProtection'],
    async (api) => {
      if (!hasPallet(api, 'nexMarket')) return null;
      const fn = (api.query as any).nexMarket.priceProtectionStore;
      if (!fn) return null;
      return parsePriceProtectionConfig(await fn());
    },
    { staleTime: STALE_TIMES.token },
  );

  const lastTradePriceQuery = useEntityQuery<bigint | null>(
    ['nexMarket', 'lastTradePrice'],
    async (api) => {
      if (!hasPallet(api, 'nexMarket')) return null;
      const pallet = (api.query as any).nexMarket;
      const fn = pallet.lastTradePrice ?? pallet.depositExchangeRate;
      if (!fn) return null;
      const value = toPlain(await fn());
      if (value == null) return null;
      const price = BigInt(String(value ?? 0));
      return price > BigInt(0) ? price : null;
    },
    { staleTime: STALE_TIMES.token },
  );

  // ─── First-order waived deposit: chain constants ──────────
  const buyerDepositRateQuery = useEntityQuery<number>(
    ['nexMarket', 'buyerDepositRate'],
    async (api) => {
      if (!hasPallet(api, 'nexMarket')) return 0;
      const value = (api.consts as any).nexMarket?.buyerDepositRate;
      if (!value) return 0;
      return Number(value.toString());
    },
    { staleTime: STALE_TIMES.token },
  );

  const maxFirstOrderAmountQuery = useEntityQuery<bigint>(
    ['nexMarket', 'maxFirstOrderAmount'],
    async (api) => {
      if (!hasPallet(api, 'nexMarket')) return BigInt(0);
      const value = (api.consts as any).nexMarket?.maxFirstOrderAmount;
      if (!value) return BigInt(0);
      return BigInt(value.toString());
    },
    { staleTime: STALE_TIMES.token },
  );

  const firstOrderTimeoutQuery = useEntityQuery<number>(
    ['nexMarket', 'firstOrderTimeout'],
    async (api) => {
      if (!hasPallet(api, 'nexMarket')) return 0;
      const value = (api.consts as any).nexMarket?.firstOrderTimeout;
      if (!value) return 0;
      return Number(value.toString());
    },
    { staleTime: STALE_TIMES.token },
  );

  const seedOrderUsdtAmountQuery = useEntityQuery<number>(
    ['nexMarket', 'seedOrderUsdtAmount'],
    async (api) => {
      if (!hasPallet(api, 'nexMarket')) return 0;
      const value = (api.consts as any).nexMarket?.seedOrderUsdtAmount;
      if (!value) return 0;
      return Number(value.toString());
    },
    { staleTime: STALE_TIMES.token },
  );

  const seedPricePremiumBpsQuery = useEntityQuery<number>(
    ['nexMarket', 'seedPricePremiumBps'],
    async (api) => {
      if (!hasPallet(api, 'nexMarket')) return 0;
      const value = (api.consts as any).nexMarket?.seedPricePremiumBps;
      if (!value) return 0;
      return Number(value.toString());
    },
    { staleTime: STALE_TIMES.token },
  );

  // ─── First-order waived deposit: address-based queries ────
  const completedBuyerQuery = useEntityQuery<boolean>(
    ['nexMarket', 'completedBuyers', address],
    async (api) => {
      if (!hasPallet(api, 'nexMarket') || !address) return false;
      const fn = (api.query as any).nexMarket.completedBuyers;
      if (!fn) return false;
      const raw = toPlain(await fn(address));
      return Boolean(raw);
    },
    { staleTime: STALE_TIMES.token, enabled: !!address },
  );

  const activeWaivedTradesQuery = useEntityQuery<number>(
    ['nexMarket', 'activeWaivedTrades', address],
    async (api) => {
      if (!hasPallet(api, 'nexMarket') || !address) return 0;
      const fn = (api.query as any).nexMarket.activeWaivedTrades;
      if (!fn) return 0;
      const raw = toPlain(await fn(address));
      return Number(raw ?? 0);
    },
    { staleTime: STALE_TIMES.token, enabled: !!address },
  );

  const invalidateKeys = [['nexMarket']];

  const placeSellOrder = useEntityMutation('nexMarket', 'placeSellOrder', { invalidateKeys });
  const placeBuyOrder = useEntityMutation('nexMarket', 'placeBuyOrder', { invalidateKeys });
  const cancelOrder = useEntityMutation('nexMarket', 'cancelOrder', { invalidateKeys });
  const acceptBuyOrder = useEntityMutation('nexMarket', 'acceptBuyOrder', { invalidateKeys });
  const reserveSellOrder = useEntityMutation('nexMarket', 'reserveSellOrder', { invalidateKeys });
  const confirmPayment = useEntityMutation('nexMarket', 'confirmPayment', { invalidateKeys });
  const sellerConfirmReceived = useEntityMutation('nexMarket', 'sellerConfirmReceived', { invalidateKeys });

  const isCompletedBuyer = completedBuyerQuery.data ?? false;
  const activeWaivedTrades = activeWaivedTradesQuery.data ?? 0;
  const isFirstOrderEligible = !!address && !isCompletedBuyer && activeWaivedTrades === 0;

  return {
    orders: orderBookQuery.data ?? [],
    stats: statsQuery.data ?? null,
    priceProtection: priceProtectionQuery.data ?? null,
    lastTradePrice: lastTradePriceQuery.data ?? null,
    isLoading: orderBookQuery.isLoading || statsQuery.isLoading,
    error: orderBookQuery.error ?? statsQuery.error,
    // First-order waived deposit
    buyerDepositRate: buyerDepositRateQuery.data ?? 0,
    maxFirstOrderAmount: maxFirstOrderAmountQuery.data ?? BigInt(0),
    firstOrderTimeout: firstOrderTimeoutQuery.data ?? 0,
    seedOrderUsdtAmount: seedOrderUsdtAmountQuery.data ?? 0,
    seedPricePremiumBps: seedPricePremiumBpsQuery.data ?? 0,
    isCompletedBuyer,
    activeWaivedTrades,
    isFirstOrderEligible,
    placeSellOrder,
    placeBuyOrder,
    cancelOrder,
    acceptBuyOrder,
    reserveSellOrder,
    confirmPayment,
    sellerConfirmReceived,
  };
}
