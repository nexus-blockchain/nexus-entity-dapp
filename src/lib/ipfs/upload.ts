import { useIpfsGatewayStore } from '@/stores/ipfs-gateway-store';
import { IPFS_HEALTH_CONFIG } from './constants';

const ENV_IPFS_API_URL = process.env.NEXT_PUBLIC_IPFS_API_URL || '';

/**
 * Get the ordered list of IPFS API endpoints to try for upload.
 * Only env-configured or healthy gateway-derived APIs are returned.
 * Remote IPFS API ports (5001) are often closed, so we probe before using.
 */
function getApiUrls(): string[] {
  if (ENV_IPFS_API_URL) {
    return [ENV_IPFS_API_URL];
  }
  return useIpfsGatewayStore.getState().getOrderedApis();
}

/**
 * Quick check if an IPFS API endpoint is reachable.
 */
async function isApiReachable(apiUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IPFS_HEALTH_CONFIG.probeTimeout);
  try {
    const res = await fetch(`${apiUrl}/api/v0/version`, {
      method: 'POST',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Upload a File or Blob to IPFS, trying multiple nodes with fallback.
 * Returns the CID on success.
 */
export async function uploadToIpfs(file: File | Blob): Promise<string> {
  const apiUrls = getApiUrls();

  if (apiUrls.length === 0) {
    throw new Error('IPFS upload failed: no API nodes available');
  }

  let lastError: Error | null = null;

  for (const apiUrl of apiUrls) {
    // Quick reachability check to avoid slow connection timeouts
    const reachable = await isApiReachable(apiUrl);
    if (!reachable) continue;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiUrl}/api/v0/add`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        throw new Error(`IPFS upload failed (${response.status}): ${text}`);
      }

      const data = await response.json();
      return data.Hash as string;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('IPFS upload failed: no reachable API nodes');
}

/**
 * Upload a JSON object to IPFS, returns the CID.
 */
export async function uploadJsonToIpfs(data: unknown): Promise<string> {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  return uploadToIpfs(blob);
}

/**
 * Upload plain text to IPFS, returns the CID.
 */
export async function uploadTextToIpfs(text: string): Promise<string> {
  const blob = new Blob([text], { type: 'text/plain' });
  return uploadToIpfs(blob);
}
