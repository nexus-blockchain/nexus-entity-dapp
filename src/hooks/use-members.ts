'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import { decodeChainString } from '@/lib/utils/codec';
import { MemberStatus } from '@/lib/types/enums';
import type { MemberData, CustomLevel } from '@/lib/types/models';
import type { UpgradeTrigger } from '@/lib/types/enums';

// ─── Parsers ────────────────────────────────────────────────

function parseMemberEntries(rawEntries: [any, any][]): MemberData[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([key, value]) => {
    const obj = value?.toJSON?.() ?? value;
    return {
      entityId: Number(key.args?.[0]?.toString() ?? obj.entityId ?? 0),
      account: String(key.args?.[1]?.toString() ?? obj.account ?? ''),
      status: String(obj.status ?? 'Active') as MemberStatus,
      level: Number(obj.level ?? 0),
      referrer: obj.referrer ? String(obj.referrer) : null,
      joinedAt: Number(obj.joinedAt ?? obj.joined_at ?? 0),
      totalSpent: BigInt(String(obj.totalSpent ?? obj.total_spent ?? 0)),
      orderCount: Number(obj.orderCount ?? obj.order_count ?? 0),
    };
  });
}

function parsePendingMembers(rawEntries: [any, any][]): string[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([key]) => String(key.args?.[1]?.toString() ?? ''));
}

function parseCustomLevels(rawEntries: [any, any][]): CustomLevel[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([, value]) => {
    const obj = value?.toJSON?.() ?? value;
    return {
      name: decodeChainString(obj.name),
      threshold: BigInt(String(obj.threshold ?? 0)),
      discountRate: Number(obj.discountRate ?? obj.discount_rate ?? 0),
      commissionBonus: Number(obj.commissionBonus ?? obj.commission_bonus ?? 0),
    };
  });
}

function parseUpgradeTriggers(rawEntries: [any, any][]): { trigger: UpgradeTrigger; value: bigint }[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([key, value]) => {
    const trigger = String(key.args?.[1]?.toString() ?? '') as UpgradeTrigger;
    const val = (value as any)?.toJSON?.() ?? value;
    return { trigger, value: BigInt(String(val ?? 0)) };
  });
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
      const storageFn = pallet.members ?? pallet.memberOf ?? pallet.memberList;
      if (!storageFn?.entries) return [];
      // Try with entityId prefix first; fall back to full scan + client filter
      try {
        const raw = await storageFn.entries(entityId);
        return parseMemberEntries(raw);
      } catch {
        const raw = await storageFn.entries();
        const filtered = (raw as [any, any][]).filter(([key, value]) => {
          const obj = value?.toJSON?.() ?? value;
          const eid = Number(key.args?.[0]?.toString() ?? obj.entityId ?? obj.entity_id ?? 0);
          return eid === entityId;
        });
        return parseMemberEntries(filtered);
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
      const fn = (api.query as any).entityMember.registrationPolicy;
      if (!fn) return null;
      const raw = await fn(entityId);
      return Number(raw?.toString() ?? 0);
    },
    { staleTime: STALE_TIMES.members },
  );

  const pendingQuery = useEntityQuery<string[]>(
    ['entity', entityId, 'members', 'pending'],
    async (api) => {
      if (!hasPallet(api, 'entityMember')) return [];
      const pallet = (api.query as any).entityMember;
      const storageFn = pallet.pendingMembers ?? pallet.pendingApprovals;
      if (!storageFn?.entries) return [];
      try {
        const raw = await storageFn.entries(entityId);
        return parsePendingMembers(raw);
      } catch {
        const raw = await storageFn.entries();
        const filtered = (raw as [any, any][]).filter(([key]) => {
          return Number(key.args?.[0]?.toString() ?? 0) === entityId;
        });
        return parsePendingMembers(filtered);
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
        const fn = (api.query as any).entityMember.referralTree;
        if (!fn) return { directReferrals: [], teamSize: 0 };
        const raw = await fn(entityId, account);
        const obj = raw?.toJSON?.() ?? raw;
        return {
          directReferrals: Array.isArray(obj?.directReferrals ?? obj?.direct_referrals)
            ? (obj.directReferrals ?? obj.direct_referrals).map(String)
            : [],
          teamSize: Number(obj?.teamSize ?? obj?.team_size ?? 0),
        };
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  // Custom levels query
  const customLevelsQuery = useEntityQuery<CustomLevel[]>(
    ['entity', entityId, 'members', 'levels'],
    async (api) => {
      if (!hasPallet(api, 'entityMember')) return [];
      const pallet = (api.query as any).entityMember;
      const storageFn = pallet.customLevels ?? pallet.levels;
      if (!storageFn?.entries) return [];
      try {
        const raw = await storageFn.entries(entityId);
        return parseCustomLevels(raw);
      } catch {
        const raw = await storageFn.entries();
        const filtered = (raw as [any, any][]).filter(([key]) => {
          return Number(key.args?.[0]?.toString() ?? 0) === entityId;
        });
        return parseCustomLevels(filtered);
      }
    },
    { staleTime: STALE_TIMES.members },
  );

  // Upgrade triggers query
  const upgradeTriggersQuery = useEntityQuery<{ trigger: UpgradeTrigger; value: bigint }[]>(
    ['entity', entityId, 'members', 'triggers'],
    async (api) => {
      if (!hasPallet(api, 'entityMember')) return [];
      const pallet = (api.query as any).entityMember;
      const storageFn = pallet.upgradeTriggers ?? pallet.levelTriggers;
      if (!storageFn?.entries) return [];
      try {
        const raw = await storageFn.entries(entityId);
        return parseUpgradeTriggers(raw);
      } catch {
        const raw = await storageFn.entries();
        const filtered = (raw as [any, any][]).filter(([key]) => {
          return Number(key.args?.[0]?.toString() ?? 0) === entityId;
        });
        return parseUpgradeTriggers(filtered);
      }
    },
    { staleTime: STALE_TIMES.members },
  );

  // ─── Mutations ──────────────────────────────────────────

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
  const approveMember = useEntityMutation('entityMember', 'approveMember', { invalidateKeys });
  const rejectMember = useEntityMutation('entityMember', 'rejectMember', { invalidateKeys });
  const setRegistrationPolicy = useEntityMutation('entityMember', 'setMemberPolicy', { invalidateKeys });

  // Level mutations
  const initializeLevels = useEntityMutation('entityMember', 'initLevelSystem', { invalidateKeys });
  const addCustomLevel = useEntityMutation('entityMember', 'addCustomLevel', { invalidateKeys });
  const updateCustomLevel = useEntityMutation('entityMember', 'updateCustomLevel', { invalidateKeys });
  const deleteCustomLevel = useEntityMutation('entityMember', 'removeCustomLevel', { invalidateKeys });
  const setUpgradeTrigger = useEntityMutation('entityMember', 'setUpgradeMode', { invalidateKeys });

  return {
    // Query data
    members: membersQuery.data ?? [],
    memberCount: memberCountQuery.data ?? 0,
    policy: policyQuery.data ?? 0,
    pendingMembers: pendingQuery.data ?? [],
    customLevels: customLevelsQuery.data ?? [],
    upgradeTriggers: upgradeTriggersQuery.data ?? [],
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
    approveMember,
    rejectMember,
    setRegistrationPolicy,
    // Level mutations
    initializeLevels,
    addCustomLevel,
    updateCustomLevel,
    deleteCustomLevel,
    setUpgradeTrigger,
  };
}
