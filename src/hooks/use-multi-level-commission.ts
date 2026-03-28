'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import type { MultiLevelConfig, MultiLevelTier, MultiLevelStats, MemberRelation } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function parseMultiLevelTier(raw: unknown): MultiLevelTier {
  const obj = (raw as any)?.toJSON?.() ?? raw ?? {};
  return {
    rate: Number(obj.rate ?? 0),
    requiredDirects: Number(obj.requiredDirects ?? obj.required_directs ?? obj.directMin ?? obj.direct_min ?? 0),
    requiredTeamSize: Number(obj.requiredTeamSize ?? obj.required_team_size ?? obj.teamMin ?? obj.team_min ?? 0),
    requiredSpent: BigInt(String(obj.requiredSpent ?? obj.required_spent ?? obj.spentMin ?? obj.spent_min ?? 0)),
    requiredLevelId: Number(obj.requiredLevelId ?? obj.required_level_id ?? obj.levelMin ?? obj.level_min ?? 0),
  };
}

function parseMultiLevelConfig(raw: unknown): MultiLevelConfig | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  const levels = obj.levels ?? [];
  return {
    levels: Array.isArray(levels) ? levels.map(parseMultiLevelTier) : [],
  };
}

function parseMultiLevelStats(raw: unknown): MultiLevelStats | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    totalDistributed: BigInt(String(obj.totalDistributed ?? obj.total_distributed ?? 0)),
    orderCount: Number(obj.orderCount ?? obj.order_count ?? 0),
    totalDistributionEntries: Number(obj.totalDistributionEntries ?? obj.total_distribution_entries ?? 0),
  };
}

function parseMemberRelation(raw: unknown, directReferrals: number, depth: number): MemberRelation | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  const parent = obj.parent ?? obj.referrer ?? null;
  return {
    parent: parent ? String(parent) : null,
    depth,
    directReferrals,
  };
}

// ─── Hook ───────────────────────────────────────────────────

const PALLET = 'commissionMultiLevel';

export function useMultiLevelCommission() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [
    ['entity', entityId, 'multiLevel'],
    ['entity', entityId, 'multiLevel', 'stats'],
  ];

  // ─── Queries ──────────────────────────────────────────

  const configQuery = useEntityQuery<MultiLevelConfig | null>(
    ['entity', entityId, 'multiLevel'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].multiLevelConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseMultiLevelConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const statsQuery = useEntityQuery<MultiLevelStats | null>(
    ['entity', entityId, 'multiLevel', 'stats'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].entityMultiLevelStats;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseMultiLevelStats(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const useMemberRelation = (account: string | null) =>
    useEntityQuery<MemberRelation | null>(
      ['entity', entityId, 'multiLevel', 'member', account],
      async (api) => {
        if (!hasPallet(api, 'entityMember')) return null;
        if (!account) return null;
        const memberFn = (api.query as any).entityMember.entityMembers;
        const directReferralsFn = (api.query as any).entityMember.directReferrals;
        if (!memberFn || !directReferralsFn) return null;

        const resolveParent = async (address: string): Promise<string | null> => {
          const raw = await memberFn(entityId, address);
          if (!raw || raw.isNone) return null;
          const obj = raw.toJSON?.() ?? raw;
          return obj?.referrer ? String(obj.referrer) : null;
        };

        const [memberRaw, directReferralsRaw] = await Promise.all([
          memberFn(entityId, account),
          directReferralsFn(entityId, account),
        ]);
        if (!memberRaw || memberRaw.isNone) return null;

        let depth = 0;
        let parentCursor = await resolveParent(account);
        const visited = new Set<string>([account]);
        while (parentCursor && !visited.has(parentCursor)) {
          visited.add(parentCursor);
          depth += 1;
          parentCursor = await resolveParent(parentCursor);
        }

        const directReferralsPlain = directReferralsRaw?.toJSON?.() ?? directReferralsRaw;
        const directReferrals = Array.isArray(directReferralsPlain) ? directReferralsPlain.length : 0;

        return parseMemberRelation(memberRaw, directReferrals, depth);
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  // ─── Mutations ──────────────────────────────────────────
  // Available chain extrinsics:
  // setMultiLevelConfig(entityId, levels:Vec<MultiLevelTier>)
  // updateMultiLevelParams(entityId, tierIndex:Option<u32>, tierUpdate:Option<Tier>)
  // addTier(entityId, index:u32, tier:Tier)
  // removeTier(entityId, index:u32)
  // clearMultiLevelConfig(entityId)
  // pauseMultiLevel(entityId)
  // resumeMultiLevel(entityId)

  const setMultiLevelConfig = useEntityMutation(PALLET, 'setMultiLevelConfig', { invalidateKeys });
  const updateMultiLevelParams = useEntityMutation(PALLET, 'updateMultiLevelParams', { invalidateKeys });
  const addTier = useEntityMutation(PALLET, 'addTier', { invalidateKeys });
  const removeTier = useEntityMutation(PALLET, 'removeTier', { invalidateKeys });
  const clearMultiLevelConfig = useEntityMutation(PALLET, 'clearMultiLevelConfig', { invalidateKeys });
  const pauseMultiLevel = useEntityMutation(PALLET, 'pauseMultiLevel', { invalidateKeys });
  const resumeMultiLevel = useEntityMutation(PALLET, 'resumeMultiLevel', { invalidateKeys });

  return {
    // Query data
    config: configQuery.data ?? null,
    stats: statsQuery.data ?? null,
    isLoading: configQuery.isLoading,
    error: configQuery.error,
    // Member relation factory
    useMemberRelation,
    // Mutations
    setMultiLevelConfig,
    updateMultiLevelParams,
    addTier,
    removeTier,
    clearMultiLevelConfig,
    pauseMultiLevel,
    resumeMultiLevel,
  };
}
