'use client';

import { useEffect, useRef } from 'react';
import { useIpfsGatewayStore } from '@/stores/ipfs-gateway-store';
import { useNodeHealthStore } from '@/stores/node-health-store';
import { probeIpfsGatewaysBatch } from './gateway-probe';
import { IPFS_HEALTH_CONFIG } from './constants';

/**
 * Manages IPFS gateway health probing lifecycle.
 * - Syncs gateway list from node-health-store on mount and on node changes.
 * - Periodically probes all gateways and updates health status.
 */
export function IpfsHealthProvider({ children }: { children: React.ReactNode }) {
  const probeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const { syncFromNodeStore } = useIpfsGatewayStore.getState();

    // Initial sync
    syncFromNodeStore();

    // Subscribe to node-health-store changes to pick up new nodes
    const unsub = useNodeHealthStore.subscribe(() => {
      syncFromNodeStore();
    });

    // Probe cycle
    const runProbe = async () => {
      const store = useIpfsGatewayStore.getState();
      const gatewayUrls = store.gateways.map((g) => g.gatewayUrl);
      if (gatewayUrls.length === 0) return;

      const results = await probeIpfsGatewaysBatch(gatewayUrls);

      const succeededSet = new Set(results.map((r) => r.gatewayUrl));
      for (const r of results) {
        store.recordProbeSuccess(r.gatewayUrl, r.latencyMs);
      }
      for (const url of gatewayUrls) {
        if (!succeededSet.has(url)) {
          store.recordProbeFailure(url);
        }
      }
    };

    // Run first probe after a short delay
    const initialTimer = setTimeout(runProbe, 2000);
    probeTimerRef.current = setInterval(runProbe, IPFS_HEALTH_CONFIG.probeInterval);

    return () => {
      unsub();
      clearTimeout(initialTimer);
      if (probeTimerRef.current) clearInterval(probeTimerRef.current);
    };
  }, []);

  return <>{children}</>;
}
