'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import type { SaleRound, VestingConfig } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function parseSaleRound(obj: any, roundId: number): SaleRound {
  const vc = obj.vestingConfig ?? obj.vesting_config ?? null;
  return {
    id: roundId,
    entityId: Number(obj.entityId ?? obj.entity_id ?? 0),
    mode: typeof obj.mode === 'string' ? obj.mode : (typeof obj.mode === 'object' && obj.mode !== null ? Object.keys(obj.mode)[0] ?? 'FixedPrice' : 'FixedPrice'),
    status: typeof obj.status === 'string' ? obj.status : (typeof obj.status === 'object' && obj.status !== null ? Object.keys(obj.status)[0] ?? 'NotStarted' : 'NotStarted'),
    totalSupply: BigInt(String(obj.totalSupply ?? obj.total_supply ?? 0)),
    soldAmount: BigInt(String(obj.soldAmount ?? obj.sold_amount ?? 0)),
    remainingAmount: BigInt(String(obj.remainingAmount ?? obj.remaining_amount ?? 0)),
    participantsCount: Number(obj.participantsCount ?? obj.participants_count ?? 0),
    paymentOptionsCount: Number(obj.paymentOptionsCount ?? obj.payment_options_count ?? 0),
    vestingConfig: vc ? {
      vestingType: typeof vc.vestingType === 'string' ? vc.vestingType : (typeof vc.vesting_type === 'string' ? vc.vesting_type : (typeof vc.vestingType === 'object' ? Object.keys(vc.vestingType)[0] : 'Linear')),
      initialUnlockBps: Number(vc.initialUnlockBps ?? vc.initial_unlock_bps ?? 0),
      cliffDuration: Number(vc.cliffDuration ?? vc.cliff_duration ?? 0),
      totalDuration: Number(vc.totalDuration ?? vc.total_duration ?? 0),
      unlockInterval: Number(vc.unlockInterval ?? vc.unlock_interval ?? 0),
    } : null,
    kycRequired: Boolean(obj.kycRequired ?? obj.kyc_required),
    minKycLevel: Number(obj.minKycLevel ?? obj.min_kyc_level ?? 0),
    startBlock: Number(obj.startBlock ?? obj.start_block ?? 0),
    endBlock: Number(obj.endBlock ?? obj.end_block ?? 0),
    dutchStartPrice: obj.dutchStartPrice != null || obj.dutch_start_price != null
      ? BigInt(String(obj.dutchStartPrice ?? obj.dutch_start_price ?? 0))
      : null,
    dutchEndPrice: obj.dutchEndPrice != null || obj.dutch_end_price != null
      ? BigInt(String(obj.dutchEndPrice ?? obj.dutch_end_price ?? 0))
      : null,
    creator: String(obj.creator ?? ''),
    createdAt: Number(obj.createdAt ?? obj.created_at ?? 0),
    fundsWithdrawn: Boolean(obj.fundsWithdrawn ?? obj.funds_withdrawn),
    cancelledAt: obj.cancelledAt ?? obj.cancelled_at ?? null,
    totalRefundedTokens: BigInt(String(obj.totalRefundedTokens ?? obj.total_refunded_tokens ?? 0)),
    totalRefundedNex: BigInt(String(obj.totalRefundedNex ?? obj.total_refunded_nex ?? 0)),
    softCap: BigInt(String(obj.softCap ?? obj.soft_cap ?? 0)),
  };
}

function parseWhitelistEntries(rawEntries: [any, any][]): string[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries
    .map(([key]) => String(key.args?.[1]?.toString() ?? ''))
    .filter(Boolean);
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Compute current Dutch auction price via linear interpolation.
 */
export function computeDutchAuctionPrice(
  startPrice: bigint,
  endPrice: bigint,
  decayBlocks: number,
  elapsedBlocks: number,
): bigint {
  if (elapsedBlocks <= 0) return startPrice;
  if (elapsedBlocks >= decayBlocks) return endPrice;
  const priceDiff = startPrice - endPrice;
  const decay = (priceDiff * BigInt(elapsedBlocks)) / BigInt(decayBlocks);
  return startPrice - decay;
}

// ─── Hook ───────────────────────────────────────────────────

export function useTokensale() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [['entity', entityId, 'tokensale']];

  // ─── Queries ──────────────────────────────────────────

  const saleRoundsQuery = useEntityQuery<SaleRound[]>(
    ['entity', entityId, 'tokensale'],
    async (api) => {
      if (!hasPallet(api, 'entityTokenSale')) return [];
      const pallet = (api.query as any).entityTokenSale;

      // Step 1: entityRounds(entityId) → BoundedVec<u64> (round IDs)
      const idsFn = pallet.entityRounds;
      if (!idsFn) return [];
      const idsRaw = await idsFn(entityId);
      const ids = idsRaw?.toJSON?.() ?? idsRaw;
      if (!Array.isArray(ids) || ids.length === 0) return [];

      // Step 2: saleRounds(roundId) → SaleRound for each
      const roundFn = pallet.saleRounds;
      if (!roundFn) return [];
      const results = await Promise.all(
        ids.map(Number).map(async (roundId: number) => {
          const raw = await roundFn(roundId);
          if (!raw || (raw as any).isNone) return null;
          const obj = (raw as any).toJSON?.() ?? raw;
          return parseSaleRound(obj, roundId);
        }),
      );
      return results.filter((r): r is SaleRound => r !== null);
    },
    { staleTime: STALE_TIMES.token },
  );

  const useSubscription = (roundId: number, account: string | null) =>
    useEntityQuery<{ amount: bigint; claimed: boolean } | null>(
      ['entity', entityId, 'tokensale', roundId, 'subscriptions', account],
      async (api) => {
        if (!hasPallet(api, 'entityTokenSale')) return null;
        if (!account) return null;
        const fn = (api.query as any).entityTokenSale.subscriptions;
        if (!fn) return null;
        const raw = await fn(roundId, account);
        if (!raw || (raw as any).isNone) return null;
        const obj = (raw as any).unwrapOr?.(null) ?? raw;
        if (!obj) return null;
        const data = obj.toJSON?.() ?? obj;
        return {
          amount: BigInt(String(data.amount ?? 0)),
          claimed: Boolean(data.claimed),
        };
      },
      { staleTime: STALE_TIMES.token, enabled: !!account },
    );

  const useWhitelist = (roundId: number) =>
    useEntityQuery<string[]>(
      ['entity', entityId, 'tokensale', roundId, 'whitelist'],
      async (api) => {
        if (!hasPallet(api, 'entityTokenSale')) return [];
        const pallet = (api.query as any).entityTokenSale;
        const whitelistFn = pallet.roundWhitelist;
        if (!whitelistFn?.entries) return [];
        let raw: [any, any][];
        try {
          raw = await whitelistFn.entries(roundId);
        } catch {
          const all = await whitelistFn.entries();
          raw = (all as [any, any][]).filter(([key]: [any, any]) => {
            const rid = Number(key.args?.[0]?.toString() ?? 0);
            return rid === roundId;
          });
        }
        return parseWhitelistEntries(raw);
      },
      { staleTime: STALE_TIMES.token },
    );

  // ─── Mutations ──────────────────────────────────────────

  const createSaleRound = useEntityMutation('entityTokenSale', 'createSaleRound', { invalidateKeys });
  const startSale = useEntityMutation('entityTokenSale', 'startSale', { invalidateKeys });
  const subscribe = useEntityMutation('entityTokenSale', 'subscribe', { invalidateKeys });
  const increaseSubscription = useEntityMutation('entityTokenSale', 'increaseSubscription', { invalidateKeys });
  const endSale = useEntityMutation('entityTokenSale', 'endSale', { invalidateKeys });
  const claimTokens = useEntityMutation('entityTokenSale', 'claimTokens', { invalidateKeys });
  const unlockTokens = useEntityMutation('entityTokenSale', 'unlockTokens', { invalidateKeys });
  const claimRefund = useEntityMutation('entityTokenSale', 'claimRefund', { invalidateKeys });
  const addToWhitelist = useEntityMutation('entityTokenSale', 'addToWhitelist', { invalidateKeys });
  const removeFromWhitelist = useEntityMutation('entityTokenSale', 'removeFromWhitelist', { invalidateKeys });
  const configureDutchAuction = useEntityMutation('entityTokenSale', 'configureDutchAuction', { invalidateKeys });
  const setVestingConfig = useEntityMutation('entityTokenSale', 'setVestingConfig', { invalidateKeys });
  const addPaymentOption = useEntityMutation('entityTokenSale', 'addPaymentOption', { invalidateKeys });

  return {
    saleRounds: saleRoundsQuery.data ?? [],
    isLoading: saleRoundsQuery.isLoading,
    error: saleRoundsQuery.error,
    useSubscription,
    useWhitelist,
    createSaleRound,
    startSale,
    subscribe,
    increaseSubscription,
    endSale,
    claimTokens,
    unlockTokens,
    claimRefund,
    addToWhitelist,
    removeFromWhitelist,
    configureDutchAuction,
    setVestingConfig,
    addPaymentOption,
  };
}
