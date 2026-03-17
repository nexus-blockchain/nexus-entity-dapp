import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';

/**
 * Validate a Substrate/SS58 address.
 * Returns true if the address is a valid SS58 encoded address.
 */
export function isValidSubstrateAddress(address: string): boolean {
  try {
    encodeAddress(decodeAddress(address));
    return true;
  } catch {
    return false;
  }
}
