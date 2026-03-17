/** IPFS gateway health probe configuration */
export const IPFS_HEALTH_CONFIG = {
  /** IPFS gateway port (kubo default, overridable via NEXT_PUBLIC_IPFS_GATEWAY_PORT) */
  gatewayPort: Number(process.env.NEXT_PUBLIC_IPFS_GATEWAY_PORT) || 8080,
  /** IPFS API port (kubo default, overridable via NEXT_PUBLIC_IPFS_API_PORT) */
  apiPort: Number(process.env.NEXT_PUBLIC_IPFS_API_PORT) || 5001,
  /** Probe interval (ms) */
  probeInterval: 30_000,
  /** Probe timeout per gateway (ms) */
  probeTimeout: 5_000,
  /** Consecutive failures before marking unhealthy */
  unhealthyAfterFailures: 2,
  /** Latency threshold for "slow" status (ms) */
  slowThreshold: 3000,
  /** Fallback public gateway when all Nexus gateways are down */
  fallbackGateway: 'https://gateway.pinata.cloud/ipfs',
} as const;
