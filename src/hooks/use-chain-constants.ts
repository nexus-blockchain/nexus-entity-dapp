'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';

/**
 * Read a single pallet constant as bigint.
 * Returns BigInt(0) if pallet or constant not found.
 */
function readBigInt(api: any, pallet: string, name: string): bigint {
  const value = api.consts?.[pallet]?.[name];
  if (!value) return BigInt(0);
  return BigInt(value.toString());
}

/**
 * Read a single pallet constant as number.
 * Returns 0 if pallet or constant not found.
 */
function readU32(api: any, pallet: string, name: string): number {
  const value = api.consts?.[pallet]?.[name];
  if (!value) return 0;
  return Number(value.toString());
}

// ─── Types ────────────────────────────────────────────────

export interface NexMarketConstants {
  minOrderNexAmount: bigint;
  maxOrderNexAmount: bigint;
  maxFirstOrderAmount: bigint;
  defaultOrderTtl: number;
  maxActiveOrdersPerUser: number;
  usdtTimeout: number;
  circuitBreakerDuration: number;
  maxSellOrders: number;
  maxBuyOrders: number;
  maxPendingTrades: number;
  maxAwaitingPaymentTrades: number;
  disputeWindowBlocks: number;
  maxTradesPerUser: number;
  maxOrderTrades: number;
}

export interface EntityOrderConstants {
  shipTimeout: number;
  confirmTimeout: number;
  serviceConfirmTimeout: number;
  disputeTimeout: number;
  confirmExtension: number;
  maxCidLength: number;
  maxBuyerOrders: number;
  maxPayerOrders: number;
  maxShopOrders: number;
}

export interface GovernanceConstants {
  votingPeriod: number;
  executionDelay: number;
  passThreshold: number;
  quorumThreshold: number;
  minProposalThreshold: number;
  maxTitleLength: number;
  maxCidLength: number;
  maxActiveProposals: number;
  maxDelegatorsPerDelegate: number;
  minVotingPeriod: number;
  minExecutionDelay: number;
  maxVotingPeriod: number;
  maxExecutionDelay: number;
  proposalCooldown: number;
}

export interface CommissionCoreConstants {
  referrerShareBps: number;
  maxCommissionRecordsPerOrder: number;
  maxCustomLevels: number;
  poolRewardWithdrawCooldown: number;
  maxWithdrawalRecords: number;
  maxMemberOrderIds: number;
}

export interface ReviewConstants {
  maxCidLength: number;
  maxReviewsPerUser: number;
  reviewWindowBlocks: number;
}

export interface EntityRegistryConstants {
  initialFundUsdt: bigint;
}

export interface ChainConstants {
  nexMarket: NexMarketConstants | null;
  entityOrder: EntityOrderConstants | null;
  entityGovernance: GovernanceConstants | null;
  commissionCore: CommissionCoreConstants | null;
  entityReview: ReviewConstants | null;
  entityRegistry: EntityRegistryConstants | null;
}

// ─── Parsers ──────────────────────────────────────────────

function parseNexMarket(api: any): NexMarketConstants | null {
  if (!hasPallet(api, 'nexMarket')) return null;
  return {
    minOrderNexAmount: readBigInt(api, 'nexMarket', 'minOrderNexAmount'),
    maxOrderNexAmount: readBigInt(api, 'nexMarket', 'maxOrderNexAmount'),
    maxFirstOrderAmount: readBigInt(api, 'nexMarket', 'maxFirstOrderAmount'),
    defaultOrderTtl: readU32(api, 'nexMarket', 'defaultOrderTTL'),
    maxActiveOrdersPerUser: readU32(api, 'nexMarket', 'maxActiveOrdersPerUser'),
    usdtTimeout: readU32(api, 'nexMarket', 'usdtTimeout'),
    circuitBreakerDuration: readU32(api, 'nexMarket', 'circuitBreakerDuration'),
    maxSellOrders: readU32(api, 'nexMarket', 'maxSellOrders'),
    maxBuyOrders: readU32(api, 'nexMarket', 'maxBuyOrders'),
    maxPendingTrades: readU32(api, 'nexMarket', 'maxPendingTrades'),
    maxAwaitingPaymentTrades: readU32(api, 'nexMarket', 'maxAwaitingPaymentTrades'),
    disputeWindowBlocks: readU32(api, 'nexMarket', 'disputeWindowBlocks'),
    maxTradesPerUser: readU32(api, 'nexMarket', 'maxTradesPerUser'),
    maxOrderTrades: readU32(api, 'nexMarket', 'maxOrderTrades'),
  };
}

function parseEntityOrder(api: any): EntityOrderConstants | null {
  if (!hasPallet(api, 'entityTransaction')) return null;
  return {
    shipTimeout: readU32(api, 'entityTransaction', 'shipTimeout'),
    confirmTimeout: readU32(api, 'entityTransaction', 'confirmTimeout'),
    serviceConfirmTimeout: readU32(api, 'entityTransaction', 'serviceConfirmTimeout'),
    disputeTimeout: readU32(api, 'entityTransaction', 'disputeTimeout'),
    confirmExtension: readU32(api, 'entityTransaction', 'confirmExtension'),
    maxCidLength: readU32(api, 'entityTransaction', 'maxCidLength'),
    maxBuyerOrders: readU32(api, 'entityTransaction', 'maxBuyerOrders'),
    maxPayerOrders: readU32(api, 'entityTransaction', 'maxPayerOrders'),
    maxShopOrders: readU32(api, 'entityTransaction', 'maxShopOrders'),
  };
}

function parseGovernance(api: any): GovernanceConstants | null {
  if (!hasPallet(api, 'entityGovernance')) return null;
  return {
    votingPeriod: readU32(api, 'entityGovernance', 'votingPeriod'),
    executionDelay: readU32(api, 'entityGovernance', 'executionDelay'),
    passThreshold: readU32(api, 'entityGovernance', 'passThreshold'),
    quorumThreshold: readU32(api, 'entityGovernance', 'quorumThreshold'),
    minProposalThreshold: readU32(api, 'entityGovernance', 'minProposalThreshold'),
    maxTitleLength: readU32(api, 'entityGovernance', 'maxTitleLength'),
    maxCidLength: readU32(api, 'entityGovernance', 'maxCidLength'),
    maxActiveProposals: readU32(api, 'entityGovernance', 'maxActiveProposals'),
    maxDelegatorsPerDelegate: readU32(api, 'entityGovernance', 'maxDelegatorsPerDelegate'),
    minVotingPeriod: readU32(api, 'entityGovernance', 'minVotingPeriod'),
    minExecutionDelay: readU32(api, 'entityGovernance', 'minExecutionDelay'),
    maxVotingPeriod: readU32(api, 'entityGovernance', 'maxVotingPeriod'),
    maxExecutionDelay: readU32(api, 'entityGovernance', 'maxExecutionDelay'),
    proposalCooldown: readU32(api, 'entityGovernance', 'proposalCooldown'),
  };
}

function parseCommissionCore(api: any): CommissionCoreConstants | null {
  if (!hasPallet(api, 'commissionCore')) return null;
  return {
    referrerShareBps: readU32(api, 'commissionCore', 'referrerShareBps'),
    maxCommissionRecordsPerOrder: readU32(api, 'commissionCore', 'maxCommissionRecordsPerOrder'),
    maxCustomLevels: readU32(api, 'commissionCore', 'maxCustomLevels'),
    poolRewardWithdrawCooldown: readU32(api, 'commissionCore', 'poolRewardWithdrawCooldown'),
    maxWithdrawalRecords: readU32(api, 'commissionCore', 'maxWithdrawalRecords'),
    maxMemberOrderIds: readU32(api, 'commissionCore', 'maxMemberOrderIds'),
  };
}

function parseReview(api: any): ReviewConstants | null {
  if (!hasPallet(api, 'entityReview')) return null;
  return {
    maxCidLength: readU32(api, 'entityReview', 'maxCidLength'),
    maxReviewsPerUser: readU32(api, 'entityReview', 'maxReviewsPerUser'),
    reviewWindowBlocks: readU32(api, 'entityReview', 'reviewWindowBlocks'),
  };
}

function parseEntityRegistry(api: any): EntityRegistryConstants | null {
  if (!hasPallet(api, 'entityRegistry')) return null;
  return {
    initialFundUsdt: readBigInt(api, 'entityRegistry', 'initialFundUsdt'),
  };
}

// ─── Hook ─────────────────────────────────────────────────

/**
 * Centralized hook for reading all chain pallet constants.
 *
 * Constants are read from `api.consts` (runtime metadata) in a single query
 * and cached with a long staleTime since they only change on runtime upgrades.
 */
export function useChainConstants(): ChainConstants & { isLoading: boolean } {
  const query = useEntityQuery<ChainConstants>(
    ['chainConstants'],
    async (api) => ({
      nexMarket: parseNexMarket(api),
      entityOrder: parseEntityOrder(api),
      entityGovernance: parseGovernance(api),
      commissionCore: parseCommissionCore(api),
      entityReview: parseReview(api),
      entityRegistry: parseEntityRegistry(api),
    }),
    { staleTime: 5 * 60_000 }, // 5 min — constants only change on runtime upgrade
  );

  return {
    nexMarket: query.data?.nexMarket ?? null,
    entityOrder: query.data?.entityOrder ?? null,
    entityGovernance: query.data?.entityGovernance ?? null,
    commissionCore: query.data?.commissionCore ?? null,
    entityReview: query.data?.entityReview ?? null,
    entityRegistry: query.data?.entityRegistry ?? null,
    isLoading: query.isLoading,
  };
}
