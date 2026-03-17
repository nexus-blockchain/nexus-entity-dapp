'use client';

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import type { EntityContext, EntityData } from '@/lib/types/models';
import { EntityStatus, EntityType, GovernanceMode } from '@/lib/types/enums';
import { useEntityQuery } from '@/hooks/use-entity-query';
import { STALE_TIMES } from '@/lib/chain/constants';
import { decodeChainString, decodeOptionalChainString, entityTreasuryAddress } from '@/lib/utils/codec';
import { useWalletStore } from '@/stores/wallet-store';
import { useEntityDAppStore } from '@/stores/entity-dapp-store';

const EntityCtx = createContext<EntityContext | null>(null);

function parseEntityData(raw: unknown): EntityData | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = unwrapped as Record<string, unknown>;
  return {
    id: Number(obj.id ?? 0),
    owner: String(obj.owner ?? ''),
    name: decodeChainString(obj.name),
    logoCid: decodeOptionalChainString(obj.logoCid),
    descriptionCid: decodeOptionalChainString(obj.descriptionCid),
    metadataUri: decodeOptionalChainString(obj.metadataUri),
    contactCid: decodeOptionalChainString(obj.contactCid),
    status: String(obj.status ?? 'Active') as EntityStatus,
    entityType: String(obj.entityType ?? 'Merchant') as EntityType,
    governanceMode: String(obj.governanceMode ?? 'None') as GovernanceMode,
    verified: Boolean(obj.verified),
    governanceLocked: Boolean(obj.governanceLocked),
    fundBalance: BigInt(String(obj.fundBalance ?? 0)),
    createdAt: Number(obj.createdAt ?? 0),
  };
}

function parsePermissions(raw: unknown): number {
  if (!raw || (raw as { isNone?: boolean }).isNone) return 0;
  const unwrapped = (raw as { unwrapOr?: (d: number) => unknown }).unwrapOr?.(0) ?? raw;
  return Number(unwrapped);
}

interface EntityProviderProps {
  entityId: number;
  children: React.ReactNode;
}

export function EntityProvider({ entityId, children }: EntityProviderProps) {
  const walletAddress = useWalletStore((s) => s.address);
  const setEntityContext = useEntityDAppStore((s) => s.setEntityContext);
  const clearEntityContext = useEntityDAppStore((s) => s.clearEntityContext);

  // Query entity basic info
  const {
    data: entity,
    isLoading: entityLoading,
    error: entityError,
  } = useEntityQuery<EntityData | null>(
    ['entity', entityId],
    async (api) => {
      const raw = await api.query.entityRegistry.entities(entityId);
      const entity = parseEntityData(raw);
      if (!entity) return null;
      // Fund balance lives in treasury sub-account, not in Entity struct
      try {
        const treasuryAddr = entityTreasuryAddress(entityId);
        const acctInfo = await api.query.system.account(treasuryAddr);
        const data = (acctInfo as any)?.data;
        entity.fundBalance = BigInt(String(data?.free ?? 0));
      } catch {
        // Non-critical, leave as 0
      }
      return entity;
    },
    { staleTime: STALE_TIMES.entity },
  );

  // Query current user's admin permissions
  // Chain no longer has separate entityAdmins storage; admins are embedded in the Entity struct
  const {
    data: permissions,
    isLoading: permissionsLoading,
  } = useEntityQuery<number>(
    ['entity', entityId, 'permissions', walletAddress],
    async (api) => {
      if (!walletAddress) return 0;
      const pallet = (api.query as any).entityRegistry;
      // Derive from entities struct: admins field is Vec<(AccountId32, u32)>
      const entityRaw = await pallet.entities(entityId);
      const ent = entityRaw?.unwrapOr?.(null) ?? entityRaw;
      if (!ent) return 0;
      const obj = ent.toJSON?.() ?? ent;
      const admins = obj?.admins ?? [];
      if (Array.isArray(admins)) {
        for (const entry of admins) {
          const addr = Array.isArray(entry) ? String(entry[0]) : String(entry?.account ?? entry?.[0] ?? '');
          const bits = Array.isArray(entry) ? Number(entry[1]) : Number(entry?.permission ?? entry?.[1] ?? 0);
          if (addr === walletAddress) return bits;
        }
      }
      return 0;
    },
    {
      staleTime: STALE_TIMES.entity,
      enabled: !!walletAddress,
    },
  );

  const isOwner = useMemo(
    () => !!walletAddress && !!entity && entity.owner === walletAddress,
    [walletAddress, entity],
  );

  const isReadOnly = useMemo(() => {
    if (!entity) return false;
    return entity.status === EntityStatus.PendingClose || entity.status === EntityStatus.Closed;
  }, [entity]);

  const isSuspended = useMemo(() => {
    if (!entity) return false;
    return entity.status === EntityStatus.Suspended || entity.status === EntityStatus.Banned;
  }, [entity]);

  // Sync to Zustand store
  useEffect(() => {
    if (entity) {
      setEntityContext(entity, permissions ?? 0, isOwner);
    }
    return () => {
      clearEntityContext();
    };
  }, [entity, permissions, isOwner, setEntityContext, clearEntityContext]);

  const value = useMemo<EntityContext>(
    () => ({
      entityId,
      entity: entity ?? null,
      isLoading: entityLoading || permissionsLoading,
      error: entityError ? String(entityError) : null,
      permissions: permissions ?? 0,
      isOwner,
      isReadOnly,
      isSuspended,
      entityType: entity?.entityType ?? EntityType.Merchant,
      governanceMode: entity?.governanceMode ?? GovernanceMode.None,
    }),
    [entityId, entity, entityLoading, permissionsLoading, entityError, permissions, isOwner, isReadOnly, isSuspended],
  );

  return <EntityCtx.Provider value={value}>{children}</EntityCtx.Provider>;
}

/** Hook to access the EntityContext. Must be used within EntityProvider. */
export function useEntityContext(): EntityContext {
  const ctx = useContext(EntityCtx);
  if (!ctx) {
    throw new Error('useEntityContext must be used within an EntityProvider');
  }
  return ctx;
}
