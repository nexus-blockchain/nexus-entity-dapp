import { Keyring } from '@polkadot/keyring';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { Signer, SignerResult } from '@polkadot/types/types';
import type { SignerPayloadRaw, SignerPayloadJSON } from '@polkadot/types/types';

const KEYSTORE_DIR = 'keystore';

export interface DesktopAccount {
  address: string;
  name: string;
  encoded: string;
}

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

function getKeyring(): Keyring {
  return new Keyring({ type: 'sr25519', ss58Format: 42 });
}

export async function createAccount(
  name: string,
  password: string,
): Promise<{ mnemonic: string; address: string }> {
  const mnemonic = mnemonicGenerate();
  const keyring = getKeyring();
  const pair = keyring.addFromMnemonic(mnemonic, { name });
  const json = pair.toJson(password);

  await ensureKeystoreDir();
  const fs = await getTauriFs();
  await fs.writeTextFile(`${KEYSTORE_DIR}/${pair.address}.json`, JSON.stringify(json), {
    baseDir: fs.BaseDirectory.AppData,
  });

  return { mnemonic, address: pair.address };
}

export async function importAccount(
  mnemonic: string,
  name: string,
  password: string,
): Promise<{ address: string }> {
  const keyring = getKeyring();
  const pair = keyring.addFromMnemonic(mnemonic, { name });
  const json = pair.toJson(password);

  await ensureKeystoreDir();
  const fs = await getTauriFs();
  await fs.writeTextFile(`${KEYSTORE_DIR}/${pair.address}.json`, JSON.stringify(json), {
    baseDir: fs.BaseDirectory.AppData,
  });

  return { address: pair.address };
}

export async function listAccounts(): Promise<DesktopAccount[]> {
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

export async function unlockAccount(
  address: string,
  password: string,
): Promise<{ pair: KeyringPair; signer: Signer }> {
  const fs = await getTauriFs();
  const content = await fs.readTextFile(`${KEYSTORE_DIR}/${address}.json`, {
    baseDir: fs.BaseDirectory.AppData,
  });
  const json = JSON.parse(content);

  const keyring = getKeyring();
  const pair = keyring.addFromJson(json);
  pair.decodePkcs8(password);

  let id = 0;
  const signer: Signer = {
    signPayload: async (payload: SignerPayloadJSON): Promise<SignerResult> => {
      const { TypeRegistry } = await import('@polkadot/types');
      const reg = new TypeRegistry();
      const extrinsicPayload = reg.createType('ExtrinsicPayload', payload, {
        version: payload.version as unknown as number,
      });
      const { signature } = extrinsicPayload.sign(pair);
      return { id: ++id, signature };
    },
    signRaw: async (raw: SignerPayloadRaw): Promise<SignerResult> => {
      const { u8aToHex } = await import('@polkadot/util');
      const signature = u8aToHex(pair.sign(raw.data));
      return { id: ++id, signature };
    },
  };

  return { pair, signer };
}

export async function deleteAccount(address: string): Promise<void> {
  const fs = await getTauriFs();
  await fs.remove(`${KEYSTORE_DIR}/${address}.json`, {
    baseDir: fs.BaseDirectory.AppData,
  });
}
