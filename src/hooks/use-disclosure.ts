'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import { DisclosureLevel, DisclosureStatus, InsiderRole } from '@/lib/types/enums';

// ─── Interfaces ─────────────────────────────────────────────

interface DisclosureData {
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

interface InsiderData {
  account: string;
  role: InsiderRole;
  addedAt: number;
}

interface AnnouncementData {
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

// ─── Parsers ────────────────────────────────────────────────

function parseDisclosureEntries(rawEntries: [any, any][]): DisclosureData[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([key, value]) => {
    const obj = value?.toJSON?.() ?? value;
    const rawType = obj.disclosureType ?? obj.disclosure_type ?? 'Other';
    return {
      id: Number(key.args?.[1]?.toString() ?? key.args?.[0]?.toString() ?? obj.id ?? 0),
      entityId: Number(obj.entityId ?? obj.entity_id ?? key.args?.[0]?.toString() ?? 0),
      disclosureType: typeof rawType === 'string' ? rawType : (typeof rawType === 'object' && rawType !== null ? Object.keys(rawType)[0] ?? 'Other' : 'Other'),
      contentCid: String(obj.contentCid ?? obj.content_cid ?? ''),
      summaryCid: obj.summaryCid ?? obj.summary_cid ?? null,
      discloser: String(obj.discloser ?? ''),
      disclosedAt: Number(obj.disclosedAt ?? obj.disclosed_at ?? 0),
      status: String(obj.status ?? 'Draft') as DisclosureStatus,
      previousId: obj.previousId ?? obj.previous_id ?? null,
    };
  });
}

function parseInsiderEntries(rawEntries: [any, any][]): InsiderData[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([key, value]) => {
    const obj = value?.toJSON?.() ?? value;
    return {
      account: String(key.args?.[1]?.toString() ?? obj.account ?? ''),
      role: String(obj.role ?? 'Admin') as InsiderRole,
      addedAt: Number(obj.addedAt ?? obj.added_at ?? 0),
    };
  });
}

function parseAnnouncementEntries(rawEntries: [any, any][]): AnnouncementData[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([key, value]) => {
    const obj = value?.toJSON?.() ?? value;
    const rawCat = obj.category ?? 'General';
    return {
      id: Number(key.args?.[1]?.toString() ?? obj.id ?? 0),
      title: String(obj.title ?? ''),
      contentCid: String(obj.contentCid ?? obj.content_cid ?? ''),
      category: typeof rawCat === 'string' ? rawCat : (typeof rawCat === 'object' && rawCat !== null ? Object.keys(rawCat)[0] ?? 'General' : 'General'),
      publisher: String(obj.publisher ?? ''),
      publishedAt: Number(obj.publishedAt ?? obj.published_at ?? 0),
      isPinned: Boolean(obj.isPinned ?? obj.is_pinned),
      expiresAt: obj.expiresAt ?? obj.expires_at ?? null,
      status: typeof obj.status === 'string' ? obj.status : (typeof obj.status === 'object' && obj.status !== null ? Object.keys(obj.status)[0] ?? 'Active' : 'Active'),
    };
  });
}

function parseBlackoutPeriod(raw: unknown): { start: number; end: number } | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return { start: Number(obj.start ?? 0), end: Number(obj.end ?? 0) };
}

// ─── Hook ───────────────────────────────────────────────────

export function useDisclosure() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [['entity', entityId, 'disclosure']];

  // ─── Queries ──────────────────────────────────────────

  const disclosuresQuery = useEntityQuery<DisclosureData[]>(
    ['entity', entityId, 'disclosure'],
    async (api) => {
      if (!hasPallet(api, 'entityDisclosure')) return [];
      const pallet = (api.query as any).entityDisclosure;

      // Prefer indexed lookup: entityDisclosures(entityId) → BoundedVec<u64>
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
                  const rawType = obj.disclosureType ?? obj.disclosure_type ?? 'Other';
                  return {
                    id: disclosureId,
                    entityId: Number(obj.entityId ?? obj.entity_id ?? entityId),
                    disclosureType: typeof rawType === 'string' ? rawType : (typeof rawType === 'object' && rawType !== null ? Object.keys(rawType)[0] ?? 'Other' : 'Other'),
                    contentCid: String(obj.contentCid ?? obj.content_cid ?? ''),
                    summaryCid: obj.summaryCid ?? obj.summary_cid ?? null,
                    discloser: String(obj.discloser ?? ''),
                    disclosedAt: Number(obj.disclosedAt ?? obj.disclosed_at ?? 0),
                    status: String(obj.status ?? 'Draft') as DisclosureStatus,
                    previousId: obj.previousId ?? obj.previous_id ?? null,
                  } as DisclosureData;
                }),
              );
              return results.filter((d): d is DisclosureData => d !== null);
            }
          }
        } catch {
          // fall through to entries scan
        }
      }

      // Fallback: full scan (for chains without entityDisclosures index)
      const storageFn = pallet.disclosures;
      if (!storageFn?.entries) return [];
      const raw = await storageFn.entries();
      const filtered = (raw as [any, any][]).filter(([, value]: [any, any]) => {
        const obj = value?.toJSON?.() ?? value;
        const eid = Number(obj.entityId ?? obj.entity_id ?? 0);
        return eid === entityId;
      });
      return parseDisclosureEntries(filtered);
    },
    { staleTime: STALE_TIMES.members },
  );

  const disclosureLevelQuery = useEntityQuery<DisclosureLevel | null>(
    ['entity', entityId, 'disclosure', 'level'],
    async (api) => {
      if (!hasPallet(api, 'entityDisclosure')) return null;
      const fn = (api.query as any).entityDisclosure.disclosureConfigs;
      if (!fn) return null;
      const raw = await fn(entityId);
      if (!raw || (raw as any).isNone) return null;
      const obj = (raw as any).toJSON?.() ?? raw;
      // Config struct has a 'level' field containing the DisclosureLevel enum
      const level = obj?.level ?? obj;
      return String(typeof level === 'string' ? level : (typeof level === 'object' && level !== null ? Object.keys(level)[0] : 'Basic')) as DisclosureLevel;
    },
    { staleTime: STALE_TIMES.members },
  );

  const insidersQuery = useEntityQuery<InsiderData[]>(
    ['entity', entityId, 'disclosure', 'insiders'],
    async (api) => {
      if (!hasPallet(api, 'entityDisclosure')) return [];
      const pallet = (api.query as any).entityDisclosure;
      const insidersFn = pallet.insiders;
      if (!insidersFn?.entries) return [];
      let raw: [any, any][];
      try {
        raw = await insidersFn.entries(entityId);
      } catch {
        const all = await insidersFn.entries();
        raw = (all as [any, any][]).filter(([key]: [any, any]) => {
          const eid = Number(key.args?.[0]?.toString() ?? 0);
          return eid === entityId;
        });
      }
      return parseInsiderEntries(raw);
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

      // Prefer indexed lookup: entityAnnouncements(entityId) → BoundedVec<u64>
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
                  const rawCat = obj.category ?? 'General';
                  return {
                    id: annId,
                    title: String(obj.title ?? ''),
                    contentCid: String(obj.contentCid ?? obj.content_cid ?? ''),
                    category: typeof rawCat === 'string' ? rawCat : (typeof rawCat === 'object' && rawCat !== null ? Object.keys(rawCat)[0] ?? 'General' : 'General'),
                    publisher: String(obj.publisher ?? ''),
                    publishedAt: Number(obj.publishedAt ?? obj.published_at ?? 0),
                    isPinned: Boolean(obj.isPinned ?? obj.is_pinned),
                    expiresAt: obj.expiresAt ?? obj.expires_at ?? null,
                    status: typeof obj.status === 'string' ? obj.status : (typeof obj.status === 'object' && obj.status !== null ? Object.keys(obj.status)[0] ?? 'Active' : 'Active'),
                  } as AnnouncementData;
                }),
              );
              return results.filter((a): a is AnnouncementData => a !== null);
            }
          }
        } catch {
          // fall through to entries scan
        }
      }

      // Fallback: entries scan
      const announcementsFn = pallet.announcements;
      if (!announcementsFn?.entries) return [];
      let raw: [any, any][];
      try {
        raw = await announcementsFn.entries(entityId);
      } catch {
        const all = await announcementsFn.entries();
        raw = (all as [any, any][]).filter(([key]: [any, any]) => {
          const eid = Number(key.args?.[0]?.toString() ?? 0);
          return eid === entityId;
        });
      }
      return parseAnnouncementEntries(raw);
    },
    { staleTime: STALE_TIMES.members },
  );

  // ─── Mutations ──────────────────────────────────────────

  const createDraftDisclosure = useEntityMutation('entityDisclosure', 'createDraftDisclosure', { invalidateKeys });
  const updateDraft = useEntityMutation('entityDisclosure', 'updateDraft', { invalidateKeys });
  const publishDraft = useEntityMutation('entityDisclosure', 'publishDraft', { invalidateKeys });
  const withdrawDisclosure = useEntityMutation('entityDisclosure', 'withdrawDisclosure', { invalidateKeys });
  const correctDisclosure = useEntityMutation('entityDisclosure', 'correctDisclosure', { invalidateKeys });
  const addInsider = useEntityMutation('entityDisclosure', 'addInsider', { invalidateKeys });
  const updateInsiderRole = useEntityMutation('entityDisclosure', 'updateInsiderRole', { invalidateKeys });
  const removeInsider = useEntityMutation('entityDisclosure', 'removeInsider', { invalidateKeys });
  const configureDisclosure = useEntityMutation('entityDisclosure', 'configureDisclosure', { invalidateKeys });
  const publishAnnouncement = useEntityMutation('entityDisclosure', 'publishAnnouncement', { invalidateKeys });
  const updateAnnouncement = useEntityMutation('entityDisclosure', 'updateAnnouncement', { invalidateKeys });
  const withdrawAnnouncement = useEntityMutation('entityDisclosure', 'withdrawAnnouncement', { invalidateKeys });
  const pinAnnouncement = useEntityMutation('entityDisclosure', 'pinAnnouncement', { invalidateKeys });
  const unpinAnnouncement = useEntityMutation('entityDisclosure', 'unpinAnnouncement', { invalidateKeys });

  return {
    // Query data
    disclosures: disclosuresQuery.data ?? [],
    disclosureLevel: disclosureLevelQuery.data ?? DisclosureLevel.Basic,
    insiders: insidersQuery.data ?? [],
    blackout: blackoutQuery.data ?? null,
    announcements: announcementsQuery.data ?? [],
    isLoading: disclosuresQuery.isLoading,
    error: disclosuresQuery.error,
    // Mutations
    createDraftDisclosure,
    updateDraft,
    publishDraft,
    withdrawDisclosure,
    correctDisclosure,
    addInsider,
    updateInsiderRole,
    removeInsider,
    configureDisclosure,
    publishAnnouncement,
    updateAnnouncement,
    withdrawAnnouncement,
    pinAnnouncement,
    unpinAnnouncement,
  };
}
