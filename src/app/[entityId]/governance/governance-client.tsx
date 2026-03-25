'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useGovernance, computeProposalResult } from '@/hooks/use-governance';
import { useIpfsUpload } from '@/hooks/use-ipfs-upload';
import { isTxBusy, useTxLock } from '@/hooks/use-tx-lock';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { GovernanceMode, ProposalCategory } from '@/lib/types/enums';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { CopyableAddress } from '@/components/copyable-address';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import { LabelWithTip } from '@/components/field-help-tip';

// ─── Proposal Types by Category (matching chain-side ProposalType enum) ───

/** Payload field type definitions for dynamic form rendering */
type FieldType = 'u8' | 'u16' | 'u32' | 'u64' | 'Balance' | 'bool' | 'BoundedVec' | 'Option<Balance>' | 'Option<u16>' | 'Option<BoundedVec>';

interface ProposalTypeInfo {
  /** Payload fields; empty = no payload (simple variant) */
  fields: Record<string, FieldType>;
}

const PROPOSAL_TYPES_KEYS: Record<string, { types: Record<string, ProposalTypeInfo> }> = {
  [ProposalCategory.EntityManagement]: {
    types: {
      General: { fields: { title_cid: 'BoundedVec', content_cid: 'BoundedVec' } },
      CommunityEvent: { fields: { event_cid: 'BoundedVec' } },
      RuleSuggestion: { fields: { suggestion_cid: 'BoundedVec' } },
      EmergencyPauseToggle: { fields: { enabled: 'bool' } },
      BatchCancelToggle: { fields: { enabled: 'bool' } },
      FundProtectionChange: { fields: { min_treasury_threshold: 'Balance', max_single_spend: 'Balance', max_daily_spend: 'Balance' } },
    },
  },
  [ProposalCategory.ShopManagement]: {
    types: {
      Promotion: { fields: { discount_rate: 'u16', duration_blocks: 'u32' } },
      ShopNameChange: { fields: { new_name: 'BoundedVec' } },
      ShopDescriptionChange: { fields: { description_cid: 'BoundedVec' } },
      ShopPause: { fields: { shop_id: 'u64' } },
      ShopResume: { fields: { shop_id: 'u64' } },
      ShopClose: { fields: { shop_id: 'u64' } },
      ShopTypeChange: { fields: { shop_id: 'u64', new_type: 'u8' } },
      ShopPoliciesChange: { fields: { policies_cid: 'BoundedVec' } },
      PointsConfigChange: { fields: { reward_rate: 'u16', exchange_rate: 'u16', transferable: 'bool' } },
      PointsToggle: { fields: { enabled: 'bool' } },
      PriceChange: { fields: { product_id: 'u64', new_usdt_price: 'u64' } },
      ProductListing: { fields: { product_cid: 'BoundedVec' } },
      ProductDelisting: { fields: { product_id: 'u64' } },
      InventoryAdjustment: { fields: { product_id: 'u64', new_inventory: 'u64' } },
      ProductVisibilityChange: { fields: { product_id: 'u64', visibility: 'u8' } },
    },
  },
  [ProposalCategory.TokenManagement]: {
    types: {
      TokenConfigChange: { fields: { reward_rate: 'Option<u16>', exchange_rate: 'Option<u16>' } },
      TokenMint: { fields: { amount: 'Balance', recipient_cid: 'BoundedVec' } },
      TokenBurn: { fields: { amount: 'Balance' } },
      AirdropDistribution: { fields: { airdrop_cid: 'BoundedVec', total_amount: 'Balance' } },
      Dividend: { fields: { rate: 'u16' } },
      TokenMaxSupplyChange: { fields: { new_max_supply: 'Balance' } },
      TokenTypeChange: { fields: { new_type: 'u8' } },
      TransferRestrictionChange: { fields: { restriction: 'u8', min_receiver_kyc: 'u8' } },
      TokenBlacklistManage: { fields: { account_cid: 'BoundedVec', add: 'bool' } },
    },
  },
  [ProposalCategory.MarketManagement]: {
    types: {
      MarketConfigChange: { fields: { min_order_amount: 'Balance', order_ttl: 'u32' } },
      MarketPause: { fields: {} },
      MarketResume: { fields: {} },
      MarketClose: { fields: {} },
      PriceProtectionChange: { fields: { max_price_deviation: 'u16', max_slippage: 'u16', circuit_breaker_threshold: 'u16', min_trades_for_twap: 'u32' } },
      MarketKycChange: { fields: { min_kyc_level: 'u8' } },
      CircuitBreakerLift: { fields: {} },
      FeeAdjustment: { fields: { new_fee_rate: 'u16' } },
      RevenueShare: { fields: { owner_share: 'u16', token_holder_share: 'u16' } },
      RefundPolicy: { fields: { policy_cid: 'BoundedVec' } },
      TreasurySpend: { fields: { amount: 'Balance', recipient_cid: 'BoundedVec', reason_cid: 'BoundedVec' } },
      TreasuryAllocateToShop: { fields: { shop_id: 'u64', amount: 'Balance' } },
    },
  },
  [ProposalCategory.MemberManagement]: {
    types: {
      MemberPolicyChange: { fields: { policy: 'u8' } },
      UpgradeRuleToggle: { fields: { enabled: 'bool' } },
      MemberStatsPolicyChange: { fields: { qualified_only: 'bool', subtract_on_removal: 'bool' } },
      AddCustomLevel: { fields: { level_id: 'u8', name: 'BoundedVec', threshold: 'Balance', discount_rate: 'u16', commission_bonus: 'u16' } },
      UpdateCustomLevel: { fields: { level_id: 'u8', name: 'Option<BoundedVec>', threshold: 'Option<Balance>', discount_rate: 'Option<u16>', commission_bonus: 'Option<u16>' } },
      RemoveCustomLevel: { fields: { level_id: 'u8' } },
      SetUpgradeMode: { fields: { mode: 'u8' } },
      EnableCustomLevels: { fields: { enabled: 'bool' } },
      KycRequirementChange: { fields: { min_level: 'u8', mandatory: 'bool', grace_period: 'u32' } },
      KycProviderAuthorize: { fields: { provider_id: 'u64' } },
      KycProviderDeauthorize: { fields: { provider_id: 'u64' } },
    },
  },
  [ProposalCategory.CommissionManagement]: {
    types: {
      CommissionModesChange: { fields: { modes: 'u16' } },
      CommissionRateChange: { fields: { new_rate: 'u16' } },
      CommissionToggle: { fields: { enabled: 'bool' } },
      CreatorRewardRateChange: { fields: { new_rate: 'u16' } },
      DirectRewardChange: { fields: { rate: 'u16' } },
      WithdrawalConfigChange: { fields: { tier_configs_cid: 'BoundedVec', enabled: 'bool' } },
      MinRepurchaseRateChange: { fields: { min_rate: 'u16' } },
      WithdrawalCooldownChange: { fields: { nex_cooldown: 'u32', token_cooldown: 'u32' } },
      TokenWithdrawalConfigChange: { fields: { enabled: 'bool' } },
      WithdrawalPauseToggle: { fields: { paused: 'bool' } },
      ReferrerGuardChange: { fields: { min_referrer_spent: 'Balance', min_referrer_orders: 'u32' } },
      CommissionCapChange: { fields: { max_per_order: 'Balance', max_total_earned: 'Balance' } },
      ReferralValidityChange: { fields: { validity_blocks: 'u32', valid_orders: 'u32' } },
      MultiLevelPause: { fields: {} },
      MultiLevelResume: { fields: {} },
      SingleLineConfigChange: { fields: { upline_rate: 'u16', downline_rate: 'u16', base_upline_levels: 'u8', base_downline_levels: 'u8', max_upline_levels: 'u8', max_downline_levels: 'u8' } },
      SingleLinePause: { fields: {} },
      SingleLineResume: { fields: {} },
      TeamPerformancePause: { fields: {} },
      TeamPerformanceResume: { fields: {} },
    },
  },
  [ProposalCategory.DisclosureManagement]: {
    types: {
      DisclosureLevelChange: { fields: { level: 'u8', insider_trading_control: 'bool', blackout_period_after: 'u32' } },
      DisclosureResetViolations: { fields: {} },
      DisclosureInsiderManage: { fields: { account_cid: 'BoundedVec', add: 'bool' } },
      DisclosurePenaltyChange: { fields: { level: 'u8' } },
    },
  },
  [ProposalCategory.GovernanceManagement]: {
    types: {
      VotingPeriodChange: { fields: { new_period_blocks: 'u32' } },
      QuorumChange: { fields: { new_quorum: 'u8' } },
      ProposalThresholdChange: { fields: { new_threshold: 'u16' } },
      ExecutionDelayChange: { fields: { new_delay_blocks: 'u32' } },
      PassThresholdChange: { fields: { new_pass: 'u8' } },
      AdminVetoToggle: { fields: { enabled: 'bool' } },
    },
  },
};

// ─── Helpers ────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  Voting: 'default',
  Passed: 'success',
  Failed: 'destructive',
  Executed: 'secondary',
  Cancelled: 'outline',
  Expired: 'outline',
  ExecutionFailed: 'destructive',
};

const STATUS_KEYS: string[] = ['Voting', 'Passed', 'Failed', 'Executed', 'Cancelled', 'Expired', 'ExecutionFailed'];

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
  const { uploadText, isUploading, error: uploadError } = useIpfsUpload();
  const [category, setCategory] = useState<string>(ProposalCategory.EntityManagement);
  const typesForCategory = PROPOSAL_TYPES_KEYS[category]?.types ?? {};
  const typeKeys = Object.keys(typesForCategory);
  const [proposalType, setProposalType] = useState<string>(typeKeys[0] ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [open, setOpen] = useState(false);
  const [payloadValues, setPayloadValues] = useState<Record<string, string>>({});

  const currentTypeInfo = typesForCategory[proposalType];
  const hasPayload = currentTypeInfo && Object.keys(currentTypeInfo.fields).length > 0;

  const handleCategoryChange = useCallback((cat: string) => {
    setCategory(cat);
    const keys = Object.keys(PROPOSAL_TYPES_KEYS[cat]?.types ?? {});
    setProposalType(keys[0] ?? '');
    setPayloadValues({});
  }, []);

  const handleTypeChange = useCallback((type: string) => {
    setProposalType(type);
    setPayloadValues({});
  }, []);

  const setPayloadField = useCallback((key: string, value: string) => {
    setPayloadValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** Build the Polkadot.js-compatible proposal type argument. */
  function buildProposalTypeArg(): string | Record<string, unknown> {
    if (!currentTypeInfo || !hasPayload) {
      // Simple variant (no payload)
      return proposalType;
    }
    // Complex variant: { VariantName: { field1: value1, ... } }
    const payload: Record<string, unknown> = {};
    for (const [fieldName, fieldType] of Object.entries(currentTypeInfo.fields)) {
      const raw = payloadValues[fieldName] ?? '';
      if (fieldType === 'bool') {
        payload[fieldName] = raw === 'true';
      } else if (fieldType === 'Balance' || fieldType === 'u64') {
        payload[fieldName] = raw || '0';
      } else if (fieldType === 'u8' || fieldType === 'u16' || fieldType === 'u32') {
        payload[fieldName] = Number(raw || 0);
      } else if (fieldType.startsWith('Option<')) {
        payload[fieldName] = raw.trim() ? (fieldType.includes('Balance') ? raw : Number(raw)) : null;
      } else {
        // BoundedVec<u8> — pass as string, Polkadot.js encodes it
        payload[fieldName] = raw;
      }
    }
    return { [proposalType]: payload };
  }

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !description.trim() || !proposalType || isUploading) return;
    const descriptionCid = await uploadText(description.trim());
    if (!descriptionCid) return;
    const typeArg = buildProposalTypeArg();
    createProposal.mutate([entityId, typeArg, title.trim(), descriptionCid]);
    setTitle('');
    setDescription('');
    setPayloadValues({});
    setOpen(false);
  }, [description, entityId, isUploading, proposalType, title, uploadText, createProposal, payloadValues, currentTypeInfo, hasPayload]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t('createProposal')}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('createProposal')}</DialogTitle>
          <DialogDescription>{t('createProposalDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <LabelWithTip tip={t('help.proposalCategory')}>{t('proposalCategory')}</LabelWithTip>
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
              <LabelWithTip tip={t('help.proposalType')}>{t('proposalType')}</LabelWithTip>
              <Select value={proposalType} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectType')} />
                </SelectTrigger>
                <SelectContent>
                  {typeKeys.map((type) => (
                    <SelectItem key={type} value={type}>{te(`proposalType.${type}`, { defaultValue: type })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <LabelWithTip tip={t('help.proposalTitle')}>{t('proposalTitle')}</LabelWithTip>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('proposalTitlePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <LabelWithTip tip={t('help.proposalDescription')}>{t('proposalDescription')}</LabelWithTip>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('proposalDescriptionPlaceholder')}
              rows={3}
            />
            {uploadError && (
              <p className="text-xs text-destructive">{uploadError}</p>
            )}
          </div>

          {/* Dynamic payload fields */}
          {hasPayload && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">{te(`proposalType.${proposalType}`, { defaultValue: proposalType })} — Parameters</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {Object.entries(currentTypeInfo.fields).map(([fieldName, fieldType]) => (
                    <div key={fieldName} className="space-y-1.5">
                      <Label htmlFor={`payload-${fieldName}`} className="text-xs">{fieldName}</Label>
                      {fieldType === 'bool' ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`payload-${fieldName}`}
                            checked={payloadValues[fieldName] === 'true'}
                            onCheckedChange={(v) => setPayloadField(fieldName, String(v))}
                          />
                          <span className="text-xs text-muted-foreground">{payloadValues[fieldName] === 'true' ? 'true' : 'false'}</span>
                        </div>
                      ) : (
                        <Input
                          id={`payload-${fieldName}`}
                          type={['u8', 'u16', 'u32', 'u64'].includes(fieldType) ? 'number' : 'text'}
                          value={payloadValues[fieldName] ?? ''}
                          onChange={(e) => setPayloadField(fieldName, e.target.value)}
                          placeholder={fieldType}
                          className="text-sm"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <TxStatusIndicator txState={createProposal.txState} />
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || !description.trim() || isTxBusy(createProposal) || isUploading}
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
  const { proposals, proposalCount, tokenTotalSupply } = useGovernance();

  const STATUS_LABEL_MAP: Record<string, string> = {
    Voting: t('statusVoting'),
    Passed: t('statusPassed'),
    Failed: t('statusFailed'),
    Executed: t('statusExecuted'),
    Cancelled: t('statusCancelled'),
    Expired: t('statusExpired'),
    ExecutionFailed: t('statusExecutionFailed'),
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
                tokenTotalSupply={tokenTotalSupply}
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
  tokenTotalSupply,
}: {
  proposals: ReturnType<typeof useGovernance>['proposals'];
  entityId: number;
  tokenTotalSupply: bigint;
}) {
  const t = useTranslations('governance');

  const STATUS_LABEL_MAP: Record<string, string> = {
    Voting: t('statusVoting'),
    Passed: t('statusPassed'),
    Failed: t('statusFailed'),
    Executed: t('statusExecuted'),
    Cancelled: t('statusCancelled'),
    Expired: t('statusExpired'),
    ExecutionFailed: t('statusExecutionFailed'),
  };

  if (proposals.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{t('noProposals')}</p>
    );
  }

  return (
    <div className="space-y-3">
      {proposals.map((p) => {
        const result = computeProposalResult(p, tokenTotalSupply);
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
                  {t('proposerLabel', { address: p.proposer })}
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
