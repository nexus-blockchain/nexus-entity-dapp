/** Hardcoded seed nodes — always available as fallback */
export const SEED_NODES: string[] = [
  'ws://127.0.0.1:9944',
  'ws://202.140.140.202:9944',
];

/** Node health probe configuration */
export const NODE_HEALTH_CONFIG = {
  /** Active node probe interval (ms) */
  probeInterval: 15_000,
  /** Background (inactive) node probe interval (ms) */
  backgroundProbeInterval: 30_000,
  /** Latency threshold for "slow" status (ms) */
  slowThreshold: 2000,
  /** Consecutive failures before marking unhealthy */
  unhealthyAfterFailures: 3,
  /** localStorage key for user-preferred node */
  preferredNodeKey: 'nexus_preferred_node',

  // --- Discovery ---
  /** Peer discovery cycle interval (ms) */
  discoveryInterval: 60_000,
  /** Timeout per endpoint probe during discovery (ms) */
  discoveryProbeTimeout: 3_000,
  /** RPC ports to try when constructing ws:// URLs from discovered IPs */
  discoveryRpcPorts: [9944, 9945] as readonly number[],
  /** localStorage key for discovered node cache */
  discoveredNodesCacheKey: 'nexus_discovered_nodes',
  /** Max number of discovered nodes to keep in cache */
  maxDiscoveredNodes: 20,
  /** Evict discovered nodes not seen for this duration (ms) — 24h */
  nodeEvictionAge: 86_400_000,

  // --- Auto-switch ---
  /** Best node latency must be ≤ this ratio of current to trigger auto-switch (0.7 = 30% better) */
  autoSwitchLatencyThreshold: 0.7,
  /** Current node must lag behind best by more than this many blocks to trigger switch */
  autoSwitchBlockLag: 5,
} as const;

/** Return only the seed endpoints (for UI labelling) */
export function getSeedEndpoints(): string[] {
  return [...SEED_NODES];
}

/**
 * Get all known endpoints: env var > seeds, merged with localStorage-cached discovered nodes (deduped).
 * The discovery cache is managed by peer-discovery.ts.
 */
export function getConfiguredEndpoints(): string[] {
  // 1. env var takes priority
  const multi = process.env.NEXT_PUBLIC_WS_ENDPOINTS;
  const base: string[] = multi
    ? multi.split(',').map((s) => s.trim()).filter(Boolean)
    : [...SEED_NODES];

  // 2. merge cached discovered nodes
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(NODE_HEALTH_CONFIG.discoveredNodesCacheKey);
      if (raw) {
        const cached: { endpoint: string }[] = JSON.parse(raw);
        for (const entry of cached) {
          if (entry.endpoint && !base.includes(entry.endpoint)) {
            base.push(entry.endpoint);
          }
        }
      }
    } catch { /* ignore corrupt cache */ }
  }

  return base;
}

/** React Query staleTime configuration per module (in ms) */
export const STALE_TIMES = {
  entity:     30_000,   // 30s
  shops:      30_000,   // 30s
  products:   15_000,   // 15s
  orders:     10_000,   // 10s
  token:      60_000,   // 60s
  orderBook:   5_000,   // 5s
  members:    30_000,   // 30s
  proposals:  30_000,   // 30s
} as const;

/** React Query retry configuration */
export const RETRY_CONFIG = {
  chainQuery: {
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
  },
  ipfsContent: {
    retry: 2,
    retryDelay: 2000,
  },
} as const;

/** Dangerous operations that require confirmation dialog */
export const DANGEROUS_OPERATIONS = [
  'transferOwnership',
  'requestCloseEntity',
  'lockGovernance',
  'banMember',
  'burnTokens',
] as const;
