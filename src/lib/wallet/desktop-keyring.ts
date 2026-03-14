import { Keyring } from '@polkadot/keyring';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { Signer, SignerResult } from '@polkadot/types/types';
import type { SignerPayloadRaw, SignerPayloadJSON } from '@polkadot/types/types';
import { isTauri } from '@/lib/utils/platform';

const KEYSTORE_DIR = 'keystore';
const LS_PREFIX = 'keystore:';

export interface DesktopAccount {
  address: string;
  name: string;
  encoded: string;
}

// ===== Tauri FS backend =====

let tauriFsModule: typeof import('@tauri-apps/plugin-fs') | null = null;

async function getTauriFs() {
  if (!tauriFsModule) {
    tauriFsModule = await import('@tauri-apps/plugin-fs');
  }
  return tauriFsModule;
}

async function ensureKeystoreDir(): Promise<void> {
  const fs = await getTauriFs();
  try {
    await fs.mkdir(KEYSTORE_DIR, { baseDir: fs.BaseDirectory.AppData, recursive: true });
  } catch {
    // directory may already exist
  }
}

// ===== localStorage backend =====

function lsKey(address: string): string {
  return `${LS_PREFIX}${address}`;
}

function lsWriteAccount(address: string, json: object): void {
  localStorage.setItem(lsKey(address), JSON.stringify(json));
}

function lsReadAccount(address: string): string | null {
  return localStorage.getItem(lsKey(address));
}

function lsListAccounts(): { address: string; content: string }[] {
  const results: { address: string; content: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LS_PREFIX)) {
      const content = localStorage.getItem(key);
      if (content) {
        results.push({ address: key.slice(LS_PREFIX.length), content });
      }
    }
  }
  return results;
}

function lsDeleteAccount(address: string): void {
  localStorage.removeItem(lsKey(address));
}

// ===== Shared =====

function getKeyring(): Keyring {
  return new Keyring({ type: 'sr25519', ss58Format: 273 });
}

export async function createAccount(
  name: string,
  password: string,
): Promise<{ mnemonic: string; address: string }> {
  const mnemonic = mnemonicGenerate();
  const keyring = getKeyring();
  const pair = keyring.addFromMnemonic(mnemonic, { name });
  const json = pair.toJson(password);

  if (isTauri()) {
    await ensureKeystoreDir();
    const fs = await getTauriFs();
    await fs.writeTextFile(`${KEYSTORE_DIR}/${pair.address}.json`, JSON.stringify(json), {
      baseDir: fs.BaseDirectory.AppData,
    });
  } else {
    lsWriteAccount(pair.address, json);
  }

  return { mnemonic, address: pair.address };
}

export async function importAccount(
  mnemonic: string,
  name: string,
  password: string,
): Promise<{ address: string }> {
  // Normalize: trim, collapse internal whitespace, lowercase
  const cleaned = mnemonic.trim().replace(/\s+/g, ' ').toLowerCase();

  const { mnemonicValidate } = await import('@polkadot/util-crypto');
  if (!mnemonicValidate(cleaned)) {
    throw new Error('Invalid mnemonic phrase');
  }

  const keyring = getKeyring();
  const pair = keyring.addFromMnemonic(cleaned, { name });
  const json = pair.toJson(password);

  if (isTauri()) {
    await ensureKeystoreDir();
    const fs = await getTauriFs();
    await fs.writeTextFile(`${KEYSTORE_DIR}/${pair.address}.json`, JSON.stringify(json), {
      baseDir: fs.BaseDirectory.AppData,
    });
  } else {
    lsWriteAccount(pair.address, json);
  }

  return { address: pair.address };
}

export async function listAccounts(): Promise<DesktopAccount[]> {
  if (isTauri()) {
    await ensureKeystoreDir();
    const fs = await getTauriFs();

    let entries: Awaited<ReturnType<typeof fs.readDir>>;
    try {
      entries = await fs.readDir(KEYSTORE_DIR, { baseDir: fs.BaseDirectory.AppData });
    } catch {
      return [];
    }

    const accounts: DesktopAccount[] = [];
    for (const entry of entries) {
      if (!entry.name?.endsWith('.json')) continue;
      try {
        const content = await fs.readTextFile(`${KEYSTORE_DIR}/${entry.name}`, {
          baseDir: fs.BaseDirectory.AppData,
        });
        const json = JSON.parse(content);
        accounts.push({
          address: json.address ?? entry.name.replace('.json', ''),
          name: json.meta?.name ?? 'Unknown',
          encoded: content,
        });
      } catch {
        // skip corrupted files
      }
    }
    return accounts;
  }

  // Browser: read from localStorage
  const entries = lsListAccounts();
  const accounts: DesktopAccount[] = [];
  for (const { content } of entries) {
    try {
      const json = JSON.parse(content);
      accounts.push({
        address: json.address ?? 'Unknown',
        name: json.meta?.name ?? 'Unknown',
        encoded: content,
      });
    } catch {
      // skip corrupted entries
    }
  }
  return accounts;
}

export async function unlockAccount(
  address: string,
  password: string,
): Promise<{ pair: KeyringPair; signer: Signer }> {
  let content: string;

  if (isTauri()) {
    const fs = await getTauriFs();
    content = await fs.readTextFile(`${KEYSTORE_DIR}/${address}.json`, {
      baseDir: fs.BaseDirectory.AppData,
    });
  } else {
    const stored = lsReadAccount(address);
    if (!stored) throw new Error(`Account ${address} not found`);
    content = stored;
  }

  const json = JSON.parse(content);

  const keyring = getKeyring();
  const pair = keyring.addFromJson(json);
  pair.decodePkcs8(password);

  let id = 0;
  const signer: Signer = {
    signPayload: async (payload: SignerPayloadJSON): Promise<SignerResult> => {
      const { getGlobalApi } = await import('@/lib/chain');
      const api = getGlobalApi();
      if (!api) {
        throw new Error('Chain API not connected');
      }
      const extrinsicPayload = api.registry.createType('ExtrinsicPayload', payload, {
        version: payload.version as unknown as number,
      });
      const { signature } = extrinsicPayload.sign(pair);
      return { id: ++id, signature };
    },
    signRaw: async (raw: SignerPayloadRaw): Promise<SignerResult> => {
      const { u8aToHex, hexToU8a } = await import('@polkadot/util');
      const message = hexToU8a(raw.data);
      const signature = u8aToHex(pair.sign(message));
      return { id: ++id, signature };
    },
  };

  return { pair, signer };
}

export async function deleteAccount(address: string): Promise<void> {
  if (isTauri()) {
    const fs = await getTauriFs();
    await fs.remove(`${KEYSTORE_DIR}/${address}.json`, {
      baseDir: fs.BaseDirectory.AppData,
    });
  } else {
    lsDeleteAccount(address);
  }
}
