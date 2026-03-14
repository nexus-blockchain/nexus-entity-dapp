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
    minSales: BigInt(String(obj.minSales ?? obj.min_sales ?? 0)),
  };
}

function parseMultiLevelConfig(raw: unknown): MultiLevelConfig | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  const tiers = obj.levels ?? obj.tiers ?? [];
  return {
    tiers: Array.isArray(tiers) ? tiers.map(parseMultiLevelTier) : [],
    maxTotalRate: Number(obj.maxTotalRate ?? obj.max_total_rate ?? 0),
  };
}

function parseMultiLevelStats(raw: unknown): MultiLevelStats | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    totalMembers: Number(obj.totalMembers ?? obj.total_members ?? 0),
    totalDistributed: BigInt(String(obj.totalDistributed ?? obj.total_distributed ?? 0)),
    maxDepthReached: Number(obj.maxDepthReached ?? obj.max_depth_reached ?? 0),
  };
}

function parseMemberRelation(raw: unknown): MemberRelation | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  const parent = obj.parent ?? obj.referrer ?? null;
  return {
    parent: parent ? String(parent) : null,
    depth: Number(obj.depth ?? 0),
    directReferrals: Number(obj.directReferrals ?? obj.direct_referrals ?? 0),
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
      const fn = (api.query as any)[PALLET].multiLevelStats;
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
        if (!hasPallet(api, PALLET)) return null;
        if (!account) return null;
        const fn = (api.query as any)[PALLET].memberRelations;
        if (!fn) return null;
        const raw = await fn(entityId, account);
        return parseMemberRelation(raw);
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  // ─── Mutations ──────────────────────────────────────────
  // Available chain extrinsics:
  // setMultiLevelConfig(entityId, levels:Vec<MultiLevelTier>, maxTotalRate:u16)
  // updateMultiLevelParams(entityId, maxTotalRate:Option<u16>, tierIndex:Option<u32>, tierUpdate:Option<Tier>)
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
