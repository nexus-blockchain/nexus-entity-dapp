'use client';

import { useEntityQuery } from './use-entity-query';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';

// ─── Types ───────────────────────────────────────────────

export interface ProtectedFundsBreakdown {
  pendingCommission: bigint;
  shoppingBalance: bigint;
  unallocatedPool: bigint;
  pendingRefund: bigint;
}

export interface FundProtectionRules {
  minTreasuryThreshold: bigint;
  maxSingleSpend: bigint;
  maxDailySpend: bigint;
  dailySpent: bigint;
  dailyRemaining: bigint;
}

export interface FundHealthStatus {
  level: number;        // 0=Critical, 1=Warning, 2=Healthy
  minOperating: bigint;
  warningThreshold: bigint;
  belowThreshold: boolean;
  belowMinOperating: boolean;
}

export interface EntityFundsView {
  treasuryBalance: bigint;
  protectedTotal: bigint;
  available: bigint;
  protected: ProtectedFundsBreakdown;
  protectionConfig: FundProtectionRules | null;
  health: FundHealthStatus;
}

// ─── Helper: parse raw JSON to typed EntityFundsView ─────

function toBigInt(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(v);
  if (typeof v === 'string') return BigInt(v || '0');
  return BigInt(0);
}

function parseEntityFunds(raw: any): EntityFundsView {
  const data = raw?.toJSON?.() ?? raw;

  const prot = data.protected ?? data.protected_ ?? {};
  const pc = data.protection_config ?? data.protectionConfig ?? null;
  const h = data.health ?? {};

  return {
    treasuryBalance: toBigInt(data.treasury_balance ?? data.treasuryBalance),
    protectedTotal: toBigInt(data.protected_total ?? data.protectedTotal),
    available: toBigInt(data.available),
    protected: {
      pendingCommission: toBigInt(prot.pending_commission ?? prot.pendingCommission),
      shoppingBalance: toBigInt(prot.shopping_balance ?? prot.shoppingBalance),
      unallocatedPool: toBigInt(prot.unallocated_pool ?? prot.unallocatedPool),
      pendingRefund: toBigInt(prot.pending_refund ?? prot.pendingRefund),
    },
    protectionConfig: pc ? {
      minTreasuryThreshold: toBigInt(pc.min_treasury_threshold ?? pc.minTreasuryThreshold),
      maxSingleSpend: toBigInt(pc.max_single_spend ?? pc.maxSingleSpend),
      maxDailySpend: toBigInt(pc.max_daily_spend ?? pc.maxDailySpend),
      dailySpent: toBigInt(pc.daily_spent ?? pc.dailySpent),
      dailyRemaining: toBigInt(pc.daily_remaining ?? pc.dailyRemaining),
    } : null,
    health: {
      level: Number(h.level ?? 2),
      minOperating: toBigInt(h.min_operating ?? h.minOperating),
      warningThreshold: toBigInt(h.warning_threshold ?? h.warningThreshold),
      belowThreshold: Boolean(h.below_threshold ?? h.belowThreshold),
      belowMinOperating: Boolean(h.below_min_operating ?? h.belowMinOperating),
    },
  };
}

// ─── Hook ────────────────────────────────────────────────

export function useEntityFunds() {
  const { entityId } = useEntityContext();

  const query = useEntityQuery<EntityFundsView | null>(
    ['entity', entityId, 'funds'],
    async (api) => {
      if (entityId == null) return null;

      const callApi = (api.call as any).entityRegistryApi;
      if (!callApi?.getEntityFunds) return null;

      const raw = await callApi.getEntityFunds(entityId);
      if (!raw || raw.isNone) return null;

      const unwrapped = raw.isSome ? raw.unwrap() : raw;
      return parseEntityFunds(unwrapped);
    },
    { staleTime: STALE_TIMES.entity, enabled: entityId != null },
  );

  return {
    funds: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
