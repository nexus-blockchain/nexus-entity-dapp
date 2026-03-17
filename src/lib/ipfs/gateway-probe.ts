import { IPFS_HEALTH_CONFIG } from './constants';

export interface GatewayProbeResult {
  gatewayUrl: string;
  latencyMs: number;
}

function getGatewayProbeUrl(gatewayUrl: string): string {
  return gatewayUrl.endsWith('/') ? gatewayUrl : `${gatewayUrl}/`;
}

/**
 * Probe a single IPFS gateway by issuing a HEAD request to the gateway root.
 * Any non-5xx HTTP response counts as reachable; network failures/timeouts do not.
 */
export async function probeIpfsGateway(
  gatewayUrl: string,
  timeout: number = IPFS_HEALTH_CONFIG.probeTimeout,
): Promise<GatewayProbeResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const start = performance.now();
    const res = await fetch(getGatewayProbeUrl(gatewayUrl), {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - start);
    if (res.status >= 500) return null;
    return { gatewayUrl, latencyMs };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe multiple IPFS gateways in parallel.
 */
export async function probeIpfsGatewaysBatch(
  gateways: string[],
  timeout: number = IPFS_HEALTH_CONFIG.probeTimeout,
): Promise<GatewayProbeResult[]> {
  const results = await Promise.all(
    gateways.map((gw) => probeIpfsGateway(gw, timeout)),
  );
  return results.filter((r): r is GatewayProbeResult => r !== null);
}

/**
 * Extract the IP address from a WebSocket endpoint like `ws://1.2.3.4:9944`.
 * Returns null for non-IP endpoints (e.g. hostnames) or invalid formats.
 */
export function extractIpFromWsEndpoint(endpoint: string): string | null {
  try {
    // ws://IP:PORT or wss://IP:PORT
    const stripped = endpoint.replace(/^wss?:\/\//, '');
    const host = stripped.split(':')[0];
    // Validate it looks like an IPv4 address
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      return null;
    }
    // Filter loopback and unspecified addresses — local machine unlikely runs IPFS
    if (host.startsWith('127.') || host === '0.0.0.0') {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}
