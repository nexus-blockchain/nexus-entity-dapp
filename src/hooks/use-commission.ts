'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import type {
  CommissionConfig,
  CoreCommissionConfig,
  EntityWithdrawalConfig,
  WithdrawalMode,
  WithdrawalTierConfig,
  MemberCommissionStats,
  MemberTokenCommissionStats,
  WithdrawalRecord,
  TokenWithdrawalRecord,
  ShopCommissionTotals,
} from '@/lib/types/models';

// ─── Generic Unwrapper ──────────────────────────────────────

function unwrapRaw(raw: unknown): any | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  return (unwrapped as any).toJSON?.() ?? unwrapped;
}

function unwrapU16(raw: unknown): number {
  if (!raw) return 0;
  const v = (raw as any)?.toJSON?.() ?? raw;
  return Number(v ?? 0);
}

function unwrapBool(raw: unknown): boolean {
  if (!raw) return false;
  const v = (raw as any)?.toJSON?.() ?? raw;
  return Boolean(v);
}

function unwrapBalance(raw: unknown): bigint {
  if (!raw) return BigInt(0);
  const v = (raw as any)?.toJSON?.() ?? raw;
  return BigInt(String(v ?? 0));
}

function unwrapU32(raw: unknown): number {
  if (!raw) return 0;
  const v = (raw as any)?.toJSON?.() ?? raw;
  return Number(v ?? 0);
}

// ─── Parsers ────────────────────────────────────────────────

function parseCoreCommissionConfig(raw: unknown): CoreCommissionConfig | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  return {
    enabledModes: Number(obj.enabledModes ?? obj.enabled_modes ?? 0),
    maxCommissionRate: Number(obj.maxCommissionRate ?? obj.max_commission_rate ?? 0),
    enabled: Boolean(obj.enabled),
    withdrawalCooldown: Number(obj.withdrawalCooldown ?? obj.withdrawal_cooldown ?? 0),
    creatorRewardRate: Number(obj.creatorRewardRate ?? obj.creator_reward_rate ?? 0),
    tokenWithdrawalCooldown: Number(obj.tokenWithdrawalCooldown ?? obj.token_withdrawal_cooldown ?? 0),
  };
}

/** @deprecated kept for backward compat */
function parseCommissionConfig(raw: unknown): CommissionConfig | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  const wc = obj.withdrawalConfig ?? obj.withdrawal_config ?? {};
  return {
    entityId: Number(obj.entityId ?? obj.entity_id ?? 0),
    enabled: Boolean(obj.enabled),
    baseRate: Number(obj.baseRate ?? obj.base_rate ?? 0),
    enabledModes: Number(obj.enabledModes ?? obj.enabled_modes ?? 0),
    withdrawalConfig: {
      minAmount: BigInt(String(wc.minAmount ?? wc.min_amount ?? 0)),
      feeRate: Number(wc.feeRate ?? wc.fee_rate ?? 0),
      cooldown: Number(wc.cooldown ?? 0),
    },
    withdrawalPaused: Boolean(obj.withdrawalPaused ?? obj.withdrawal_paused),
  };
}

function parseWithdrawalMode(obj: any): WithdrawalMode {
  if (!obj) return { type: 'FullWithdrawal' };
  if (typeof obj === 'string') {
    if (obj === 'FullWithdrawal' || obj === 'fullWithdrawal') return { type: 'FullWithdrawal' };
    if (obj === 'LevelBased' || obj === 'levelBased') return { type: 'LevelBased' };
    return { type: 'FullWithdrawal' };
  }
  if (obj.FixedRate || obj.fixedRate) {
    const inner = obj.FixedRate ?? obj.fixedRate;
    return { type: 'FixedRate', repurchaseRate: Number(inner?.repurchaseRate ?? inner?.repurchase_rate ?? inner ?? 0) };
  }
  if (obj.MemberChoice || obj.memberChoice) {
    const inner = obj.MemberChoice ?? obj.memberChoice;
    return { type: 'MemberChoice', minRepurchaseRate: Number(inner?.minRepurchaseRate ?? inner?.min_repurchase_rate ?? inner ?? 0) };
  }
  if (obj.LevelBased !== undefined || obj.levelBased !== undefined) return { type: 'LevelBased' };
  return { type: 'FullWithdrawal' };
}

function parseTierConfig(obj: any): WithdrawalTierConfig {
  if (!obj) return { withdrawalRate: 10000, repurchaseRate: 0 };
  return {
    withdrawalRate: Number(obj.withdrawalRate ?? obj.withdrawal_rate ?? 10000),
    repurchaseRate: Number(obj.repurchaseRate ?? obj.repurchase_rate ?? 0),
  };
}

function parseEntityWithdrawalConfig(raw: unknown): EntityWithdrawalConfig | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  const overrides = obj.levelOverrides ?? obj.level_overrides ?? [];
  return {
    mode: parseWithdrawalMode(obj.mode),
    defaultTier: parseTierConfig(obj.defaultTier ?? obj.default_tier),
    levelOverrides: Array.isArray(overrides)
      ? overrides.map((item: any) => {
          if (Array.isArray(item)) return [Number(item[0]), parseTierConfig(item[1])] as [number, WithdrawalTierConfig];
          return [Number(item.level ?? 0), parseTierConfig(item.tier ?? item)] as [number, WithdrawalTierConfig];
        })
      : [],
    voluntaryBonusRate: Number(obj.voluntaryBonusRate ?? obj.voluntary_bonus_rate ?? 0),
    enabled: Boolean(obj.enabled),
  };
}

function parseMemberCommissionStats(raw: unknown): MemberCommissionStats | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  return {
    totalEarned: BigInt(String(obj.totalEarned ?? obj.total_earned ?? 0)),
    pending: BigInt(String(obj.pending ?? 0)),
    withdrawn: BigInt(String(obj.withdrawn ?? 0)),
    repurchased: BigInt(String(obj.repurchased ?? 0)),
    orderCount: Number(obj.orderCount ?? obj.order_count ?? 0),
  };
}

function parseMemberTokenCommissionStats(raw: unknown): MemberTokenCommissionStats | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  return {
    totalEarned: BigInt(String(obj.totalEarned ?? obj.total_earned ?? 0)),
    pending: BigInt(String(obj.pending ?? 0)),
    withdrawn: BigInt(String(obj.withdrawn ?? 0)),
    repurchased: BigInt(String(obj.repurchased ?? 0)),
    orderCount: Number(obj.orderCount ?? obj.order_count ?? 0),
  };
}

function parseWithdrawalRecords(rawEntries: [any, any][]): WithdrawalRecord[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([_key, value]) => {
    const obj = value?.toJSON?.() ?? value;
    return {
      amount: BigInt(String(obj.amount ?? 0)),
      repurchaseAmount: BigInt(String(obj.repurchaseAmount ?? obj.repurchase_amount ?? 0)),
      block: Number(obj.block ?? obj.blockNumber ?? obj.block_number ?? 0),
    };
  });
}

function parseTokenWithdrawalRecords(rawEntries: [any, any][]): TokenWithdrawalRecord[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([_key, value]) => {
    const obj = value?.toJSON?.() ?? value;
    return {
      amount: BigInt(String(obj.amount ?? 0)),
      repurchaseAmount: BigInt(String(obj.repurchaseAmount ?? obj.repurchase_amount ?? 0)),
      block: Number(obj.block ?? obj.blockNumber ?? obj.block_number ?? 0),
    };
  });
}

function parseShopCommissionTotals(raw: unknown): ShopCommissionTotals | null {
  const obj = unwrapRaw(raw);
  if (!obj) return null;
  return {
    totalDistributed: BigInt(String(obj.totalDistributed ?? obj.total_distributed ?? 0)),
    totalOrders: Number(obj.totalOrders ?? obj.total_orders ?? 0),
  };
}

function parseMemberCommission(raw: unknown): { nexEarned: bigint; tokenEarned: bigint } {
  if (!raw || (raw as { isNone?: boolean }).isNone) return { nexEarned: BigInt(0), tokenEarned: BigInt(0) };
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return { nexEarned: BigInt(0), tokenEarned: BigInt(0) };
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    nexEarned: BigInt(String(obj.nexEarned ?? obj.nex_earned ?? obj.totalEarned ?? obj.total_earned ?? 0)),
    tokenEarned: BigInt(String(obj.tokenEarned ?? obj.token_earned ?? 0)),
  };
}

function parseOrderCommissions(rawRecords: unknown[]): { orderId: number; amount: bigint; plugin: string }[] {
  if (!rawRecords || !Array.isArray(rawRecords)) return [];
  return rawRecords.map((value) => {
    const obj = (value as any)?.toJSON?.() ?? value ?? {};
    return {
      orderId: Number(obj.orderId ?? obj.order_id ?? 0),
      amount: BigInt(String(obj.amount ?? 0)),
      plugin: String(obj.plugin ?? obj.commissionType ?? obj.commission_type ?? ''),
    };
  });
}

// ─── Hook ───────────────────────────────────────────────────

const PALLET = 'commissionCore';

export function useCommission() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [['entity', entityId, 'commission']];

  // ─── Core Config Queries ──────────────────────────────

  const coreConfigQuery = useEntityQuery<CoreCommissionConfig | null>(
    ['entity', entityId, 'commission', 'coreConfig'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].commissionConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseCoreCommissionConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  /** @deprecated use coreConfig instead */
  const configQuery = useEntityQuery<CommissionConfig | null>(
    ['entity', entityId, 'commission'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].commissionConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseCommissionConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  // ─── Withdrawal Config Queries ────────────────────────

  const withdrawalConfigQuery = useEntityQuery<EntityWithdrawalConfig | null>(
    ['entity', entityId, 'commission', 'withdrawalConfig'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].withdrawalConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseEntityWithdrawalConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const tokenWithdrawalConfigQuery = useEntityQuery<EntityWithdrawalConfig | null>(
    ['entity', entityId, 'commission', 'tokenWithdrawalConfig'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].tokenWithdrawalConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseEntityWithdrawalConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  // ─── Member Stats Queries ─────────────────────────────

  const useMemberCommission = (account: string | null) =>
    useEntityQuery<{ nexEarned: bigint; tokenEarned: bigint }>(
      ['entity', entityId, 'commission', 'member', account],
      async (api) => {
        if (!hasPallet(api, PALLET)) return { nexEarned: BigInt(0), tokenEarned: BigInt(0) };
        if (!account) return { nexEarned: BigInt(0), tokenEarned: BigInt(0) };
        // memberCommissions no longer in chain; derive from memberCommissionStats
        const fn = (api.query as any)[PALLET].memberCommissionStats;
        if (!fn) return { nexEarned: BigInt(0), tokenEarned: BigInt(0) };
        const raw = await fn(entityId, account);
        const stats = parseMemberCommissionStats(raw);
        return {
          nexEarned: stats?.totalEarned ?? BigInt(0),
          tokenEarned: BigInt(0),
        };
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  const useMemberCommissionStats = (account: string | null) =>
    useEntityQuery<MemberCommissionStats | null>(
      ['entity', entityId, 'commission', 'memberStats', account],
      async (api) => {
        if (!hasPallet(api, PALLET) || !account) return null;
        const fn = (api.query as any)[PALLET].memberCommissionStats;
        if (!fn) return null;
        const raw = await fn(entityId, account);
        return parseMemberCommissionStats(raw);
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  const useMemberTokenCommissionStats = (account: string | null) =>
    useEntityQuery<MemberTokenCommissionStats | null>(
      ['entity', entityId, 'commission', 'memberTokenStats', account],
      async (api) => {
        if (!hasPallet(api, PALLET) || !account) return null;
        const fn = (api.query as any)[PALLET].memberTokenCommissionStats;
        if (!fn) return null;
        const raw = await fn(entityId, account);
        return parseMemberTokenCommissionStats(raw);
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  // ─── Entity Totals Queries ────────────────────────────

  const shopCommissionTotalsQuery = useEntityQuery<ShopCommissionTotals | null>(
    ['entity', entityId, 'commission', 'shopTotals'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return null;
      const fn = (api.query as any)[PALLET].shopCommissionTotals;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseShopCommissionTotals(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const shopPendingTotalQuery = useEntityQuery<bigint>(
    ['entity', entityId, 'commission', 'shopPendingTotal'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return BigInt(0);
      const fn = (api.query as any)[PALLET].shopPendingTotal;
      if (!fn) return BigInt(0);
      return unwrapBalance(await fn(entityId));
    },
    { staleTime: STALE_TIMES.members },
  );

  const tokenPendingTotalQuery = useEntityQuery<bigint>(
    ['entity', entityId, 'commission', 'tokenPendingTotal'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return BigInt(0);
      const fn = (api.query as any)[PALLET].tokenPendingTotal;
      if (!fn) return BigInt(0);
      return unwrapBalance(await fn(entityId));
    },
    { staleTime: STALE_TIMES.members },
  );

  const unallocatedPoolQuery = useEntityQuery<bigint>(
    ['entity', entityId, 'commission', 'unallocatedPool'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return BigInt(0);
      const fn = (api.query as any)[PALLET].unallocatedPool;
      if (!fn) return BigInt(0);
      return unwrapBalance(await fn(entityId));
    },
    { staleTime: STALE_TIMES.members },
  );

  const unallocatedTokenPoolQuery = useEntityQuery<bigint>(
    ['entity', entityId, 'commission', 'unallocatedTokenPool'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return BigInt(0);
      const fn = (api.query as any)[PALLET].unallocatedTokenPool;
      if (!fn) return BigInt(0);
      return unwrapBalance(await fn(entityId));
    },
    { staleTime: STALE_TIMES.members },
  );

  // ─── Global Config Queries ────────────────────────────

  const globalMinRepurchaseRateQuery = useEntityQuery<number>(
    ['commission', 'globalMinRepurchaseRate'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return 0;
      const fn = (api.query as any)[PALLET].globalMinRepurchaseRate;
      if (!fn) return 0;
      return unwrapU16(await fn());
    },
    { staleTime: STALE_TIMES.members },
  );

  const globalMinTokenRepurchaseRateQuery = useEntityQuery<number>(
    ['commission', 'globalMinTokenRepurchaseRate'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return 0;
      const fn = (api.query as any)[PALLET].globalMinTokenRepurchaseRate;
      if (!fn) return 0;
      return unwrapU16(await fn());
    },
    { staleTime: STALE_TIMES.members },
  );

  const globalMaxCommissionRateQuery = useEntityQuery<number>(
    ['commission', 'globalMaxCommissionRate'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return 0;
      const fn = (api.query as any)[PALLET].globalMaxCommissionRate;
      if (!fn) return 0;
      return unwrapU16(await fn());
    },
    { staleTime: STALE_TIMES.members },
  );

  const globalMaxTokenCommissionRateQuery = useEntityQuery<number>(
    ['commission', 'globalMaxTokenCommissionRate'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return 0;
      const fn = (api.query as any)[PALLET].globalMaxTokenCommissionRate;
      if (!fn) return 0;
      return unwrapU16(await fn());
    },
    { staleTime: STALE_TIMES.members },
  );

  const tokenPlatformFeeRateQuery = useEntityQuery<number>(
    ['commission', 'tokenPlatformFeeRate'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return 0;
      const fn = (api.query as any)[PALLET].tokenPlatformFeeRate;
      if (!fn) return 0;
      return unwrapU16(await fn());
    },
    { staleTime: STALE_TIMES.members },
  );

  const globalCommissionPausedQuery = useEntityQuery<boolean>(
    ['commission', 'globalCommissionPaused'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return false;
      const fn = (api.query as any)[PALLET].globalCommissionPaused;
      if (!fn) return false;
      return unwrapBool(await fn());
    },
    { staleTime: STALE_TIMES.members },
  );

  const withdrawalPausedQuery = useEntityQuery<boolean>(
    ['entity', entityId, 'commission', 'withdrawalPaused'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return false;
      const fn = (api.query as any)[PALLET].withdrawalPaused;
      if (!fn) return false;
      return unwrapBool(await fn(entityId));
    },
    { staleTime: STALE_TIMES.members },
  );

  const minWithdrawalIntervalQuery = useEntityQuery<number>(
    ['commission', 'minWithdrawalInterval'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return 0;
      const fn = (api.query as any)[PALLET].minWithdrawalInterval;
      if (!fn) return 0;
      return unwrapU32(await fn());
    },
    { staleTime: STALE_TIMES.members },
  );

  // ─── Member Withdrawal History ────────────────────────

  const useMemberWithdrawalHistory = (account: string | null) =>
    useEntityQuery<WithdrawalRecord[]>(
      ['entity', entityId, 'commission', 'withdrawalHistory', account],
      async (api) => {
        if (!hasPallet(api, PALLET) || !account) return [];
        const fn = (api.query as any)[PALLET].memberWithdrawalHistory;
        if (!fn?.entries) return [];
        try {
          const raw = await fn.entries(entityId, account);
          return parseWithdrawalRecords(raw);
        } catch {
          return [];
        }
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  const useMemberTokenWithdrawalHistory = (account: string | null) =>
    useEntityQuery<TokenWithdrawalRecord[]>(
      ['entity', entityId, 'commission', 'tokenWithdrawalHistory', account],
      async (api) => {
        if (!hasPallet(api, PALLET) || !account) return [];
        const fn = (api.query as any)[PALLET].memberTokenWithdrawalHistory;
        if (!fn?.entries) return [];
        try {
          const raw = await fn.entries(entityId, account);
          return parseTokenWithdrawalRecords(raw);
        } catch {
          return [];
        }
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  // ─── Member Last Credited/Withdrawn ───────────────────

  const useMemberLastCredited = (account: string | null) =>
    useEntityQuery<number>(
      ['entity', entityId, 'commission', 'lastCredited', account],
      async (api) => {
        if (!hasPallet(api, PALLET) || !account) return 0;
        const fn = (api.query as any)[PALLET].memberLastCredited;
        if (!fn) return 0;
        return unwrapU32(await fn(entityId, account));
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  const useMemberLastWithdrawn = (account: string | null) =>
    useEntityQuery<number>(
      ['entity', entityId, 'commission', 'lastWithdrawn', account],
      async (api) => {
        if (!hasPallet(api, PALLET) || !account) return 0;
        const fn = (api.query as any)[PALLET].memberLastWithdrawn;
        if (!fn) return 0;
        return unwrapU32(await fn(entityId, account));
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  const useMemberTokenLastCredited = (account: string | null) =>
    useEntityQuery<number>(
      ['entity', entityId, 'commission', 'tokenLastCredited', account],
      async (api) => {
        if (!hasPallet(api, PALLET) || !account) return 0;
        const fn = (api.query as any)[PALLET].memberTokenLastCredited;
        if (!fn) return 0;
        return unwrapU32(await fn(entityId, account));
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  const useMemberTokenLastWithdrawn = (account: string | null) =>
    useEntityQuery<number>(
      ['entity', entityId, 'commission', 'tokenLastWithdrawn', account],
      async (api) => {
        if (!hasPallet(api, PALLET) || !account) return 0;
        const fn = (api.query as any)[PALLET].memberTokenLastWithdrawn;
        if (!fn) return 0;
        return unwrapU32(await fn(entityId, account));
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  // ─── Order Commissions ────────────────────────────────

  const orderCommissionsQuery = useEntityQuery<{ orderId: number; amount: bigint; plugin: string }[]>(
    ['entity', entityId, 'commission', 'orders'],
    async (api) => {
      if (!hasPallet(api, PALLET)) return [];
      const pallet = (api.query as any)[PALLET];
      const orderIdsFn = pallet.memberCommissionOrderIds;
      const recordsFn = pallet.orderCommissionRecords;
      if (!orderIdsFn?.entries || !recordsFn) return [];

      let orderIdEntries: [any, any][];
      try {
        orderIdEntries = await orderIdsFn.entries(entityId);
      } catch {
        const all = await orderIdsFn.entries();
        orderIdEntries = (all as [any, any][]).filter(([key]) => Number(key.args?.[0]?.toString() ?? 0) === entityId);
      }

      const orderIds = Array.from(
        new Set(
          orderIdEntries.flatMap(([, value]) => {
            const plain = value?.toJSON?.() ?? value;
            return Array.isArray(plain)
              ? plain.map((item) => Number(item)).filter((item) => Number.isFinite(item))
              : [];
          }),
        ),
      );

      if (orderIds.length === 0) return [];

      const recordVectors = await Promise.all(orderIds.map((orderId) => recordsFn(orderId)));
      return recordVectors.flatMap((vector) => parseOrderCommissions((vector?.toJSON?.() ?? vector ?? []) as unknown[]));
    },
    { staleTime: STALE_TIMES.members },
  );

  // ─── Mutations ────────────────────────────────────────

  // Entity owner/admin mutations
  const setCommissionRate = useEntityMutation(PALLET, 'setCommissionRate', { invalidateKeys });
  const setCommissionModes = useEntityMutation(PALLET, 'setCommissionModes', { invalidateKeys });
  const enableCommission = useEntityMutation(PALLET, 'enableCommission', { invalidateKeys });
  const configureWithdrawal = useEntityMutation(PALLET, 'setWithdrawalConfig', { invalidateKeys });
  const setTokenWithdrawalConfig = useEntityMutation(PALLET, 'setTokenWithdrawalConfig', { invalidateKeys });
  const pauseWithdrawal = useEntityMutation(PALLET, 'pauseWithdrawals', { invalidateKeys });
  const setCreatorRewardRate = useEntityMutation(PALLET, 'setCreatorRewardRate', { invalidateKeys });
  const setWithdrawalCooldown = useEntityMutation(PALLET, 'setWithdrawalCooldown', { invalidateKeys });
  const setMinWithdrawalInterval = useEntityMutation(PALLET, 'setMinWithdrawalInterval', { invalidateKeys });
  const clearCommissionConfig = useEntityMutation(PALLET, 'clearCommissionConfig', { invalidateKeys });
  const clearWithdrawalConfig = useEntityMutation(PALLET, 'clearWithdrawalConfig', { invalidateKeys });
  const clearTokenWithdrawalConfig = useEntityMutation(PALLET, 'clearTokenWithdrawalConfig', { invalidateKeys });

  // Member withdrawal mutations
  const withdrawNex = useEntityMutation(PALLET, 'withdrawCommission', { invalidateKeys });
  const withdrawToken = useEntityMutation(PALLET, 'withdrawTokenCommission', { invalidateKeys });

  // Entity fund withdrawal mutations
  const withdrawEntityFunds = useEntityMutation(PALLET, 'withdrawEntityFunds', { invalidateKeys });
  const withdrawEntityTokenFunds = useEntityMutation(PALLET, 'withdrawEntityTokenFunds', { invalidateKeys });

  // Archive/maintenance mutations
  const archiveOrderRecords = useEntityMutation(PALLET, 'archiveOrderRecords', { invalidateKeys });

  // Governance/Root mutations
  const setGlobalMinRepurchaseRate = useEntityMutation(PALLET, 'setGlobalMinRepurchaseRate', { invalidateKeys });
  const setGlobalMinTokenRepurchaseRate = useEntityMutation(PALLET, 'setGlobalMinTokenRepurchaseRate', { invalidateKeys });
  const setGlobalMaxCommissionRate = useEntityMutation(PALLET, 'setGlobalMaxCommissionRate', { invalidateKeys });
  const setGlobalMaxTokenCommissionRate = useEntityMutation(PALLET, 'setGlobalMaxTokenCommissionRate', { invalidateKeys });
  const setTokenPlatformFeeRate = useEntityMutation(PALLET, 'setTokenPlatformFeeRate', { invalidateKeys });
  const forceDisableEntityCommission = useEntityMutation(PALLET, 'forceDisableEntityCommission', { invalidateKeys });
  const forceEnableEntityCommission = useEntityMutation(PALLET, 'forceEnableEntityCommission', { invalidateKeys });
  const forceGlobalPause = useEntityMutation(PALLET, 'forceGlobalPause', { invalidateKeys });
  const retryCancelCommission = useEntityMutation(PALLET, 'retryCancelCommission', { invalidateKeys });

  return {
    // Core config
    coreConfig: coreConfigQuery.data ?? null,
    /** @deprecated use coreConfig */
    config: configQuery.data ?? null,

    // Withdrawal configs
    withdrawalConfig: withdrawalConfigQuery.data ?? null,
    tokenWithdrawalConfig: tokenWithdrawalConfigQuery.data ?? null,

    // Entity totals
    shopCommissionTotals: shopCommissionTotalsQuery.data ?? null,
    shopPendingTotal: shopPendingTotalQuery.data ?? BigInt(0),
    tokenPendingTotal: tokenPendingTotalQuery.data ?? BigInt(0),
    unallocatedPool: unallocatedPoolQuery.data ?? BigInt(0),
    unallocatedTokenPool: unallocatedTokenPoolQuery.data ?? BigInt(0),

    // Global config
    globalMinRepurchaseRate: globalMinRepurchaseRateQuery.data ?? 0,
    globalMinTokenRepurchaseRate: globalMinTokenRepurchaseRateQuery.data ?? 0,
    globalMaxCommissionRate: globalMaxCommissionRateQuery.data ?? 0,
    globalMaxTokenCommissionRate: globalMaxTokenCommissionRateQuery.data ?? 0,
    tokenPlatformFeeRate: tokenPlatformFeeRateQuery.data ?? 0,
    globalCommissionPaused: globalCommissionPausedQuery.data ?? false,
    isWithdrawalPaused: withdrawalPausedQuery.data ?? false,
    minWithdrawalInterval: minWithdrawalIntervalQuery.data ?? 0,

    // Order commissions
    orderCommissions: orderCommissionsQuery.data ?? [],

    // Loading/error
    isLoading: coreConfigQuery.isLoading,
    error: coreConfigQuery.error,

    // Member query factories
    useMemberCommission,
    useMemberCommissionStats,
    useMemberTokenCommissionStats,
    useMemberWithdrawalHistory,
    useMemberTokenWithdrawalHistory,
    useMemberLastCredited,
    useMemberLastWithdrawn,
    useMemberTokenLastCredited,
    useMemberTokenLastWithdrawn,

    // Entity owner/admin mutations
    setCommissionRate,
    setCommissionModes,
    enableCommission,
    configureWithdrawal,
    setTokenWithdrawalConfig,
    pauseWithdrawal,
    setCreatorRewardRate,
    setWithdrawalCooldown,
    setMinWithdrawalInterval,
    clearCommissionConfig,
    clearWithdrawalConfig,
    clearTokenWithdrawalConfig,

    // Member withdrawal mutations
    withdrawNex,
    withdrawToken,

    // Entity fund withdrawal
    withdrawEntityFunds,
    withdrawEntityTokenFunds,

    // Archive/maintenance
    archiveOrderRecords,

    // Governance/Root mutations
    setGlobalMinRepurchaseRate,
    setGlobalMinTokenRepurchaseRate,
    setGlobalMaxCommissionRate,
    setGlobalMaxTokenCommissionRate,
    setTokenPlatformFeeRate,
    forceDisableEntityCommission,
    forceEnableEntityCommission,
    forceGlobalPause,
    retryCancelCommission,
  };
}
