'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ApiPromise } from '@polkadot/api';
import { useApi } from '@/lib/chain';
import { useWallet } from './use-wallet';
import type { TxState, ConfirmDialogConfig } from '@/lib/types';
import { DANGEROUS_OPERATIONS } from '@/lib/chain/constants';

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
            if (status.isInBlock) {
              const blockHash = status.asInBlock.toHex();
              setTxState({
                status: 'inBlock',
                hash: blockHash,
                error: null,
                blockNumber: null,
              });
            }

            if (status.isFinalized) {
              const blockHash = status.asFinalized.toHex();

              if (dispatchError) {
                let errorMsg = 'Transaction failed';
                if (dispatchError.isModule) {
                  const decoded = api.registry.findMetaError(dispatchError.asModule);
                  errorMsg = `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`;
                }
                setTxState({
                  status: 'error',
                  hash: blockHash,
                  error: errorMsg,
                  blockNumber: null,
                });
                options?.onError?.(errorMsg);
                reject(new Error(errorMsg));
                return;
              }

              setTxState({
                status: 'finalized',
                hash: blockHash,
                error: null,
                blockNumber: null,
              });

              // Invalidate related queries
              if (options?.invalidateKeys) {
                for (const key of options.invalidateKeys) {
                  queryClient.invalidateQueries({ queryKey: key });
                }
              }

              options?.onSuccess?.(blockHash);
              resolve();
            }
          }).catch((err: Error) => {
            setTxState({
              status: 'error',
              hash: null,
              error: err.message,
              blockNumber: null,
            });
            options?.onError?.(err.message);
            reject(err);
          });
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setTxState({
          status: 'error',
          hash: null,
          error: errorMsg,
          blockNumber: null,
        });
        options?.onError?.(errorMsg);
      }
    },
    [api, address, getSigner, palletName, callName, queryClient, options],
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
