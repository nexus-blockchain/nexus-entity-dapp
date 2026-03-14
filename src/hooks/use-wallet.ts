'use client';

import { useCallback } from 'react';
import type { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';
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
  const { address, name, source, isConnected, balance, desktopSigner, setWallet, setBalance, setDesktopSigner, disconnect } =
    useWalletStore();

  /** Enable wallet extensions and get available accounts */
  const getAccounts = useCallback(async (): Promise<InjectedAccountWithMeta[]> => {
    // Always try built-in keyring accounts
    const dk = await getDesktopKeyring();
    const builtInAccounts = await dk.listAccounts();
    const keyringAccounts: InjectedAccountWithMeta[] = builtInAccounts.map((acc) => ({
      address: acc.address,
      meta: { name: acc.name, source: 'desktop-keyring' },
      type: 'sr25519',
    }));

    // In Tauri mode, only return keyring accounts
    if (isTauri()) {
      return keyringAccounts;
    }

    // In browser, also try extensions and merge
    let extensionAccounts: InjectedAccountWithMeta[] = [];
    try {
      const { web3Enable, web3Accounts } = await getExtensionDapp();
      const extensions = await web3Enable(APP_NAME);
      if (extensions.length > 0) {
        extensionAccounts = await web3Accounts();
      }
    } catch {
      // Extensions not available — that's fine
    }

    const allAccounts = [...keyringAccounts, ...extensionAccounts];
    if (allAccounts.length === 0) {
      throw new Error('No accounts found. Create a built-in wallet or install a browser extension.');
    }
    return allAccounts;
  }, []);

  /** Connect to a specific account */
  const connect = useCallback(
    async (account: InjectedAccountWithMeta) => {
      if (account.meta.source === 'desktop-keyring') {
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

  /** Unlock desktop account — stores signer in global store */
  const unlockDesktopAccount = useCallback(
    async (accountAddress: string, password: string) => {
      const dk = await getDesktopKeyring();
      const { signer } = await dk.unlockAccount(accountAddress, password);
      setDesktopSigner(signer);
    },
    [setDesktopSigner],
  );

  /** Get signer for transaction signing */
  const getSigner = useCallback(async () => {
    if (!source) throw new Error('Wallet not connected');

    if (source === 'desktop-keyring') {
      if (!desktopSigner) {
        throw new Error('Desktop account is locked. Please unlock with your password first.');
      }
      return desktopSigner;
    }

    const { web3FromSource } = await getExtensionDapp();
    const injector = await web3FromSource(source);
    return injector.signer;
  }, [source, desktopSigner]);

  return {
    address,
    name,
    source,
    isConnected,
    balance,
    setBalance,
    getAccounts,
    connect,
    disconnect,
    getSigner,
    unlockDesktopAccount,
    supportedWallets: SUPPORTED_WALLETS,
  };
}
