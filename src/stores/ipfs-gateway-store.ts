import { create } from 'zustand';
import { IPFS_HEALTH_CONFIG } from '@/lib/ipfs/constants';
import { extractIpFromWsEndpoint } from '@/lib/ipfs/gateway-probe';
import { useNodeHealthStore } from './node-health-store';

export type IpfsGatewayStatus = 'healthy' | 'slow' | 'unhealthy' | 'unknown';

export interface IpfsGatewayHealth {
  ip: string;
  gatewayUrl: string;
  apiUrl: string;
  status: IpfsGatewayStatus;
  latencyMs: number | null;
  lastProbeAt: number | null;
  consecutiveFailures: number;
}

interface IpfsGatewayStore {
  gateways: IpfsGatewayHealth[];

  /** Sync gateway list from node-health-store endpoints */
  syncFromNodeStore: () => void;

  /** Record a successful probe */
  recordProbeSuccess: (gatewayUrl: string, latencyMs: number) => void;

  /** Record a failed probe */
  recordProbeFailure: (gatewayUrl: string) => void;

  /** Get the best available gateway URL (for reading) */
  getActiveGateway: () => string;

  /** Get the best available API URL (for uploading) */
  getActiveApi: () => string;

  /** Get all gateways ordered by health + latency (for fallback chains) */
  getOrderedGateways: () => string[];

  /** Get all API URLs ordered by health + latency (for upload fallback) */
  getOrderedApis: () => string[];
}

function makeGateway(ip: string): IpfsGatewayHealth {
  return {
    ip,
    gatewayUrl: `http://${ip}:${IPFS_HEALTH_CONFIG.gatewayPort}/ipfs`,
    apiUrl: `http://${ip}:${IPFS_HEALTH_CONFIG.apiPort}`,
    status: 'unknown',
    latencyMs: null,
    lastProbeAt: null,
    consecutiveFailures: 0,
  };
}

const statusPriority: Record<IpfsGatewayStatus, number> = {
  healthy: 0,
  slow: 1,
  unknown: 2,
  unhealthy: 3,
};

function sortGateways(gateways: IpfsGatewayHealth[]): IpfsGatewayHealth[] {
  return [...gateways].sort((a, b) => {
    const sa = statusPriority[a.status];
    const sb = statusPriority[b.status];
    if (sa !== sb) return sa - sb;
    const la = a.latencyMs ?? Infinity;
    const lb = b.latencyMs ?? Infinity;
    return la - lb;
  });
}

export const useIpfsGatewayStore = create<IpfsGatewayStore>((set, get) => ({
  gateways: [],

  syncFromNodeStore: () => {
    const nodes = useNodeHealthStore.getState().nodes;
    const existing = get().gateways;
    const existingMap = new Map(existing.map((g) => [g.ip, g]));

    const seen = new Set<string>();
    const result: IpfsGatewayHealth[] = [];

    for (const node of nodes) {
      const ip = extractIpFromWsEndpoint(node.endpoint);
      if (!ip || seen.has(ip)) continue;
      seen.add(ip);
      result.push(existingMap.get(ip) ?? makeGateway(ip));
    }

    set({ gateways: result });
  },

  recordProbeSuccess: (gatewayUrl, latencyMs) =>
    set((state) => ({
      gateways: state.gateways.map((g) =>
        g.gatewayUrl === gatewayUrl
          ? {
              ...g,
              status: latencyMs > IPFS_HEALTH_CONFIG.slowThreshold ? 'slow' : 'healthy',
              latencyMs,
              lastProbeAt: Date.now(),
              consecutiveFailures: 0,
            }
          : g,
      ),
    })),

  recordProbeFailure: (gatewayUrl) =>
    set((state) => ({
      gateways: state.gateways
        .map((g) => {
          if (g.gatewayUrl !== gatewayUrl) return g;
          const failures = g.consecutiveFailures + 1;
          return {
            ...g,
            consecutiveFailures: failures,
            lastProbeAt: Date.now(),
            status:
              failures >= IPFS_HEALTH_CONFIG.unhealthyAfterFailures
                ? ('unhealthy' as const)
                : g.status,
          };
        })
        // Remove unhealthy nodes — they will be re-added on next syncFromNodeStore
        .filter((g) => g.status !== 'unhealthy'),
    })),

  getActiveGateway: () => {
    const sorted = sortGateways(get().gateways);
    const best = sorted.find((g) => g.status === 'healthy' || g.status === 'slow');
    return best?.gatewayUrl ?? IPFS_HEALTH_CONFIG.fallbackGateway;
  },

  getActiveApi: () => {
    const sorted = sortGateways(get().gateways);
    const best = sorted.find((g) => g.status === 'healthy' || g.status === 'slow');
    return best?.apiUrl ?? '';
  },

  getOrderedGateways: () => {
    const sorted = sortGateways(get().gateways);
    const urls = sorted
      .filter((g) => g.status !== 'unhealthy')
      .map((g) => g.gatewayUrl);
    // Always append the public fallback at the end
    urls.push(IPFS_HEALTH_CONFIG.fallbackGateway);
    return urls;
  },

  getOrderedApis: () => {
    const sorted = sortGateways(get().gateways);
    return sorted
      .filter((g) => g.status !== 'unhealthy')
      .map((g) => g.apiUrl);
  },
}));
