'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import type { LevelDiffConfig, LevelDiffStats } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function parseLevelDiffConfig(raw: unknown): LevelDiffConfig | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  const rates = obj.levelRates ?? obj.level_rates ?? [];
  return {
    levelRates: Array.isArray(rates) ? rates.map(Number) : [],
    maxDepth: Number(obj.maxDepth ?? obj.max_depth ?? 0),
  };
}

function parseLevelDiffStats(raw: unknown): LevelDiffStats | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    totalDistributed: BigInt(String(obj.totalDistributed ?? obj.total_distributed ?? 0)),
    activeLevels: Number(obj.activeLevels ?? obj.active_levels ?? 0),
    maxLevelReached: Number(obj.maxLevelReached ?? obj.max_level_reached ?? 0),
  };
}

// ─── Hook ───────────────────────────────────────────────────

const PALLET = 'commissionLevelDiff';

export function useLevelDiffCommission() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [
    ['entity', entityId, 'levelDiff'],
    ['entity', entityId, 'levelDiff', 'stats'],
  ];

  // ─── Queries ──────────────────────────────────────────

  const configQuery = useEntityQuery<LevelDiffConfig | null>(
    ['entity', entityId, 'levelDiff'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].levelDiffConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseLevelDiffConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const statsQuery = useEntityQuery<LevelDiffStats | null>(
    ['entity', entityId, 'levelDiff', 'stats'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].levelDiffStats;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseLevelDiffStats(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  // ─── Mutations ──────────────────────────────────────────
  // Available chain extrinsics:
  // setLevelDiffConfig(entityId, levelRates:Vec<u16>, maxDepth:u8)
  // updateLevelDiffConfig(entityId, levelRates:Option<Vec<u16>>, maxDepth:Option<u8>)
  // clearLevelDiffConfig(entityId)

  const setLevelDiffConfig = useEntityMutation(PALLET, 'setLevelDiffConfig', { invalidateKeys });
  const updateLevelDiffConfig = useEntityMutation(PALLET, 'updateLevelDiffConfig', { invalidateKeys });
  const clearLevelDiffConfig = useEntityMutation(PALLET, 'clearLevelDiffConfig', { invalidateKeys });

  return {
    config: configQuery.data ?? null,
    stats: statsQuery.data ?? null,
    isLoading: configQuery.isLoading,
    error: configQuery.error,
    setLevelDiffConfig,
    updateLevelDiffConfig,
    clearLevelDiffConfig,
  };
}
