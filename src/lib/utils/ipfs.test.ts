import { describe, expect, test, vi } from 'vitest';
import { ipfsUrl, normalizeIpfsReference } from './ipfs';

describe('normalizeIpfsReference', () => {
  test('normalizes ipfs:// URIs to bare CID paths', () => {
    expect(normalizeIpfsReference('ipfs://bafy-test-cid/logo.png')).toBe('bafy-test-cid/logo.png');
  });

  test('extracts CID paths from gateway URLs', () => {
    expect(
      normalizeIpfsReference('https://gateway.pinata.cloud/ipfs/bafy-test-cid/logo.png?filename=logo.png'),
    ).toBe('bafy-test-cid/logo.png?filename=logo.png');
  });

  test('keeps non-IPFS absolute URLs unchanged', () => {
    expect(normalizeIpfsReference('https://cdn.example.com/logo.png')).toBe('https://cdn.example.com/logo.png');
  });

  test('normalizes empty placeholder values to null', () => {
    expect(normalizeIpfsReference('None')).toBeNull();
    expect(normalizeIpfsReference('null')).toBeNull();
    expect(normalizeIpfsReference('')).toBeNull();
  });
});

describe('ipfsUrl', () => {
  test('builds a gateway URL for a bare CID', () => {
    expect(ipfsUrl('bafy-test-cid/logo.png', 'https://gw.example/ipfs')).toBe(
      'https://gw.example/ipfs/bafy-test-cid/logo.png',
    );
  });

  test('rebuilds gateway URLs from ipfs:// references', () => {
    expect(ipfsUrl('ipfs://bafy-test-cid/logo.png', 'https://gw.example/ipfs')).toBe(
      'https://gw.example/ipfs/bafy-test-cid/logo.png',
    );
  });

  test('rebuilds gateway URLs from stored HTTP IPFS URLs so fallbacks can work', () => {
    expect(
      ipfsUrl('http://202.140.140.202:8080/ipfs/bafy-test-cid/logo.png', 'https://gw.example/ipfs'),
    ).toBe('https://gw.example/ipfs/bafy-test-cid/logo.png');
  });

  test('returns direct absolute URLs unchanged', () => {
    expect(ipfsUrl('https://cdn.example.com/logo.png', 'https://gw.example/ipfs')).toBe(
      'https://cdn.example.com/logo.png',
    );
  });

  test('returns empty string for invalid placeholder values', () => {
    expect(ipfsUrl('None', 'https://gw.example/ipfs')).toBe('');
  });
});
