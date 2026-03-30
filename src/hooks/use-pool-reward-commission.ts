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
  LevelClaimRule,
  CapBehavior,
  FundingSummary,
  PoolRewardAdminView,
  PoolRewardMemberView,
  AdminLevelRuleInfo,
  LevelProgressInfo,
  LevelRuleSummaryInfo,
  MemberStatsInfo,
  MemberCapInfo,
  CompletedRoundSummary,
  PendingConfigInfo,
  PoolFundingRecord,
} from '@/lib/types/models';
import { useWalletStore } from '@/stores/wallet-store';

// ─── Parsers ────────────────────────────────────────────────

function unwrapRaw(raw: unknown): any | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  return (unwrapped as any).toJSON?.() ?? unwrapped;
}

function parseCapBehavior(raw: unknown): CapBehavior {
  const obj = (raw as any)?.toJSON?.() ?? raw;
  if (typeof obj === 'string') {
    // Polkadot.js toJSON() returns "fixed" (lowercase) for unit variant
    if (obj.toLowerCase() === 'fixed') return { type: 'Fixed' };
    return { type: 'Fixed' };
  }
  if (obj && typeof obj === 'object') {
    // Polkadot.js toJSON() produces camelCase keys: { unlockByTeam: { ... } }
    // Also handle PascalCase { UnlockByTeam: { ... } } for runtime API responses
    const inner =
      (obj as any).unlockByTeam ??
      (obj as any).UnlockByTeam ??
      (obj as any).unlock_by_team ??
      null;
    if (inner) {
      return {
        type: 'UnlockByTeam',
        directPerUnlock: Number(inner.directPerUnlock ?? inner.direct_per_unlock ?? 0),
        teamPerUnlock: Number(inner.team_per_unlock ?? inner.teamPerUnlock ?? 0),
        unlockPercent: Number(inner.unlock_percent ?? inner.unlockPercent ?? 0),
        baselineDirect: Number(inner.baseline_direct ?? inner.baselineDirect ?? 0),
        baselineTeam: Number(inner.baseline_team ?? inner.baselineTeam ?? 0),
      };
    }
  }
  return { type: 'Fixed' };
}

function parseLevelClaimRule(raw: unknown): LevelClaimRule {
  const obj = (raw as any)?.toJSON?.() ?? raw ?? {};
  const behavior = parseCapBehavior(obj.capBehavior ?? obj.cap_behavior);
  // Merge baseline from rule-level fields (chain storage) into UnlockByTeam behavior
  if (behavior.type === 'UnlockByTeam') {
    behavior.baselineDirect = behavior.baselineDirect || Number(obj.baseline_direct ?? obj.baselineDirect ?? 0);
    behavior.baselineTeam = behavior.baselineTeam || Number(obj.baseline_team ?? obj.baselineTeam ?? 0);
  }
  return {
    baseCapPercent: Number(obj.baseCapPercent ?? obj.base_cap_percent ?? 0),
    capBehavior: behavior,
  };
}

function parseFundingSummary(raw: unknown): FundingSummary | null {
  if (!raw) return null;
  const obj = (raw as any)?.toJSON?.() ?? raw ?? {};
  return {
    nexCommissionRemainder: BigInt(String(obj.nexCommissionRemainder ?? obj.nex_commission_remainder ?? 0)),
    tokenPlatformFeeRetention: BigInt(String(obj.tokenPlatformFeeRetention ?? obj.token_platform_fee_retention ?? 0)),
    tokenCommissionRemainder: BigInt(String(obj.tokenCommissionRemainder ?? obj.token_commission_remainder ?? 0)),
    nexCancelReturn: BigInt(String(obj.nexCancelReturn ?? obj.nex_cancel_return ?? 0)),
    totalFundingCount: Number(obj.totalFundingCount ?? obj.total_funding_count ?? 0),
  };
}

function parsePoolRewardConfig(raw: unknown): PoolRewardConfig | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  const rules = obj.levelRules ?? obj.level_rules ?? [];
  return {
    levelRules: Array.isArray(rules)
      ? rules.map((entry: unknown) => {
          if (Array.isArray(entry)) {
            return [Number(entry[0]), parseLevelClaimRule(entry[1])] as [number, LevelClaimRule];
          }
          const ruleObj = (entry as any)?.toJSON?.() ?? entry ?? {};
          return [Number(ruleObj[0] ?? ruleObj.levelId ?? ruleObj.level_id ?? 0), parseLevelClaimRule(ruleObj[1] ?? ruleObj.rule)] as [number, LevelClaimRule];
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

  const tokenSnaps = obj.tokenLevelSnapshots ?? obj.token_level_snapshots ?? obj.tokenLevelQuotas ?? obj.token_level_quotas ?? null;

  return {
    roundId: Number(obj.roundId ?? obj.round_id ?? 0),
    startBlock: Number(obj.startBlock ?? obj.start_block ?? 0),
    endBlock: obj.endBlock != null || obj.end_block != null ? Number(obj.endBlock ?? obj.end_block ?? 0) : null,
    poolSnapshot: BigInt(String(obj.poolSnapshot ?? obj.pool_snapshot ?? 0)),
    eligibleCount: Number(obj.eligibleCount ?? obj.eligible_count ?? 0),
    perMemberReward: BigInt(String(obj.perMemberReward ?? obj.per_member_reward ?? 0)),
    claimedCount: Number(obj.claimedCount ?? obj.claimed_count ?? 0),
    levelSnapshots: parseLevelSnapshots(obj.levelSnapshots ?? obj.level_snapshots ?? obj.levelQuotas ?? obj.level_quotas),
    tokenPoolSnapshot: obj.tokenPoolSnapshot != null || obj.token_pool_snapshot != null
      ? BigInt(String(obj.tokenPoolSnapshot ?? obj.token_pool_snapshot ?? 0))
      : null,
    tokenPerMemberReward: obj.tokenPerMemberReward != null || obj.token_per_member_reward != null
      ? BigInt(String(obj.tokenPerMemberReward ?? obj.token_per_member_reward ?? 0))
      : null,
    tokenClaimedCount: Number(obj.tokenClaimedCount ?? obj.token_claimed_count ?? 0),
    tokenLevelSnapshots: tokenSnaps ? parseLevelSnapshots(tokenSnaps) : null,
    fundingSummary: parseFundingSummary(obj.fundingSummary ?? obj.funding_summary),
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

function parseLevelProgressInfo(raw: any): LevelProgressInfo {
  return {
    levelId: Number(raw.levelId ?? raw.level_id ?? 0),
    ratioBps: Number(raw.ratioBps ?? raw.ratio_bps ?? 0),
    memberCount: Number(raw.memberCount ?? raw.member_count ?? 0),
    claimedCount: Number(raw.claimedCount ?? raw.claimed_count ?? 0),
    perMemberReward: BigInt(String(raw.perMemberReward ?? raw.per_member_reward ?? 0)),
  };
}

function parseAdminView(obj: any): PoolRewardAdminView {
  const currentRoundRaw = obj.currentRound ?? obj.current_round ?? null;
  const roundHistoryRaw = obj.roundHistory ?? obj.round_history ?? [];
  const pendingRaw = obj.pendingConfig ?? obj.pending_config ?? null;

  return {
    levelRules: (obj.levelRules ?? obj.level_rules ?? []).map((e: any) =>
      Array.isArray(e) ? [Number(e[0]), Number(e[1])] as [number, number] : [0, 0] as [number, number],
    ),
    levelRuleDetails: (obj.levelRuleDetails ?? obj.level_rule_details ?? []).map((r: any) => ({
      levelId: Number(r.levelId ?? r.level_id ?? 0),
      baseCapPercent: Number(r.baseCapPercent ?? r.base_cap_percent ?? 0),
      capBehavior: parseCapBehavior(r.capBehavior ?? r.cap_behavior),
      memberCount: Number(r.memberCount ?? r.member_count ?? 0),
      cappedMemberCount: Number(r.cappedMemberCount ?? r.capped_member_count ?? 0),
    })),
    roundDuration: Number(obj.roundDuration ?? obj.round_duration ?? 0),
    tokenPoolEnabled: Boolean(obj.tokenPoolEnabled ?? obj.token_pool_enabled ?? false),
    currentRound: currentRoundRaw ? parseRoundInfo({ unwrapOr: () => null, isNone: false, unwrap: () => ({ toJSON: () => currentRoundRaw }) } as any) : null,
    totalNexDistributed: BigInt(String(obj.totalNexDistributed ?? obj.total_nex_distributed ?? 0)),
    totalTokenDistributed: BigInt(String(obj.totalTokenDistributed ?? obj.total_token_distributed ?? 0)),
    totalRoundsCompleted: Number(obj.totalRoundsCompleted ?? obj.total_rounds_completed ?? 0),
    totalClaims: Number(obj.totalClaims ?? obj.total_claims ?? 0),
    roundHistory: Array.isArray(roundHistoryRaw) ? roundHistoryRaw.map((r: any) => {
      const fs = r.fundingSummary ?? r.funding_summary ?? {};
      const tokenSnaps = r.tokenLevelSnapshots ?? r.token_level_snapshots ?? r.tokenLevelQuotas ?? r.token_level_quotas ?? null;
      return {
        roundId: Number(r.roundId ?? r.round_id ?? 0),
        startBlock: Number(r.startBlock ?? r.start_block ?? 0),
        endBlock: Number(r.endBlock ?? r.end_block ?? 0),
        poolSnapshot: BigInt(String(r.poolSnapshot ?? r.pool_snapshot ?? 0)),
        nexUsdtRateSnapshot: r.nexUsdtRateSnapshot ?? r.nex_usdt_rate_snapshot ?? null,
        eligibleCount: Number(r.eligibleCount ?? r.eligible_count ?? 0),
        perMemberReward: BigInt(String(r.perMemberReward ?? r.per_member_reward ?? 0)),
        claimedCount: Number(r.claimedCount ?? r.claimed_count ?? 0),
        tokenPoolSnapshot: r.tokenPoolSnapshot != null || r.token_pool_snapshot != null
          ? BigInt(String(r.tokenPoolSnapshot ?? r.token_pool_snapshot ?? 0)) : null,
        tokenPerMemberReward: r.tokenPerMemberReward != null || r.token_per_member_reward != null
          ? BigInt(String(r.tokenPerMemberReward ?? r.token_per_member_reward ?? 0)) : null,
        tokenClaimedCount: Number(r.tokenClaimedCount ?? r.token_claimed_count ?? 0),
        levelSnapshots: (r.levelSnapshots ?? r.level_snapshots ?? r.levelQuotas ?? r.level_quotas ?? []).map(parseLevelProgressInfo),
        tokenLevelSnapshots: tokenSnaps ? (Array.isArray(tokenSnaps) ? tokenSnaps.map(parseLevelProgressInfo) : null) : null,
        fundingSummary: {
          nexCommissionRemainder: BigInt(String(fs.nexCommissionRemainder ?? fs.nex_commission_remainder ?? 0)),
          tokenPlatformFeeRetention: BigInt(String(fs.tokenPlatformFeeRetention ?? fs.token_platform_fee_retention ?? 0)),
          tokenCommissionRemainder: BigInt(String(fs.tokenCommissionRemainder ?? fs.token_commission_remainder ?? 0)),
          nexCancelReturn: BigInt(String(fs.nexCancelReturn ?? fs.nex_cancel_return ?? 0)),
          totalFundingCount: Number(fs.totalFundingCount ?? fs.total_funding_count ?? 0),
        },
      } as CompletedRoundSummary;
    }) : [],
    pendingConfig: pendingRaw ? {
      levelRules: (pendingRaw.levelRules ?? pendingRaw.level_rules ?? []).map((e: any) =>
        Array.isArray(e) ? [Number(e[0]), Number(e[1])] : [0, 0],
      ),
      roundDuration: Number(pendingRaw.roundDuration ?? pendingRaw.round_duration ?? 0),
      applyAfter: Number(pendingRaw.applyAfter ?? pendingRaw.apply_after ?? 0),
    } : null,
    isPaused: Boolean(obj.isPaused ?? obj.is_paused ?? false),
    isGlobalPaused: Boolean(obj.isGlobalPaused ?? obj.is_global_paused ?? false),
    currentPoolBalance: BigInt(String(obj.currentPoolBalance ?? obj.current_pool_balance ?? 0)),
    currentTokenPoolBalance: BigInt(String(obj.currentTokenPoolBalance ?? obj.current_token_pool_balance ?? 0)),
    tokenPoolDeficit: BigInt(String(obj.tokenPoolDeficit ?? obj.token_pool_deficit ?? 0)),
  };
}

function parseLevelRuleSummary(raw: any): LevelRuleSummaryInfo {
  return {
    levelId: Number(raw.levelId ?? raw.level_id ?? 0),
    baseCapPercent: Number(raw.baseCapPercent ?? raw.base_cap_percent ?? 0),
    capBehavior: parseCapBehavior(raw.capBehavior ?? raw.cap_behavior),
  };
}

function parseMemberCapInfo(raw: any): MemberCapInfo {
  return {
    cumulativeClaimedUsdt: BigInt(String(raw.cumulativeClaimedUsdt ?? raw.cumulative_claimed_usdt ?? 0)),
    currentCapUsdt: BigInt(String(raw.currentCapUsdt ?? raw.current_cap_usdt ?? 0)),
    remainingCapUsdt: BigInt(String(raw.remainingCapUsdt ?? raw.remaining_cap_usdt ?? 0)),
    isCapped: Boolean(raw.isCapped ?? raw.is_capped ?? false),
    quotaNexBeforeCap: BigInt(String(raw.quotaNexBeforeCap ?? raw.quota_nex_before_cap ?? 0)),
    rateSnapshotUsed: raw.rateSnapshotUsed ?? raw.rate_snapshot_used ?? null,
    baseCapPercent: Number(raw.baseCapPercent ?? raw.base_cap_percent ?? 0),
    baseCapUsdt: BigInt(String(raw.baseCapUsdt ?? raw.base_cap_usdt ?? 0)),
    unlockCount: Number(raw.unlockCount ?? raw.unlock_count ?? 0),
    unlockPercent: raw.unlockPercent ?? raw.unlock_percent ?? null,
    unlockAmountPerStepUsdt: raw.unlockAmountPerStepUsdt != null || raw.unlock_amount_per_step_usdt != null
      ? BigInt(String(raw.unlockAmountPerStepUsdt ?? raw.unlock_amount_per_step_usdt ?? 0))
      : null,
    nextDirectGap: raw.nextDirectGap ?? raw.next_direct_gap ?? null,
    nextTeamGap: raw.nextTeamGap ?? raw.next_team_gap ?? null,
    nextUnlockIncreaseUsdt: raw.nextUnlockIncreaseUsdt != null || raw.next_unlock_increase_usdt != null
      ? BigInt(String(raw.nextUnlockIncreaseUsdt ?? raw.next_unlock_increase_usdt ?? 0))
      : null,
  };
}

function parseMemberView(obj: any): PoolRewardMemberView {
  const tokenLevelProgress = obj.tokenLevelProgress ?? obj.token_level_progress ?? null;
  return {
    roundDuration: Number(obj.roundDuration ?? obj.round_duration ?? 0),
    tokenPoolEnabled: Boolean(obj.tokenPoolEnabled ?? obj.token_pool_enabled ?? false),
    levelRules: (obj.levelRules ?? obj.level_rules ?? []).map((e: any) =>
      Array.isArray(e) ? [Number(e[0]), Number(e[1])] as [number, number] : [0, 0] as [number, number],
    ),
    levelRuleDetails: (obj.levelRuleDetails ?? obj.level_rule_details ?? []).map(parseLevelRuleSummary),
    currentRoundId: Number(obj.currentRoundId ?? obj.current_round_id ?? 0),
    roundStartBlock: Number(obj.roundStartBlock ?? obj.round_start_block ?? 0),
    roundEndBlock: Number(obj.roundEndBlock ?? obj.round_end_block ?? 0),
    poolSnapshot: BigInt(String(obj.poolSnapshot ?? obj.pool_snapshot ?? 0)),
    tokenPoolSnapshot: obj.tokenPoolSnapshot != null || obj.token_pool_snapshot != null
      ? BigInt(String(obj.tokenPoolSnapshot ?? obj.token_pool_snapshot ?? 0))
      : null,
    effectiveLevel: Number(obj.effectiveLevel ?? obj.effective_level ?? 0),
    claimableNex: BigInt(String(obj.claimableNex ?? obj.claimable_nex ?? 0)),
    claimableToken: BigInt(String(obj.claimableToken ?? obj.claimable_token ?? 0)),
    alreadyClaimed: Boolean(obj.alreadyClaimed ?? obj.already_claimed ?? false),
    roundExpired: Boolean(obj.roundExpired ?? obj.round_expired ?? false),
    lastClaimedRound: Number(obj.lastClaimedRound ?? obj.last_claimed_round ?? 0),
    memberStats: {
      directCount: Number((obj.memberStats ?? obj.member_stats ?? {}).directCount ?? (obj.memberStats ?? obj.member_stats ?? {}).direct_count ?? 0),
      teamCount: Number((obj.memberStats ?? obj.member_stats ?? {}).teamCount ?? (obj.memberStats ?? obj.member_stats ?? {}).team_count ?? 0),
      totalSpent: BigInt(String((obj.memberStats ?? obj.member_stats ?? {}).totalSpent ?? (obj.memberStats ?? obj.member_stats ?? {}).total_spent ?? 0)),
    },
    capInfo: parseMemberCapInfo(obj.capInfo ?? obj.cap_info ?? {}),
    levelProgress: (obj.levelProgress ?? obj.level_progress ?? []).map(parseLevelProgressInfo),
    tokenLevelProgress: tokenLevelProgress ? (Array.isArray(tokenLevelProgress) ? tokenLevelProgress.map(parseLevelProgressInfo) : null) : null,
    claimHistory: (obj.claimHistory ?? obj.claim_history ?? []).map((r: any) => ({
      roundId: Number(r.roundId ?? r.round_id ?? 0),
      amount: BigInt(String(r.amount ?? 0)),
      tokenAmount: BigInt(String(r.tokenAmount ?? r.token_amount ?? 0)),
      levelId: Number(r.levelId ?? r.level_id ?? 0),
      claimedAt: Number(r.claimedAt ?? r.claimed_at ?? 0),
    })),
    isPaused: Boolean(obj.isPaused ?? obj.is_paused ?? false),
    hasPendingConfig: Boolean(obj.hasPendingConfig ?? obj.has_pending_config ?? false),
  };
}

function parseFundingSourceLabel(s: any): string {
  if (typeof s === 'string') return s;
  if (s && typeof s === 'object') {
    const key = Object.keys(s)[0] ?? '';
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
  return 'Unknown';
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

  // ─── Admin View (Runtime API) ────────────────────────────
  const adminViewQuery = useEntityQuery<PoolRewardAdminView | null>(
    ['entity', entityId, 'poolReward', 'adminView'],
    async (api) => {
      const fn = (api.call as any)?.poolRewardDetailApi?.getPoolRewardAdminView;
      if (!fn) return null;
      const raw = await fn(entityId);
      if ((raw as any)?.isNone) return null;
      const d = ((raw as any).unwrap?.() ?? raw);
      const obj = (d as any)?.toJSON?.() ?? d;
      if (!obj) return null;
      return parseAdminView(obj);
    },
    { staleTime: 15_000, refetchInterval: 30_000 },
  );

  // ─── Member View (Runtime API) ─────────────────────────────
  const address = useWalletStore.getState().address;

  const memberViewQuery = useEntityQuery<PoolRewardMemberView | null>(
    ['entity', entityId, 'poolReward', 'memberView', address],
    async (api) => {
      const currentAddress = useWalletStore.getState().address;
      if (!currentAddress) return null;
      const fn = (api.call as any)?.poolRewardDetailApi?.getPoolRewardMemberView;
      if (!fn) return null;
      const raw = await fn(entityId, currentAddress);
      if ((raw as any)?.isNone) return null;
      const d = ((raw as any).unwrap?.() ?? raw);
      const obj = (d as any)?.toJSON?.() ?? d;
      if (!obj) return null;
      return parseMemberView(obj);
    },
    { staleTime: 15_000, refetchInterval: 30_000, enabled: !!address },
  );

  // ─── Funding Records (Storage) ─────────────────────────
  const fundingRecordsQuery = useEntityQuery<PoolFundingRecord[]>(
    ['entity', entityId, 'poolReward', 'fundingRecords'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return [];
      const fn = (api.query as any)[PALLET].poolFundingRecords;
      if (!fn) return [];
      const raw = await fn(entityId);
      const arr = (raw as any)?.toJSON?.() ?? raw;
      if (!Array.isArray(arr)) return [];
      return arr.map((r: any) => ({
        source: parseFundingSourceLabel(r.source),
        nexAmount: BigInt(String(r.nexAmount ?? r.nex_amount ?? 0)),
        tokenAmount: BigInt(String(r.tokenAmount ?? r.token_amount ?? 0)),
        orderId: Number(r.orderId ?? r.order_id ?? 0),
        blockNumber: Number(r.blockNumber ?? r.block_number ?? 0),
      }));
    },
    { staleTime: STALE_TIMES.members },
  );

  // ─── Mutations ──────────────────────────────────────────

  const claimInvalidateKeys = [
    ...invalidateKeys,
    ['entity', entityId, 'poolReward', 'claimHistory'],
    ['entity', entityId, 'poolReward', 'lastClaimed'],
    ['entity', entityId, 'poolReward', 'memberView'],
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
    adminView: adminViewQuery.data ?? null,
    memberView: memberViewQuery.data ?? null,
    fundingRecords: fundingRecordsQuery.data ?? [],
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
