import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, mnemonicGenerate } from '@polkadot/util-crypto';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { Signer, SignerResult } from '@polkadot/types/types';
import type { SignerPayloadRaw, SignerPayloadJSON } from '@polkadot/types/types';
import { isTauri } from '@/lib/utils/platform';

const KEYSTORE_DIR = 'keystore';
const LS_PREFIX = 'keystore:';
const LS_MNEMONIC_PREFIX = 'keystore-mnemonic:';

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

function lsMnemonicKey(address: string): string {
  return `${LS_MNEMONIC_PREFIX}${address}`;
}

function lsWriteMnemonic(address: string, encrypted: string): void {
  localStorage.setItem(lsMnemonicKey(address), encrypted);
}

function lsReadMnemonic(address: string): string | null {
  return localStorage.getItem(lsMnemonicKey(address));
}

function lsDeleteMnemonic(address: string): void {
  localStorage.removeItem(lsMnemonicKey(address));
}

// ===== Mnemonic encryption =====
// Uses Web Crypto API (PBKDF2 + AES-GCM) when available (secure contexts),
// falls back to @polkadot/util-crypto (naclEncrypt + scrypt) for insecure
// contexts like http://<LAN-IP>:port during development.

function isWebCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

// ----- Web Crypto path (PBKDF2 + AES-GCM) -----

async function deriveEncryptionKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptMnemonicWebCrypto(mnemonic: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(mnemonic),
  );
  // Pack: salt(16) + iv(12) + ciphertext → base64
  const packed = new Uint8Array(salt.length + iv.length + new Uint8Array(ciphertext).length);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return btoa(Array.from(packed, (b) => String.fromCharCode(b)).join(''));
}

async function decryptMnemonicWebCrypto(encrypted: string, password: string): Promise<string> {
  const packed = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const salt = packed.slice(0, 16);
  const iv = packed.slice(16, 28);
  const ciphertext = packed.slice(28);
  const key = await deriveEncryptionKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

// ----- Fallback path (nacl from @polkadot/util-crypto) -----
// Uses naclEncrypt/naclDecrypt with a key derived by hashing the password.
// Format prefix "nacl:" distinguishes from Web Crypto data.

async function deriveNaclKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const { blake2AsU8a } = await import('@polkadot/util-crypto');
  const encoder = new TextEncoder();
  const pwBytes = encoder.encode(password);
  const input = new Uint8Array(pwBytes.length + salt.length);
  input.set(pwBytes, 0);
  input.set(salt, pwBytes.length);
  return blake2AsU8a(input, 256);
}

async function encryptMnemonicFallback(mnemonic: string, password: string): Promise<string> {
  const { naclEncrypt, randomAsU8a } = await import('@polkadot/util-crypto');
  const salt = randomAsU8a(16);
  const secret = await deriveNaclKey(password, salt);
  const encoder = new TextEncoder();
  const { encrypted, nonce } = naclEncrypt(encoder.encode(mnemonic), secret);
  // Pack: salt(16) + nonce(24) + encrypted
  const packed = new Uint8Array(salt.length + nonce.length + encrypted.length);
  packed.set(salt, 0);
  packed.set(nonce, salt.length);
  packed.set(encrypted, salt.length + nonce.length);
  return 'nacl:' + btoa(Array.from(packed, (b) => String.fromCharCode(b)).join(''));
}

async function decryptMnemonicFallback(encrypted: string, password: string): Promise<string> {
  const { naclDecrypt } = await import('@polkadot/util-crypto');
  const raw = encrypted.startsWith('nacl:') ? encrypted.slice(5) : encrypted;
  const packed = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  const salt = packed.slice(0, 16);
  const nonce = packed.slice(16, 40);
  const ciphertext = packed.slice(40);
  const secret = await deriveNaclKey(password, salt);
  const plaintext = naclDecrypt(ciphertext, nonce, secret);
  if (!plaintext) throw new Error('Decryption failed');
  return new TextDecoder().decode(plaintext);
}

// ----- Unified API -----

async function encryptMnemonic(mnemonic: string, password: string): Promise<string> {
  if (isWebCryptoAvailable()) {
    return encryptMnemonicWebCrypto(mnemonic, password);
  }
  return encryptMnemonicFallback(mnemonic, password);
}

async function decryptMnemonic(encrypted: string, password: string): Promise<string> {
  // Detect format by prefix
  if (encrypted.startsWith('nacl:')) {
    return decryptMnemonicFallback(encrypted, password);
  }
  // Web Crypto format — requires crypto.subtle
  if (isWebCryptoAvailable()) {
    return decryptMnemonicWebCrypto(encrypted, password);
  }
  throw new Error(
    'Cannot decrypt: this mnemonic was encrypted with Web Crypto which is unavailable in insecure contexts. ' +
    'Access the app via https:// or localhost to decrypt.',
  );
}

async function storeMnemonic(address: string, mnemonic: string, password: string): Promise<void> {
  const encrypted = await encryptMnemonic(mnemonic, password);
  if (isTauri()) {
    await ensureKeystoreDir();
    const fs = await getTauriFs();
    await fs.writeTextFile(`${KEYSTORE_DIR}/${address}.mnemonic.json`, JSON.stringify({ encrypted }), {
      baseDir: fs.BaseDirectory.AppData,
    });
  } else {
    lsWriteMnemonic(address, JSON.stringify({ encrypted }));
  }
}

async function deleteMnemonicStorage(address: string): Promise<void> {
  if (isTauri()) {
    const fs = await getTauriFs();
    try {
      await fs.remove(`${KEYSTORE_DIR}/${address}.mnemonic.json`, {
        baseDir: fs.BaseDirectory.AppData,
      });
    } catch {
      // file may not exist (old account)
    }
  } else {
    lsDeleteMnemonic(address);
  }
}

// ===== Shared =====

function getKeyring(): Keyring {
  return new Keyring({ type: 'sr25519', ss58Format: 273 });
}

export async function createAccount(
  name: string,
  password: string,
): Promise<{ mnemonic: string; address: string }> {
  await cryptoWaitReady();
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

  await storeMnemonic(pair.address, mnemonic, password);

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
  await cryptoWaitReady();
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

  await storeMnemonic(pair.address, cleaned, password);

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
      if (!entry.name?.endsWith('.json') || entry.name.endsWith('.mnemonic.json')) continue;
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
  await cryptoWaitReady();
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
  await deleteMnemonicStorage(address);
}

export async function exportSecretKey(address: string, password: string): Promise<string> {
  const { pair } = await unlockAccount(address, password);
  // encodePkcs8() without password returns unencrypted PKCS8 encoding
  const encoded = pair.encodePkcs8();
  // decodePair extracts { publicKey, secretKey } from the raw encoding
  const { decodePair } = await import('@polkadot/keyring/pair/decode');
  const { secretKey } = decodePair(undefined, encoded);
  const { u8aToHex } = await import('@polkadot/util');
  // For sr25519: secretKey is 64 bytes (mini-secret + nonce), return full hex
  return u8aToHex(secretKey);
}

export async function exportMnemonic(address: string, password: string): Promise<string | null> {
  let stored: string | null = null;
  if (isTauri()) {
    const fs = await getTauriFs();
    try {
      stored = await fs.readTextFile(`${KEYSTORE_DIR}/${address}.mnemonic.json`, {
        baseDir: fs.BaseDirectory.AppData,
      });
    } catch {
      return null; // no mnemonic file (old account)
    }
  } else {
    stored = lsReadMnemonic(address);
  }

  if (!stored) return null;

  try {
    const { encrypted } = JSON.parse(stored);
    return await decryptMnemonic(encrypted, password);
  } catch {
    throw new Error('Failed to decrypt mnemonic — wrong password?');
  }
}
