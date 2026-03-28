'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useShops } from './use-shops';
import { useWalletStore } from '@/stores/wallet-store';
import { STALE_TIMES } from '@/lib/chain/constants';
import { OrderStatus, PaymentAsset, ProductCategory } from '@/lib/types/enums';
import type { OrderData } from '@/lib/types/models';
import { decodeOptionalChainString } from '@/lib/utils/codec';

// ─── Parser ─────────────────────────────────────────────────

function unwrapChainOption(val: unknown): unknown | null {
  if (val == null) return null;
  if (typeof val === 'object') {
    const maybeOption = val as { isNone?: boolean; unwrapOr?: (fallback: null) => unknown };
    if (maybeOption.isNone) return null;
    if (typeof maybeOption.unwrapOr === 'function') {
      return maybeOption.unwrapOr(null) ?? null;
    }
  }
  const normalized = String(val).trim().toLowerCase();
  if (normalized === 'none' || normalized === 'null' || normalized === 'undefined') {
    return null;
  }
  return val;
}

function parseOptionalNumber(val: unknown): number | null {
  const unwrapped = unwrapChainOption(val);
  if (unwrapped == null) return null;
  const parsed = Number(unwrapped);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalAccount(val: unknown): string | null {
  const unwrapped = unwrapChainOption(val);
  if (unwrapped == null) return null;
  const parsed = String(unwrapped).trim();
  return parsed ? parsed : null;
}

function parseBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (val == null) return false;
  if (typeof val === 'string') {
    return val.trim().toLowerCase() === 'true';
  }
  if (typeof val === 'object') {
    const rendered = String(val).trim().toLowerCase();
    if (rendered === 'true') return true;
    if (rendered === 'false') return false;
  }
  return Boolean(val);
}

function parseOrderData(raw: unknown): OrderData | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = unwrapped as Record<string, unknown>;

  const buyer = String(obj.buyer ?? '');
  const createdAt = Number(obj.createdAt ?? obj.created_at ?? 0);
  const shippedAt = parseOptionalNumber(obj.shippedAt ?? obj.shipped_at);
  const completedAt = parseOptionalNumber(obj.completedAt ?? obj.completed_at);
  const serviceStartedAt = parseOptionalNumber(obj.serviceStartedAt ?? obj.service_started_at);
  const serviceCompletedAt = parseOptionalNumber(obj.serviceCompletedAt ?? obj.service_completed_at);
  const explicitUpdatedAt = Number(obj.updatedAt ?? obj.updated_at ?? 0);
  const updatedAt = explicitUpdatedAt > 0
    ? explicitUpdatedAt
    : Math.max(
        createdAt,
        shippedAt ?? 0,
        completedAt ?? 0,
        serviceStartedAt ?? 0,
        serviceCompletedAt ?? 0,
      );

  return {
    id: Number(obj.id ?? 0),
    entityId: Number(obj.entityId ?? obj.entity_id ?? 0),
    shopId: Number(obj.shopId ?? obj.shop_id ?? 0),
    productId: Number(obj.productId ?? obj.product_id ?? 0),
    buyer,
    seller: String(obj.seller ?? ''),
    payer: parseOptionalAccount(obj.payer),
    quantity: Number(obj.quantity ?? 0),
    unitPrice: BigInt(String(obj.unitPrice ?? obj.unit_price ?? 0)),
    paymentAsset: String(obj.paymentAsset ?? obj.payment_asset ?? 'Native') as PaymentAsset,
    totalAmount: BigInt(String(obj.totalAmount ?? obj.total_amount ?? 0)),
    platformFee: BigInt(String(obj.platformFee ?? obj.platform_fee ?? 0)),
    usdtTotal: BigInt(String(obj.usdtTotal ?? obj.usdt_total ?? 0)),
    nexUsdtRate: BigInt(String(obj.nexUsdtRate ?? obj.nex_usdt_rate ?? 0)),
    tokenNexRate: BigInt(String(obj.tokenNexRate ?? obj.token_nex_rate ?? 0)),
    tokenPaymentAmount: BigInt(String(obj.tokenPaymentAmount ?? obj.token_payment_amount ?? 0)),
    shoppingBalanceUsed: BigInt(String(obj.shoppingBalanceUsed ?? obj.shopping_balance_used ?? 0)),
    tokenDiscountTokensBurned: BigInt(String(obj.tokenDiscountTokensBurned ?? obj.token_discount_tokens_burned ?? 0)),
    productCategory: String(obj.productCategory ?? obj.product_category ?? 'Physical') as ProductCategory,
    status: String(obj.status ?? 'Created') as OrderStatus,
    escrowId: parseOptionalNumber(obj.escrowId ?? obj.escrow_id),
    shippingCid: decodeOptionalChainString(obj.shippingCid ?? obj.shipping_cid),
    trackingCid: decodeOptionalChainString(obj.trackingCid ?? obj.tracking_cid),
    noteCid: decodeOptionalChainString(obj.noteCid ?? obj.note_cid),
    refundReasonCid: decodeOptionalChainString(obj.refundReasonCid ?? obj.refund_reason_cid),
    disputeDeadline: parseOptionalNumber(obj.disputeDeadline ?? obj.dispute_deadline),
    createdAt,
    shippedAt,
    completedAt,
    serviceStartedAt,
    serviceCompletedAt,
    confirmExtended: parseBoolean(obj.confirmExtended ?? obj.confirm_extended),
    disputeRejected: parseBoolean(obj.disputeRejected ?? obj.dispute_rejected),
    updatedAt,
  };
}

// ─── Hook: Shop Orders (seller view) ────────────────────────

export function useShopOrders(shopId: number) {
  const { entityId } = useEntityContext();

  const orderIdsQuery = useEntityQuery<number[]>(
    ['entity', entityId, 'shop', shopId, 'orders'],
    async (api) => {
      if (!hasPallet(api, 'entityTransaction')) return [];
      const raw = await (api.query as any).entityTransaction.shopOrders(shopId);
      if (!raw) return [];
      const arr = raw.toJSON?.() ?? raw;
      return Array.isArray(arr) ? arr.map(Number) : [];
    },
    { staleTime: STALE_TIMES.orders, enabled: shopId > 0 },
  );

  const ordersQuery = useEntityQuery<OrderData[]>(
    ['entity', entityId, 'shop', shopId, 'orders', 'data', orderIdsQuery.data],
    async (api) => {
      if (!hasPallet(api, 'entityTransaction')) return [];
      const ids = orderIdsQuery.data;
      if (!ids || ids.length === 0) return [];
      const results = await Promise.all(
        ids.map((id) => (api.query as any).entityTransaction.orders(id)),
      );
      return results
        .map((raw) => parseOrderData(raw))
        .filter((o): o is OrderData => o !== null);
    },
    {
      staleTime: STALE_TIMES.orders,
      enabled: !!orderIdsQuery.data && orderIdsQuery.data.length > 0,
    },
  );

  // Seller mutations
  const shipOrder = useEntityMutation('entityTransaction', 'shipOrder', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'orders']],
  });
  const approveRefund = useEntityMutation('entityTransaction', 'approveRefund', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'orders']],
  });
  const cancelOrder = useEntityMutation('entityTransaction', 'cancelOrder', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'orders']],
  });
  const sellerCancelOrder = useEntityMutation('entityTransaction', 'sellerCancelOrder', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'orders']],
  });
  const startService = useEntityMutation('entityTransaction', 'startService', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'orders']],
  });
  const completeService = useEntityMutation('entityTransaction', 'completeService', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'orders']],
  });
  const cleanupShopOrders = useEntityMutation('entityTransaction', 'cleanupShopOrders', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'orders']],
  });
  const rejectRefund = useEntityMutation('entityTransaction', 'rejectRefund', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'orders']],
  });
  const updateShippingAddress = useEntityMutation('entityTransaction', 'updateShippingAddress', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'orders']],
  });
  const updateTracking = useEntityMutation('entityTransaction', 'updateTracking', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'orders']],
  });
  const sellerRefundOrder = useEntityMutation('entityTransaction', 'sellerRefundOrder', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'orders']],
  });
  const extendConfirmTimeout = useEntityMutation('entityTransaction', 'extendConfirmTimeout', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'orders']],
  });

  return {
    orders: ordersQuery.data ?? [],
    orderIndexCount: orderIdsQuery.data?.length ?? 0,
    isLoading: orderIdsQuery.isLoading || ordersQuery.isLoading,
    error: orderIdsQuery.error || ordersQuery.error,
    shipOrder,
    approveRefund,
    cancelOrder,
    sellerCancelOrder,
    startService,
    completeService,
    cleanupShopOrders,
    rejectRefund,
    updateShippingAddress,
    updateTracking,
    sellerRefundOrder,
    extendConfirmTimeout,
  };
}

// ─── Hook: Entity Sales Orders (all shops aggregated) ───────

export function useEntitySalesOrders() {
  const { entityId } = useEntityContext();
  const { shops, isLoading: shopsLoading } = useShops();
  const shopIds = shops.map((s) => s.id);

  // Fetch order IDs from all shops
  const allOrderIdsQuery = useEntityQuery<{ shopId: number; orderIds: number[] }[]>(
    ['entity', entityId, 'salesOrders', 'ids', shopIds],
    async (api) => {
      if (!hasPallet(api, 'entityTransaction')) return [];
      if (shopIds.length === 0) return [];
      const results = await Promise.all(
        shopIds.map(async (shopId) => {
          const raw = await (api.query as any).entityTransaction.shopOrders(shopId);
          if (!raw) return { shopId, orderIds: [] as number[] };
          const arr = raw.toJSON?.() ?? raw;
          return {
            shopId,
            orderIds: Array.isArray(arr) ? arr.map(Number) : [],
          };
        }),
      );
      return results;
    },
    {
      staleTime: STALE_TIMES.orders,
      enabled: shopIds.length > 0,
    },
  );

  // Flatten all order IDs and fetch full OrderData
  const shopOrderMap = allOrderIdsQuery.data ?? [];
  const allOrderIds = shopOrderMap.flatMap((s) => s.orderIds);

  const ordersQuery = useEntityQuery<OrderData[]>(
    ['entity', entityId, 'salesOrders', 'data', allOrderIds],
    async (api) => {
      if (!hasPallet(api, 'entityTransaction')) return [];
      if (allOrderIds.length === 0) return [];
      const results = await Promise.all(
        allOrderIds.map((id) => (api.query as any).entityTransaction.orders(id)),
      );
      return results
        .map((raw) => parseOrderData(raw))
        .filter((o): o is OrderData => o !== null);
    },
    {
      staleTime: STALE_TIMES.orders,
      enabled: allOrderIds.length > 0,
    },
  );

  // Per-shop order count (for index cleanup warnings)
  const orderCountByShop: Record<number, number> = {};
  for (const entry of shopOrderMap) {
    orderCountByShop[entry.shopId] = entry.orderIds.length;
  }

  return {
    orders: ordersQuery.data ?? [],
    orderCountByShop,
    isLoading: shopsLoading || allOrderIdsQuery.isLoading || ordersQuery.isLoading,
    error: allOrderIdsQuery.error || ordersQuery.error,
    shops,
  };
}

// ─── Hook: Buyer Orders ─────────────────────────────────────

export function useBuyerOrders() {
  const { entityId } = useEntityContext();
  const address = useWalletStore((s) => s.address);

  const orderIdsQuery = useEntityQuery<number[]>(
    ['entity', entityId, 'orders', address],
    async (api) => {
      if (!hasPallet(api, 'entityTransaction')) return [];
      if (!address) return [];
      const raw = await (api.query as any).entityTransaction.buyerOrders(address);
      if (!raw) return [];
      const arr = raw.toJSON?.() ?? raw;
      return Array.isArray(arr) ? arr.map(Number) : [];
    },
    { staleTime: STALE_TIMES.orders, enabled: !!address },
  );

  const ordersQuery = useEntityQuery<OrderData[]>(
    ['entity', entityId, 'orders', address, 'data', orderIdsQuery.data],
    async (api) => {
      if (!hasPallet(api, 'entityTransaction')) return [];
      const ids = orderIdsQuery.data;
      if (!ids || ids.length === 0) return [];
      const results = await Promise.all(
        ids.map((id) => (api.query as any).entityTransaction.orders(id)),
      );
      return results
        .map((raw) => parseOrderData(raw))
        .filter((o): o is OrderData => o !== null);
    },
    {
      staleTime: STALE_TIMES.orders,
      enabled: !!orderIdsQuery.data && orderIdsQuery.data.length > 0,
    },
  );

  // Buyer mutations
  const placeOrder = useEntityMutation('entityTransaction', 'placeOrder', {
    invalidateKeys: [['entity', entityId, 'orders', address]],
  });
  const confirmReceipt = useEntityMutation('entityTransaction', 'confirmReceipt', {
    invalidateKeys: [['entity', entityId, 'orders', address]],
  });
  const requestRefund = useEntityMutation('entityTransaction', 'requestRefund', {
    invalidateKeys: [['entity', entityId, 'orders', address]],
  });
  const cancelOrder = useEntityMutation('entityTransaction', 'cancelOrder', {
    invalidateKeys: [['entity', entityId, 'orders', address]],
  });
  const confirmService = useEntityMutation('entityTransaction', 'confirmService', {
    invalidateKeys: [['entity', entityId, 'orders', address]],
  });
  const cleanupBuyerOrders = useEntityMutation('entityTransaction', 'cleanupBuyerOrders', {
    invalidateKeys: [['entity', entityId, 'orders', address]],
  });

  return {
    orders: ordersQuery.data ?? [],
    orderIndexCount: orderIdsQuery.data?.length ?? 0,
    isLoading: orderIdsQuery.isLoading || ordersQuery.isLoading,
    error: orderIdsQuery.error || ordersQuery.error,
    placeOrder,
    confirmReceipt,
    requestRefund,
    cancelOrder,
    confirmService,
    cleanupBuyerOrders,
  };
}
