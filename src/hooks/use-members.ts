'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import { decodeChainString } from '@/lib/utils/codec';
import { MemberStatus } from '@/lib/types/enums';
import type { MemberData, CustomLevel, LevelSystemData, PendingMemberData, UpgradeRule, UpgradeRuleSystem } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function toPlain(raw: unknown): any | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  return (unwrapped as { toJSON?: () => unknown }).toJSON?.() ?? unwrapped;
}

function parseMemberStatus(obj: Record<string, unknown>): MemberStatus {
  const isBanned = Boolean(obj.is_banned ?? obj.isBanned ?? false);
  if (isBanned) return MemberStatus.Banned;
  const activated = obj.activated;
  return activated === false ? MemberStatus.Frozen : MemberStatus.Active;
}

function parseMemberEntries(rawEntries: [any, any][], orderCountByAccount: Map<string, number>): MemberData[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([key, value]) => {
    const obj = (toPlain(value) ?? {}) as Record<string, unknown>;
    const account = String(key.args?.[1]?.toString() ?? obj.account ?? '');
    const directReferrals = Number(obj.directReferrals ?? obj.direct_referrals ?? 0);
    const indirectReferrals = Number(obj.indirectReferrals ?? obj.indirect_referrals ?? 0);
    return {
      entityId: Number(key.args?.[0]?.toString() ?? obj.entityId ?? obj.entity_id ?? 0),
      account,
      status: parseMemberStatus(obj),
      level: Number(obj.customLevelId ?? obj.custom_level_id ?? obj.level ?? 0),
      effectiveLevel: Number(obj.effectiveLevelId ?? obj.effective_level_id ?? obj.customLevelId ?? obj.custom_level_id ?? obj.level ?? 0),
      referrer: obj.referrer ? String(obj.referrer) : null,
      directReferrals,
      indirectReferrals,
      teamSize: Number(obj.teamSize ?? obj.team_size ?? directReferrals + indirectReferrals),
      joinedAt: Number(obj.joinedAt ?? obj.joined_at ?? 0),
      lastActiveAt: Number(obj.lastActiveAt ?? obj.last_active_at ?? 0),
      totalSpent: BigInt(String(obj.totalSpent ?? obj.total_spent ?? 0)),
      upgradeEligibleSpent: BigInt(String(obj.upgradeEligibleSpent ?? obj.upgrade_eligible_spent ?? obj.totalSpent ?? obj.total_spent ?? 0)),
      orderCount: orderCountByAccount.get(account) ?? Number(obj.orderCount ?? obj.order_count ?? 0),
      banReason: decodeChainString(obj.banReason ?? obj.ban_reason ?? null),
    };
  });
}

function parsePendingMemberEntries(rawEntries: [any, any][]): PendingMemberData[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([key, value]) => {
    const obj = value?.toJSON?.() ?? value;
    // Value is (Option<AccountId>, BlockNumber) tuple or object
    let referrer: string | null = null;
    let appliedAt = 0;
    if (Array.isArray(obj)) {
      referrer = obj[0] ? String(obj[0]) : null;
      appliedAt = Number(obj[1] ?? 0);
    } else if (obj) {
      referrer = obj.referrer ? String(obj.referrer) : (obj[0] ? String(obj[0]) : null);
      appliedAt = Number(obj.appliedAt ?? obj.applied_at ?? obj[1] ?? 0);
    }
    return {
      account: String(key.args?.[1]?.toString() ?? ''),
      referrer,
      appliedAt,
    };
  });
}

function parseCustomLevels(raw: unknown): CustomLevel[] {
  const obj = (toPlain(raw) ?? {}) as Record<string, unknown>;
  const levels = obj.levels ?? obj.customLevels ?? obj.custom_levels ?? [];
  if (!Array.isArray(levels)) return [];
  return levels.map((value, index) => {
    const obj = (value as { toJSON?: () => unknown })?.toJSON?.() ?? value;
    const level = (obj ?? {}) as Record<string, unknown>;
    return {
      id: Number(level.id ?? index + 1),
      name: decodeChainString(level.name),
      threshold: BigInt(String(level.threshold ?? 0)),
      discountRate: Number(level.discountRate ?? level.discount_rate ?? 0),
      commissionBonus: Number(level.commissionBonus ?? level.commission_bonus ?? 0),
      minDirectReferrals: Number(level.minDirectReferrals ?? level.min_direct_referrals ?? 0),
      minTeamSize: Number(level.minTeamSize ?? level.min_team_size ?? 0),
      minIndirectReferrals: Number(level.minIndirectReferrals ?? level.min_indirect_referrals ?? 0),
    };
  });
}

function parseLevelSystem(raw: unknown): LevelSystemData | null {
  const obj = toPlain(raw);
  if (!obj) return null;
  const sysObj = (obj ?? {}) as Record<string, unknown>;
  const upgradeMode = String(
    sysObj.upgradeMode ?? sysObj.upgrade_mode ?? 'AutoUpgrade'
  );
  return {
    levels: parseCustomLevels(raw),
    useCustom: Boolean(sysObj.useCustom ?? sysObj.use_custom ?? false),
    upgradeMode,
  };
}

function parseTrigger(raw: any): { type: string; data: Record<string, number> } {
  if (typeof raw === 'string') return { type: raw, data: {} };
  if (!raw || typeof raw !== 'object') return { type: 'Unknown', data: {} };
  const keys = Object.keys(raw);
  if (keys.length === 0) return { type: 'Unknown', data: {} };
  const type = keys[0];
  const data: Record<string, number> = {};
  const inner = raw[type];
  if (inner && typeof inner === 'object') {
    for (const [k, v] of Object.entries(inner)) {
      data[k] = Number(v);
    }
  }
  return { type, data };
}

function parseUpgradeRule(obj: any): UpgradeRule {
  return {
    id: Number(obj.id ?? 0),
    name: decodeChainString(obj.name),
    trigger: parseTrigger(obj.trigger),
    targetLevelId: Number(obj.targetLevelId ?? obj.target_level_id ?? 0),
    duration: obj.duration != null ? Number(obj.duration) : null,
    enabled: Boolean(obj.enabled),
    priority: Number(obj.priority ?? 0),
    stackable: Boolean(obj.stackable),
    maxTriggers: (obj.maxTriggers ?? obj.max_triggers) != null
      ? Number(obj.maxTriggers ?? obj.max_triggers)
      : null,
    triggerCount: Number(obj.triggerCount ?? obj.trigger_count ?? 0),
  };
}

function parseUpgradeRuleSystem(raw: any): UpgradeRuleSystem {
  const obj = raw?.toJSON?.() ?? raw;
  return {
    rules: (obj.rules ?? []).map((r: any) => parseUpgradeRule(r)),
    nextRuleId: Number(obj.nextRuleId ?? obj.next_rule_id ?? 0),
    enabled: Boolean(obj.enabled),
    conflictStrategy: String(obj.conflictStrategy ?? obj.conflict_strategy ?? 'HighestLevel'),
  };
}

// ─── Hook ───────────────────────────────────────────────────

export function useMembers() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [['entity', entityId, 'members']];

  // ─── Queries ──────────────────────────────────────────

  const membersQuery = useEntityQuery<MemberData[]>(
    ['entity', entityId, 'members'],
    async (api) => {
      if (!hasPallet(api, 'entityMember')) return [];
      const pallet = (api.query as any).entityMember;
      const storageFn = pallet.entityMembers;
      const orderCountFn = pallet.memberOrderCount;
      if (!storageFn?.entries) return [];
      // Try with entityId prefix first; fall back to full scan + client filter
      try {
        const [memberEntries, orderCountEntries] = await Promise.all([
          storageFn.entries(entityId),
          orderCountFn?.entries ? orderCountFn.entries(entityId) : Promise.resolve([]),
        ]);
        const orderCountByAccount = new Map<string, number>(
          (orderCountEntries as [any, any][])
            .map(([key, value]) => [String(key.args?.[1]?.toString() ?? ''), Number(value?.toString() ?? 0)] as const),
        );
        return parseMemberEntries(memberEntries, orderCountByAccount);
      } catch {
        const [memberEntries, orderCountEntries] = await Promise.all([
          storageFn.entries(),
          orderCountFn?.entries ? orderCountFn.entries() : Promise.resolve([]),
        ]);
        const filtered = (memberEntries as [any, any][]).filter(([key, value]) => {
          const obj = toPlain(value) ?? {};
          const eid = Number(key.args?.[0]?.toString() ?? obj.entityId ?? obj.entity_id ?? 0);
          return eid === entityId;
        });
        const orderCountByAccount = new Map<string, number>(
          (orderCountEntries as [any, any][])
            .filter(([key]) => Number(key.args?.[0]?.toString() ?? 0) === entityId)
            .map(([key, value]) => [String(key.args?.[1]?.toString() ?? ''), Number(value?.toString() ?? 0)] as const),
        );
        return parseMemberEntries(filtered, orderCountByAccount);
      }
    },
    { staleTime: STALE_TIMES.members },
  );

  const memberCountQuery = useEntityQuery<number>(
    ['entity', entityId, 'members', 'count'],
    async (api) => {
      if (!hasPallet(api, 'entityMember')) return 0;
      const fn = (api.query as any).entityMember.memberCount;
      if (!fn) return 0;
      const raw = await fn(entityId);
      return Number(raw?.toString() ?? 0);
    },
    { staleTime: STALE_TIMES.members },
  );

  const policyQuery = useEntityQuery<number | null>(
    ['entity', entityId, 'members', 'policy'],
    async (api) => {
      if (!hasPallet(api, 'entityMember')) return null;
      const fn = (api.query as any).entityMember.entityMemberPolicy;
      if (!fn) return null;
      const raw = await fn(entityId);
      return Number(raw?.toString() ?? 0);
    },
    { staleTime: STALE_TIMES.members },
  );

  const pendingQuery = useEntityQuery<PendingMemberData[]>(
    ['entity', entityId, 'members', 'pending'],
    async (api) => {
      if (!hasPallet(api, 'entityMember')) return [];
      const pallet = (api.query as any).entityMember;
      const storageFn = pallet.pendingMembers;
      if (!storageFn?.entries) return [];
      try {
        const raw = await storageFn.entries(entityId);
        return parsePendingMemberEntries(raw);
      } catch {
        const raw = await storageFn.entries();
        const filtered = (raw as [any, any][]).filter(([key]) => {
          return Number(key.args?.[0]?.toString() ?? 0) === entityId;
        });
        return parsePendingMemberEntries(filtered);
      }
    },
    { staleTime: STALE_TIMES.members },
  );

  // Referral tree query factory
  const useReferralTree = (account: string | null) =>
    useEntityQuery<{ directReferrals: string[]; teamSize: number }>(
      ['entity', entityId, 'members', 'referral', account],
      async (api) => {
        if (!hasPallet(api, 'entityMember')) return { directReferrals: [], teamSize: 0 };
        if (!account) return { directReferrals: [], teamSize: 0 };
        const fn = (api.query as any).entityMember.directReferrals;
        if (!fn) return { directReferrals: [], teamSize: 0 };
        const raw = await fn(entityId, account);
        const obj = raw?.toJSON?.() ?? raw;
        const referrals = Array.isArray(obj)
          ? obj.map(String)
          : Array.isArray(obj?.directReferrals ?? obj?.direct_referrals)
            ? (obj.directReferrals ?? obj.direct_referrals).map(String)
            : [];
        return {
          directReferrals: referrals,
          teamSize: Number(obj?.teamSize ?? obj?.team_size ?? referrals.length ?? 0),
        };
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  // Level system query (contains levels + upgradeMode + useCustom)
  const levelSystemQuery = useEntityQuery<LevelSystemData | null>(
    ['entity', entityId, 'members', 'levelSystem'],
    async (api) => {
      if (!hasPallet(api, 'entityMember')) return null;
      const storageFn = (api.query as any).entityMember.entityLevelSystems;
      if (!storageFn) return null;
      const raw = await storageFn(entityId);
      return parseLevelSystem(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  // Level member count query (per-level member counts)
  const levelMemberCountQuery = useEntityQuery<Record<number, number>>(
    ['entity', entityId, 'members', 'levelMemberCount'],
    async (api) => {
      if (!hasPallet(api, 'entityMember')) return {};
      const storageFn = (api.query as any).entityMember.levelMemberCount;
      if (!storageFn?.entries) return {};
      try {
        const raw = await storageFn.entries(entityId);
        const counts: Record<number, number> = {};
        for (const [key, value] of raw as [any, any][]) {
          const levelId = Number(key.args?.[1]?.toString() ?? 0);
          counts[levelId] = Number(value?.toString() ?? 0);
        }
        return counts;
      } catch {
        return {};
      }
    },
    { staleTime: STALE_TIMES.members },
  );

  // Upgrade rule system query (StorageMap: entity_id -> EntityUpgradeRuleSystem)
  const upgradeRuleSystemQuery = useEntityQuery<UpgradeRuleSystem | null>(
    ['entity', entityId, 'members', 'upgradeRules'],
    async (api) => {
      if (!hasPallet(api, 'entityMember')) return null;
      const storageFn = (api.query as any).entityMember.entityUpgradeRules;
      if (!storageFn) return null;
      const raw = await storageFn(entityId);
      if (!raw || raw.isNone) return null;
      return parseUpgradeRuleSystem(raw.unwrap?.() ?? raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  // ─── Mutations ──────────────────────────────────────────
  // NOTE: Most extrinsics take shop_id (not entity_id) as first param.
  // The caller (component) must pass [shopId, ...] to mutate().
  // Exception: cleanup_expired_pending takes entity_id.

  const registerMember = useEntityMutation('entityMember', 'registerMember', { invalidateKeys });
  const freezeMember = useEntityMutation('entityMember', 'deactivateMember', { invalidateKeys });
  const unfreezeMember = useEntityMutation('entityMember', 'activateMember', { invalidateKeys });
  const banMember = useEntityMutation('entityMember', 'banMember', {
    invalidateKeys,
    confirmDialog: { title: '确认封禁', description: '封禁后该会员将无法参与任何实体活动，确定继续？', severity: 'danger' },
  });
  const unbanMember = useEntityMutation('entityMember', 'unbanMember', { invalidateKeys });
  const removeMember = useEntityMutation('entityMember', 'removeMember', {
    invalidateKeys,
    confirmDialog: { title: '确认移除', description: '移除会员不可撤销，确定继续？', severity: 'danger' },
  });

  // --- Approval workflow ---
  const approveMember = useEntityMutation('entityMember', 'approveMember', { invalidateKeys });
  const rejectMember = useEntityMutation('entityMember', 'rejectMember', { invalidateKeys });
  const batchApproveMembers = useEntityMutation('entityMember', 'batchApproveMembers', { invalidateKeys });
  const batchRejectMembers = useEntityMutation('entityMember', 'batchRejectMembers', { invalidateKeys });
  const cancelPendingMember = useEntityMutation('entityMember', 'cancelPendingMember', { invalidateKeys });
  const cleanupExpiredPending = useEntityMutation('entityMember', 'cleanupExpiredPending', { invalidateKeys });

  // --- Policy ---
  const setRegistrationPolicy = useEntityMutation('entityMember', 'setMemberPolicy', { invalidateKeys });

  // --- Level ---
  const initializeLevels = useEntityMutation('entityMember', 'initLevelSystem', { invalidateKeys });
  const addCustomLevel = useEntityMutation('entityMember', 'addCustomLevel', { invalidateKeys });
  const updateCustomLevel = useEntityMutation('entityMember', 'updateCustomLevel', { invalidateKeys });
  const deleteCustomLevel = useEntityMutation('entityMember', 'removeCustomLevel', { invalidateKeys });
  const setUpgradeMode = useEntityMutation('entityMember', 'setUpgradeMode', { invalidateKeys });
  const resetLevelSystem = useEntityMutation('entityMember', 'resetLevelSystem', {
    invalidateKeys,
    confirmDialog: { title: '确认重置', description: '将清除所有等级配置，需所有会员均为基础等级才可操作', severity: 'danger' },
  });

  // --- Upgrade Rule System ---
  const initUpgradeRuleSystem = useEntityMutation('entityMember', 'initUpgradeRuleSystem', { invalidateKeys });
  const addUpgradeRule = useEntityMutation('entityMember', 'addUpgradeRule', { invalidateKeys });
  const updateUpgradeRule = useEntityMutation('entityMember', 'updateUpgradeRule', { invalidateKeys });
  const removeUpgradeRule = useEntityMutation('entityMember', 'removeUpgradeRule', { invalidateKeys });
  const setUpgradeRuleSystemEnabled = useEntityMutation('entityMember', 'setUpgradeRuleSystemEnabled', { invalidateKeys });
  const setConflictStrategy = useEntityMutation('entityMember', 'setConflictStrategy', { invalidateKeys });
  const resetUpgradeRuleSystem = useEntityMutation('entityMember', 'resetUpgradeRuleSystem', {
    invalidateKeys,
    confirmDialog: { title: '确认重置', description: '将清除所有升级规则，此操作不可撤销', severity: 'danger' },
  });

  return {
    // Query data
    members: membersQuery.data ?? [],
    memberCount: memberCountQuery.data ?? 0,
    policy: policyQuery.data ?? 0,
    pendingMembers: pendingQuery.data ?? [],
    levelSystem: levelSystemQuery.data ?? null,
    customLevels: levelSystemQuery.data?.levels ?? [],
    levelMemberCounts: levelMemberCountQuery.data ?? {},
    upgradeRuleSystem: upgradeRuleSystemQuery.data ?? null,
    isLoading: membersQuery.isLoading || memberCountQuery.isLoading,
    error: membersQuery.error ?? memberCountQuery.error,
    // Referral
    useReferralTree,
    // Member mutations
    registerMember,
    freezeMember,
    unfreezeMember,
    banMember,
    unbanMember,
    removeMember,
    // Approval workflow
    approveMember,
    rejectMember,
    batchApproveMembers,
    batchRejectMembers,
    cancelPendingMember,
    cleanupExpiredPending,
    // Policy
    setRegistrationPolicy,
    // Level mutations
    initializeLevels,
    addCustomLevel,
    updateCustomLevel,
    deleteCustomLevel,
    setUpgradeMode,
    resetLevelSystem,
    // Upgrade rule system
    initUpgradeRuleSystem,
    addUpgradeRule,
    updateUpgradeRule,
    removeUpgradeRule,
    setUpgradeRuleSystemEnabled,
    setConflictStrategy,
    resetUpgradeRuleSystem,
  };
}
