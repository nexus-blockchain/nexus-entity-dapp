'use client';

import { useEntityQuery } from './use-entity-query';

/** Escrow lock state values from pallet-dispute-escrow (u8 enum) */
const LOCK_STATE_MAP: Record<number, EscrowStatus> = {
  0: 'Held',
  1: 'Disputed',
  2: 'Released',
  3: 'Closed',
};

/** Escrow status as returned by pallet-escrow */
export type EscrowStatus = 'Held' | 'Released' | 'Refunded' | 'Disputed' | 'Closed';

export interface EscrowData {
  id: number;
  status: EscrowStatus;
  amount: bigint;
  depositor: string;
  beneficiary: string;
}

/**
 * Query escrow status from pallet-dispute-escrow.
 *
 * Chain storages:
 *  - `escrow.lockStateOf(escrowId)` → u8 (0=Held, 1=Disputed, 2=Released, 3=Closed)
 *  - `escrow.locked(escrowId)` → Option<EscrowInfo { depositor, beneficiary, amount }>
 */
export function useEscrowStatus(escrowId: number | null) {
  const query = useEntityQuery<EscrowData | null>(
    ['escrow', escrowId],
    async (api) => {
      if (escrowId == null) return null;
      const pallet = (api.query as any).escrow;
      if (!pallet) return null;

      // Query lock state (u8) and escrow info in parallel
      const [rawState, rawInfo] = await Promise.all([
        pallet.lockStateOf ? pallet.lockStateOf(escrowId) : Promise.resolve(null),
        pallet.locked ? pallet.locked(escrowId) : Promise.resolve(null),
      ]);

      // Parse lock state u8 → status string
      const stateNum = Number(rawState?.toString?.() ?? rawState ?? 0);
      const status: EscrowStatus = LOCK_STATE_MAP[stateNum] ?? 'Held';

      // Parse locked info (Option<EscrowInfo>)
      let amount = BigInt(0);
      let depositor = '';
      let beneficiary = '';

      if (rawInfo && !(rawInfo as { isNone?: boolean }).isNone) {
        const unwrapped = (rawInfo as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? rawInfo;
        if (unwrapped) {
          const obj = (unwrapped as { toJSON?: () => unknown }).toJSON?.() ?? unwrapped;
          if (obj && typeof obj === 'object') {
            const info = obj as Record<string, unknown>;
            amount = BigInt(String(info.amount ?? 0));
            depositor = String(info.depositor ?? '');
            beneficiary = String(info.beneficiary ?? '');
          }
        }
      }

      return { id: escrowId, status, amount, depositor, beneficiary };
    },
    { staleTime: 15_000, enabled: escrowId != null },
  );

  return {
    escrow: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
