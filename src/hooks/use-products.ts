'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import { decodeChainString } from '@/lib/utils/codec';
import type { ProductData } from '@/lib/types/models';
import { ProductCategory, ProductStatus, ProductVisibility } from '@/lib/types/enums';

// ─── Parser ─────────────────────────────────────────────────

export function parseProductData(raw: unknown): ProductData | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = unwrapped as Record<string, unknown>;

  return {
    id: Number(obj.id ?? 0),
    shopId: Number(obj.shopId ?? 0),
    nameCid: decodeChainString(obj.nameCid),
    imagesCid: decodeChainString(obj.imagesCid ?? obj.imageCid),
    detailCid: decodeChainString(obj.detailCid),
    price: BigInt(String(obj.price ?? obj.priceNex ?? 0)),
    usdtPrice: Number(obj.usdtPrice ?? obj.priceUsdt ?? 0),
    stock: Number(obj.stock ?? 0),
    category: String(obj.category ?? 'Other') as ProductCategory,
    visibility: String(obj.visibility ?? 'Public') as ProductVisibility,
    levelGate: obj.levelGate != null ? Number(obj.levelGate) : null,
    status: String(obj.status ?? 'Draft') as ProductStatus,
    sortWeight: Number(obj.sortWeight ?? obj.sort_weight ?? 0),
    tagsCid: obj.tagsCid ? decodeChainString(obj.tagsCid) : null,
    skuCid: obj.skuCid ? decodeChainString(obj.skuCid) : null,
    minOrderQuantity: Number(obj.minOrderQuantity ?? obj.minQuantity ?? 1),
    maxOrderQuantity: Number(obj.maxOrderQuantity ?? obj.maxQuantity ?? 0),
  };
}

// ─── Hook ───────────────────────────────────────────────────

export function useProducts(shopId: number) {
  const { entityId } = useEntityContext();

  // Query product IDs for this shop
  const productIdsQuery = useEntityQuery<number[]>(
    ['entity', entityId, 'shop', shopId, 'products'],
    async (api) => {
      if (!hasPallet(api, 'entityProduct')) return [];
      const raw = await (api.query as any).entityProduct.shopProducts(shopId);
      if (!raw) return [];
      const arr = raw.toJSON?.() ?? raw;
      return Array.isArray(arr) ? arr.map(Number) : [];
    },
    { staleTime: STALE_TIMES.products, enabled: shopId > 0 },
  );

  // Query full product data
  const productsQuery = useEntityQuery<ProductData[]>(
    ['entity', entityId, 'shop', shopId, 'products', 'data', productIdsQuery.data],
    async (api) => {
      if (!hasPallet(api, 'entityProduct')) return [];
      const ids = productIdsQuery.data;
      if (!ids || ids.length === 0) return [];

      const results = await Promise.all(
        ids.map((id) => (api.query as any).entityProduct.products(id)),
      );

      return results
        .map((raw) => parseProductData(raw))
        .filter((p): p is ProductData => p !== null);
    },
    {
      staleTime: STALE_TIMES.products,
      enabled: !!productIdsQuery.data && productIdsQuery.data.length > 0,
    },
  );

  // Mutations
  const createProduct = useEntityMutation('entityProduct', 'createProduct', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'products']],
  });

  const updateProduct = useEntityMutation('entityProduct', 'updateProduct', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'products']],
  });

  const publishProduct = useEntityMutation('entityProduct', 'publishProduct', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'products']],
  });

  const unpublishProduct = useEntityMutation('entityProduct', 'unpublishProduct', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'products']],
  });

  const deleteProduct = useEntityMutation('entityProduct', 'deleteProduct', {
    invalidateKeys: [['entity', entityId, 'shop', shopId, 'products']],
  });

  return {
    products: productsQuery.data ?? [],
    isLoading: productIdsQuery.isLoading || productsQuery.isLoading,
    error: productIdsQuery.error || productsQuery.error,
    createProduct,
    updateProduct,
    publishProduct,
    unpublishProduct,
    deleteProduct,
  };
}

// ─── Single Product Hook ─────────────────────────────────────

export function useProduct(productId: number) {
  const { entityId } = useEntityContext();

  const productQuery = useEntityQuery<ProductData | null>(
    ['entity', entityId, 'product', productId],
    async (api) => {
      if (!hasPallet(api, 'entityProduct')) return null;
      const raw = await (api.query as any).entityProduct.products(productId);
      return parseProductData(raw);
    },
    { staleTime: STALE_TIMES.products, enabled: productId > 0 },
  );

  const shopId = productQuery.data?.shopId ?? 0;
  const invalidateKeys = [
    ['entity', entityId, 'product', productId],
    ['entity', entityId, 'shop', shopId, 'products'],
  ];

  const updateProduct = useEntityMutation('entityProduct', 'updateProduct', { invalidateKeys });
  const deleteProduct = useEntityMutation('entityProduct', 'deleteProduct', { invalidateKeys });
  const publishProduct = useEntityMutation('entityProduct', 'publishProduct', { invalidateKeys });
  const unpublishProduct = useEntityMutation('entityProduct', 'unpublishProduct', { invalidateKeys });

  return {
    product: productQuery.data ?? null,
    isLoading: productQuery.isLoading,
    error: productQuery.error,
    updateProduct,
    deleteProduct,
    publishProduct,
    unpublishProduct,
  };
}
