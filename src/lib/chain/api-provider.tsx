'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { getConfiguredEndpoints, getSeedEndpoints, NODE_HEALTH_CONFIG } from './constants';
import {
  discoverPeers,
  probeEndpointsBatch,
  selectBestNode,
  shouldAutoSwitch,
  loadCachedNodes,
  saveCachedNodes,
  mergeCachedNodes,
} from './peer-discovery';
import { useNodeHealthStore } from '@/stores/node-health-store';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface ApiContextValue {
  api: ApiPromise | null;
  isReady: boolean;
  connectionStatus: ConnectionStatus;
  error: string | null;
  activeEndpoint: string | null;
  switchNode: (endpoint: string) => void;
  discoveredNodeCount: number;
  isDiscovering: boolean;
  addManualNode: (endpoint: string) => Promise<boolean>;
}

const ApiContext = createContext<ApiContextValue>({
  api: null,
  isReady: false,
  connectionStatus: 'disconnected',
  error: null,
  activeEndpoint: null,
  switchNode: () => {},
  discoveredNodeCount: 0,
  isDiscovering: false,
  addManualNode: async () => false,
});

/** Order endpoints: preferred first, then by health (healthy > slow > unknown > unhealthy), then by latency */
function orderEndpoints(
  endpoints: string[],
  preferred: string | null,
  nodes: { endpoint: string; status: string; latencyMs: number | null }[],
): string[] {
  const healthMap = new Map(nodes.map((n) => [n.endpoint, n]));
  const statusOrder: Record<string, number> = { healthy: 0, slow: 1, unknown: 2, unhealthy: 3 };

  const sorted = [...endpoints].sort((a, b) => {
    if (a === preferred) return -1;
    if (b === preferred) return 1;

    const ha = healthMap.get(a);
    const hb = healthMap.get(b);
    const sa = statusOrder[ha?.status ?? 'unknown'] ?? 2;
    const sb = statusOrder[hb?.status ?? 'unknown'] ?? 2;
    if (sa !== sb) return sa - sb;

    const la = ha?.latencyMs ?? Infinity;
    const lb = hb?.latencyMs ?? Infinity;
    return la - lb;
  });

  return sorted;
}

export function ApiProvider({
  endpoint,
  children,
}: {
  endpoint?: string;
  children: React.ReactNode;
}) {
  const [api, setApi] = useState<ApiPromise | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [activeEndpoint, setActiveEndpointLocal] = useState<string | null>(null);
  const [discoveredNodeCount, setDiscoveredNodeCount] = useState(0);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const apiRef = useRef<ApiPromise | null>(null);
  const providerRef = useRef<WsProvider | null>(null);
  const probeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bgProbeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discoveryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const initNodes = useNodeHealthStore((s) => s.initNodes);
  const addNodeToStore = useNodeHealthStore((s) => s.addNode);
  const storeNodes = useNodeHealthStore((s) => s.nodes);
  const setStoreActiveEndpoint = useNodeHealthStore((s) => s.setActiveEndpoint);
  const preferredEndpoint = useNodeHealthStore((s) => s.preferredEndpoint);
  const setPreferredEndpoint = useNodeHealthStore((s) => s.setPreferredEndpoint);
  const recordProbeSuccess = useNodeHealthStore((s) => s.recordProbeSuccess);
  const recordProbeFailure = useNodeHealthStore((s) => s.recordProbeFailure);

  const endpointsRef = useRef<string[]>([]);

  // -----------------------------------------------------------------------
  // Helper: create a WsProvider + ApiPromise connection
  // -----------------------------------------------------------------------
  const createConnection = useCallback(
    (ordered: string[]) => {
      // Disconnect existing
      if (apiRef.current) {
        apiRef.current.disconnect().catch(() => {});
        apiRef.current = null;
      }

      setConnectionStatus('connecting');
      setError(null);

      const provider = new WsProvider(ordered, 2500);
      providerRef.current = provider;

      provider.on('connected', () => {
        const ep = (provider as unknown as { endpoint: string }).endpoint ?? ordered[0];
        setActiveEndpointLocal(ep);
        setStoreActiveEndpoint(ep);
      });

      provider.on('disconnected', () => {
        setConnectionStatus('disconnected');
        setIsReady(false);
      });

      provider.on('error', () => {
        setConnectionStatus('error');
        setError('WebSocket connection error');
      });

      ApiPromise.create({ provider })
        .then((apiInstance) =>
          apiInstance.isReady.then(() => {
            apiRef.current = apiInstance;
            setApi(apiInstance);
            setIsReady(true);
            setConnectionStatus('connected');
          }),
        )
        .catch((err) => {
          setConnectionStatus('error');
          setError(err instanceof Error ? err.message : 'Failed to connect');
        });
    },
    [setStoreActiveEndpoint],
  );

  // -----------------------------------------------------------------------
  // Initial connection
  // -----------------------------------------------------------------------
  const connect = useCallback(() => {
    const seeds = getSeedEndpoints();
    const cached = loadCachedNodes().map((n) => n.endpoint);
    const endpoints = endpoint ? [endpoint] : getConfiguredEndpoints();
    endpointsRef.current = endpoints;

    // Initialize store: seeds vs discovered
    const seedSet = new Set(seeds);
    const seedEndpoints = endpoints.filter((e) => seedSet.has(e));
    const discoveredEndpoints = endpoints.filter((e) => !seedSet.has(e));
    initNodes(seedEndpoints.length > 0 ? seedEndpoints : endpoints, discoveredEndpoints);
    setDiscoveredNodeCount(cached.length);

    const ordered = orderEndpoints(endpoints, preferredEndpoint, storeNodes);
    createConnection(ordered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  useEffect(() => {
    connect();
    return () => {
      if (probeTimerRef.current) clearInterval(probeTimerRef.current);
      if (bgProbeTimerRef.current) clearInterval(bgProbeTimerRef.current);
      if (discoveryTimerRef.current) clearInterval(discoveryTimerRef.current);
      apiRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]);

  // -----------------------------------------------------------------------
  // Active node probe (every 15s)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (probeTimerRef.current) clearInterval(probeTimerRef.current);
    if (!isReady || !api || !activeEndpoint) return;

    const probe = async () => {
      const currentApi = apiRef.current;
      const ep = activeEndpoint;
      if (!currentApi || !ep) return;

      const start = performance.now();
      try {
        const header = await currentApi.rpc.chain.getHeader();
        const latency = Math.round(performance.now() - start);
        const blockHeight = header.number.toNumber();
        recordProbeSuccess(ep, latency, blockHeight);
      } catch {
        recordProbeFailure(ep);
      }
    };

    probe();
    probeTimerRef.current = setInterval(probe, NODE_HEALTH_CONFIG.probeInterval);

    return () => {
      if (probeTimerRef.current) clearInterval(probeTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, api, activeEndpoint]);

  // -----------------------------------------------------------------------
  // Background probe for inactive nodes (every 30s)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (bgProbeTimerRef.current) clearInterval(bgProbeTimerRef.current);
    if (!isReady || !activeEndpoint) return;

    const bgProbe = async () => {
      const currentNodes = useNodeHealthStore.getState().nodes;
      const inactiveEndpoints = currentNodes
        .filter((n) => n.endpoint !== activeEndpoint)
        .map((n) => n.endpoint);

      if (inactiveEndpoints.length === 0) return;

      const results = await probeEndpointsBatch(
        inactiveEndpoints,
        3,
        NODE_HEALTH_CONFIG.discoveryProbeTimeout,
      );

      const probedSet = new Set<string>();
      for (const r of results) {
        probedSet.add(r.endpoint);
        recordProbeSuccess(r.endpoint, r.latencyMs, r.blockHeight);
      }

      // Mark non-responsive endpoints
      for (const ep of inactiveEndpoints) {
        if (!probedSet.has(ep)) {
          recordProbeFailure(ep);
        }
      }

      // --- Auto-switch check ---
      const state = useNodeHealthStore.getState();
      const currentNode = state.nodes.find((n) => n.endpoint === activeEndpoint) ?? null;
      // Combine active probe data with background results for best-node selection
      const allResults = [
        ...results,
        ...(currentNode && currentNode.latencyMs != null && currentNode.blockHeight != null
          ? [{ endpoint: currentNode.endpoint, latencyMs: currentNode.latencyMs, blockHeight: currentNode.blockHeight }]
          : []),
      ];
      const best = selectBestNode(allResults, activeEndpoint);
      if (shouldAutoSwitch(currentNode, best, state.preferredEndpoint, activeEndpoint)) {
        autoSwitchNode(best!.endpoint);
      }
    };

    bgProbe();
    bgProbeTimerRef.current = setInterval(bgProbe, NODE_HEALTH_CONFIG.backgroundProbeInterval);

    return () => {
      if (bgProbeTimerRef.current) clearInterval(bgProbeTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, activeEndpoint]);

  // -----------------------------------------------------------------------
  // Peer discovery (every 60s when API is ready)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (discoveryTimerRef.current) clearInterval(discoveryTimerRef.current);
    if (!isReady || !api) return;

    const runDiscovery = async () => {
      const currentApi = apiRef.current;
      if (!currentApi) return;

      setIsDiscovering(true);
      try {
        const candidateEndpoints = await discoverPeers(currentApi);
        if (candidateEndpoints.length === 0) return;

        // Filter out already-known endpoints
        const known = new Set(useNodeHealthStore.getState().nodes.map((n) => n.endpoint));
        const newCandidates = candidateEndpoints.filter((ep) => !known.has(ep));

        // Probe new candidates
        const probeResults = await probeEndpointsBatch(
          newCandidates,
          3,
          NODE_HEALTH_CONFIG.discoveryProbeTimeout,
        );

        // Only add endpoints that responded successfully
        const reachable = probeResults.map((r) => r.endpoint);

        if (reachable.length > 0) {
          // Update store
          for (const ep of reachable) {
            addNodeToStore(ep, 'discovered');
          }

          // Update endpoints ref
          for (const ep of reachable) {
            if (!endpointsRef.current.includes(ep)) {
              endpointsRef.current.push(ep);
            }
          }

          // Record probe results
          for (const r of probeResults) {
            recordProbeSuccess(r.endpoint, r.latencyMs, r.blockHeight);
          }
        }

        // Update localStorage cache (include both old cached + newly discovered)
        const oldCached = loadCachedNodes();
        const allDiscovered = mergeCachedNodes(oldCached, reachable);
        saveCachedNodes(allDiscovered);
        setDiscoveredNodeCount(allDiscovered.length);
      } finally {
        setIsDiscovering(false);
      }
    };

    // First run after a small delay to let initial connection stabilize
    const initialTimer = setTimeout(runDiscovery, 5000);
    discoveryTimerRef.current = setInterval(runDiscovery, NODE_HEALTH_CONFIG.discoveryInterval);

    return () => {
      clearTimeout(initialTimer);
      if (discoveryTimerRef.current) clearInterval(discoveryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, api]);

  // -----------------------------------------------------------------------
  // Auto-switch: switch without setting preferred (so auto-select continues)
  // -----------------------------------------------------------------------
  const autoSwitchNode = useCallback(
    (ep: string) => {
      if (apiRef.current) {
        apiRef.current.disconnect().catch(() => {});
        apiRef.current = null;
      }
      setApi(null);
      setIsReady(false);
      setActiveEndpointLocal(null);

      const endpoints = endpointsRef.current;
      const nodes = useNodeHealthStore.getState().nodes;
      // Put the target endpoint first, then order the rest
      const rest = endpoints.filter((e) => e !== ep);
      const ordered = [ep, ...orderEndpoints(rest, null, nodes)];

      createConnection(ordered);
    },
    [createConnection],
  );

  // -----------------------------------------------------------------------
  // switchNode: user-initiated — persist preference, reconnect
  // -----------------------------------------------------------------------
  const switchNode = useCallback(
    (ep: string) => {
      setPreferredEndpoint(ep);

      if (apiRef.current) {
        apiRef.current.disconnect().catch(() => {});
        apiRef.current = null;
      }
      setApi(null);
      setIsReady(false);
      setActiveEndpointLocal(null);

      const endpoints = endpointsRef.current;
      const nodes = useNodeHealthStore.getState().nodes;
      const ordered = orderEndpoints(endpoints, ep, nodes);

      createConnection(ordered);
    },
    [setPreferredEndpoint, createConnection],
  );

  // -----------------------------------------------------------------------
  // addManualNode: probe first, add if reachable
  // -----------------------------------------------------------------------
  const addManualNode = useCallback(
    async (ep: string): Promise<boolean> => {
      const results = await probeEndpointsBatch([ep], 1, NODE_HEALTH_CONFIG.discoveryProbeTimeout);
      if (results.length === 0) return false;

      addNodeToStore(ep, 'manual');
      if (!endpointsRef.current.includes(ep)) {
        endpointsRef.current.push(ep);
      }
      recordProbeSuccess(results[0].endpoint, results[0].latencyMs, results[0].blockHeight);
      return true;
    },
    [addNodeToStore, recordProbeSuccess],
  );

  return (
    <ApiContext.Provider
      value={{
        api,
        isReady,
        connectionStatus,
        error,
        activeEndpoint,
        switchNode,
        discoveredNodeCount,
        isDiscovering,
        addManualNode,
      }}
    >
      {children}
    </ApiContext.Provider>
  );
}

/** Hook to access the Polkadot.js API instance */
export function useApi(): ApiContextValue {
  return useContext(ApiContext);
}
