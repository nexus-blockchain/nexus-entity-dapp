import { describe, expect, test } from 'vitest';
import { Option, Text } from '@polkadot/types';
import { TypeRegistry } from '@polkadot/types/create';
import { decodeChainString, decodeOptionalChainString } from './codec';

describe('decodeChainString', () => {
  test('decodes UTF-8 hex strings', () => {
    expect(decodeChainString('0x6e65787573')).toBe('nexus');
  });
});

describe('decodeOptionalChainString', () => {
  const registry = new TypeRegistry();

  test('returns null for Option::None values', () => {
    const noneText = new Option(registry, Text, null);
    expect(decodeOptionalChainString(noneText)).toBeNull();
  });

  test('returns null for placeholder strings', () => {
    expect(decodeOptionalChainString('None')).toBeNull();
    expect(decodeOptionalChainString('null')).toBeNull();
    expect(decodeOptionalChainString('')).toBeNull();
  });

  test('decodes valid optional text values', () => {
    const someText = new Option(registry, Text, 'Entity Logo');
    expect(decodeOptionalChainString(someText)).toBe('Entity Logo');
  });
});
