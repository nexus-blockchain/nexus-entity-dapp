'use client';

import React, { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useMembers } from '@/hooks/use-members';
import { useShops } from '@/hooks/use-shops';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { MemberStatus, RegistrationPolicy, MemberStatsPolicy } from '@/lib/types/enums';
import type { PendingMemberData } from '@/lib/types/models';
import { formatNex } from '@/lib/utils/format';

import { useTranslations } from 'next-intl';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { CopyableAddress } from '@/components/copyable-address';
import { LabelWithTip } from '@/components/field-help-tip';

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

const STATUS_BADGE_VARIANT: Record<MemberStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'; className?: string }> = {
  [MemberStatus.Active]: { variant: 'success' },
  [MemberStatus.Pending]: { variant: 'warning' },
  [MemberStatus.Frozen]: { variant: 'secondary', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  [MemberStatus.Banned]: { variant: 'destructive' },
  [MemberStatus.Expired]: { variant: 'outline' },
};

const POLICY_FLAGS = [
  { bit: RegistrationPolicy.PURCHASE_REQUIRED, key: 'purchaseRequired', descKey: 'purchaseRequiredDesc' },
  { bit: RegistrationPolicy.REFERRAL_REQUIRED, key: 'referralRequired', descKey: 'referralRequiredDesc' },
  { bit: RegistrationPolicy.APPROVAL_REQUIRED, key: 'approvalRequired', descKey: 'approvalRequiredDesc' },
  { bit: RegistrationPolicy.KYC_REQUIRED, key: 'kycRequired', descKey: 'kycRequiredDesc' },
  { bit: RegistrationPolicy.KYC_UPGRADE_REQUIRED, key: 'kycUpgradeRequired', descKey: 'kycUpgradeRequiredDesc' },
] as const;

const STATS_POLICY_FLAGS = [
  { bit: MemberStatsPolicy.INCLUDE_REPURCHASE_DIRECT, key: 'includeRepurchaseDirect', descKey: 'includeRepurchaseDirectDesc' },
  { bit: MemberStatsPolicy.INCLUDE_REPURCHASE_INDIRECT, key: 'includeRepurchaseIndirect', descKey: 'includeRepurchaseIndirectDesc' },
] as const;

const MAX_BATCH_SIZE = 50;

function formatBlock(block: number): string {
  if (block === 0) return '-';
  return `#${block.toLocaleString()}`;
}

// ─── Shop Selector ──────────────────────────────────────────

function ShopSelector({
  shopId,
  onShopChange,
}: {
  shopId: number | null;
  onShopChange: (id: number) => void;
}) {
  const t = useTranslations('members');
  const { shops, isLoading } = useShops();

  if (isLoading) return <Skeleton className="h-10 w-48" />;
  if (shops.length === 0) return <p className="text-sm text-muted-foreground">{t('noShops')}</p>;

  return (
    <div className="flex items-center gap-2">
      <LabelWithTip className="shrink-0 text-sm" tip={t('help.selectShop')}>{t('selectShop')}</LabelWithTip>
      <Select value={shopId?.toString() ?? ''} onValueChange={(v) => onShopChange(Number(v))}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder={t('selectShopPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {shops.map((shop) => (
            <SelectItem key={shop.id} value={shop.id.toString()}>
              {shop.name} (#{shop.id})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────

function MembersSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <Card><CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center space-x-3">
              <Skeleton className="h-6 w-11" /><Skeleton className="h-4 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card><CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
          <div className="mt-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-32" /><Skeleton className="h-5 w-14 rounded-full" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Registration Policy Section ────────────────────────────

function PolicySection({ shopId }: { shopId: number | null }) {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const { policy, setRegistrationPolicy } = useMembers();
  const { shops } = useShops();
  const [localPolicy, setLocalPolicy] = useState<number | null>(null);
  const current = localPolicy ?? policy;
  const hasNoShops = shops.length === 0;

  const toggleBit = useCallback((bit: number) => {
    setLocalPolicy((prev) => {
      let next = (prev ?? policy) ^ bit;
      if (bit === RegistrationPolicy.KYC_UPGRADE_REQUIRED && (next & RegistrationPolicy.KYC_UPGRADE_REQUIRED)) {
        next = next | RegistrationPolicy.KYC_REQUIRED;
      }
      if (bit === RegistrationPolicy.KYC_REQUIRED && !(next & RegistrationPolicy.KYC_REQUIRED)) {
        next = next & ~RegistrationPolicy.KYC_UPGRADE_REQUIRED;
      }
      return next;
    });
  }, [policy]);

  const handleSave = useCallback(() => {
    if (localPolicy !== null && localPolicy !== policy && shopId) {
      setRegistrationPolicy.mutate([shopId, localPolicy]);
      setLocalPolicy(null);
    }
  }, [shopId, localPolicy, policy, setRegistrationPolicy]);

  const activeConditions = POLICY_FLAGS.filter(({ bit }) => (current & bit) !== 0).map(({ key }) => t(key));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('registrationPolicy')}</CardTitle>
        <CardDescription>{t('registrationPolicyDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-2">
          {current === 0
            ? <Badge variant="success">{tc('open')}</Badge>
            : <Badge variant="warning">{t('registrationPolicy')}</Badge>}
          <span className="text-sm text-muted-foreground">
            {current === 0 ? t('policyOpenDesc') : t('policyRestrictedDesc')}
          </span>
        </div>
        <Separator />
        <TooltipProvider>
          {POLICY_FLAGS.map(({ bit, key, descKey }) => {
            const isPurchase = bit === RegistrationPolicy.PURCHASE_REQUIRED;
            const disabled = isPurchase && hasNoShops;
            const isKycForced = bit === RegistrationPolicy.KYC_REQUIRED
              && (current & RegistrationPolicy.KYC_UPGRADE_REQUIRED) !== 0;
            return (
              <div key={bit} className="flex items-start space-x-3 py-1">
                {disabled ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span><Switch id={`policy-${bit}`} checked={false} disabled /></span>
                    </TooltipTrigger>
                    <TooltipContent>{t('noShops')}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Switch id={`policy-${bit}`} checked={(current & bit) !== 0} disabled={isKycForced} onCheckedChange={() => toggleBit(bit)} />
                )}
                <div className="space-y-0.5">
                  <Label htmlFor={`policy-${bit}`} className="cursor-pointer">{t(key)}</Label>
                  <p className="text-xs text-muted-foreground">{t(descKey)}</p>
                  {isKycForced && <p className="text-xs text-amber-600 dark:text-amber-400">{t('kycImplied')}</p>}
                  {disabled && <p className="text-xs text-destructive">{t('noShops')}</p>}
                </div>
              </div>
            );
          })}
        </TooltipProvider>
        <Separator />
        <div className="rounded-md bg-muted p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t('policySummary')}</p>
          <p className="text-sm">
            {current === 0 ? t('policySummaryOpen') : t('policySummaryRestricted', { conditions: activeConditions.join(', ') })}
          </p>
        </div>
      </CardContent>
      {localPolicy !== null && localPolicy !== policy && (
        <CardFooter className="gap-3">
          <Button onClick={handleSave} disabled={isTxBusy(setRegistrationPolicy) || !shopId}>{t('savePolicy')}</Button>
          <Button variant="ghost" onClick={() => setLocalPolicy(null)}>{tc('reset')}</Button>
          <TxStatusIndicator txState={setRegistrationPolicy.txState} />
          {!shopId && <span className="text-xs text-destructive">{t('selectShopFirst')}</span>}
        </CardFooter>
      )}
    </Card>
  );
}

// ─── Stats Policy Section ───────────────────────────────────

function StatsPolicySection({ shopId }: { shopId: number | null }) {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const { statsPolicy, setStatsPolicy } = useMembers();
  const [localPolicy, setLocalPolicy] = useState<number | null>(null);
  const current = localPolicy ?? statsPolicy;

  const toggleBit = useCallback((bit: number) => {
    setLocalPolicy((prev) => (prev ?? statsPolicy) ^ bit);
  }, [statsPolicy]);

  const handleSave = useCallback(() => {
    if (localPolicy !== null && localPolicy !== statsPolicy && shopId) {
      setStatsPolicy.mutate([shopId, localPolicy]);
      setLocalPolicy(null);
    }
  }, [shopId, localPolicy, statsPolicy, setStatsPolicy]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('statsPolicy')}</CardTitle>
        <CardDescription>{t('statsPolicyDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {STATS_POLICY_FLAGS.map(({ bit, key, descKey }) => (
          <div key={bit} className="flex items-start space-x-3">
            <Switch id={`stats-${bit}`} checked={(current & bit) !== 0} onCheckedChange={() => toggleBit(bit)} />
            <div className="grid gap-0.5">
              <Label htmlFor={`stats-${bit}`} className="cursor-pointer font-medium">{t(key)}</Label>
              <p className="text-xs text-muted-foreground">{t(descKey)}</p>
            </div>
          </div>
        ))}
      </CardContent>
      {localPolicy !== null && localPolicy !== statsPolicy && (
        <CardFooter className="gap-3">
          <Button onClick={handleSave} disabled={isTxBusy(setStatsPolicy) || !shopId}>{t('savePolicy')}</Button>
          <Button variant="ghost" onClick={() => setLocalPolicy(null)}>{tc('reset')}</Button>
          <TxStatusIndicator txState={setStatsPolicy.txState} />
          {!shopId && <span className="text-xs text-destructive">{t('selectShopFirst')}</span>}
        </CardFooter>
      )}
    </Card>
  );
}

// ─── Pending Members Section (Enhanced) ─────────────────────

function PendingSection({ shopId }: { shopId: number | null }) {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { pendingMembers, policy, approveMember, rejectMember, batchApproveMembers, batchRejectMembers, cleanupExpiredPending } = useMembers();
  const hasApproval = (policy & RegistrationPolicy.APPROVAL_REQUIRED) !== 0;
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((account: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(account)) next.delete(account); else next.add(account);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedAccounts((prev) => {
      if (prev.size === pendingMembers.length) return new Set();
      return new Set(pendingMembers.map((p) => p.account));
    });
  }, [pendingMembers]);

  const handleBatchApprove = useCallback(() => {
    if (selectedAccounts.size === 0 || !shopId) return;
    batchApproveMembers.mutate([shopId, Array.from(selectedAccounts).slice(0, MAX_BATCH_SIZE)])
      .then(() => setSelectedAccounts(new Set()))
      .catch(() => {/* keep selection on failure */});
  }, [shopId, selectedAccounts, batchApproveMembers]);

  const handleBatchReject = useCallback(() => {
    if (selectedAccounts.size === 0 || !shopId) return;
    batchRejectMembers.mutate([shopId, Array.from(selectedAccounts).slice(0, MAX_BATCH_SIZE)])
      .then(() => setSelectedAccounts(new Set()))
      .catch(() => {/* keep selection on failure */});
  }, [shopId, selectedAccounts, batchRejectMembers]);

  const handleCleanup = useCallback(() => {
    cleanupExpiredPending.mutate([entityId, MAX_BATCH_SIZE]);
  }, [entityId, cleanupExpiredPending]);

  if (!hasApproval && pendingMembers.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{t('pendingMembers', { count: pendingMembers.length })}</CardTitle>
            <CardDescription>{t('pendingMembersDesc')}</CardDescription>
          </div>
          {pendingMembers.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" onClick={handleCleanup} disabled={isTxBusy(cleanupExpiredPending)}>{t('cleanupExpired')}</Button>
                </TooltipTrigger>
                <TooltipContent>{t('cleanupExpiredDesc')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>

      {pendingMembers.length === 0 ? (
        <CardContent>
          <p className="py-4 text-center text-sm text-muted-foreground">{t('noPendingMembers')}</p>
        </CardContent>
      ) : (
        <CardContent>
          {selectedAccounts.size > 0 && (
            <div className="mb-4 flex items-center gap-3 rounded-lg bg-muted p-3">
              <span className="text-sm font-medium">
                {t('selectedCount', { count: selectedAccounts.size })}
                {selectedAccounts.size > MAX_BATCH_SIZE && (
                  <span className="ml-1 text-xs text-destructive">({t('batchLimitWarning', { max: MAX_BATCH_SIZE })})</span>
                )}
              </span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" onClick={handleBatchApprove} disabled={isTxBusy(batchApproveMembers) || !shopId}>{t('batchApprove')}</Button>
                <Button size="sm" variant="destructive" onClick={handleBatchReject} disabled={isTxBusy(batchRejectMembers) || !shopId}>{t('batchReject')}</Button>
              </div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={selectedAccounts.size === pendingMembers.length && pendingMembers.length > 0} onChange={toggleSelectAll} />
                </TableHead>
                <TableHead>{tc('address')}</TableHead>
                <TableHead>{t('referrer')}</TableHead>
                <TableHead>{t('appliedAt')}</TableHead>
                <TableHead className="text-right">{tc('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingMembers.map((pending) => (
                <PendingMemberRow key={pending.account} pending={pending} shopId={shopId} selected={selectedAccounts.has(pending.account)} onToggleSelect={() => toggleSelect(pending.account)} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
      <CardFooter className="flex-wrap gap-3">
        <TxStatusIndicator txState={approveMember.txState} />
        <TxStatusIndicator txState={rejectMember.txState} />
        <TxStatusIndicator txState={batchApproveMembers.txState} />
        <TxStatusIndicator txState={batchRejectMembers.txState} />
        <TxStatusIndicator txState={cleanupExpiredPending.txState} />
      </CardFooter>
    </Card>
  );
}

function PendingMemberRow({ pending, shopId, selected, onToggleSelect }: { pending: PendingMemberData; shopId: number | null; selected: boolean; onToggleSelect: () => void }) {
  const t = useTranslations('members');
  const { approveMember, rejectMember } = useMembers();
  return (
    <TableRow>
      <TableCell><input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={selected} onChange={onToggleSelect} /></TableCell>
      <TableCell><CopyableAddress address={pending.account} textClassName="text-xs" /></TableCell>
      <TableCell className="text-sm">
        {pending.referrer ? <CopyableAddress address={pending.referrer} textClassName="text-xs" /> : <span className="text-muted-foreground">-</span>}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{formatBlock(pending.appliedAt)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={() => shopId && approveMember.mutate([shopId, pending.account])} disabled={isTxBusy(approveMember) || !shopId}>{t('approve')}</Button>
          <Button size="sm" variant="destructive" onClick={() => shopId && rejectMember.mutate([shopId, pending.account])} disabled={isTxBusy(rejectMember) || !shopId}>{t('reject')}</Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── Referral Display ───────────────────────────────────────

function ReferralSection({ account }: { account: string }) {
  const t = useTranslations('members');
  const { useReferralTree } = useMembers();
  const { data } = useReferralTree(account);
  if (!data || data.directReferrals.length === 0) return null;
  return (
    <div className="mt-2 rounded-md bg-muted p-3">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{t('directReferrals', { teamSize: data.teamSize })}</p>
      <div className="flex flex-wrap gap-1">
        {data.directReferrals.map((ref) => (<Badge key={ref} variant="outline" className="font-mono text-xs"><CopyableAddress address={ref} textClassName="text-xs" hideCopyIcon /></Badge>))}
      </div>
    </div>
  );
}

// ─── Member Actions ─────────────────────────────────────────

function MemberActions({ account, status, shopId }: { account: string; status: MemberStatus; shopId: number | null }) {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const { freezeMember, unfreezeMember, banMember, unbanMember, removeMember } = useMembers();
  const [banReason, setBanReason] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    action: 'ban' | 'remove';
    onConfirm: (reason?: string) => void;
  } | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-1">
        {status === MemberStatus.Active && (
          <>
            <Button size="sm" variant="secondary" onClick={() => shopId && freezeMember.mutate([shopId, account])} disabled={isTxBusy(freezeMember) || !shopId}>{t('freeze')}</Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => shopId && setConfirmDialog({
                title: t('confirmBan'),
                description: t('confirmBanDesc', { address: account }),
                action: 'ban',
                onConfirm: (reason) => {
                  banMember.mutate([shopId, account, reason?.trim() || null]);
                  setBanReason('');
                  setConfirmDialog(null);
                },
              })}
              disabled={!shopId}
            >
              {t('ban')}
            </Button>
          </>
        )}
        {status === MemberStatus.Frozen && (
          <Button size="sm" onClick={() => shopId && unfreezeMember.mutate([shopId, account])} disabled={isTxBusy(unfreezeMember) || !shopId}>{t('unfreeze')}</Button>
        )}
        {status === MemberStatus.Banned && (
          <Button size="sm" variant="outline" onClick={() => shopId && unbanMember.mutate([shopId, account])} disabled={isTxBusy(unbanMember) || !shopId}>{t('unban')}</Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => shopId && setConfirmDialog({
            title: t('confirmRemove'),
            description: t('confirmRemoveDesc', { address: account }),
            action: 'remove',
            onConfirm: () => {
              removeMember.mutate([shopId, account]);
              setBanReason('');
              setConfirmDialog(null);
            },
          })}
          disabled={!shopId}
        >
          {t('removeMember')}
        </Button>
      </div>
      <Dialog open={confirmDialog !== null} onOpenChange={(open) => { if (!open) { setConfirmDialog(null); setBanReason(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{confirmDialog?.title}</DialogTitle><DialogDescription>{confirmDialog?.description}</DialogDescription></DialogHeader>
          {confirmDialog?.action === 'ban' && (
            <div className="space-y-2">
              <Label htmlFor={`ban-reason-${account}`}>{t('banReason')}</Label>
              <Input
                id={`ban-reason-${account}`}
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder={t('banReasonPlaceholder')}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmDialog(null); setBanReason(''); }}>{tc('cancel')}</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDialog?.onConfirm(banReason)}
              disabled={confirmDialog?.action === 'ban' && !banReason.trim()}
            >
              {tc('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Member List Section ────────────────────────────────────

function MemberListSection({ shopId }: { shopId: number | null }) {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { members, memberCount } = useMembers();
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">{t('memberList', { count: memberCount })}</CardTitle></CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList className="mb-4">
            <TabsTrigger value="all">{tc('all')}</TabsTrigger>
            {Object.values(MemberStatus).map((s) => (<TabsTrigger key={s} value={s}>{te(`memberStatus.${s}`)}</TabsTrigger>))}
          </TabsList>
          <TabsContent value="all"><MemberTable members={members} expandedAccount={expandedAccount} setExpandedAccount={setExpandedAccount} shopId={shopId} /></TabsContent>
          {Object.values(MemberStatus).map((s) => (
            <TabsContent key={s} value={s}><MemberTable members={members.filter((m) => m.status === s)} expandedAccount={expandedAccount} setExpandedAccount={setExpandedAccount} shopId={shopId} /></TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Member Table (shared) ──────────────────────────────────

function MemberTable({ members, expandedAccount, setExpandedAccount, shopId }: { members: ReturnType<typeof useMembers>['members']; expandedAccount: string | null; setExpandedAccount: (account: string | null) => void; shopId: number | null }) {
  const t = useTranslations('members');
  const te = useTranslations('enums');

  if (members.length === 0) {
    return (<div className="flex items-center justify-center py-8"><p className="text-sm text-muted-foreground">{t('noMembers')}</p></div>);
  }

  return (
    <div className="space-y-2">
      {members.map((m) => (
        <Collapsible key={m.account} open={expandedAccount === m.account} onOpenChange={(open) => setExpandedAccount(open ? m.account : null)}>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="font-mono text-sm"><CopyableAddress address={m.account} textClassName="text-xs" hideCopyIcon /></Button></CollapsibleTrigger>
                  <Badge variant={STATUS_BADGE_VARIANT[m.status].variant} className={STATUS_BADGE_VARIANT[m.status].className}>{te(`memberStatus.${m.status}`)}</Badge>
                  <span className="text-xs text-muted-foreground">Lv.{m.level}</span>
                </div>
                <PermissionGuard required={AdminPermission.MEMBER_MANAGE} fallback={null}><MemberActions account={m.account} status={m.status} shopId={shopId} /></PermissionGuard>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span>{t('spent')}: {formatNex(m.totalSpent)} NEX</span>
                <span>{t('orderCount')}: {m.orderCount}</span>
                {m.referrer && <span className="inline-flex items-center gap-1">{t('referrer')}: <CopyableAddress address={m.referrer} textClassName="text-xs" /></span>}
              </div>
              <CollapsibleContent><Separator className="my-3" /><ReferralSection account={m.account} /></CollapsibleContent>
            </CardContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}

// ─── Cancel Pending Section ─────────────────────────────────

function CancelPendingSection({ shopId }: { shopId: number | null }) {
  const t = useTranslations('members');
  const { cancelPendingMember } = useMembers();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('cancelPending')}</CardTitle>
        <CardDescription>{t('cancelPendingDesc')}</CardDescription>
      </CardHeader>
      <CardFooter className="gap-3">
        <Button variant="outline" onClick={() => shopId && cancelPendingMember.mutate([shopId])} disabled={isTxBusy(cancelPendingMember) || !shopId}>{t('cancelMyApplication')}</Button>
        <TxStatusIndicator txState={cancelPendingMember.txState} />
        {!shopId && <span className="text-xs text-destructive">{t('selectShopFirst')}</span>}
      </CardFooter>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function MembersPage() {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { isLoading, error, policy } = useMembers();
  const { shops } = useShops();
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);

  const shopId = useMemo(() => {
    if (selectedShopId !== null) return selectedShopId;
    if (shops.length > 0) return shops[0].id;
    return null;
  }, [selectedShopId, shops]);

  const hasApproval = (policy & RegistrationPolicy.APPROVAL_REQUIRED) !== 0;

  if (isLoading) return <MembersSkeleton />;

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="w-full max-w-md"><CardHeader><CardTitle className="text-destructive">{tc('loadFailed', { error: String(error) })}</CardTitle></CardHeader></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <div className="flex gap-2">
          <Link href={`/${entityId}/members/levels`}><Button variant="outline" size="sm">{t('levels.title')}</Button></Link>
          <Link href={`/${entityId}/members/referrals`}><Button variant="outline" size="sm">{t('referrals.title')}</Button></Link>
        </div>
      </div>

      <PermissionGuard required={AdminPermission.MEMBER_MANAGE} fallback={null}>
        <Card><CardContent className="pt-6"><ShopSelector shopId={shopId} onShopChange={setSelectedShopId} /></CardContent></Card>
        <PolicySection shopId={shopId} />
        <StatsPolicySection shopId={shopId} />
        <PendingSection shopId={shopId} />
      </PermissionGuard>

      {hasApproval && <CancelPendingSection shopId={shopId} />}

      <MemberListSection shopId={shopId} />
    </div>
  );
}
