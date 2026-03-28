'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import {
  parseLevelBasedLevels,
  parseSingleLineConfig,
  parseSingleLineMemberView,
  parseSingleLinePosition,
  parseSingleLinePreview,
  parseSingleLineStats,
} from '@/lib/chain/adapters/single-line-parsers';
import type {
  SingleLineConfig,
  LevelBasedLevels,
  SingleLinePosition,
  SingleLineStats,
  SingleLineMemberViewData,
  SingleLinePreviewData,
} from '@/lib/types/models';

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
      const enabledFn = (api.query as any)[PALLET].singleLineEnabled;
      if (enabledFn) {
        const enabledRaw = await enabledFn(entityId);
        config.enabled = enabledRaw?.toPrimitive?.() ?? enabledRaw?.isTrue ?? true;
      }
      return config;
    },
    { staleTime: STALE_TIMES.members },
  );

  const statsQuery = useEntityQuery<SingleLineStats | null>(
    ['entity', entityId, 'singleLine', 'overview'],
    async (api) => {
      const fn = (api.call as any)?.singleLineQueryApi?.singleLineOverview;
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
        if (!account) return null;
        const fn = (api.call as any)?.singleLineQueryApi?.singleLineMemberPosition;
        if (!fn) return null;
        const raw = await fn(entityId, account);
        return parseSingleLinePosition(raw);
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  const useMemberView = (account: string | null) =>
    useEntityQuery<SingleLineMemberViewData | null>(
      ['entity', entityId, 'singleLine', 'memberView', account],
      async (api) => {
        if (!account) return null;
        const fn = (api.call as any)?.singleLineQueryApi?.singleLineMemberView;
        if (!fn) return null;
        const raw = await fn(entityId, account);
        return parseSingleLineMemberView(raw);
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  const usePreview = (buyer: string | null, orderAmount: bigint | number | null) =>
    useEntityQuery<SingleLinePreviewData[]>(
      ['entity', entityId, 'singleLine', 'preview', buyer, String(orderAmount ?? '')],
      async (api) => {
        if (!buyer || orderAmount == null) return [];
        const fn = (api.call as any)?.singleLineQueryApi?.singleLinePreviewCommission;
        if (!fn) return [];
        const raw = await fn(entityId, buyer, orderAmount.toString());
        return parseSingleLinePreview(raw);
      },
      { staleTime: STALE_TIMES.members, enabled: !!buyer && orderAmount != null },
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
    stats: statsQuery.data ?? null,
    isLoading: configQuery.isLoading || statsQuery.isLoading,
    error: configQuery.error ?? statsQuery.error,
    useLinePosition,
    useMemberView,
    usePreview,
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
