'use client';

import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ApiPromise } from '@polkadot/api';
import { useApi } from '@/lib/chain';
import { useWallet } from './use-wallet';
import type { TxState, ConfirmDialogConfig } from '@/lib/types';
import { DANGEROUS_OPERATIONS } from '@/lib/chain/constants';
import { parseDispatchError } from '@/lib/chain/error-parser';

interface UseEntityMutationOptions {
  onSuccess?: (blockHash: string) => void;
  onError?: (error: string) => void;
  invalidateKeys?: unknown[][];
  confirmDialog?: ConfirmDialogConfig;
}

export function useEntityMutation(
  palletName: string,
  callName: string,
  options?: UseEntityMutationOptions,
) {
  const { api } = useApi();
  const { address, getSigner } = useWallet();
  const queryClient = useQueryClient();
  // Stabilize options reference to avoid useCallback invalidation on every render
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [txState, setTxState] = useState<TxState>({
    status: 'idle',
    hash: null,
    error: null,
    blockNumber: null,
  });

  const isDangerous = DANGEROUS_OPERATIONS.includes(callName as any);
  const needsConfirmation = isDangerous || !!options?.confirmDialog;

  const reset = useCallback(() => {
    setTxState({ status: 'idle', hash: null, error: null, blockNumber: null });
  }, []);

  const mutate = useCallback(
    async (params: unknown[]) => {
      if (!api || !address) {
        setTxState({ status: 'error', hash: null, error: 'API or wallet not connected', blockNumber: null });
        return;
      }

      let unsub: (() => void) | null = null as (() => void) | null;

      try {
        setTxState({ status: 'signing', hash: null, error: null, blockNumber: null });

        const signer = await getSigner();

        const pallet = (api.tx as any)[palletName];
        if (!pallet) {
          // Log available pallets for debugging
          const available = Object.keys(api.tx).filter(k => !k.startsWith('$')).join(', ');
          console.error(`[useEntityMutation] Pallet "${palletName}" not found. Available: ${available}`);
          throw new Error(`Pallet "${palletName}" not found on chain`);
        }

        const call = pallet[callName];
        if (!call) {
          const available = Object.keys(pallet).filter(k => !k.startsWith('$')).join(', ');
          console.error(`[useEntityMutation] Method "${callName}" not found in "${palletName}". Available: ${available}`);
          throw new Error(`Method "${palletName}.${callName}" not found on chain`);
        }

        const tx = call(...params);

        setTxState((prev) => ({ ...prev, status: 'broadcasting' }));

        await new Promise<void>((resolve, reject) => {
          tx.signAndSend(address, { signer }, ({ status, dispatchError }: any) => {
            // Handle dispatch error as early as possible (inBlock or finalized)
            if (dispatchError && (status.isInBlock || status.isFinalized)) {
              const blockHash = status.isFinalized
                ? status.asFinalized.toHex()
                : status.asInBlock.toHex();
              const parsed = parseDispatchError(api, dispatchError);
              const errorMsg = `${parsed.module}.${parsed.name}: ${parsed.message}`;
              setTxState({
                status: 'error',
                hash: blockHash,
                error: errorMsg,
                blockNumber: null,
              });
              optionsRef.current?.onError?.(errorMsg);
              if (unsub) { unsub(); unsub = null; }
              reject(new Error(errorMsg));
              return;
            }

            if (status.isInBlock) {
              const blockHash = status.asInBlock.toHex();
              // Fetch block number from block hash
              api.rpc.chain.getHeader(blockHash).then((header: any) => {
                const blockNum = header.number.toNumber();
                setTxState({
                  status: 'inBlock',
                  hash: blockHash,
                  error: null,
                  blockNumber: blockNum,
                });
              }).catch(() => {
                setTxState({
                  status: 'inBlock',
                  hash: blockHash,
                  error: null,
                  blockNumber: null,
                });
              });
            }

            if (status.isFinalized) {
              const blockHash = status.asFinalized.toHex();

              // Fetch block number
              api.rpc.chain.getHeader(blockHash).then((header: any) => {
                const blockNum = header.number.toNumber();
                setTxState({
                  status: 'finalized',
                  hash: blockHash,
                  error: null,
                  blockNumber: blockNum,
                });
              }).catch(() => {
                setTxState({
                  status: 'finalized',
                  hash: blockHash,
                  error: null,
                  blockNumber: null,
                });
              });

              // Invalidate related queries
              if (optionsRef.current?.invalidateKeys) {
                if (process.env.NODE_ENV === 'development') {
                  console.debug(`[useEntityMutation] ${palletName}.${callName} finalized — invalidating keys:`, optionsRef.current.invalidateKeys);
                }
                for (const key of optionsRef.current.invalidateKeys) {
                  queryClient.invalidateQueries({ queryKey: key });
                }
              }

              if (unsub) { unsub(); unsub = null; }
              optionsRef.current?.onSuccess?.(blockHash);
              resolve();
            }
          }).then((unsubFn: () => void) => {
            unsub = unsubFn;
          }).catch((err: Error) => {
            if (unsub) { unsub(); unsub = null; }
            setTxState({
              status: 'error',
              hash: null,
              error: err.message,
              blockNumber: null,
            });
            optionsRef.current?.onError?.(err.message);
            reject(err);
          });
        });
      } catch (err) {
        if (unsub) { unsub(); unsub = null; }
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setTxState({
          status: 'error',
          hash: null,
          error: errorMsg,
          blockNumber: null,
        });
        optionsRef.current?.onError?.(errorMsg);
      }
    },
    [api, address, getSigner, palletName, callName, queryClient],
  );

  return {
    mutate,
    txState,
    reset,
    isDangerous,
    needsConfirmation,
    confirmConfig: options?.confirmDialog,
  };
}
