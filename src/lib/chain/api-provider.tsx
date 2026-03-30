'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { ApiPromise, WsProvider } from '@polkadot/api';
import type { DefinitionsCall } from '@polkadot/types/types';
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

// Global API reference accessible outside React tree (e.g. desktop-keyring signer)
let _globalApi: ApiPromise | null = null;
export function getGlobalApi(): ApiPromise | null {
  return _globalApi;
}

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

const singleLineTypes: Record<string, any> = {
  SingleLineMemberPositionInfo: {
    position: 'u32',
    queue_length: 'u32',
    upline_levels: 'u8',
    downline_levels: 'u8',
    previous_account: 'Option<AccountId>',
    next_account: 'Option<AccountId>',
  },
  SingleLinePayoutRecordView: {
    order_id: 'u64',
    buyer: 'AccountId',
    amount: 'u128',
    direction: 'u8',
    level_distance: 'u16',
    block_number: 'u64',
  },
  SingleLineMemberSummaryView: {
    total_earned_as_upline: 'u128',
    total_earned_as_downline: 'u128',
    total_payout_count: 'u32',
    last_payout_block: 'u64',
  },
  SingleLinePreviewOutput: {
    beneficiary: 'AccountId',
    amount: 'u128',
    commission_type: 'CommissionType',
    level: 'u16',
  },
  SingleLineMemberView: {
    position_info: 'Option<SingleLineMemberPositionInfo>',
    is_enabled: 'bool',
    summary: 'SingleLineMemberSummaryView',
    recent_payouts: 'Vec<SingleLinePayoutRecordView>',
  },
  SingleLineEntityStatsView: {
    total_orders: 'u32',
    total_upline_payouts: 'u32',
    total_downline_payouts: 'u32',
  },
  SingleLineOverview: {
    is_enabled: 'bool',
    queue_length: 'u32',
    remaining_capacity_in_tail_segment: 'u32',
    segment_count: 'u32',
    stats: 'SingleLineEntityStatsView',
  },
};

// ── Pool Reward Runtime API types ──
const poolRewardTypes: Record<string, any> = {
  CapBehaviorInfo: {
    _enum: {
      Fixed: null,
      UnlockByTeam: {
        direct_per_unlock: 'u32',
        team_per_unlock: 'u32',
        unlock_percent: 'u16',
        baseline_direct: 'u32',
        baseline_team: 'u32',
      },
    },
  },
  AdminLevelRuleInfo: {
    level_id: 'u8',
    base_cap_percent: 'u16',
    cap_behavior: 'CapBehaviorInfo',
    member_count: 'u32',
    capped_member_count: 'u32',
  },
  LevelRuleSummaryInfo: {
    level_id: 'u8',
    base_cap_percent: 'u16',
    cap_behavior: 'CapBehaviorInfo',
  },
  LevelProgressInfo: {
    level_id: 'u8',
    ratio_bps: 'u16',
    member_count: 'u32',
    claimed_count: 'u32',
    per_member_reward: 'u128',
  },
  FundingSummaryInfo: {
    nex_commission_remainder: 'u128',
    token_platform_fee_retention: 'u128',
    token_commission_remainder: 'u128',
    nex_cancel_return: 'u128',
    total_funding_count: 'u32',
  },
  RoundDetailInfo: {
    round_id: 'u64',
    start_block: 'u64',
    end_block: 'u64',
    pool_snapshot: 'u128',
    nex_usdt_rate_snapshot: 'Option<u64>',
    eligible_count: 'u32',
    per_member_reward: 'u128',
    claimed_count: 'u32',
    token_pool_snapshot: 'Option<u128>',
    token_per_member_reward: 'Option<u128>',
    token_claimed_count: 'u32',
    level_snapshots: 'Vec<LevelProgressInfo>',
    token_level_snapshots: 'Option<Vec<LevelProgressInfo>>',
  },
  CompletedRoundInfo: {
    round_id: 'u64',
    start_block: 'u64',
    end_block: 'u64',
    pool_snapshot: 'u128',
    nex_usdt_rate_snapshot: 'Option<u64>',
    eligible_count: 'u32',
    per_member_reward: 'u128',
    claimed_count: 'u32',
    token_pool_snapshot: 'Option<u128>',
    token_per_member_reward: 'Option<u128>',
    token_claimed_count: 'u32',
    level_snapshots: 'Vec<LevelProgressInfo>',
    token_level_snapshots: 'Option<Vec<LevelProgressInfo>>',
    funding_summary: 'FundingSummaryInfo',
  },
  PendingConfigInfo: {
    level_rules: 'Vec<(u8, u16)>',
    level_rule_details: 'Vec<LevelRuleSummaryInfo>',
    round_duration: 'u64',
    apply_after: 'u64',
  },
  PoolRewardAdminView: {
    level_rules: 'Vec<(u8, u16)>',
    level_rule_details: 'Vec<AdminLevelRuleInfo>',
    round_duration: 'u64',
    token_pool_enabled: 'bool',
    current_round: 'Option<RoundDetailInfo>',
    total_nex_distributed: 'u128',
    total_token_distributed: 'u128',
    total_rounds_completed: 'u64',
    total_claims: 'u64',
    round_history: 'Vec<CompletedRoundInfo>',
    pending_config: 'Option<PendingConfigInfo>',
    is_paused: 'bool',
    is_global_paused: 'bool',
    current_pool_balance: 'u128',
    current_token_pool_balance: 'u128',
    token_pool_deficit: 'u128',
  },
};

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

// ============================================================================
// Custom SCALE types + Runtime API definitions for EntityRegistryApi
// ============================================================================

const entityRegistryTypes: Record<string, any> = {
  ProtectedFundsBreakdown: {
    pending_commission: 'u128',
    shopping_balance: 'u128',
    unallocated_pool: 'u128',
    pending_refund: 'u128',
  },
  FundProtectionRules: {
    min_treasury_threshold: 'u128',
    max_single_spend: 'u128',
    max_daily_spend: 'u128',
    daily_spent: 'u128',
    daily_remaining: 'u128',
  },
  FundHealthStatus: {
    level: 'u8',
    min_operating: 'u128',
    warning_threshold: 'u128',
    below_threshold: 'bool',
    below_min_operating: 'bool',
  },
  EntityFundsView: {
    treasury_balance: 'u128',
    protected_total: 'u128',
    available: 'u128',
    protected: 'ProtectedFundsBreakdown',
    protection_config: 'Option<FundProtectionRules>',
    health: 'FundHealthStatus',
  },
};

const entityRegistryRuntimeDefs: DefinitionsCall = {
  EntityRegistryApi: [
    {
      methods: {
        get_entity_funds: {
          description: 'Query entity fund overview with protected breakdown',
          params: [{ name: 'entity_id', type: 'u64' }],
          type: 'Option<EntityFundsView>',
        },
      },
      version: 1,
    },
  ],
  SingleLineQueryApi: [
    {
      methods: {
        single_line_member_position: {
          description: 'Query single-line member position info',
          params: [
            { name: 'entity_id', type: 'u64' },
            { name: 'account', type: 'AccountId' },
          ],
          type: 'Option<SingleLineMemberPositionInfo>',
        },
        single_line_member_view: {
          description: 'Query single-line member view',
          params: [
            { name: 'entity_id', type: 'u64' },
            { name: 'account', type: 'AccountId' },
          ],
          type: 'Option<SingleLineMemberView>',
        },
        single_line_overview: {
          description: 'Query single-line overview',
          params: [{ name: 'entity_id', type: 'u64' }],
          type: 'SingleLineOverview',
        },
        single_line_member_payouts: {
          description: 'Query single-line member payouts',
          params: [
            { name: 'entity_id', type: 'u64' },
            { name: 'account', type: 'AccountId' },
          ],
          type: 'Vec<SingleLinePayoutRecordView>',
        },
        single_line_preview_commission: {
          description: 'Preview single-line commission outputs',
          params: [
            { name: 'entity_id', type: 'u64' },
            { name: 'buyer', type: 'AccountId' },
            { name: 'order_amount', type: 'u128' },
          ],
          type: 'Vec<SingleLinePreviewOutput>',
        },
      },
      version: 1,
    },
  ],
  PoolRewardDetailApi: [
    {
      methods: {
        get_pool_reward_admin_view: {
          description: 'Get comprehensive pool reward admin view',
          params: [{ name: 'entity_id', type: 'u64' }],
          type: 'Option<PoolRewardAdminView>',
        },
      },
      version: 1,
    },
  ],
};

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

      ApiPromise.create({ provider, types: { ...entityRegistryTypes, ...singleLineTypes, ...poolRewardTypes }, runtime: entityRegistryRuntimeDefs })
        .then((apiInstance) =>
          apiInstance.isReady.then(() => {
            apiRef.current = apiInstance;
            _globalApi = apiInstance;
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
