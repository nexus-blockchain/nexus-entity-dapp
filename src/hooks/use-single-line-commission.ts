'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import type { SingleLineConfig, LevelBasedLevels } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function parseSingleLineConfig(raw: unknown): SingleLineConfig | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    enabled: true, // placeholder; actual value is read from SingleLineEnabled storage separately
    uplineRate: Number(obj.uplineRate ?? obj.upline_rate ?? 0),
    downlineRate: Number(obj.downlineRate ?? obj.downline_rate ?? 0),
    baseUplineLevels: Number(obj.baseUplineLevels ?? obj.base_upline_levels ?? 0),
    baseDownlineLevels: Number(obj.baseDownlineLevels ?? obj.base_downline_levels ?? 0),
    levelIncrementThreshold: BigInt(String(obj.levelIncrementThreshold ?? obj.level_increment_threshold ?? 0)),
    maxUplineLevels: Number(obj.maxUplineLevels ?? obj.max_upline_levels ?? 0),
    maxDownlineLevels: Number(obj.maxDownlineLevels ?? obj.max_downline_levels ?? 0),
  };
}

function parseLevelBasedLevels(levelId: number, raw: unknown): LevelBasedLevels | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    levelId,
    uplineLevels: Number(obj.uplineLevels ?? obj.upline_levels ?? 0),
    downlineLevels: Number(obj.downlineLevels ?? obj.downline_levels ?? 0),
  };
}

// ─── Hook ───────────────────────────────────────────────────

const PALLET = 'commissionSingleLine';

export function useSingleLineCommission() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [
    ['entity', entityId, 'singleLine'],
    ['entity', entityId, 'singleLine', 'levelOverrides'],
  ];

  const configQuery = useEntityQuery<SingleLineConfig | null>(
    ['entity', entityId, 'singleLine'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].singleLineConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      const config = parseSingleLineConfig(raw);
      if (!config) return null;
      // enabled is a separate storage item (SingleLineEnabled), not part of SingleLineConfig struct
      const enabledFn = (api.query as any)[PALLET].singleLineEnabled;
      if (enabledFn) {
        const enabledRaw = await enabledFn(entityId);
        config.enabled = enabledRaw?.toPrimitive?.() ?? enabledRaw?.isTrue ?? true;
      }
      return config;
    },
    { staleTime: STALE_TIMES.members },
  );

  const useLevelOverrides = (maxLevelId: number) =>
    useEntityQuery<LevelBasedLevels[]>(
      ['entity', entityId, 'singleLine', 'levelOverrides', maxLevelId],
      async (api) => {
        if (!hasPallet(api, PALLET)) return [];
        const fn = (api.query as any)[PALLET].singleLineCustomLevelOverrides;
        if (!fn) return [];
        const results: LevelBasedLevels[] = [];
        for (let levelId = 1; levelId <= maxLevelId; levelId += 1) {
          const raw = await fn(entityId, levelId);
          const parsed = parseLevelBasedLevels(levelId, raw);
          if (parsed) results.push(parsed);
        }
        return results;
      },
      { staleTime: STALE_TIMES.members, enabled: maxLevelId > 0 },
    );

  const configureSingleLine = useEntityMutation(PALLET, 'setSingleLineConfig', { invalidateKeys });
  const updateParams = useEntityMutation(PALLET, 'updateSingleLineParams', { invalidateKeys });
  const clearConfig = useEntityMutation(PALLET, 'clearSingleLineConfig', { invalidateKeys });
  const pauseSingleLine = useEntityMutation(PALLET, 'pauseSingleLine', { invalidateKeys });
  const resumeSingleLine = useEntityMutation(PALLET, 'resumeSingleLine', { invalidateKeys });
  const setLevelBasedLevels = useEntityMutation(PALLET, 'setLevelBasedLevels', { invalidateKeys });
  const removeLevelBasedLevels = useEntityMutation(PALLET, 'removeLevelBasedLevels', { invalidateKeys });

  return {
    config: configQuery.data ?? null,
    stats: null,
    isLoading: configQuery.isLoading,
    error: configQuery.error,
    useLinePosition: (_account: string | null) => ({ data: null, isLoading: false, error: null }),
    useLevelOverrides,
    configureSingleLine,
    updateParams,
    clearConfig,
    pauseSingleLine,
    resumeSingleLine,
    setLevelBasedLevels,
    removeLevelBasedLevels,
  };
}
