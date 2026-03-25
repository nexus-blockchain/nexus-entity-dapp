'use client';

import { createContext, useContext } from 'react';

/**
 * Shared transaction lock context.
 *
 * Prevents concurrent Substrate transactions from the same account,
 * which would cause "Priority is too low" nonce-collision errors in the tx pool.
 *
 * The lock state lives in EntityProvider (global for all pages under one entity).
 * Each section drives the lock via `useEffect(() => { setLocked(localBusy); }, ...)`.
 */

export interface TxLockValue {
  isLocked: boolean;
  setLocked: (v: boolean) => void;
}

export const TxLockContext = createContext<TxLockValue>({
  isLocked: false,
  setLocked: () => {},
});

export const TxLockProvider = TxLockContext.Provider;

export function useTxLock(): TxLockValue {
  return useContext(TxLockContext);
}

/** Check if a mutation hook is currently signing or broadcasting. */
export function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}
