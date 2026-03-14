'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import { CommissionPlugin } from '@/lib/types/enums';
import type { CommissionConfig, WithdrawalConfig } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function parseCommissionConfig(raw: unknown): CommissionConfig | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
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

function parseOrderCommissions(rawEntries: [any, any][]): { orderId: number; amount: bigint; plugin: string }[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([key, value]) => {
    const obj = value?.toJSON?.() ?? value;
    return {
      orderId: Number(key.args?.[1]?.toString() ?? obj.orderId ?? obj.order_id ?? 0),
      amount: BigInt(String(obj.amount ?? 0)),
      plugin: String(obj.plugin ?? obj.commissionType ?? obj.commission_type ?? ''),
    };
  });
}

// ─── Hook ───────────────────────────────────────────────────

export function useCommission() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [['entity', entityId, 'commission']];

  // ─── Queries ──────────────────────────────────────────

  const configQuery = useEntityQuery<CommissionConfig | null>(
    ['entity', entityId, 'commission'],
    async (api) => {
      if (!hasPallet(api, 'commissionCore')) return null;
      const fn = (api.query as any).commissionCore.commissionConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseCommissionConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const useMemberCommission = (account: string | null) =>
    useEntityQuery<{ nexEarned: bigint; tokenEarned: bigint }>(
      ['entity', entityId, 'commission', 'member', account],
      async (api) => {
        if (!hasPallet(api, 'commissionCore')) return { nexEarned: BigInt(0), tokenEarned: BigInt(0) };
        if (!account) return { nexEarned: BigInt(0), tokenEarned: BigInt(0) };
        const fn = (api.query as any).commissionCore.memberCommissions;
        if (!fn) return { nexEarned: BigInt(0), tokenEarned: BigInt(0) };
        const raw = await fn(entityId, account);
        return parseMemberCommission(raw);
      },
      { staleTime: STALE_TIMES.members, enabled: !!account },
    );

  const orderCommissionsQuery = useEntityQuery<{ orderId: number; amount: bigint; plugin: string }[]>(
    ['entity', entityId, 'commission', 'orders'],
    async (api) => {
      if (!hasPallet(api, 'commissionCore')) return [];
      const pallet = (api.query as any).commissionCore;
      const storageFn = pallet.orderCommissions;
      if (!storageFn?.entries) return [];
      let raw: [any, any][];
      try {
        raw = await storageFn.entries(entityId);
      } catch {
        const all = await storageFn.entries();
        raw = (all as [any, any][]).filter(([key]: [any, any]) => {
          const eid = Number(key.args?.[0]?.toString() ?? 0);
          return eid === entityId;
        });
      }
      return parseOrderCommissions(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  // ─── Mutations ──────────────────────────────────────────

  const setCommissionRate = useEntityMutation('commissionCore', 'setCommissionRate', { invalidateKeys });
  const setCommissionModes = useEntityMutation('commissionCore', 'setCommissionModes', { invalidateKeys });
  const enableCommission = useEntityMutation('commissionCore', 'enableCommission', { invalidateKeys });
  const configureWithdrawal = useEntityMutation('commissionCore', 'setWithdrawalConfig', { invalidateKeys });
  const pauseWithdrawal = useEntityMutation('commissionCore', 'pauseWithdrawals', { invalidateKeys });
  const withdrawNex = useEntityMutation('commissionCore', 'withdrawCommission', { invalidateKeys });
  const withdrawToken = useEntityMutation('commissionCore', 'withdrawTokenCommission', { invalidateKeys });

  return {
    // Query data
    config: configQuery.data ?? null,
    orderCommissions: orderCommissionsQuery.data ?? [],
    isLoading: configQuery.isLoading,
    error: configQuery.error,
    // Member commission factory
    useMemberCommission,
    // Mutations
    setCommissionRate,
    setCommissionModes,
    enableCommission,
    configureWithdrawal,
    pauseWithdrawal,
    withdrawNex,
    withdrawToken,
  };
}
