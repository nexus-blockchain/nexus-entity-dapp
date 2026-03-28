'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import type {
  ReferralConfig,
  ReferralStats,
  ReferrerRecord,
  ReferrerGuardConfig,
  CommissionCapConfig,
} from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function unwrapRaw(raw: unknown): any | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  return (unwrapped as any).toJSON?.() ?? unwrapped;
}

function parseReferralConfig(raw: unknown): ReferralConfig | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  return {
    enabled: Boolean(obj.enabled),
    rewardRate: Number(obj.rewardRate ?? obj.reward_rate ?? obj.rate ?? 0),
  };
}

function parseReferralStats(raw: unknown): ReferralStats | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  return {
    totalReferrals: Number(obj.totalReferrals ?? obj.total_referrals ?? 0),
    totalRewardDistributed: BigInt(String(obj.totalRewardDistributed ?? obj.total_reward_distributed ?? 0)),
    activeReferrers: Number(obj.activeReferrers ?? obj.active_referrers ?? 0),
  };
}

function parseReferrerRecord(raw: unknown): ReferrerRecord | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  const referrer = obj.referrer ?? null;
  return {
    referrer: referrer ? String(referrer) : null,
    totalReferred: Number(obj.totalReferred ?? obj.total_referred ?? 0),
    totalEarned: BigInt(String(obj.totalEarned ?? obj.total_earned ?? 0)),
  };
}

function parseReferrerGuardConfig(raw: unknown): ReferrerGuardConfig | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  return {
    minReferrerSpent: BigInt(String(obj.minReferrerSpent ?? obj.min_referrer_spent ?? 0)),
    minReferrerOrders: Number(obj.minReferrerOrders ?? obj.min_referrer_orders ?? 0),
  };
}

function parseCommissionCapConfig(raw: unknown): CommissionCapConfig | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  return {
    maxPerOrder: BigInt(String(obj.maxPerOrder ?? obj.max_per_order ?? 0)),
    maxTotalEarned: BigInt(String(obj.maxTotalEarned ?? obj.max_total_earned ?? 0)),
  };
}

function parseEntityMemberSummary(raw: unknown): { referrer: string | null; directReferrals: number } | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  return {
    referrer: obj.referrer ? String(obj.referrer) : null,
    directReferrals: Number(obj.directReferrals ?? obj.direct_referrals ?? 0),
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

  // referralStats not in chain; return null
  const statsQuery = useEntityQuery<ReferralStats | null>(
    ['entity', entityId, 'referral', 'stats'],
    async (api) => {
      if (!hasPallet(api, PALLET) || !hasPallet(api, 'entityMember')) return null;
      const memberEntriesFn = (api.query as any).entityMember.entityMembers;
      const earnedFn = (api.query as any)[PALLET].referrerTotalEarned;
      if (!memberEntriesFn?.entries || !earnedFn) return null;

      const memberEntries = await memberEntriesFn.entries(entityId);
      const members = (memberEntries as [any, any][])
        .map(([key, value]) => {
          const summary = parseEntityMemberSummary(value);
          if (!summary) return null;
          return {
            account: String(key.args?.[1]?.toString() ?? ''),
            ...summary,
          };
        })
        .filter((item): item is { account: string; referrer: string | null; directReferrals: number } => item !== null);

      const earnedValues = await Promise.all(
        members.map(async ({ account }) => {
          const raw = await earnedFn(entityId, account);
          const value = (raw as any)?.toJSON?.() ?? raw;
          return BigInt(String(value ?? 0));
        }),
      );

      return {
        totalReferrals: members.filter((member) => member.referrer !== null).length,
        totalRewardDistributed: earnedValues.reduce((sum, value) => sum + value, BigInt(0)),
        activeReferrers: members.filter((member) => member.directReferrals > 0).length,
      };
    },
    { staleTime: STALE_TIMES.members },
  );

  const useReferrerRecord = (account: string | null) =>
    useEntityQuery<ReferrerRecord | null>(
      ['entity', entityId, 'referral', 'referrer', account],
      async (api) => {
        if (!hasPallet(api, PALLET) || !hasPallet(api, 'entityMember')) return null;
        if (!account) return null;
        const memberFn = (api.query as any).entityMember.entityMembers;
        const directReferralsFn = (api.query as any).entityMember.directReferrals;
        const earnedFn = (api.query as any)[PALLET].referrerTotalEarned;
        if (!memberFn || !directReferralsFn || !earnedFn) return null;

        const [memberRaw, directReferralsRaw, earnedRaw] = await Promise.all([
          memberFn(entityId, account),
          directReferralsFn(entityId, account),
          earnedFn(entityId, account),
        ]);

        const member = parseEntityMemberSummary(memberRaw);
        const directReferralsPlain = (directReferralsRaw as any)?.toJSON?.() ?? directReferralsRaw;
        const directReferrals = Array.isArray(directReferralsPlain)
          ? directReferralsPlain.length
          : member?.directReferrals ?? 0;

        return parseReferrerRecord({
          referrer: member?.referrer ?? null,
          totalReferred: directReferrals,
          totalEarned: (earnedRaw as any)?.toJSON?.() ?? earnedRaw ?? 0,
        });
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  const guardConfigQuery = useEntityQuery<ReferrerGuardConfig | null>(
    ['entity', entityId, 'referral', 'guardConfig'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].referrerGuardConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseReferrerGuardConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const capConfigQuery = useEntityQuery<CommissionCapConfig | null>(
    ['entity', entityId, 'referral', 'capConfig'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].commissionCapConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseCommissionCapConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const useReferrerTotalEarned = (account: string | null) =>
    useEntityQuery<bigint>(
      ['entity', entityId, 'referral', 'totalEarned', account],
      async (api) => {
        if (!hasPallet(api, PALLET) || !account) return BigInt(0);
        const fn = (api.query as any)[PALLET].referrerTotalEarned;
        if (!fn) return BigInt(0);
        const raw = await fn(entityId, account);
        const v = (raw as any)?.toJSON?.() ?? raw;
        return BigInt(String(v ?? 0));
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  // ─── Mutations ──────────────────────────────────────────

  const setDirectRewardConfig = useEntityMutation(PALLET, 'setDirectRewardConfig', { invalidateKeys });
  const setFixedAmountConfig = useEntityMutation(PALLET, 'setFixedAmountConfig', { invalidateKeys });
  const setFirstOrderConfig = useEntityMutation(PALLET, 'setFirstOrderConfig', { invalidateKeys });
  const setRepeatPurchaseConfig = useEntityMutation(PALLET, 'setRepeatPurchaseConfig', { invalidateKeys });
  const clearReferralConfig = useEntityMutation(PALLET, 'clearReferralConfig', { invalidateKeys });
  const setReferrerGuardConfig = useEntityMutation(PALLET, 'setReferrerGuardConfig', { invalidateKeys });
  const setCommissionCapConfig = useEntityMutation(PALLET, 'setCommissionCapConfig', { invalidateKeys });

  return {
    config: configQuery.data ?? null,
    stats: statsQuery.data ?? null,
    guardConfig: guardConfigQuery.data ?? null,
    capConfig: capConfigQuery.data ?? null,
    isLoading: configQuery.isLoading,
    error: configQuery.error,
    useReferrerRecord,
    useReferrerTotalEarned,
    setDirectRewardConfig,
    setFixedAmountConfig,
    setFirstOrderConfig,
    setRepeatPurchaseConfig,
    clearReferralConfig,
    setReferrerGuardConfig,
    setCommissionCapConfig,
  };
}
