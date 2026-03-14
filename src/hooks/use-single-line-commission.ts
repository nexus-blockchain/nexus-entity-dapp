'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import type { SingleLineConfig, SingleLineStats, SingleLinePosition } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function parseSingleLineConfig(raw: unknown): SingleLineConfig | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    enabled: Boolean(obj.enabled),
    uplineRate: Number(obj.uplineRate ?? obj.upline_rate ?? 0),
    downlineRate: Number(obj.downlineRate ?? obj.downline_rate ?? 0),
    baseUplineLevels: Number(obj.baseUplineLevels ?? obj.base_upline_levels ?? 0),
    baseDownlineLevels: Number(obj.baseDownlineLevels ?? obj.base_downline_levels ?? 0),
    levelIncrementThreshold: BigInt(String(obj.levelIncrementThreshold ?? obj.level_increment_threshold ?? 0)),
    maxUplineLevels: Number(obj.maxUplineLevels ?? obj.max_upline_levels ?? 0),
    maxDownlineLevels: Number(obj.maxDownlineLevels ?? obj.max_downline_levels ?? 0),
  };
}

function parseSingleLineStats(raw: unknown): SingleLineStats | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    totalDistributed: BigInt(String(obj.totalDistributed ?? obj.total_distributed ?? 0)),
    totalLines: Number(obj.totalLines ?? obj.total_lines ?? 0),
    avgLineDepth: Number(obj.avgLineDepth ?? obj.avg_line_depth ?? 0),
  };
}

function parseSingleLinePosition(raw: unknown): SingleLinePosition | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  const upline = obj.upline ?? obj.parent ?? null;
  return {
    position: Number(obj.position ?? 0),
    upline: upline ? String(upline) : null,
    downlineCount: Number(obj.downlineCount ?? obj.downline_count ?? 0),
  };
}

// ─── Hook ───────────────────────────────────────────────────

const PALLET = 'commissionSingleLine';

export function useSingleLineCommission() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [
    ['entity', entityId, 'singleLine'],
    ['entity', entityId, 'singleLine', 'stats'],
  ];

  // ─── Queries ──────────────────────────────────────────

  const configQuery = useEntityQuery<SingleLineConfig | null>(
    ['entity', entityId, 'singleLine'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].singleLineConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseSingleLineConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const statsQuery = useEntityQuery<SingleLineStats | null>(
    ['entity', entityId, 'singleLine', 'stats'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].singleLineStats;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseSingleLineStats(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const useLinePosition = (account: string | null) =>
    useEntityQuery<SingleLinePosition | null>(
      ['entity', entityId, 'singleLine', 'position', account],
      async (api) => {
        if (!hasPallet(api, PALLET)) return null;
        if (!account) return null;
        const fn = (api.query as any)[PALLET].linePositions;
        if (!fn) return null;
        const raw = await fn(entityId, account);
        return parseSingleLinePosition(raw);
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  // ─── Mutations ──────────────────────────────────────────

  const configureSingleLine = useEntityMutation(PALLET, 'setSingleLineConfig', { invalidateKeys });
  const updateParams = useEntityMutation(PALLET, 'updateSingleLineParams', { invalidateKeys });
  const clearConfig = useEntityMutation(PALLET, 'clearSingleLineConfig', { invalidateKeys });
  const pauseSingleLine = useEntityMutation(PALLET, 'pauseSingleLine', { invalidateKeys });
  const resumeSingleLine = useEntityMutation(PALLET, 'resumeSingleLine', { invalidateKeys });

  return {
    config: configQuery.data ?? null,
    stats: statsQuery.data ?? null,
    isLoading: configQuery.isLoading,
    error: configQuery.error,
    useLinePosition,
    configureSingleLine,
    updateParams,
    clearConfig,
    pauseSingleLine,
    resumeSingleLine,
  };
}
