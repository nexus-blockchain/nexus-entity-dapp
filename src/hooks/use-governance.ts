'use client';

import { useEntityQuery, hasPallet } from './use-entity-query';
import { useEntityMutation } from './use-entity-mutation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { STALE_TIMES } from '@/lib/chain/constants';
import { getEntityTokenAssetId } from './use-entity-token';
import type { ProposalData } from '@/lib/types/models';
import { VoteOption } from '@/lib/types/enums';

// ─── Helpers ────────────────────────────────────────────────

/**
 * Extract proposal type key and payload from chain enum value.
 * Simple variants (no payload): toJSON() returns a string like 'MarketPause'
 * Complex variants (with payload): toJSON() returns { PriceChange: { product_id: 1, ... } }
 */
function parseProposalTypeEnum(raw: unknown): { key: string; payload?: Record<string, unknown> } {
  if (typeof raw === 'string') {
    return { key: raw };
  }
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1) {
      const key = keys[0];
      const value = obj[key];
      if (typeof value === 'object' && value !== null) {
        return { key, payload: value as Record<string, unknown> };
      }
      return { key };
    }
  }
  return { key: String(raw ?? '') };
}

function parseProposal(raw: any, proposalId: number, entityId: number): ProposalData {
  const obj = raw?.toJSON?.() ?? raw ?? {};
  const descriptionCid = String(obj.descriptionCid ?? obj.description_cid ?? obj.description ?? '');

  // Parse proposal type: extract enum key and optional payload
  const rawType = obj.proposalType ?? obj.proposal_type ?? '';
  const { key: proposalType, payload: proposalPayload } = parseProposalTypeEnum(
    typeof rawType === 'string' ? rawType : rawType
  );

  // Parse status: chain enum may be string or object
  const rawStatus = obj.status ?? 'Voting';
  const status = typeof rawStatus === 'string'
    ? rawStatus
    : typeof rawStatus === 'object' && rawStatus !== null
      ? Object.keys(rawStatus)[0] ?? 'Voting'
      : String(rawStatus);

  return {
    id: proposalId,
    entityId,
    proposer: String(obj.proposer ?? ''),
    proposalType,
    proposalPayload,
    title: String(obj.title ?? ''),
    description: descriptionCid,
    descriptionCid,
    votesApprove: BigInt(String(obj.votesApprove ?? obj.votes_approve ?? 0)),
    votesReject: BigInt(String(obj.votesReject ?? obj.votes_reject ?? 0)),
    votesAbstain: BigInt(String(obj.votesAbstain ?? obj.votes_abstain ?? 0)),
    quorumPct: Number(obj.quorumPct ?? obj.quorum_pct ?? 0),
    passThreshold: Number(obj.passThreshold ?? obj.pass_threshold ?? 0),
    endBlock: Number(obj.endBlock ?? obj.end_block ?? 0),
    status,
    executed: Boolean(obj.executed),
  };
}

function parseProposalEntries(rawEntries: [any, any][]): ProposalData[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  return rawEntries.map(([key, value]) => {
    const obj = value?.toJSON?.() ?? value ?? {};
    const proposalId = Number(key.args?.[1]?.toString() ?? key.args?.[0]?.toString() ?? obj.id ?? 0);
    const proposalEntityId = Number(obj.entityId ?? obj.entity_id ?? key.args?.[0]?.toString() ?? 0);
    return parseProposal(obj, proposalId, proposalEntityId);
  });
}

/**
 * Compute proposal voting result.
 *
 * @param proposal - The proposal data
 * @param totalSupply - Token total supply (used as quorum base).
 *   When provided, quorum is met if totalVotes >= totalSupply * quorumPct / 100.
 *   When omitted (0 or undefined), quorum check is skipped (always true if votes > 0).
 */
export function computeProposalResult(
  proposal: ProposalData,
  totalSupply?: bigint,
): {
  quorumMet: boolean;
  passed: boolean;
  approvalPct: number;
} {
  const approve = proposal.votesApprove;
  const reject = proposal.votesReject;
  const abstain = proposal.votesAbstain;
  const totalVotes = approve + reject + abstain;

  let quorumMet: boolean;
  if (proposal.quorumPct === 0) {
    // No quorum requirement
    quorumMet = true;
  } else if (totalSupply && totalSupply > BigInt(0)) {
    // quorumPct is a percentage (e.g. 10 means 10%)
    // quorum met when: totalVotes * 100 >= totalSupply * quorumPct
    quorumMet = totalVotes * BigInt(100) >= totalSupply * BigInt(proposal.quorumPct);
  } else {
    // No supply info available — cannot verify quorum, mark as not met
    quorumMet = false;
  }

  const activeVotes = approve + reject;
  const activeVotesNum = Number(activeVotes);
  const approveNum = Number(approve);
  const passed = activeVotesNum > 0
    ? (approveNum / activeVotesNum) * 100 >= proposal.passThreshold
    : false;

  const approvalPct = activeVotesNum > 0 ? (approveNum / activeVotesNum) * 100 : 0;

  return { quorumMet, passed, approvalPct };
}

// ─── Hook ───────────────────────────────────────────────────

export function useGovernance() {
  const { entityId } = useEntityContext();

  const invalidateKeys = [['entity', entityId, 'proposals']];

  const proposalsQuery = useEntityQuery<ProposalData[]>(
    ['entity', entityId, 'proposals'],
    async (api) => {
      if (!hasPallet(api, 'entityGovernance')) return [];
      const pallet = (api.query as any).entityGovernance;

      const idsFn = pallet.entityProposals;
      if (idsFn) {
        try {
          const idsRaw = await idsFn(entityId);
          const ids = idsRaw?.toJSON?.() ?? idsRaw;
          if (Array.isArray(ids) && ids.length > 0) {
            const proposals = await Promise.all(
              ids.map(Number).map(async (proposalId: number) => {
                const raw = await pallet.proposals(proposalId);
                if (!raw || (raw as any).isNone) return null;
                return parseProposal(raw, proposalId, entityId);
              }),
            );
            return proposals.filter((proposal): proposal is ProposalData => proposal !== null);
          }
        } catch {
          // fallback below
        }
      }

      const storageFn = pallet.proposals;
      if (!storageFn?.entries) return [];
      let rawEntries: [any, any][];
      try {
        rawEntries = await storageFn.entries(entityId);
      } catch {
        const allEntries = await storageFn.entries();
        rawEntries = (allEntries as [any, any][]).filter(([key, value]) => {
          const obj = value?.toJSON?.() ?? value ?? {};
          const proposalEntityId = Number(obj.entityId ?? obj.entity_id ?? key.args?.[0]?.toString() ?? 0);
          return proposalEntityId === entityId;
        });
      }
      return parseProposalEntries(rawEntries);
    },
    { staleTime: STALE_TIMES.proposals },
  );

  const useVote = (proposalId: number, account: string | null) =>
    useEntityQuery<VoteOption | null>(
      ['entity', entityId, 'proposals', proposalId, 'votes', account],
      async (api) => {
        if (!hasPallet(api, 'entityGovernance') || !account) return null;
        const fn = (api.query as any).entityGovernance.voteRecords;
        if (!fn) return null;
        const raw = await fn(proposalId, account);
        if (!raw || (raw as any).isNone) return null;
        const value = (raw as any).unwrapOr?.(null) ?? raw;
        return value ? (String(value) as VoteOption) : null;
      },
      { staleTime: STALE_TIMES.proposals, enabled: !!account },
    );

  // Query token total supply for quorum calculation
  const tokenSupplyQuery = useEntityQuery<bigint>(
    ['entity', entityId, 'token', 'totalSupply'],
    async (api) => {
      const assetId = getEntityTokenAssetId(entityId);
      const fn = (api.query as any).assets?.asset;
      if (!fn) return BigInt(0);
      const raw = await fn(assetId);
      if (!raw || (raw as any).isNone) return BigInt(0);
      const obj = (raw as any).toJSON?.() ?? raw;
      return BigInt(String(obj?.supply ?? 0));
    },
    { staleTime: STALE_TIMES.token },
  );

  const createProposal = useEntityMutation('entityGovernance', 'createProposal', { invalidateKeys });
  const vote = useEntityMutation('entityGovernance', 'vote', { invalidateKeys });
  const finalizeVoting = useEntityMutation('entityGovernance', 'finalizeVoting', { invalidateKeys });
  const executeProposal = useEntityMutation('entityGovernance', 'executeProposal', { invalidateKeys });
  const delegateVote = useEntityMutation('entityGovernance', 'delegateVote', { invalidateKeys });
  const undelegateVote = useEntityMutation('entityGovernance', 'undelegateVote', { invalidateKeys });
  const changeVote = useEntityMutation('entityGovernance', 'changeVote', { invalidateKeys });

  return {
    proposals: proposalsQuery.data ?? [],
    proposalCount: proposalsQuery.data?.length ?? 0,
    tokenTotalSupply: tokenSupplyQuery.data ?? BigInt(0),
    isLoading: proposalsQuery.isLoading,
    error: proposalsQuery.error,
    useVote,
    createProposal,
    vote,
    finalizeVoting,
    executeProposal,
    delegateVote,
    undelegateVote,
    changeVote,
  };
}
