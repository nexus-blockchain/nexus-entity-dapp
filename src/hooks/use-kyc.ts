'use client';

import { useEntityQuery } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import { KycLevel, KycStatus } from '@/lib/types/enums';
import type { EntityKycRequirement, KycRecord } from '@/lib/types/models';

// ─── Parsers ────────────────────────────────────────────────

function decodeCountryCode(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw || null;
  if (Array.isArray(raw)) {
    const chars = raw
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => String.fromCharCode(value));
    return chars.length > 0 ? chars.join('').toUpperCase() : null;
  }
  return null;
}

function parseKycEntries(rawEntries: [any, any][]): KycRecord[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([key, value]) => {
    const obj = value?.toJSON?.() ?? value;
    return {
      entityId: Number(key.args?.[0]?.toString() ?? obj.entityId ?? obj.entity_id ?? 0),
      account: String(key.args?.[1]?.toString() ?? obj.account ?? ''),
      level: Number(obj.level ?? 0) as KycLevel,
      status: String(obj.status ?? 'NotSubmitted') as KycStatus,
      dataCid: String(obj.dataCid ?? obj.data_cid ?? ''),
      countryCode: decodeCountryCode(obj.countryCode ?? obj.country_code),
      riskScore: Number(obj.riskScore ?? obj.risk_score ?? 0),
      submittedAt: Number(obj.submittedAt ?? obj.submitted_at ?? 0),
      expiresAt: obj.expiresAt ?? obj.expires_at ?? null,
    };
  });
}

function defaultRequirement(): EntityKycRequirement {
  return {
    minLevel: KycLevel.None,
    mandatory: false,
    gracePeriod: 0,
    allowHighRiskCountries: true,
    maxRiskScore: 100,
  };
}

function parseEntityRequirement(raw: unknown): EntityKycRequirement {
  if (!raw || (raw as { isNone?: boolean }).isNone) return defaultRequirement();
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return defaultRequirement();
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    minLevel: Number(obj.minLevel ?? obj.min_level ?? 0) as KycLevel,
    mandatory: Boolean(obj.mandatory),
    gracePeriod: Number(obj.gracePeriod ?? obj.grace_period ?? 0),
    allowHighRiskCountries: Boolean(obj.allowHighRiskCountries ?? obj.allow_high_risk_countries ?? true),
    maxRiskScore: Number(obj.maxRiskScore ?? obj.max_risk_score ?? 100),
  };
}

// ─── Hook ───────────────────────────────────────────────────

export function useKyc() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [['entity', entityId, 'kyc']];

  const kycRecordsQuery = useEntityQuery<KycRecord[]>(
    ['entity', entityId, 'kyc'],
    async (api) => {
      const pallet = (api.query as any).entityKyc;
      if (!pallet) return [];
      const storageFn = pallet.kycRecords;
      if (!storageFn?.entries) return [];
      let rawEntries: [any, any][];
      try {
        rawEntries = await storageFn.entries(entityId);
      } catch {
        const allEntries = await storageFn.entries();
        rawEntries = (allEntries as [any, any][]).filter(([key]: [any, any]) => {
          const currentEntityId = Number(key.args?.[0]?.toString() ?? 0);
          return currentEntityId === entityId;
        });
      }
      return parseKycEntries(rawEntries);
    },
    { staleTime: STALE_TIMES.members },
  );

  const requirementQuery = useEntityQuery<EntityKycRequirement>(
    ['entity', entityId, 'kyc', 'requirement'],
    async (api) => {
      const pallet = (api.query as any).entityKyc;
      if (!pallet) return defaultRequirement();
      const fn = pallet.entityRequirements;
      if (!fn) return defaultRequirement();
      const raw = await fn(entityId);
      return parseEntityRequirement(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const submitKyc = useEntityMutation('entityKyc', 'submitKyc', { invalidateKeys });
  const updateKycData = useEntityMutation('entityKyc', 'updateKycData', { invalidateKeys });
  const purgeKycData = useEntityMutation('entityKyc', 'purgeKycData', { invalidateKeys });
  const approveKyc = useEntityMutation('entityKyc', 'approveKyc', { invalidateKeys });
  const rejectKyc = useEntityMutation('entityKyc', 'rejectKyc', { invalidateKeys });
  const revokeKyc = useEntityMutation('entityKyc', 'revokeKyc', { invalidateKeys });
  const setEntityRequirement = useEntityMutation('entityKyc', 'setEntityRequirement', { invalidateKeys });

  return {
    kycRecords: kycRecordsQuery.data ?? [],
    requirement: requirementQuery.data ?? defaultRequirement(),
    isLoading: kycRecordsQuery.isLoading,
    error: kycRecordsQuery.error,
    submitKyc,
    updateKycData,
    purgeKycData,
    approveKyc,
    rejectKyc,
    revokeKyc,
    setEntityRequirement,
  };
}
