import { create } from 'zustand';
import type { Signer } from '@polkadot/types/types';

interface WalletState {
  address: string | null;
  name: string | null;
  source: string | null;  // wallet extension name
  isConnected: boolean;
  balance: bigint;
  desktopSigner: Signer | null;

  // Actions
  setWallet: (address: string, name: string, source: string) => void;
  setBalance: (balance: bigint) => void;
  setDesktopSigner: (signer: Signer) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  name: null,
  source: null,
  isConnected: false,
  balance: BigInt(0),
  desktopSigner: null,

  setWallet: (address, name, source) =>
    set({ address, name, source, isConnected: true }),

  setBalance: (balance) => set({ balance }),

  setDesktopSigner: (signer) => set({ desktopSigner: signer }),

  disconnect: () =>
    set({ address: null, name: null, source: null, isConnected: false, balance: BigInt(0), desktopSigner: null }),
}));
