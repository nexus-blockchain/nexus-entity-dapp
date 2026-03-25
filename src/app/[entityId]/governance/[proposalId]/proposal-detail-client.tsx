'use client';

import React, { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useGovernance, computeProposalResult } from '@/hooks/use-governance';
import { isTxBusy, useTxLock } from '@/hooks/use-tx-lock';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { VoteOption, GovernanceMode } from '@/lib/types/enums';
import { useWalletStore } from '@/stores/wallet-store';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils/cn';
import { CopyableAddress } from '@/components/copyable-address';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Vote Progress Bar ──────────────────────────────────────

function VoteBar({ label, count, total, color }: { label: string; count: bigint; total: number; color: string }) {
  const pct = total > 0 ? (Number(count) / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{count.toString()} ({pct.toFixed(1)}%)</span>
      </div>
      <Progress value={Math.min(pct, 100)} className={cn('h-2', color)} />
    </div>
  );
}

// ─── Voting Section ─────────────────────────────────────────

function VotingActions({ proposalId }: { proposalId: number }) {
  const { vote } = useGovernance();
  const walletAddress = useWalletStore((s) => s.address);
  const t = useTranslations('governance');

  const handleVote = useCallback((option: VoteOption) => {
    vote.mutate([proposalId, option]);
  }, [proposalId, vote]);

  if (!walletAddress) {
    return <p className="text-sm text-muted-foreground">{t('connectWalletToVote')}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => handleVote(VoteOption.Approve)}
          disabled={isTxBusy(vote)}
          className="bg-green-600 hover:bg-green-700"
        >
          {t('approve')}
        </Button>
        <Button
          variant="destructive"
          onClick={() => handleVote(VoteOption.Reject)}
          disabled={isTxBusy(vote)}
        >
          {t('reject')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => handleVote(VoteOption.Abstain)}
          disabled={isTxBusy(vote)}
        >
          {t('abstain')}
        </Button>
      </div>
      <TxStatusIndicator txState={vote.txState} />
    </div>
  );
}


// ─── Admin Actions ──────────────────────────────────────────

function AdminActions({ proposalId, status, executed }: { proposalId: number; status: string; executed: boolean }) {
  const { finalizeVoting, executeProposal } = useGovernance();
  const t = useTranslations('governance');

  const canFinalize = status === 'Voting';
  const canExecute = status === 'Passed' && !executed;

  return (
    <div className="space-y-3">
      {canFinalize && (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => finalizeVoting.mutate([proposalId])}
            disabled={isTxBusy(finalizeVoting)}
          >
            {t('finalizeVoting')}
          </Button>
          <TxStatusIndicator txState={finalizeVoting.txState} />
        </div>
      )}
      {canExecute && (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => executeProposal.mutate([proposalId])}
            disabled={isTxBusy(executeProposal)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {t('executeProposal')}
          </Button>
          <TxStatusIndicator txState={executeProposal.txState} />
        </div>
      )}
    </div>
  );
}

// ─── Status Badge Mapping ───────────────────────────────────

const STATUS_BADGE_VARIANT: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }> = {
  Voting: { variant: 'default' },
  Passed: { variant: 'success' },
  Failed: { variant: 'destructive' },
  Executed: { variant: 'secondary' },
  Cancelled: { variant: 'outline' },
  Expired: { variant: 'outline' },
  ExecutionFailed: { variant: 'destructive' },
};

const STATUS_LABEL_KEY: Record<string, string> = {
  Voting: 'statusVoting',
  Passed: 'statusPassed',
  Failed: 'statusFailed',
  Executed: 'statusExecuted',
  Cancelled: 'statusCancelled',
  Expired: 'statusExpired',
  ExecutionFailed: 'statusExecutionFailed',
};

// ─── Skeleton Loading ───────────────────────────────────────

function ProposalDetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-4 w-32" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-36" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function ProposalDetailPage() {
  const t = useTranslations('governance');
  const tc = useTranslations('common');
  const params = useParams();
  const entityId = Number(params.entityId);
  const proposalId = Number(params.proposalId);
  const { governanceMode } = useEntityContext();
  const { proposals, isLoading, error, tokenTotalSupply } = useGovernance();

  if (governanceMode === GovernanceMode.None) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="border-dashed">
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t('noGovernanceDesc')}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return <ProposalDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="border-destructive/50">
          <CardContent className="p-6 text-sm text-destructive">
            {tc('loadFailed', { error: String(error) })}
          </CardContent>
        </Card>
      </div>
    );
  }

  const proposal = proposals.find((p) => p.id === proposalId);

  if (!proposal) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="border-dashed">
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t('proposalNotFound')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const result = computeProposalResult(proposal, tokenTotalSupply);
  const totalVotes = Number(proposal.votesApprove) + Number(proposal.votesReject) + Number(proposal.votesAbstain);
  const isVotingOpen = proposal.status === 'Voting';

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Button variant="link" asChild className="h-auto p-0">
        <Link href={`/${entityId}/governance`}>
          {t('backToList')}
        </Link>
      </Button>

      {/* Proposal Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle className="text-xl">#{proposal.id} {proposal.title}</CardTitle>
            <Badge variant={STATUS_BADGE_VARIANT[proposal.status]?.variant ?? 'warning'}>
              {STATUS_LABEL_KEY[proposal.status] ? t(STATUS_LABEL_KEY[proposal.status]) : proposal.status}
            </Badge>
            {proposal.executed && (
              <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                {t('executed')}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{t('proposalTypeLabel')}: {proposal.proposalType}</p>
          <p className="inline-flex items-center gap-1">{t('proposerLabel')}: <CopyableAddress address={proposal.proposer} textClassName="text-xs" /></p>
          <p>{t('endBlockLabel')}: #{proposal.endBlock}</p>
          {proposal.description && <p className="mt-3">{proposal.description}</p>}
          {/* Proposal payload details */}
          {proposal.proposalPayload && Object.keys(proposal.proposalPayload).length > 0 && (
            <div className="mt-3 rounded-md border bg-muted/50 p-3">
              <p className="text-xs font-medium">{t('proposalTypeLabel')}</p>
              <div className="mt-1 space-y-1">
                {Object.entries(proposal.proposalPayload).map(([key, value]) => (
                  <p key={key} className="text-xs">
                    <span className="font-mono text-muted-foreground">{key}</span>: {String(value)}
                  </p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vote Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('voteProgress')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <VoteBar label={t('votesApprove')} count={proposal.votesApprove} total={totalVotes} color="[&>div]:bg-green-500" />
            <VoteBar label={t('votesReject')} count={proposal.votesReject} total={totalVotes} color="[&>div]:bg-red-500" />
            <VoteBar label={t('votesAbstain')} count={proposal.votesAbstain} total={totalVotes} color="[&>div]:bg-gray-400" />
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('totalVotes')}</p>
              <p className="text-sm font-medium">{totalVotes}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('quorumRequired')}</p>
              <p className="text-sm font-medium">{proposal.quorumPct}%</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('passThreshold')}</p>
              <p className="text-sm font-medium">{proposal.passThreshold}%</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('currentApproval')}</p>
              <p className={cn('text-sm font-medium', result.passed ? 'text-green-600' : 'text-red-600')}>
                {result.approvalPct.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Result Summary */}
          <div className="mt-4 flex gap-3">
            <Badge variant={result.quorumMet ? 'success' : 'warning'}>
              {result.quorumMet ? t('quorumMet') : t('quorumNotMet')}
            </Badge>
            <Badge variant={result.passed ? 'success' : 'destructive'}>
              {result.passed ? t('votePassed') : t('voteNotPassed')}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Voting Actions */}
      {isVotingOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('participateVoting')}</CardTitle>
          </CardHeader>
          <CardContent>
            <VotingActions proposalId={proposalId} />
          </CardContent>
        </Card>
      )}

      {/* Admin Actions */}
      <PermissionGuard required={AdminPermission.GOVERNANCE_MANAGE} fallback={null}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('adminActions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminActions proposalId={proposalId} status={proposal.status} executed={proposal.executed} />
          </CardContent>
        </Card>
      </PermissionGuard>
    </div>
  );
}
