'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useGovernance, computeProposalResult } from '@/hooks/use-governance';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { GovernanceMode, ProposalCategory } from '@/lib/types/enums';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

// ─── Proposal Types by Category ─────────────────────────────

const PROPOSAL_TYPES_KEYS: Record<string, { types: string[] }> = {
  [ProposalCategory.EntityManagement]: {
    types: [
      'UpdateEntityName', 'UpdateEntityLogo', 'UpdateEntityDescription',
      'UpdateEntityMetadata', 'TransferOwnership', 'RequestCloseEntity',
    ],
  },
  [ProposalCategory.ShopManagement]: {
    types: ['CreateShop', 'UpdateShop', 'PauseShop', 'ResumeShop', 'CloseShop'],
  },
  [ProposalCategory.TokenManagement]: {
    types: [
      'MintTokens', 'BurnTokens', 'SetTransferRestriction',
      'UpdateTokenMetadata', 'CreateSaleRound', 'SetDividendPolicy',
    ],
  },
  [ProposalCategory.MarketManagement]: {
    types: ['SetPriceProtection', 'ToggleCircuitBreaker', 'UpdateMarketConfig', 'SetTradingFee'],
  },
  [ProposalCategory.MemberManagement]: {
    types: [
      'SetRegistrationPolicy', 'AddCustomLevel', 'UpdateCustomLevel',
      'SetUpgradeTrigger', 'BanMember', 'UnbanMember',
    ],
  },
  [ProposalCategory.CommissionManagement]: {
    types: [
      'SetCommissionRate', 'EnableCommissionPlugin', 'DisableCommissionPlugin',
      'UpdateWithdrawalConfig', 'PauseWithdrawal', 'ResumeWithdrawal',
    ],
  },
  [ProposalCategory.DisclosureManagement]: {
    types: ['PublishDisclosure', 'WithdrawDisclosure', 'SetDisclosurePolicy'],
  },
  [ProposalCategory.GovernanceManagement]: {
    types: [
      'UpdateQuorum', 'UpdatePassThreshold', 'UpdateVotingPeriod',
      'AddAdmin', 'RemoveAdmin', 'LockGovernance',
    ],
  },
};

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-6)}` : addr;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  Pending: 'warning',
  Active: 'default',
  Passed: 'success',
  Rejected: 'destructive',
  Executed: 'secondary',
  Cancelled: 'outline',
};

const STATUS_KEYS: string[] = ['Pending', 'Active', 'Passed', 'Rejected', 'Executed', 'Cancelled'];

// ─── Loading Skeleton ───────────────────────────────────────

function GovernanceSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-24" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-3 w-full" />
              <div className="flex gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Create Proposal Form (Dialog) ──────────────────────────

function CreateProposalForm() {
  const t = useTranslations('governance');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const { createProposal } = useGovernance();
  const [category, setCategory] = useState<string>(ProposalCategory.EntityManagement);
  const [proposalType, setProposalType] = useState<string>(PROPOSAL_TYPES_KEYS[ProposalCategory.EntityManagement].types[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [open, setOpen] = useState(false);

  const handleCategoryChange = useCallback((cat: string) => {
    setCategory(cat);
    const firstType = PROPOSAL_TYPES_KEYS[cat]?.types[0] ?? '';
    setProposalType(firstType);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !proposalType) return;
    createProposal.mutate([entityId, proposalType, title.trim(), description.trim()]);
    setTitle('');
    setDescription('');
    setOpen(false);
  }, [entityId, proposalType, title, description, createProposal]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t('createProposal')}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('createProposal')}</DialogTitle>
          <DialogDescription>{t('createProposalDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('proposalCategory')}</Label>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(PROPOSAL_TYPES_KEYS).map((key) => (
                    <SelectItem key={key} value={key}>{te(`proposalCategory.${key}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('proposalType')}</Label>
              <Select value={proposalType} onValueChange={setProposalType}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectType')} />
                </SelectTrigger>
                <SelectContent>
                  {PROPOSAL_TYPES_KEYS[category]?.types.map((type) => (
                    <SelectItem key={type} value={type}>{te(`proposalType.${type}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('proposalTitle')}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('proposalTitlePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('proposalDescription')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('proposalDescriptionPlaceholder')}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <TxStatusIndicator txState={createProposal.txState} />
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || isTxBusy(createProposal)}
          >
            {t('submitProposal')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Proposal List ──────────────────────────────────────────

function ProposalListSection() {
  const t = useTranslations('governance');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { proposals, proposalCount } = useGovernance();

  const STATUS_LABEL_MAP: Record<string, string> = {
    Pending: t('statusPending'),
    Active: t('statusActive'),
    Passed: t('statusPassed'),
    Rejected: t('statusRejected'),
    Executed: t('statusExecuted'),
    Cancelled: t('statusCancelled'),
  };

  const statusTabs = [
    { value: 'all', label: tc('all') },
    ...STATUS_KEYS.map((key) => ({ value: key, label: STATUS_LABEL_MAP[key] })),
  ];

  return (
    <Tabs defaultValue="all">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">{t('proposalList', { count: proposalCount })}</CardTitle>
          <TabsList>
            {statusTabs.map(({ value, label }) => (
              <TabsTrigger key={value} value={value} className="text-xs">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </CardHeader>

        <CardContent>
          {statusTabs.map(({ value: tabValue }) => (
            <TabsContent key={tabValue} value={tabValue} className="mt-0">
              <ProposalTabContent
                proposals={tabValue === 'all' ? proposals : proposals.filter((p) => p.status === tabValue)}
                entityId={entityId}
              />
            </TabsContent>
          ))}
        </CardContent>
      </Card>
    </Tabs>
  );
}

function ProposalTabContent({
  proposals,
  entityId,
}: {
  proposals: ReturnType<typeof useGovernance>['proposals'];
  entityId: number;
}) {
  const t = useTranslations('governance');

  const STATUS_LABEL_MAP: Record<string, string> = {
    Pending: t('statusPending'),
    Active: t('statusActive'),
    Passed: t('statusPassed'),
    Rejected: t('statusRejected'),
    Executed: t('statusExecuted'),
    Cancelled: t('statusCancelled'),
  };

  if (proposals.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{t('noProposals')}</p>
    );
  }

  return (
    <div className="space-y-3">
      {proposals.map((p) => {
        const result = computeProposalResult(p);
        const totalVotes = Number(p.votesApprove) + Number(p.votesReject) + Number(p.votesAbstain);
        const approvalPct = result.approvalPct;

        return (
          <Link
            key={p.id}
            href={`/${entityId}/governance/${p.id}`}
            className="block"
          >
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      #{p.id} {p.title}
                    </span>
                    <Badge variant={STATUS_VARIANT[p.status] ?? 'secondary'}>
                      {STATUS_LABEL_MAP[p.status] ?? p.status}
                    </Badge>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">
                    {p.proposalType}
                  </Badge>
                </div>

                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t('approvalRateLabel', { pct: approvalPct.toFixed(1) })}</span>
                    <span>
                      {t('voteBreakdown', {
                        approve: p.votesApprove.toString(),
                        reject: p.votesReject.toString(),
                        abstain: p.votesAbstain.toString(),
                      })}
                    </span>
                  </div>
                  <Progress value={approvalPct} className="h-2" />
                </div>

                <div className="mt-2 text-xs text-muted-foreground">
                  {t('proposerLabel', { address: shortAddr(p.proposer) })}
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function GovernancePage() {
  const t = useTranslations('governance');
  const tc = useTranslations('common');
  const { governanceMode, isLoading: entityLoading } = useEntityContext();
  const { isLoading, error } = useGovernance();

  if (entityLoading || isLoading) {
    return <GovernanceSkeleton />;
  }

  if (governanceMode === GovernanceMode.None) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-lg">{t('noGovernance')}</CardTitle>
            <CardDescription>{t('noGovernanceDesc')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="max-w-md border-destructive">
          <CardHeader className="text-center">
            <CardTitle className="text-lg text-destructive">{tc('loadFailed', { error: '' })}</CardTitle>
            <CardDescription>{String(error)}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <PermissionGuard required={AdminPermission.GOVERNANCE_MANAGE} fallback={null}>
          <CreateProposalForm />
        </PermissionGuard>
      </div>

      <ProposalListSection />
    </div>
  );
}
