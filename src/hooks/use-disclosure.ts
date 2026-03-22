'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import {
  DisclosureLevel, DisclosureStatus, InsiderRole, AuditStatus,
  PenaltyLevel, InsiderTransactionType, ViolationReportStatus,
} from '@/lib/types/enums';

// ─── Interfaces ─────────────────────────────────────────────

export interface DisclosureData {
  id: number;
  entityId: number;
  disclosureType: string;
  contentCid: string;
  summaryCid: string | null;
  discloser: string;
  disclosedAt: number;
  status: DisclosureStatus;
  previousId: number | null;
}

export interface DisclosureConfigData {
  level: DisclosureLevel;
  insiderTradingControl: boolean;
  blackoutPeriodAfter: number;
  nextRequiredDisclosure: number;
  lastDisclosure: number;
  violationCount: number;
}

export interface InsiderData {
  account: string;
  role: InsiderRole;
  addedAt: number;
}

export interface AnnouncementData {
  id: number;
  title: string;
  contentCid: string;
  category: string;
  publisher: string;
  publishedAt: number;
  isPinned: boolean;
  expiresAt: number | null;
  status: string;
}

export interface ApprovalConfigData {
  requiredApprovals: number;
  allowedRoles: number;
}

export interface FiscalYearData {
  yearStartBlock: number;
  yearLength: number;
}

export interface DisclosureMetadataData {
  periodStart: number | null;
  periodEnd: number | null;
  auditStatus: AuditStatus;
  isEmergency: boolean;
}

export interface InsiderTransactionData {
  account: string;
  transactionType: InsiderTransactionType;
  tokenAmount: string;
  reportedAt: number;
  transactionBlock: number;
}

export interface ViolationReportData {
  id: number;
  entityId: number;
  violationType: string;
  reporter: string;
  reportedAt: number;
  status: ViolationReportStatus;
}

export interface InsiderRoleChangeData {
  oldRole: InsiderRole | null;
  newRole: InsiderRole;
  changedAt: number;
}

// ─── Parsers ────────────────────────────────────────────────

function parseEnumVariant(raw: unknown, fallback: string): string {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null) return Object.keys(raw)[0] ?? fallback;
  return fallback;
}

function parseDisclosureConfig(raw: unknown): DisclosureConfigData | null {
  if (!raw || (raw as any).isNone) return null;
  const unwrapped = (raw as any).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    level: parseEnumVariant(obj.level, 'Basic') as DisclosureLevel,
    insiderTradingControl: Boolean(obj.insiderTradingControl ?? obj.insider_trading_control),
    blackoutPeriodAfter: Number(obj.blackoutPeriodAfter ?? obj.blackout_period_after ?? 0),
    nextRequiredDisclosure: Number(obj.nextRequiredDisclosure ?? obj.next_required_disclosure ?? 0),
    lastDisclosure: Number(obj.lastDisclosure ?? obj.last_disclosure ?? 0),
    violationCount: Number(obj.violationCount ?? obj.violation_count ?? 0),
  };
}

function parseApprovalConfig(raw: unknown): ApprovalConfigData | null {
  if (!raw || (raw as any).isNone) return null;
  const unwrapped = (raw as any).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    requiredApprovals: Number(obj.requiredApprovals ?? obj.required_approvals ?? 0),
    allowedRoles: Number(obj.allowedRoles ?? obj.allowed_roles ?? 0),
  };
}

function parseFiscalYear(raw: unknown): FiscalYearData | null {
  if (!raw || (raw as any).isNone) return null;
  const unwrapped = (raw as any).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    yearStartBlock: Number(obj.yearStartBlock ?? obj.year_start_block ?? 0),
    yearLength: Number(obj.yearLength ?? obj.year_length ?? 0),
  };
}

function parseDisclosureMetadata(raw: unknown): DisclosureMetadataData | null {
  if (!raw || (raw as any).isNone) return null;
  const unwrapped = (raw as any).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    periodStart: obj.periodStart ?? obj.period_start ?? null,
    periodEnd: obj.periodEnd ?? obj.period_end ?? null,
    auditStatus: parseEnumVariant(obj.auditStatus ?? obj.audit_status, 'NotRequired') as AuditStatus,
    isEmergency: Boolean(obj.isEmergency ?? obj.is_emergency),
  };
}

function parseBlackoutPeriod(raw: unknown): { start: number; end: number } | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  if (Array.isArray(obj)) return { start: Number(obj[0] ?? 0), end: Number(obj[1] ?? 0) };
  return { start: Number(obj.start ?? obj[0] ?? 0), end: Number(obj.end ?? obj[1] ?? 0) };
}

// ─── Hook ───────────────────────────────────────────────────

export function useDisclosure() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [['entity', entityId, 'disclosure']];

  // ─── Queries ──────────────────────────────────────────

  const disclosuresQuery = useEntityQuery<DisclosureData[]>(
    ['entity', entityId, 'disclosure', 'list'],
    async (api) => {
      if (!hasPallet(api, 'entityDisclosure')) return [];
      const pallet = (api.query as any).entityDisclosure;

      const idsFn = pallet.entityDisclosures;
      if (idsFn) {
        try {
          const idsRaw = await idsFn(entityId);
          const ids = idsRaw?.toJSON?.() ?? idsRaw;
          if (Array.isArray(ids) && ids.length > 0) {
            const disclosureFn = pallet.disclosures;
            if (disclosureFn) {
              const results = await Promise.all(
                ids.map(Number).map(async (disclosureId: number) => {
                  const raw = await disclosureFn(disclosureId);
                  if (!raw || (raw as any).isNone) return null;
                  const obj = (raw as any).toJSON?.() ?? raw;
                  return {
                    id: disclosureId,
                    entityId: Number(obj.entityId ?? obj.entity_id ?? entityId),
                    disclosureType: parseEnumVariant(obj.disclosureType ?? obj.disclosure_type, 'Other'),
                    contentCid: String(obj.contentCid ?? obj.content_cid ?? ''),
                    summaryCid: obj.summaryCid ?? obj.summary_cid ?? null,
                    discloser: String(obj.discloser ?? ''),
                    disclosedAt: Number(obj.disclosedAt ?? obj.disclosed_at ?? 0),
                    status: parseEnumVariant(obj.status, 'Draft') as DisclosureStatus,
                    previousId: obj.previousId ?? obj.previous_id ?? null,
                  } as DisclosureData;
                }),
              );
              return results.filter((d): d is DisclosureData => d !== null);
            }
          }
        } catch {
          // fall through
        }
      }

      const storageFn = pallet.disclosures;
      if (!storageFn?.entries) return [];
      const raw = await storageFn.entries();
      return (raw as [any, any][])
        .filter(([, value]: [any, any]) => {
          const obj = value?.toJSON?.() ?? value;
          return Number(obj.entityId ?? obj.entity_id ?? 0) === entityId;
        })
        .map(([key, value]: [any, any]) => {
          const obj = value?.toJSON?.() ?? value;
          return {
            id: Number(key.args?.[0]?.toString() ?? obj.id ?? 0),
            entityId: Number(obj.entityId ?? obj.entity_id ?? entityId),
            disclosureType: parseEnumVariant(obj.disclosureType ?? obj.disclosure_type, 'Other'),
            contentCid: String(obj.contentCid ?? obj.content_cid ?? ''),
            summaryCid: obj.summaryCid ?? obj.summary_cid ?? null,
            discloser: String(obj.discloser ?? ''),
            disclosedAt: Number(obj.disclosedAt ?? obj.disclosed_at ?? 0),
            status: parseEnumVariant(obj.status, 'Draft') as DisclosureStatus,
            previousId: obj.previousId ?? obj.previous_id ?? null,
          } as DisclosureData;
        });
    },
    { staleTime: STALE_TIMES.members },
  );

  const configQuery = useEntityQuery<DisclosureConfigData | null>(
    ['entity', entityId, 'disclosure', 'config'],
    async (api) => {
      if (!hasPallet(api, 'entityDisclosure')) return null;
      const fn = (api.query as any).entityDisclosure.disclosureConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseDisclosureConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const insidersQuery = useEntityQuery<InsiderData[]>(
    ['entity', entityId, 'disclosure', 'insiders'],
    async (api) => {
      if (!hasPallet(api, 'entityDisclosure')) return [];
      const fn = (api.query as any).entityDisclosure.insiders;
      if (!fn) return [];
      const raw = await fn(entityId);
      if (!raw) return [];
      const arr = raw?.toJSON?.() ?? raw;
      if (!Array.isArray(arr)) return [];
      return arr.map((item: any) => ({
        account: String(item.account ?? ''),
        role: parseEnumVariant(item.role, 'Admin') as InsiderRole,
        addedAt: Number(item.addedAt ?? item.added_at ?? 0),
      }));
    },
    { staleTime: STALE_TIMES.members },
  );

  const blackoutQuery = useEntityQuery<{ start: number; end: number } | null>(
    ['entity', entityId, 'disclosure', 'blackout'],
    async (api) => {
      if (!hasPallet(api, 'entityDisclosure')) return null;
      const fn = (api.query as any).entityDisclosure.blackoutPeriods;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseBlackoutPeriod(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const announcementsQuery = useEntityQuery<AnnouncementData[]>(
    ['entity', entityId, 'disclosure', 'announcements'],
    async (api) => {
      if (!hasPallet(api, 'entityDisclosure')) return [];
      const pallet = (api.query as any).entityDisclosure;

      const idsFn = pallet.entityAnnouncements;
      if (idsFn) {
        try {
          const idsRaw = await idsFn(entityId);
          const ids = idsRaw?.toJSON?.() ?? idsRaw;
          if (Array.isArray(ids) && ids.length > 0) {
            const announcementFn = pallet.announcements;
            if (announcementFn) {
              const results = await Promise.all(
                ids.map(Number).map(async (annId: number) => {
                  const raw = await announcementFn(annId);
                  if (!raw || (raw as any).isNone) return null;
                  const obj = (raw as any).toJSON?.() ?? raw;
                  return {
                    id: annId,
                    title: String(obj.title ?? ''),
                    contentCid: String(obj.contentCid ?? obj.content_cid ?? ''),
                    category: parseEnumVariant(obj.category, 'General'),
                    publisher: String(obj.publisher ?? ''),
                    publishedAt: Number(obj.publishedAt ?? obj.published_at ?? 0),
                    isPinned: Boolean(obj.isPinned ?? obj.is_pinned),
                    expiresAt: obj.expiresAt ?? obj.expires_at ?? null,
                    status: parseEnumVariant(obj.status, 'Active'),
                  } as AnnouncementData;
                }),
              );
              return results.filter((a): a is AnnouncementData => a !== null);
            }
          }
        } catch {
          // fall through
        }
      }

      const announcementsFn = pallet.announcements;
      if (!announcementsFn?.entries) return [];
      const raw = await announcementsFn.entries();
      return (raw as [any, any][])
        .filter(([, value]: [any, any]) => {
          const obj = value?.toJSON?.() ?? value;
          return Number(obj.entityId ?? obj.entity_id ?? 0) === entityId;
        })
        .map(([key, value]: [any, any]) => {
          const obj = value?.toJSON?.() ?? value;
          return {
            id: Number(key.args?.[0]?.toString() ?? obj.id ?? 0),
            title: String(obj.title ?? ''),
            contentCid: String(obj.contentCid ?? obj.content_cid ?? ''),
            category: parseEnumVariant(obj.category, 'General'),
            publisher: String(obj.publisher ?? ''),
            publishedAt: Number(obj.publishedAt ?? obj.published_at ?? 0),
            isPinned: Boolean(obj.isPinned ?? obj.is_pinned),
            expiresAt: obj.expiresAt ?? obj.expires_at ?? null,
            status: parseEnumVariant(obj.status, 'Active'),
          } as AnnouncementData;
        });
    },
    { staleTime: STALE_TIMES.members },
  );

  const approvalConfigQuery = useEntityQuery<ApprovalConfigData | null>(
    ['entity', entityId, 'disclosure', 'approvalConfig'],
    async (api) => {
      if (!hasPallet(api, 'entityDisclosure')) return null;
      const fn = (api.query as any).entityDisclosure.approvalConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseApprovalConfig(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const fiscalYearQuery = useEntityQuery<FiscalYearData | null>(
    ['entity', entityId, 'disclosure', 'fiscalYear'],
    async (api) => {
      if (!hasPallet(api, 'entityDisclosure')) return null;
      const fn = (api.query as any).entityDisclosure.fiscalYearConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      return parseFiscalYear(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  const penaltyQuery = useEntityQuery<PenaltyLevel>(
    ['entity', entityId, 'disclosure', 'penalty'],
    async (api) => {
      if (!hasPallet(api, 'entityDisclosure')) return PenaltyLevel.None;
      const fn = (api.query as any).entityDisclosure.entityPenalties;
      if (!fn) return PenaltyLevel.None;
      const raw = await fn(entityId);
      if (!raw) return PenaltyLevel.None;
      const val = raw?.toJSON?.() ?? raw;
      return parseEnumVariant(val, 'None') as PenaltyLevel;
    },
    { staleTime: STALE_TIMES.members },
  );

  const highRiskQuery = useEntityQuery<boolean>(
    ['entity', entityId, 'disclosure', 'highRisk'],
    async (api) => {
      if (!hasPallet(api, 'entityDisclosure')) return false;
      const fn = (api.query as any).entityDisclosure.highRiskEntities;
      if (!fn) return false;
      const raw = await fn(entityId);
      const val = raw?.toJSON?.() ?? raw;
      return Boolean(val);
    },
    { staleTime: STALE_TIMES.members },
  );

  const insiderTransactionsQuery = useEntityQuery<InsiderTransactionData[]>(
    ['entity', entityId, 'disclosure', 'insiderTransactions'],
    async (api) => {
      if (!hasPallet(api, 'entityDisclosure')) return [];
      const fn = (api.query as any).entityDisclosure.insiderTransactionReports;
      if (!fn?.entries) return [];
      let raw: [any, any][];
      try {
        raw = await fn.entries(entityId);
      } catch {
        return [];
      }
      const results: InsiderTransactionData[] = [];
      for (const [key, value] of raw) {
        const account = String(key.args?.[1]?.toString() ?? '');
        const arr = value?.toJSON?.() ?? value;
        if (!Array.isArray(arr)) continue;
        for (const item of arr) {
          results.push({
            account,
            transactionType: parseEnumVariant(item.transactionType ?? item.transaction_type, 'Buy') as InsiderTransactionType,
            tokenAmount: String(item.tokenAmount ?? item.token_amount ?? '0'),
            reportedAt: Number(item.reportedAt ?? item.reported_at ?? 0),
            transactionBlock: Number(item.transactionBlock ?? item.transaction_block ?? 0),
          });
        }
      }
      return results.sort((a, b) => b.reportedAt - a.reportedAt);
    },
    { staleTime: STALE_TIMES.members },
  );

  // ─── Mutations ──────────────────────────────────────────

  // Core disclosure
  const createDraftDisclosure = useEntityMutation('entityDisclosure', 'createDraftDisclosure', { invalidateKeys });
  const updateDraft = useEntityMutation('entityDisclosure', 'updateDraft', { invalidateKeys });
  const deleteDraft = useEntityMutation('entityDisclosure', 'deleteDraft', { invalidateKeys });
  const publishDraft = useEntityMutation('entityDisclosure', 'publishDraft', { invalidateKeys });
  const withdrawDisclosure = useEntityMutation('entityDisclosure', 'withdrawDisclosure', { invalidateKeys });
  const correctDisclosure = useEntityMutation('entityDisclosure', 'correctDisclosure', { invalidateKeys });
  const configureDisclosure = useEntityMutation('entityDisclosure', 'configureDisclosure', { invalidateKeys });

  // Insider management
  const addInsider = useEntityMutation('entityDisclosure', 'addInsider', { invalidateKeys });
  const updateInsiderRole = useEntityMutation('entityDisclosure', 'updateInsiderRole', { invalidateKeys });
  const removeInsider = useEntityMutation('entityDisclosure', 'removeInsider', { invalidateKeys });
  const batchAddInsiders = useEntityMutation('entityDisclosure', 'batchAddInsiders', { invalidateKeys });
  const batchRemoveInsiders = useEntityMutation('entityDisclosure', 'batchRemoveInsiders', { invalidateKeys });

  // Blackout
  const startBlackout = useEntityMutation('entityDisclosure', 'startBlackout', { invalidateKeys });
  const endBlackout = useEntityMutation('entityDisclosure', 'endBlackout', { invalidateKeys });
  const expireBlackout = useEntityMutation('entityDisclosure', 'expireBlackout', { invalidateKeys });

  // Announcements
  const publishAnnouncement = useEntityMutation('entityDisclosure', 'publishAnnouncement', { invalidateKeys });
  const updateAnnouncement = useEntityMutation('entityDisclosure', 'updateAnnouncement', { invalidateKeys });
  const withdrawAnnouncement = useEntityMutation('entityDisclosure', 'withdrawAnnouncement', { invalidateKeys });
  const pinAnnouncement = useEntityMutation('entityDisclosure', 'pinAnnouncement', { invalidateKeys });
  const unpinAnnouncement = useEntityMutation('entityDisclosure', 'unpinAnnouncement', { invalidateKeys });
  const expireAnnouncement = useEntityMutation('entityDisclosure', 'expireAnnouncement', { invalidateKeys });

  // v0.6: Approval workflow
  const configureApprovalRequirements = useEntityMutation('entityDisclosure', 'configureApprovalRequirements', { invalidateKeys });
  const approveDisclosure = useEntityMutation('entityDisclosure', 'approveDisclosure', { invalidateKeys });
  const rejectDisclosure = useEntityMutation('entityDisclosure', 'rejectDisclosure', { invalidateKeys });

  // v0.6: Emergency disclosure
  const publishEmergencyDisclosure = useEntityMutation('entityDisclosure', 'publishEmergencyDisclosure', { invalidateKeys });

  // v0.6: Insider transactions
  const reportInsiderTransaction = useEntityMutation('entityDisclosure', 'reportInsiderTransaction', { invalidateKeys });

  // v0.6: Fiscal year & metadata
  const configureFiscalYear = useEntityMutation('entityDisclosure', 'configureFiscalYear', { invalidateKeys });
  const setDisclosureMetadata = useEntityMutation('entityDisclosure', 'setDisclosureMetadata', { invalidateKeys });
  const auditDisclosure = useEntityMutation('entityDisclosure', 'auditDisclosure', { invalidateKeys });

  // v0.6: Violation & compliance
  const reportDisclosureViolation = useEntityMutation('entityDisclosure', 'reportDisclosureViolation', { invalidateKeys });
  const resetViolationCount = useEntityMutation('entityDisclosure', 'resetViolationCount', { invalidateKeys });

  // Cleanup
  const cleanupDisclosureHistory = useEntityMutation('entityDisclosure', 'cleanupDisclosureHistory', { invalidateKeys });
  const cleanupAnnouncementHistory = useEntityMutation('entityDisclosure', 'cleanupAnnouncementHistory', { invalidateKeys });
  const cleanupExpiredCooldowns = useEntityMutation('entityDisclosure', 'cleanupExpiredCooldowns', { invalidateKeys });

  return {
    // Query data
    disclosures: disclosuresQuery.data ?? [],
    config: configQuery.data ?? null,
    disclosureLevel: configQuery.data?.level ?? DisclosureLevel.Basic,
    insiders: insidersQuery.data ?? [],
    blackout: blackoutQuery.data ?? null,
    announcements: announcementsQuery.data ?? [],
    approvalConfig: approvalConfigQuery.data ?? null,
    fiscalYear: fiscalYearQuery.data ?? null,
    penalty: penaltyQuery.data ?? PenaltyLevel.None,
    highRisk: highRiskQuery.data ?? false,
    insiderTransactions: insiderTransactionsQuery.data ?? [],
    isLoading: disclosuresQuery.isLoading,
    error: disclosuresQuery.error,

    // Core disclosure mutations
    createDraftDisclosure,
    updateDraft,
    deleteDraft,
    publishDraft,
    withdrawDisclosure,
    correctDisclosure,
    configureDisclosure,

    // Insider mutations
    addInsider,
    updateInsiderRole,
    removeInsider,
    batchAddInsiders,
    batchRemoveInsiders,

    // Blackout mutations
    startBlackout,
    endBlackout,
    expireBlackout,

    // Announcement mutations
    publishAnnouncement,
    updateAnnouncement,
    withdrawAnnouncement,
    pinAnnouncement,
    unpinAnnouncement,
    expireAnnouncement,

    // Approval workflow mutations
    configureApprovalRequirements,
    approveDisclosure,
    rejectDisclosure,

    // Emergency disclosure
    publishEmergencyDisclosure,

    // Insider transaction mutations
    reportInsiderTransaction,

    // Fiscal year & metadata mutations
    configureFiscalYear,
    setDisclosureMetadata,
    auditDisclosure,

    // Violation & compliance mutations
    reportDisclosureViolation,
    resetViolationCount,

    // Cleanup mutations
    cleanupDisclosureHistory,
    cleanupAnnouncementHistory,
    cleanupExpiredCooldowns,
  };
}
