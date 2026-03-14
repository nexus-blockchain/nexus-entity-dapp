/**
 * Decode a Substrate BoundedVec<u8> value to a UTF-8 string.
 *
 * Polkadot.js may return these as hex strings (e.g. "0x7869616f646f6e67")
 * instead of decoded text. This helper transparently handles both cases.
 */
export function decodeChainString(val: unknown): string {
  if (!val) return '';
  const s = String(val);
  if (s.startsWith('0x') && s.length > 2) {
    try {
      const hex = s.slice(2);
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }
      return new TextDecoder().decode(bytes);
    } catch {
      return s;
    }
  }
  return s;
}

/**
 * Derive the Entity treasury sub-account address from a PalletId and entity_id.
 *
 * Mirrors Substrate's `PalletId(*b"et/enty/").into_sub_account_truncating(entity_id)`.
 * The algorithm:
 *   1. Prefix: b"modl" (4 bytes)
 *   2. Pallet ID: b"et/enty/" (8 bytes)
 *   3. Sub-account suffix: entity_id as little-endian u64 (8 bytes)
 *   4. Pad to 32 bytes with 0x00
 *   5. The resulting 32 bytes IS the raw AccountId32
 */
export function entityTreasuryAddress(entityId: number): Uint8Array {
  const buf = new Uint8Array(32); // AccountId32 = 32 bytes
  // "modl" prefix
  buf[0] = 0x6d; buf[1] = 0x6f; buf[2] = 0x64; buf[3] = 0x6c;
  // "et/enty/" pallet id
  const palletId = [0x65, 0x74, 0x2f, 0x65, 0x6e, 0x74, 0x79, 0x2f]; // "et/enty/"
  for (let i = 0; i < 8; i++) buf[4 + i] = palletId[i];
  // entity_id as little-endian u64 (8 bytes)
  let id = BigInt(entityId);
  for (let i = 0; i < 8; i++) {
    buf[12 + i] = Number(id & BigInt(0xff));
    id >>= BigInt(8);
  }
  // remaining bytes stay 0x00
  return buf;
}

/**
 * Derive the Shop treasury sub-account address from PalletId and shop_id.
 *
 * Mirrors Substrate's `PalletId(*b"et/shop_").into_sub_account_truncating(shop_id)`.
 */
export function shopTreasuryAddress(shopId: number): Uint8Array {
  const buf = new Uint8Array(32);
  // "modl" prefix
  buf[0] = 0x6d; buf[1] = 0x6f; buf[2] = 0x64; buf[3] = 0x6c;
  // "et/shop_" pallet id
  const palletId = [0x65, 0x74, 0x2f, 0x73, 0x68, 0x6f, 0x70, 0x5f]; // "et/shop_"
  for (let i = 0; i < 8; i++) buf[4 + i] = palletId[i];
  // shop_id as little-endian u64
  let id = BigInt(shopId);
  for (let i = 0; i < 8; i++) {
    buf[12 + i] = Number(id & BigInt(0xff));
    id >>= BigInt(8);
  }
  return buf;
}
