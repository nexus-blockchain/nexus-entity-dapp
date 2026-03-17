'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ApiPromise } from '@polkadot/api';
import type { VoidFn } from '@polkadot/api/types';
import type { EventRecord } from '@polkadot/types/interfaces';
import { useApi } from '@/lib/chain';
import { useEntityDAppStore } from '@/stores/entity-dapp-store';
import type { Notification } from '@/lib/types/models';

// ─── Event Configuration ────────────────────────────────────

export interface EntityEventConfig {
  pallet: string;
  events: string[];
  filter: (event: EventRecord, entityId: number) => boolean;
  invalidateKeys: (entityId: number, event: EventRecord) => unknown[][];
}

function extractNumericArg(event: EventRecord, index: number): number | null {
  try {
    const value = event.event.data[index];
    if (value == null) return null;
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractEntityIdFromEvent(event: EventRecord): number | null {
  return extractNumericArg(event, 0);
}

function entityIdFilter(event: EventRecord, entityId: number): boolean {
  return extractEntityIdFromEvent(event) === entityId;
}

function anyEvent(): string[] {
  return ['*'];
}

export const ENTITY_EVENT_CONFIGS: EntityEventConfig[] = [
  {
    pallet: 'entityRegistry',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId]],
  },
  {
    pallet: 'entityShop',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'shops'], ['entity', entityId, 'shop']],
  },
  {
    pallet: 'entityToken',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'token']],
  },
  {
    pallet: 'entityTransaction',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'orders'], ['entity', entityId, 'shop']],
  },
  {
    pallet: 'entityMarket',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'market']],
  },
  {
    pallet: 'entityMember',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'members']],
  },
  {
    pallet: 'entityGovernance',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'proposals']],
  },
  {
    pallet: 'entityKyc',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'kyc']],
  },
  {
    pallet: 'entityDisclosure',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'disclosure']],
  },
  {
    pallet: 'commissionCore',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'commission']],
  },
  {
    pallet: 'commissionReferral',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'referral'], ['entity', entityId, 'commission']],
  },
  {
    pallet: 'commissionMultiLevel',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'multiLevel'], ['entity', entityId, 'commission']],
  },
  {
    pallet: 'commissionLevelDiff',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'levelDiff'], ['entity', entityId, 'commission']],
  },
  {
    pallet: 'commissionSingleLine',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'singleLine'], ['entity', entityId, 'commission']],
  },
  {
    pallet: 'commissionTeam',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'team'], ['entity', entityId, 'commission']],
  },
  {
    pallet: 'commissionPoolReward',
    events: anyEvent(),
    filter: entityIdFilter,
    invalidateKeys: (entityId) => [['entity', entityId, 'poolReward'], ['entity', entityId, 'commission']],
  },
];

// ─── Event Summary Generation ───────────────────────────────

export function generateEventSummary(pallet: string, eventName: string): string {
  const summaries: Record<string, Record<string, string>> = {
    entityRegistry: {
      EntitySuspendedLowFund: 'Entity suspended due to low funds',
      FundWarning: 'Entity fund balance is below warning threshold',
      OwnershipTransferred: 'Entity ownership has been transferred',
      GovernanceLocked: 'Entity governance has been locked',
    },
    entityShop: {
      ShopCreated: 'A new shop has been created',
      ShopClosed: 'A shop has been closed',
    },
    entityTransaction: {
      OrderPlaced: 'A new order has been placed',
      OrderPaid: 'An order has been paid',
      OrderShipped: 'An order has been shipped',
      OrderDisputed: 'An order refund/dispute has been initiated',
    },
    entityMember: {
      MemberRegistered: 'A new member has registered',
      MemberBanned: 'A member has been banned',
    },
    entityGovernance: {
      ProposalCreated: 'A new governance proposal has been created',
      VoteCast: 'A vote has been cast on a proposal',
      ProposalExecuted: 'A governance proposal has been executed',
    },
    commissionCore: {
      CommissionDistributed: 'Commission has been distributed',
      WithdrawalCompleted: 'A withdrawal has been completed',
    },
    commissionPoolReward: {
      PoolRewardClaimed: 'Pool reward has been claimed',
    },
  };

  return summaries[pallet]?.[eventName] ?? `${pallet}.${eventName}`;
}

// ─── Event Filtering ────────────────────────────────────────

export function filterEntityEvent(
  event: EventRecord,
  entityId: number,
): { config: EntityEventConfig; eventName: string } | null {
  const section = event.event.section;
  const method = event.event.method;

  for (const config of ENTITY_EVENT_CONFIGS) {
    const matchesEvent = config.events.includes('*') || config.events.includes(method);
    if (config.pallet === section && matchesEvent && config.filter(event, entityId)) {
      return { config, eventName: method };
    }
  }
  return null;
}

// ─── Hook ───────────────────────────────────────────────────

export function useEntityEvents(entityId: number) {
  const { api, isReady } = useApi();
  const queryClient = useQueryClient();
  const unsubRef = useRef<VoidFn | null>(null);

  const addNotification = useEntityDAppStore((state) => state.addNotification);
  const notifications = useEntityDAppStore((state) => state.notifications);
  const unreadCount = useEntityDAppStore((state) => state.unreadCount);
  const markNotificationRead = useEntityDAppStore((state) => state.markNotificationRead);
  const clearAllNotifications = useEntityDAppStore((state) => state.clearAllNotifications);

  const handleEvents = useCallback((events: EventRecord[]) => {
    for (const record of events) {
      const match = filterEntityEvent(record, entityId);
      if (!match) continue;

      const notification: Notification = {
        id: `${Date.now()}-${match.config.pallet}-${match.eventName}-${Math.random().toString(36).slice(2, 8)}`,
        pallet: match.config.pallet,
        event: match.eventName,
        summary: generateEventSummary(match.config.pallet, match.eventName),
        timestamp: Date.now(),
        read: false,
      };
      addNotification(notification);

      for (const key of match.config.invalidateKeys(entityId, record)) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    }
  }, [addNotification, entityId, queryClient]);

  useEffect(() => {
    if (!api || !isReady) return;

    let cancelled = false;

    const subscribe = async () => {
      try {
        const unsub = await (api as ApiPromise).query.system.events(
          ((eventRecords: any) => {
            if (cancelled) return;
            const records: EventRecord[] = Array.isArray(eventRecords) ? eventRecords : [...eventRecords];
            handleEvents(records);
          }) as any,
        ) as unknown as VoidFn;

        if (cancelled) {
          unsub();
        } else {
          unsubRef.current = unsub;
        }
      } catch {
        // ignore subscription failures and rely on ApiProvider reconnects
      }
    };

    subscribe();

    return () => {
      cancelled = true;
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [api, handleEvents, isReady]);

  return {
    notifications,
    unreadCount,
    markAsRead: markNotificationRead,
    clearAll: clearAllNotifications,
  };
}
