/** IPFS gateway health probe configuration */
export const IPFS_HEALTH_CONFIG = {
  /** IPFS gateway port (kubo default) */
  gatewayPort: 8080,
  /** IPFS API port (kubo default) */
  apiPort: 5001,
  /** Probe interval (ms) */
  probeInterval: 30_000,
  /** Probe timeout per gateway (ms) */
  probeTimeout: 5_000,
  /** Consecutive failures before marking unhealthy */
  unhealthyAfterFailures: 2,
  /** Latency threshold for "slow" status (ms) */
  slowThreshold: 3000,
  /** Well-known CID for health probing (empty directory) */
  probeCid: 'bafybeifx7yeb55armcsxwwitkymga5xf53dxiarykms3ygqic223w5sk3m',
  /** Fallback public gateway when all Nexus gateways are down */
  fallbackGateway: 'https://gateway.pinata.cloud/ipfs',
} as const;
