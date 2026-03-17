'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import { SalesThresholdMode } from '@/lib/types/enums';
import type { TeamConfig, TeamTier, TeamStats, TeamInfo } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function parseTeamTier(raw: unknown): TeamTier {
  const obj = (raw as any)?.toJSON?.() ?? raw ?? {};
  return {
    tier: Number(obj.tier ?? 0),
    rate: Number(obj.rate ?? 0),
    minTeamPerformance: BigInt(String(obj.minTeamPerformance ?? obj.min_team_performance ?? 0)),
    minDirectCount: Number(obj.minDirectCount ?? obj.min_direct_count ?? 0),
  };
}

function parseSalesThresholdMode(raw: unknown): SalesThresholdMode {
  const s = String(raw ?? 'PersonalOnly');
  if (s === 'TeamTotal' || s === 'teamTotal') return SalesThresholdMode.TeamTotal;
  if (s === 'WeightedMix' || s === 'weightedMix') return SalesThresholdMode.WeightedMix;
  return SalesThresholdMode.PersonalOnly;
}

function parseTeamConfig(raw: unknown): TeamConfig | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  const tiers = obj.tiers ?? obj.levels ?? [];
  return {
    enabled: Boolean(obj.enabled),
    tiers: Array.isArray(tiers) ? tiers.map(parseTeamTier) : [],
    maxDepth: Number(obj.maxDepth ?? obj.max_depth ?? 0),
    allowStacking: Boolean(obj.allowStacking ?? obj.allow_stacking ?? false),
    thresholdMode: parseSalesThresholdMode(obj.thresholdMode ?? obj.threshold_mode),
  };
}

function parseTeamStats(raw: unknown): TeamStats | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    totalDistributed: BigInt(String(obj.totalDistributed ?? obj.total_distributed ?? 0)),
    totalTeams: Number(obj.totalTeams ?? obj.total_teams ?? 0),
    activeTeamLeaders: Number(obj.activeTeamLeaders ?? obj.active_team_leaders ?? 0),
  };
}

function parseTeamInfo(raw: unknown): TeamInfo | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    leader: String(obj.leader ?? ''),
    teamSize: Number(obj.teamSize ?? obj.team_size ?? 0),
    teamPerformance: BigInt(String(obj.teamPerformance ?? obj.team_performance ?? 0)),
    currentTier: Number(obj.currentTier ?? obj.current_tier ?? 0),
    directCount: Number(obj.directCount ?? obj.direct_count ?? 0),
  };
}

// ─── Hook ───────────────────────────────────────────────────

const PALLET = 'commissionTeam';

export function useTeamCommission() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [
    ['entity', entityId, 'team'],
    ['entity', entityId, 'team', 'stats'],
  ];

  // ─── Queries ──────────────────────────────────────────

  const configQuery = useEntityQuery<TeamConfig | null>(
    ['entity', entityId, 'team'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].teamPerformanceConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseTeamConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  // teamStats not in chain; only TeamPerformanceConfigs and TeamPerformanceEnabled exist
  const statsQuery = useEntityQuery<TeamStats | null>(
    ['entity', entityId, 'team', 'stats'],
    async () => {
      return null;
    },
    { staleTime: STALE_TIMES.members },
  );

  // teamInfos not in chain
  const useTeamInfo = (_account: string | null) =>
    useEntityQuery<TeamInfo | null>(
      ['entity', entityId, 'team', 'info', _account],
      async () => {
        return null;
      },
      { staleTime: STALE_TIMES.members, enabled: !!_account },
    );

  // ─── Mutations ──────────────────────────────────────────
  // Available chain extrinsics:
  // setTeamPerformanceConfig(entityId, tiers:Vec<TeamPerformanceTier>, maxDepth:u8, allowStacking:bool, thresholdMode:SalesThresholdMode)
  // updateTeamPerformanceParams(entityId, ...)
  // clearTeamPerformanceConfig(entityId)
  // addTier(entityId, tier:TeamPerformanceTier)
  // removeTier(entityId, tierIndex:u32)
  // pauseTeamPerformance(entityId)
  // resumeTeamPerformance(entityId)

  const setTeamPerformanceConfig = useEntityMutation(PALLET, 'setTeamPerformanceConfig', { invalidateKeys });
  const updateTeamPerformanceParams = useEntityMutation(PALLET, 'updateTeamPerformanceParams', { invalidateKeys });
  const clearTeamPerformanceConfig = useEntityMutation(PALLET, 'clearTeamPerformanceConfig', { invalidateKeys });
  const addTier = useEntityMutation(PALLET, 'addTier', { invalidateKeys });
  const removeTier = useEntityMutation(PALLET, 'removeTier', { invalidateKeys });
  const pauseTeamPerformance = useEntityMutation(PALLET, 'pauseTeamPerformance', { invalidateKeys });
  const resumeTeamPerformance = useEntityMutation(PALLET, 'resumeTeamPerformance', { invalidateKeys });

  return {
    config: configQuery.data ?? null,
    stats: statsQuery.data ?? null,
    isLoading: configQuery.isLoading,
    error: configQuery.error,
    useTeamInfo,
    setTeamPerformanceConfig,
    updateTeamPerformanceParams,
    clearTeamPerformanceConfig,
    addTier,
    removeTier,
    pauseTeamPerformance,
    resumeTeamPerformance,
  };
}
