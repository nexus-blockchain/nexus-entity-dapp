'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import type { PoolRewardConfig, PoolRewardStats, PoolParticipant } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function parsePoolRewardConfig(raw: unknown): PoolRewardConfig | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  const ratios = obj.levelRatios ?? obj.level_ratios ?? [];
  return {
    enabled: Boolean(obj.enabled),
    levelRatios: Array.isArray(ratios)
      ? ratios.map((r: unknown) => {
          if (Array.isArray(r)) return [Number(r[0]), Number(r[1])] as [number, number];
          const ro = (r as any)?.toJSON?.() ?? r ?? {};
          return [Number(ro[0] ?? ro.level ?? 0), Number(ro[1] ?? ro.ratio ?? 0)] as [number, number];
        })
      : [],
    roundDuration: Number(obj.roundDuration ?? obj.round_duration ?? 0),
  };
}

function parsePoolRewardStats(raw: unknown): PoolRewardStats | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    poolBalance: BigInt(String(obj.poolBalance ?? obj.pool_balance ?? 0)),
    totalDistributed: BigInt(String(obj.totalDistributed ?? obj.total_distributed ?? 0)),
    totalParticipants: Number(obj.totalParticipants ?? obj.total_participants ?? 0),
    lastDistributionBlock: Number(obj.lastDistributionBlock ?? obj.last_distribution_block ?? 0),
  };
}

function parsePoolParticipant(raw: unknown): PoolParticipant | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    account: String(obj.account ?? ''),
    contribution: BigInt(String(obj.contribution ?? 0)),
    share: Number(obj.share ?? 0),
    totalClaimed: BigInt(String(obj.totalClaimed ?? obj.total_claimed ?? 0)),
  };
}

// ─── Hook ───────────────────────────────────────────────────

const PALLET = 'commissionPoolReward';

export function usePoolRewardCommission() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [
    ['entity', entityId, 'poolReward'],
    ['entity', entityId, 'poolReward', 'stats'],
  ];

  // ─── Queries ──────────────────────────────────────────

  const configQuery = useEntityQuery<PoolRewardConfig | null>(
    ['entity', entityId, 'poolReward'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].poolRewardConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parsePoolRewardConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const statsQuery = useEntityQuery<PoolRewardStats | null>(
    ['entity', entityId, 'poolReward', 'stats'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].poolRewardStats;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parsePoolRewardStats(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const useParticipant = (account: string | null) =>
    useEntityQuery<PoolParticipant | null>(
      ['entity', entityId, 'poolReward', 'participant', account],
      async (api) => {
        if (!hasPallet(api, PALLET)) return null;
        if (!account) return null;
        const fn = (api.query as any)[PALLET].participants;
        if (!fn) return null;
        const raw = await fn(entityId, account);
        return parsePoolParticipant(raw);
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  // ─── Mutations ──────────────────────────────────────────
  // Available chain extrinsics:
  // setPoolRewardConfig(entityId, levelRatios:Vec<(u8,u16)>, roundDuration:u32)
  // startNewRound(entityId)
  // clearPoolRewardConfig(entityId)
  // claimPoolReward(entityId)
  // pausePoolReward(entityId)
  // resumePoolReward(entityId)

  const setPoolRewardConfig = useEntityMutation(PALLET, 'setPoolRewardConfig', { invalidateKeys });
  const clearPoolRewardConfig = useEntityMutation(PALLET, 'clearPoolRewardConfig', { invalidateKeys });
  const claimPoolReward = useEntityMutation(PALLET, 'claimPoolReward', { invalidateKeys });
  const startNewRound = useEntityMutation(PALLET, 'startNewRound', { invalidateKeys });
  const pausePoolReward = useEntityMutation(PALLET, 'pausePoolReward', { invalidateKeys });
  const resumePoolReward = useEntityMutation(PALLET, 'resumePoolReward', { invalidateKeys });

  return {
    config: configQuery.data ?? null,
    stats: statsQuery.data ?? null,
    isLoading: configQuery.isLoading,
    error: configQuery.error,
    useParticipant,
    setPoolRewardConfig,
    clearPoolRewardConfig,
    claimPoolReward,
    startNewRound,
    pausePoolReward,
    resumePoolReward,
  };
}
