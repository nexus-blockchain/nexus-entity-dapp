'use client';

import { useCallback, useRef } from 'react';
import type { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';
import type { Signer } from '@polkadot/types/types';
import { useWalletStore } from '@/stores/wallet-store';
import { isTauri } from '@/lib/utils/platform';

const APP_NAME = 'NEXUS Entity dApp';

// Supported wallet extensions (browser mode)
const SUPPORTED_WALLETS = ['polkadot-js', 'talisman', 'subwallet-js'] as const;
export type SupportedWallet = (typeof SUPPORTED_WALLETS)[number];

async function getExtensionDapp() {
  return import('@polkadot/extension-dapp');
}

async function getDesktopKeyring() {
  return import('@/lib/wallet/desktop-keyring');
}

export function useWallet() {
  const { address, name, source, isConnected, balance, setWallet, setBalance, disconnect } =
    useWalletStore();

  // Cache the desktop signer after unlock
  const desktopSignerRef = useRef<Signer | null>(null);

  /** Enable wallet extensions and get available accounts */
  const getAccounts = useCallback(async (): Promise<InjectedAccountWithMeta[]> => {
    if (isTauri()) {
      const dk = await getDesktopKeyring();
      const accounts = await dk.listAccounts();
      return accounts.map((acc) => ({
        address: acc.address,
        meta: { name: acc.name, source: 'desktop-keyring' },
        type: 'sr25519',
      }));
    }

    const { web3Enable, web3Accounts } = await getExtensionDapp();
    const extensions = await web3Enable(APP_NAME);
    if (extensions.length === 0) {
      throw new Error('No wallet extension found. Please install Polkadot.js, Talisman, or SubWallet.');
    }
    return web3Accounts();
  }, []);

  /** Connect to a specific account */
  const connect = useCallback(
    async (account: InjectedAccountWithMeta) => {
      if (isTauri()) {
        setWallet(
          account.address,
          account.meta.name || 'Unknown',
          'desktop-keyring',
        );
        return;
      }

      const { web3FromSource } = await getExtensionDapp();
      const injector = await web3FromSource(account.meta.source);
      if (!injector) {
        throw new Error(`Failed to connect to ${account.meta.source}`);
      }
      setWallet(
        account.address,
        account.meta.name || 'Unknown',
        account.meta.source,
      );
    },
    [setWallet],
  );

  /** Unlock desktop account (Tauri only) — stores signer in ref */
  const unlockDesktopAccount = useCallback(
    async (accountAddress: string, password: string) => {
      const dk = await getDesktopKeyring();
      const { signer } = await dk.unlockAccount(accountAddress, password);
      desktopSignerRef.current = signer;
    },
    [],
  );

  /** Get signer for transaction signing */
  const getSigner = useCallback(async () => {
    if (!source) throw new Error('Wallet not connected');

    if (source === 'desktop-keyring') {
      if (!desktopSignerRef.current) {
        throw new Error('Desktop account is locked. Please unlock with your password first.');
      }
      return desktopSignerRef.current;
    }

    const { web3FromSource } = await getExtensionDapp();
    const injector = await web3FromSource(source);
    return injector.signer;
  }, [source]);

  /** Disconnect and clear desktop signer */
  const handleDisconnect = useCallback(() => {
    desktopSignerRef.current = null;
    disconnect();
  }, [disconnect]);

  return {
    address,
    name,
    source,
    isConnected,
    balance,
    setBalance,
    getAccounts,
    connect,
    disconnect: handleDisconnect,
    getSigner,
    unlockDesktopAccount,
    supportedWallets: SUPPORTED_WALLETS,
  };
}
