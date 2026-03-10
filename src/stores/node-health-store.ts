import { create } from 'zustand';
import { NODE_HEALTH_CONFIG } from '@/lib/chain/constants';

export type NodeStatus = 'healthy' | 'slow' | 'unhealthy' | 'unknown';
export type NodeSource = 'seed' | 'discovered' | 'manual';

export interface NodeHealth {
  endpoint: string;
  status: NodeStatus;
  latencyMs: number | null;
  lastProbeAt: number | null;
  consecutiveFailures: number;
  blockHeight: number | null;
  source: NodeSource;
}

interface NodeHealthStore {
  nodes: NodeHealth[];
  activeEndpoint: string | null;
  preferredEndpoint: string | null;

  initNodes: (seeds: string[], discovered?: string[]) => void;
  addNode: (endpoint: string, source: NodeSource) => void;
  removeNode: (endpoint: string) => void;
  getBestNode: () => NodeHealth | null;
  setActiveEndpoint: (ep: string) => void;
  setPreferredEndpoint: (ep: string | null) => void;
  recordProbeSuccess: (ep: string, latencyMs: number, blockHeight: number) => void;
  recordProbeFailure: (ep: string) => void;
}

function loadPreferred(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(NODE_HEALTH_CONFIG.preferredNodeKey);
  } catch {
    return null;
  }
}

function makeNode(endpoint: string, source: NodeSource): NodeHealth {
  return {
    endpoint,
    status: 'unknown',
    latencyMs: null,
    lastProbeAt: null,
    consecutiveFailures: 0,
    blockHeight: null,
    source,
  };
}

export const useNodeHealthStore = create<NodeHealthStore>((set, get) => ({
  nodes: [],
  activeEndpoint: null,
  preferredEndpoint: loadPreferred(),

  initNodes: (seeds, discovered = []) => {
    const existing = get().nodes;
    const existingMap = new Map(existing.map((n) => [n.endpoint, n]));

    const result: NodeHealth[] = [];
    const seen = new Set<string>();

    for (const ep of seeds) {
      if (seen.has(ep)) continue;
      seen.add(ep);
      result.push(existingMap.get(ep) ?? makeNode(ep, 'seed'));
    }

    for (const ep of discovered) {
      if (seen.has(ep)) continue;
      seen.add(ep);
      result.push(existingMap.get(ep) ?? makeNode(ep, 'discovered'));
    }

    // Keep any existing manual nodes that are not in either list
    for (const n of existing) {
      if (!seen.has(n.endpoint) && n.source === 'manual') {
        seen.add(n.endpoint);
        result.push(n);
      }
    }

    set({ nodes: result });
  },

  addNode: (endpoint, source) => {
    const exists = get().nodes.some((n) => n.endpoint === endpoint);
    if (exists) return;
    set((state) => ({
      nodes: [...state.nodes, makeNode(endpoint, source)],
    }));
  },

  removeNode: (endpoint) => {
    set((state) => ({
      nodes: state.nodes.filter(
        (n) => n.endpoint !== endpoint || n.source === 'seed',
      ),
    }));
  },

  getBestNode: () => {
    const { nodes } = get();
    const healthy = nodes.filter(
      (n) => n.status === 'healthy' && n.latencyMs != null && n.blockHeight != null,
    );
    if (healthy.length === 0) return null;

    const maxBlock = Math.max(...healthy.map((n) => n.blockHeight!));
    // Only consider nodes within 3 blocks of the highest
    const candidates = healthy.filter((n) => n.blockHeight! >= maxBlock - 3);
    // Pick lowest latency
    candidates.sort((a, b) => a.latencyMs! - b.latencyMs!);
    return candidates[0] ?? null;
  },

  setActiveEndpoint: (ep) => set({ activeEndpoint: ep }),

  setPreferredEndpoint: (ep) => {
    if (typeof window !== 'undefined') {
      try {
        if (ep) {
          localStorage.setItem(NODE_HEALTH_CONFIG.preferredNodeKey, ep);
        } else {
          localStorage.removeItem(NODE_HEALTH_CONFIG.preferredNodeKey);
        }
      } catch { /* ignore */ }
    }
    set({ preferredEndpoint: ep });
  },

  recordProbeSuccess: (ep, latencyMs, blockHeight) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.endpoint === ep
          ? {
              ...n,
              status: latencyMs > NODE_HEALTH_CONFIG.slowThreshold ? 'slow' : 'healthy',
              latencyMs,
              blockHeight,
              lastProbeAt: Date.now(),
              consecutiveFailures: 0,
            }
          : n,
      ),
    })),

  recordProbeFailure: (ep) =>
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.endpoint !== ep) return n;
        const failures = n.consecutiveFailures + 1;
        return {
          ...n,
          consecutiveFailures: failures,
          lastProbeAt: Date.now(),
          status: failures >= NODE_HEALTH_CONFIG.unhealthyAfterFailures ? 'unhealthy' : n.status,
        };
      }),
    })),
}));
