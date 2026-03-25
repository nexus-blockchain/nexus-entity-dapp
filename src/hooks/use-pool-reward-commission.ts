'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import type {
  PoolRewardConfig,
  PoolRewardStats,
  PoolRewardRoundInfo,
  PoolRewardClaimRecord,
  LevelSnapshot,
} from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function unwrapRaw(raw: unknown): any | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  return (unwrapped as any).toJSON?.() ?? unwrapped;
}

function parsePoolRewardConfig(raw: unknown): PoolRewardConfig | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  const ratios = obj.levelRatios ?? obj.level_ratios ?? [];
  return {
    levelRatios: Array.isArray(ratios)
      ? ratios.map((r: unknown) => {
          if (Array.isArray(r)) return [Number(r[0]), Number(r[1])] as [number, number];
          const ro = (r as any)?.toJSON?.() ?? r ?? {};
          return [Number(ro[0] ?? ro.level ?? 0), Number(ro[1] ?? ro.ratio ?? 0)] as [number, number];
        })
      : [],
    roundDuration: Number(obj.roundDuration ?? obj.round_duration ?? 0),
    tokenPoolEnabled: Boolean(obj.tokenPoolEnabled ?? obj.token_pool_enabled ?? false),
  };
}

function parseLevelSnapshot(raw: unknown): LevelSnapshot {
  const obj = (raw as any)?.toJSON?.() ?? raw ?? {};
  return {
    levelId: Number(obj.levelId ?? obj.level_id ?? 0),
    memberCount: Number(obj.memberCount ?? obj.member_count ?? 0),
    perMemberReward: BigInt(String(obj.perMemberReward ?? obj.per_member_reward ?? 0)),
    claimedCount: Number(obj.claimedCount ?? obj.claimed_count ?? 0),
  };
}

function parseLevelSnapshots(raw: unknown): LevelSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseLevelSnapshot);
}

function parseRoundInfo(raw: unknown): PoolRewardRoundInfo | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;

  const tokenSnaps = obj.tokenLevelSnapshots ?? obj.token_level_snapshots ?? null;

  return {
    roundId: Number(obj.roundId ?? obj.round_id ?? 0),
    startBlock: Number(obj.startBlock ?? obj.start_block ?? 0),
    poolSnapshot: BigInt(String(obj.poolSnapshot ?? obj.pool_snapshot ?? 0)),
    levelSnapshots: parseLevelSnapshots(obj.levelSnapshots ?? obj.level_snapshots),
    tokenPoolSnapshot: obj.tokenPoolSnapshot != null || obj.token_pool_snapshot != null
      ? BigInt(String(obj.tokenPoolSnapshot ?? obj.token_pool_snapshot ?? 0))
      : null,
    tokenLevelSnapshots: tokenSnaps ? parseLevelSnapshots(tokenSnaps) : null,
  };
}

function parseDistributionStats(raw: unknown): PoolRewardStats | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  return {
    totalNexDistributed: BigInt(String(obj.totalNexDistributed ?? obj.total_nex_distributed ?? 0)),
    totalTokenDistributed: BigInt(String(obj.totalTokenDistributed ?? obj.total_token_distributed ?? 0)),
    totalRoundsCompleted: Number(obj.totalRoundsCompleted ?? obj.total_rounds_completed ?? 0),
    totalClaims: Number(obj.totalClaims ?? obj.total_claims ?? 0),
  };
}

function parseClaimRecords(raw: unknown): PoolRewardClaimRecord[] {
  const arr = unwrapRaw(raw);
  if (!Array.isArray(arr)) return [];
  return arr.map((item: unknown) => {
    const obj = (item as any)?.toJSON?.() ?? item ?? {};
    return {
      roundId: Number(obj.roundId ?? obj.round_id ?? 0),
      amount: BigInt(String(obj.amount ?? 0)),
      tokenAmount: BigInt(String(obj.tokenAmount ?? obj.token_amount ?? 0)),
      levelId: Number(obj.levelId ?? obj.level_id ?? 0),
      claimedAt: Number(obj.claimedAt ?? obj.claimed_at ?? 0),
    };
  });
}

// ─── Hook ───────────────────────────────────────────────────

const PALLET = 'commissionPoolReward';
const CORE_PALLET = 'commissionCore';

export function usePoolRewardCommission() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [
    ['entity', entityId, 'poolReward'],
    ['entity', entityId, 'poolReward', 'stats'],
    ['entity', entityId, 'poolReward', 'currentRound'],
    ['entity', entityId, 'poolReward', 'lastRoundId'],
    ['entity', entityId, 'poolReward', 'paused'],
    ['entity', entityId, 'poolReward', 'globalPaused'],
    ['entity', entityId, 'poolReward', 'poolBalance'],
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
      const fn = (api.query as any)[PALLET].distributionStatistics;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseDistributionStats(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  // 沉淀池余额（从 commission-core 的 UnallocatedPool 查询）
  const poolBalanceQuery = useEntityQuery<bigint>(
    ['entity', entityId, 'poolReward', 'poolBalance'],
    async (api) => {
      if (!hasPallet(api, CORE_PALLET)) return BigInt(0);
      const fn = (api.query as any)[CORE_PALLET].unallocatedPool;
      if (!fn) return BigInt(0);
      const raw = await fn(entityId);
      const v = (raw as any)?.toJSON?.() ?? raw;
      return BigInt(String(v ?? 0));
    },
    { staleTime: 15_000, refetchInterval: 30_000 },
  );

  // ─── Round Queries ────────────────────────────────────

  const currentRoundQuery = useEntityQuery<PoolRewardRoundInfo | null>(
    ['entity', entityId, 'poolReward', 'currentRound'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].currentRound;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseRoundInfo(raw);
    },
    { staleTime: 15_000, refetchInterval: 15_000 },
  );

  const lastRoundIdQuery = useEntityQuery<number>(
    ['entity', entityId, 'poolReward', 'lastRoundId'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return 0;
      const fn = (api.query as any)[PALLET].lastRoundId;
      if (!fn) return 0;
      const raw = await fn(entityId);
      const v = (raw as any)?.toJSON?.() ?? raw;
      return Number(v ?? 0);
    },
    { staleTime: STALE_TIMES.members },
  );

  const useLastClaimedRound = (account: string | null) =>
    useEntityQuery<number>(
      ['entity', entityId, 'poolReward', 'lastClaimed', account],
      async (api) => {
        if (!hasPallet(api, PALLET) || !account) return 0;
        const fn = (api.query as any)[PALLET].lastClaimedRound;
        if (!fn) return 0;
        const raw = await fn(entityId, account);
        const v = (raw as any)?.toJSON?.() ?? raw;
        return Number(v ?? 0);
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  const useClaimHistory = (account: string | null) =>
    useEntityQuery<PoolRewardClaimRecord[]>(
      ['entity', entityId, 'poolReward', 'claimHistory', account],
      async (api) => {
        if (!hasPallet(api, PALLET) || !account) return [];
        const fn = (api.query as any)[PALLET].claimRecords;
        if (!fn) return [];
        const raw = await fn(entityId, account);
        return parseClaimRecords(raw);
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  const poolRewardPausedQuery = useEntityQuery<boolean>(
    ['entity', entityId, 'poolReward', 'paused'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return false;
      const fn = (api.query as any)[PALLET].poolRewardPaused;
      if (!fn) return false;
      const raw = await fn(entityId);
      const v = (raw as any)?.toJSON?.() ?? raw;
      return Boolean(v);
    },
    { staleTime: STALE_TIMES.members },
  );

  const globalPausedQuery = useEntityQuery<boolean>(
    ['entity', entityId, 'poolReward', 'globalPaused'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return false;
      const fn = (api.query as any)[PALLET].globalPoolRewardPaused;
      if (!fn) return false;
      const raw = await fn();
      const v = (raw as any)?.toJSON?.() ?? raw;
      return Boolean(v);
    },
    { staleTime: STALE_TIMES.members },
  );

  // ─── Mutations ──────────────────────────────────────────

  const claimInvalidateKeys = [
    ...invalidateKeys,
    ['entity', entityId, 'poolReward', 'claimHistory'],
    ['entity', entityId, 'poolReward', 'lastClaimed'],
  ];

  const setPoolRewardConfig = useEntityMutation(PALLET, 'setPoolRewardConfig', { invalidateKeys });
  const clearPoolRewardConfig = useEntityMutation(PALLET, 'clearPoolRewardConfig', { invalidateKeys });
  const claimPoolReward = useEntityMutation(PALLET, 'claimPoolReward', { invalidateKeys: claimInvalidateKeys });
  const pausePoolReward = useEntityMutation(PALLET, 'pausePoolReward', { invalidateKeys });
  const resumePoolReward = useEntityMutation(PALLET, 'resumePoolReward', { invalidateKeys });
  const setTokenPoolEnabled = useEntityMutation(PALLET, 'setTokenPoolEnabled', { invalidateKeys });

  return {
    config: configQuery.data ?? null,
    stats: statsQuery.data ?? null,
    poolBalance: poolBalanceQuery.data ?? BigInt(0),
    currentRound: currentRoundQuery.data ?? null,
    lastRoundId: lastRoundIdQuery.data ?? 0,
    isPaused: poolRewardPausedQuery.data ?? false,
    isGlobalPaused: globalPausedQuery.data ?? false,
    isLoading: configQuery.isLoading,
    error: configQuery.error,
    useLastClaimedRound,
    useClaimHistory,
    setPoolRewardConfig,
    clearPoolRewardConfig,
    claimPoolReward,
    pausePoolReward,
    resumePoolReward,
    setTokenPoolEnabled,
  };
}
