'use client';

import { useEntityQuery } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';

// ─── Types ──────────────────────────────────────────────────

interface ReviewData {
  id: number;
  entityId: number;
  orderId: number;
  reviewer: string;
  rating: number;
  contentCid: string;
  createdAt: number;
}

// ─── Parsers ────────────────────────────────────────────────

function parseReviewEntries(rawEntries: [any, any][]): ReviewData[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([key, value]) => {
    const obj = value?.toJSON?.() ?? value;
    return {
      // reviews is a StorageMap (single key = reviewId); entityId is in the value struct
      id: Number(key.args?.[1]?.toString() ?? key.args?.[0]?.toString() ?? obj.id ?? 0),
      entityId: Number(obj.entityId ?? obj.entity_id ?? key.args?.[0]?.toString() ?? 0),
      orderId: Number(obj.orderId ?? obj.order_id ?? 0),
      reviewer: String(obj.reviewer ?? ''),
      rating: Number(obj.rating ?? 0),
      contentCid: String(obj.contentCid ?? obj.content_cid ?? ''),
      createdAt: Number(obj.createdAt ?? obj.created_at ?? 0),
    };
  });
}

// ─── Helpers ────────────────────────────────────────────────

/** Returns true only for integers 1-5. */
export function validateRating(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

// ─── Hook ───────────────────────────────────────────────────

export function useReview() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [['entity', entityId, 'reviews']];

  // ─── Queries ──────────────────────────────────────────

  const reviewsQuery = useEntityQuery<ReviewData[]>(
    ['entity', entityId, 'reviews'],
    async (api) => {
      const pallet = (api.query as any).entityReview;
      if (!pallet) return [];

      // Prefer indexed lookup: entityReviews(entityId) → BoundedVec<u64>
      const idsFn = pallet.entityReviews ?? pallet.productReviews;
      if (idsFn) {
        try {
          const idsRaw = await idsFn(entityId);
          const ids = idsRaw?.toJSON?.() ?? idsRaw;
          if (Array.isArray(ids) && ids.length > 0) {
            const reviewFn = pallet.reviews;
            if (reviewFn) {
              const results = await Promise.all(
                ids.map(Number).map(async (reviewId: number) => {
                  const raw = await reviewFn(reviewId);
                  if (!raw || (raw as any).isNone) return null;
                  const obj = (raw as any).toJSON?.() ?? raw;
                  return {
                    id: reviewId,
                    entityId: Number(obj.entityId ?? obj.entity_id ?? entityId),
                    orderId: Number(obj.orderId ?? obj.order_id ?? 0),
                    reviewer: String(obj.reviewer ?? ''),
                    rating: Number(obj.rating ?? 0),
                    contentCid: String(obj.contentCid ?? obj.content_cid ?? ''),
                    createdAt: Number(obj.createdAt ?? obj.created_at ?? 0),
                  } as ReviewData;
                }),
              );
              return results.filter((r): r is ReviewData => r !== null);
            }
          }
        } catch {
          // fall through to entries scan
        }
      }

      // Fallback: full scan (for chains without entityReviews index)
      const reviewsFn = pallet.reviews;
      if (!reviewsFn?.entries) return [];
      const raw = await reviewsFn.entries();
      const filtered = (raw as [any, any][]).filter(([, value]) => {
        const obj = value?.toJSON?.() ?? value;
        const eid = Number(obj.entityId ?? obj.entity_id ?? 0);
        return eid === entityId;
      });
      return parseReviewEntries(filtered);
    },
    { staleTime: STALE_TIMES.token },
  );

  const reviewEnabledQuery = useEntityQuery<boolean>(
    ['entity', entityId, 'reviews', 'enabled'],
    async (api) => {
      // Chain: EntityReviewDisabled is OptionQuery with value ()
      // Key exists → disabled=true (review off), key absent → enabled=true (review on)
      // Polkadot.js returns an Option: isSome means key exists (disabled), isNone means absent (enabled)
      const fn = (api.query as any).entityReview.entityReviewDisabled;
      if (!fn) return true;
      const raw = await fn(entityId);
      // isNone = key does not exist → reviews are enabled
      if ((raw as any).isNone) return true;
      // isSome or truthy = key exists → reviews are disabled
      return false;
    },
    { staleTime: STALE_TIMES.token },
  );

  // ─── Mutations ──────────────────────────────────────────

  const submitReview = useEntityMutation('entityReview', 'submitReview', { invalidateKeys });
  const setReviewEnabled = useEntityMutation('entityReview', 'setReviewEnabled', { invalidateKeys });

  return {
    reviews: reviewsQuery.data ?? [],
    reviewEnabled: reviewEnabledQuery.data ?? true,
    isLoading: reviewsQuery.isLoading,
    error: reviewsQuery.error,
    submitReview,
    setReviewEnabled,
  };
}
