import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockGetOrderedApis = vi.fn();

vi.mock('@/stores/ipfs-gateway-store', () => ({
  useIpfsGatewayStore: {
    getState: () => ({
      getOrderedApis: mockGetOrderedApis,
    }),
  },
}));

import { uploadJsonToIpfs, uploadTextToIpfs, uploadToIpfs } from './upload';

const FAKE_CID = 'QmTestCid123456789abcdef';
const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOrderedApis.mockReturnValue(['http://api-1:5001', 'http://api-2:5001']);
});

describe('uploadToIpfs', () => {
  test('uploads a file through the first reachable API and returns the CID', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true }) // POST /version reachability probe
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Hash: FAKE_CID }),
      }); // POST /add

    const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
    const cid = await uploadToIpfs(file);

    expect(cid).toBe(FAKE_CID);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://api-1:5001/api/v0/version',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://api-1:5001/api/v0/add',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    );
  });

  test('falls back to the next API when the first node is unreachable', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('unreachable'))
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Hash: FAKE_CID }),
      });

    const cid = await uploadToIpfs(new File(['x'], 'x.txt'));

    expect(cid).toBe(FAKE_CID);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://api-2:5001/api/v0/version',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'http://api-2:5001/api/v0/add',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('throws when no API nodes are available', async () => {
    mockGetOrderedApis.mockReturnValue([]);
    await expect(uploadToIpfs(new File(['x'], 'x.txt'))).rejects.toThrow(
      'IPFS upload failed: no API nodes available',
    );
  });

  test('throws when the add request returns a non-ok response', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

    await expect(uploadToIpfs(new File(['x'], 'x.txt'))).rejects.toThrow(
      'IPFS upload failed (401): Unauthorized',
    );
  });

  test('throws when all reachable nodes fail to upload', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('second network error'));

    await expect(uploadToIpfs(new File(['x'], 'x.txt'))).rejects.toThrow('second network error');
  });
});

describe('uploadJsonToIpfs', () => {
  test('uploads JSON content and returns the CID', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Hash: FAKE_CID }),
      });

    await expect(uploadJsonToIpfs({ name: 'Test' })).resolves.toBe(FAKE_CID);
  });
});

describe('uploadTextToIpfs', () => {
  test('uploads text content and returns the CID', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Hash: FAKE_CID }),
      });

    await expect(uploadTextToIpfs('Hello IPFS')).resolves.toBe(FAKE_CID);
  });
});
