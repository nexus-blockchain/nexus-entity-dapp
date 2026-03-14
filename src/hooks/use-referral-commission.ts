'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import type { ReferralConfig, ReferralStats, ReferrerRecord } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function parseReferralConfig(raw: unknown): ReferralConfig | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    enabled: Boolean(obj.enabled),
    rewardRate: Number(obj.rewardRate ?? obj.reward_rate ?? obj.rate ?? 0),
  };
}

function parseReferralStats(raw: unknown): ReferralStats | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    totalReferrals: Number(obj.totalReferrals ?? obj.total_referrals ?? 0),
    totalRewardDistributed: BigInt(String(obj.totalRewardDistributed ?? obj.total_reward_distributed ?? 0)),
    activeReferrers: Number(obj.activeReferrers ?? obj.active_referrers ?? 0),
  };
}

function parseReferrerRecord(raw: unknown): ReferrerRecord | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  const referrer = obj.referrer ?? null;
  return {
    referrer: referrer ? String(referrer) : null,
    totalReferred: Number(obj.totalReferred ?? obj.total_referred ?? 0),
    totalEarned: BigInt(String(obj.totalEarned ?? obj.total_earned ?? 0)),
  };
}

// ─── Hook ───────────────────────────────────────────────────

const PALLET = 'commissionReferral';

export function useReferralCommission() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [
    ['entity', entityId, 'referral'],
    ['entity', entityId, 'referral', 'stats'],
  ];

  // ─── Queries ──────────────────────────────────────────

  const configQuery = useEntityQuery<ReferralConfig | null>(
    ['entity', entityId, 'referral'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].referralConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseReferralConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const statsQuery = useEntityQuery<ReferralStats | null>(
    ['entity', entityId, 'referral', 'stats'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].referralStats;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseReferralStats(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const useReferrerRecord = (account: string | null) =>
    useEntityQuery<ReferrerRecord | null>(
      ['entity', entityId, 'referral', 'referrer', account],
      async (api) => {
        if (!hasPallet(api, PALLET)) return null;
        if (!account) return null;
        const fn = (api.query as any)[PALLET].referrerRecords;
        if (!fn) return null;
        const raw = await fn(entityId, account);
        return parseReferrerRecord(raw);
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  // ─── Mutations ──────────────────────────────────────────

  const setDirectRewardConfig = useEntityMutation(PALLET, 'setDirectRewardConfig', { invalidateKeys });
  const setFixedAmountConfig = useEntityMutation(PALLET, 'setFixedAmountConfig', { invalidateKeys });
  const setFirstOrderConfig = useEntityMutation(PALLET, 'setFirstOrderConfig', { invalidateKeys });
  const setRepeatPurchaseConfig = useEntityMutation(PALLET, 'setRepeatPurchaseConfig', { invalidateKeys });
  const clearReferralConfig = useEntityMutation(PALLET, 'clearReferralConfig', { invalidateKeys });
  const pauseReferral = useEntityMutation(PALLET, 'pauseReferral', { invalidateKeys });
  const resumeReferral = useEntityMutation(PALLET, 'resumeReferral', { invalidateKeys });

  return {
    config: configQuery.data ?? null,
    stats: statsQuery.data ?? null,
    isLoading: configQuery.isLoading,
    error: configQuery.error,
    useReferrerRecord,
    setDirectRewardConfig,
    setFixedAmountConfig,
    setFirstOrderConfig,
    setRepeatPurchaseConfig,
    clearReferralConfig,
    pauseReferral,
    resumeReferral,
  };
}
