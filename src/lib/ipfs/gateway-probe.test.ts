import { beforeEach, describe, expect, test, vi } from 'vitest';

import { extractIpFromWsEndpoint, probeIpfsGateway, probeIpfsGatewaysBatch } from './gateway-probe';

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('probeIpfsGateway', () => {
  test('probes the gateway root with HEAD and treats a 404 as reachable', async () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(100).mockReturnValueOnce(148);
    mockFetch.mockResolvedValueOnce({ status: 404 });

    const result = await probeIpfsGateway('http://gw.example:8080/ipfs');

    expect(result).toEqual({
      gatewayUrl: 'http://gw.example:8080/ipfs',
      latencyMs: 48,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://gw.example:8080/ipfs/',
      expect.objectContaining({
        method: 'HEAD',
        cache: 'no-store',
      }),
    );

    nowSpy.mockRestore();
  });

  test('returns null when the gateway responds with a 5xx status', async () => {
    mockFetch.mockResolvedValueOnce({ status: 503 });

    await expect(probeIpfsGateway('http://gw.example:8080/ipfs')).resolves.toBeNull();
  });

  test('returns null when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));

    await expect(probeIpfsGateway('http://gw.example:8080/ipfs')).resolves.toBeNull();
  });
});

describe('probeIpfsGatewaysBatch', () => {
  test('filters out failed gateway probes', async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 200 })
      .mockRejectedValueOnce(new Error('offline'));

    const results = await probeIpfsGatewaysBatch([
      'http://gw-1.example:8080/ipfs',
      'http://gw-2.example:8080/ipfs',
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.gatewayUrl).toBe('http://gw-1.example:8080/ipfs');
  });
});

describe('extractIpFromWsEndpoint', () => {
  test('extracts IPv4 addresses from websocket endpoints', () => {
    expect(extractIpFromWsEndpoint('ws://202.140.140.202:9944')).toBe('202.140.140.202');
    expect(extractIpFromWsEndpoint('wss://10.0.0.5:9944')).toBe('10.0.0.5');
  });

  test('returns null for loopback, unspecified, or hostname endpoints', () => {
    expect(extractIpFromWsEndpoint('ws://127.0.0.1:9944')).toBeNull();
    expect(extractIpFromWsEndpoint('ws://0.0.0.0:9944')).toBeNull();
    expect(extractIpFromWsEndpoint('wss://rpc.example.com:9944')).toBeNull();
  });
});
