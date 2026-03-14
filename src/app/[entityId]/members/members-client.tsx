'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useMembers } from '@/hooks/use-members';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { MemberStatus, RegistrationPolicy } from '@/lib/types/enums';

import { useTranslations } from 'next-intl';

import { useApi } from '@/lib/chain/api-provider';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils/cn';

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
  { bit: RegistrationPolicy.OPEN, key: 'openRegistration' },
  { bit: RegistrationPolicy.PURCHASE_REQUIRED, key: 'purchaseRequired' },
  { bit: RegistrationPolicy.REFERRAL_REQUIRED, key: 'referralRequired' },
  { bit: RegistrationPolicy.APPROVAL_REQUIRED, key: 'approvalRequired' },
  { bit: RegistrationPolicy.KYC_REQUIRED, key: 'kycRequired' },
  { bit: RegistrationPolicy.KYC_UPGRADE_REQUIRED, key: 'kycUpgradeRequired' },
] as const;

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-6)}` : addr;
}

// ─── Loading Skeleton ───────────────────────────────────────

function MembersSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center space-x-3">
              <Skeleton className="h-6 w-11" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
          <div className="mt-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-14 rounded-full" />
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

function PolicySection() {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { api } = useApi();
  const { policy, setRegistrationPolicy } = useMembers();
  const [localPolicy, setLocalPolicy] = useState<number | null>(null);
  const current = localPolicy ?? policy;

  // DEBUG: 在 render 时打印，确保能看到
  console.log('[DEBUG-RENDER] api ready:', !!api, 'entityId:', entityId, 'policy:', policy);
  if (api) {
    try {
      const txMethods = Object.keys((api.tx as any).entityMember ?? {}).filter(k => !k.startsWith('$'));
      const storageKeys = Object.keys((api.query as any).entityMember ?? {}).filter(k => !k.startsWith('$'));
      const meta = (api.tx as any).entityMember?.setMemberPolicy?.meta?.toJSON?.();
      console.log('[DEBUG] entityMember tx methods:', txMethods);
      console.log('[DEBUG] entityMember storage keys:', storageKeys);
      console.log('[DEBUG] setMemberPolicy meta args:', meta?.args);
    } catch (e) { console.log('[DEBUG] error:', e); }
  }

  const toggleBit = useCallback((bit: number) => {
    setLocalPolicy((prev) => (prev ?? policy) ^ bit);
  }, [policy]);

  const handleSave = useCallback(() => {
    if (localPolicy !== null && localPolicy !== policy) {
      setRegistrationPolicy.mutate([entityId, localPolicy]);
      setLocalPolicy(null);
    }
  }, [entityId, localPolicy, policy, setRegistrationPolicy]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('registrationPolicy')}</CardTitle>
        <CardDescription>{t('registrationPolicyDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {POLICY_FLAGS.map(({ bit, key }) => (
          <div key={bit} className="flex items-center space-x-3">
            <Switch
              id={`policy-${bit}`}
              checked={(current & bit) !== 0 || bit === 0}
              disabled={bit === 0}
              onCheckedChange={() => toggleBit(bit)}
            />
            <Label htmlFor={`policy-${bit}`} className="cursor-pointer">
              {t(key)}
            </Label>
          </div>
        ))}
      </CardContent>
      {localPolicy !== null && localPolicy !== policy && (
        <CardFooter className="gap-3">
          <Button
            onClick={handleSave}
            disabled={isTxBusy(setRegistrationPolicy)}
          >
            {t('savePolicy')}
          </Button>
          <Button variant="ghost" onClick={() => setLocalPolicy(null)}>
            {tc('reset')}
          </Button>
          <TxStatusIndicator txState={setRegistrationPolicy.txState} />
        </CardFooter>
      )}
    </Card>
  );
}

// ─── Pending Members Section ────────────────────────────────

function PendingSection() {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { pendingMembers, policy, approveMember, rejectMember } = useMembers();
  const hasApproval = (policy & RegistrationPolicy.APPROVAL_REQUIRED) !== 0;

  if (!hasApproval || pendingMembers.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('pendingMembers', { count: pendingMembers.length })}
        </CardTitle>
        <CardDescription>{t('pendingMembersDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tc('address')}</TableHead>
              <TableHead className="text-right">{tc('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingMembers.map((account) => (
              <TableRow key={account}>
                <TableCell className="font-mono text-sm">{shortAddr(account)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => approveMember.mutate([entityId, account])}
                      disabled={isTxBusy(approveMember)}
                    >
                      {t('approve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => rejectMember.mutate([entityId, account])}
                      disabled={isTxBusy(rejectMember)}
                    >
                      {t('reject')}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter className="gap-3">
        <TxStatusIndicator txState={approveMember.txState} />
        <TxStatusIndicator txState={rejectMember.txState} />
      </CardFooter>
    </Card>
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
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        {t('directReferrals', { teamSize: data.teamSize })}
      </p>
      <div className="flex flex-wrap gap-1">
        {data.directReferrals.map((ref) => (
          <Badge key={ref} variant="outline" className="font-mono text-xs">
            {shortAddr(ref)}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ─── Member Actions ─────────────────────────────────────────

function MemberActions({ account, status }: { account: string; status: MemberStatus }) {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { freezeMember, unfreezeMember, banMember, unbanMember, removeMember } = useMembers();
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-1">
        {status === MemberStatus.Active && (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => freezeMember.mutate([entityId, account])}
              disabled={isTxBusy(freezeMember)}
            >
              {t('freeze')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                setConfirmDialog({
                  title: t('confirmBan'),
                  description: t('confirmBanDesc', { address: shortAddr(account) }),
                  onConfirm: () => {
                    banMember.mutate([entityId, account]);
                    setConfirmDialog(null);
                  },
                })
              }
            >
              {t('ban')}
            </Button>
          </>
        )}
        {status === MemberStatus.Frozen && (
          <Button
            size="sm"
            onClick={() => unfreezeMember.mutate([entityId, account])}
            disabled={isTxBusy(unfreezeMember)}
          >
            {t('unfreeze')}
          </Button>
        )}
        {status === MemberStatus.Banned && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => unbanMember.mutate([entityId, account])}
            disabled={isTxBusy(unbanMember)}
          >
            {t('unban')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setConfirmDialog({
              title: t('confirmRemove'),
              description: t('confirmRemoveDesc', { address: shortAddr(account) }),
              onConfirm: () => {
                removeMember.mutate([entityId, account]);
                setConfirmDialog(null);
              },
            })
          }
        >
          {t('removeMember')}
        </Button>
      </div>

      <Dialog open={confirmDialog !== null} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog?.title}</DialogTitle>
            <DialogDescription>{confirmDialog?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDialog?.onConfirm}>
              {tc('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Member List Section ────────────────────────────────────

function MemberListSection() {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { members, memberCount } = useMembers();
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('memberList', { count: memberCount })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList className="mb-4">
            <TabsTrigger value="all">{tc('all')}</TabsTrigger>
            {Object.values(MemberStatus).map((s) => (
              <TabsTrigger key={s} value={s}>{te(`memberStatus.${s}`)}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all">
            <MemberTable
              members={members}
              expandedAccount={expandedAccount}
              setExpandedAccount={setExpandedAccount}
            />
          </TabsContent>

          {Object.values(MemberStatus).map((s) => (
            <TabsContent key={s} value={s}>
              <MemberTable
                members={members.filter((m) => m.status === s)}
                expandedAccount={expandedAccount}
                setExpandedAccount={setExpandedAccount}
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Member Table (shared) ──────────────────────────────────

function MemberTable({
  members,
  expandedAccount,
  setExpandedAccount,
}: {
  members: ReturnType<typeof useMembers>['members'];
  expandedAccount: string | null;
  setExpandedAccount: (account: string | null) => void;
}) {
  const t = useTranslations('members');
  const te = useTranslations('enums');

  if (members.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-muted-foreground">{t('noMembers')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {members.map((m) => (
        <Collapsible
          key={m.account}
          open={expandedAccount === m.account}
          onOpenChange={(open) => setExpandedAccount(open ? m.account : null)}
        >
          <Card className="shadow-none">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="font-mono text-sm">
                      {shortAddr(m.account)}
                    </Button>
                  </CollapsibleTrigger>
                  <Badge
                    variant={STATUS_BADGE_VARIANT[m.status].variant}
                    className={STATUS_BADGE_VARIANT[m.status].className}
                  >
                    {te(`memberStatus.${m.status}`)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">Lv.{m.level}</span>
                </div>
                <PermissionGuard required={AdminPermission.MEMBER_MANAGE} fallback={null}>
                  <MemberActions account={m.account} status={m.status} />
                </PermissionGuard>
              </div>

              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span>{t('spent')}: {m.totalSpent.toString()}</span>
                <span>{t('orderCount')}: {m.orderCount}</span>
                {m.referrer && <span>{t('referrer')}: {shortAddr(m.referrer)}</span>}
              </div>

              <CollapsibleContent>
                <Separator className="my-3" />
                <ReferralSection account={m.account} />
              </CollapsibleContent>
            </CardContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function MembersPage() {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { isLoading, error } = useMembers();

  if (isLoading) {
    return <MembersSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">{tc('loadFailed', { error: String(error) })}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <Link href={`/${entityId}/members/referrals`}>
          <Button variant="outline" size="sm">{t('referrals.title')}</Button>
        </Link>
      </div>

      <PermissionGuard required={AdminPermission.MEMBER_MANAGE} fallback={null}>
        <PolicySection />
        <PendingSection />
      </PermissionGuard>

      <MemberListSection />
    </div>
  );
}
