'use client';

import React, { useState, useCallback } from 'react';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useKyc } from '@/hooks/use-kyc';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { KycLevel, KycStatus } from '@/lib/types/enums';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-6)}` : addr;
}

const KYC_LEVEL_KEY: Record<number, string> = {
  [KycLevel.None]: 'kycLevel.None',
  [KycLevel.Basic]: 'kycLevel.Basic',
  [KycLevel.Standard]: 'kycLevel.Standard',
  [KycLevel.Enhanced]: 'kycLevel.Enhanced',
  [KycLevel.Full]: 'kycLevel.Full',
};

const KYC_STATUS_VARIANT: Record<KycStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  [KycStatus.NotSubmitted]: 'secondary',
  [KycStatus.Pending]: 'warning',
  [KycStatus.Approved]: 'success',
  [KycStatus.Rejected]: 'destructive',
  [KycStatus.Expired]: 'outline',
  [KycStatus.Revoked]: 'destructive',
};

const KYC_STATUS_KEY: Record<KycStatus, string> = {
  [KycStatus.NotSubmitted]: 'kycStatus.NotSubmitted',
  [KycStatus.Pending]: 'kycStatus.Pending',
  [KycStatus.Approved]: 'kycStatus.Approved',
  [KycStatus.Rejected]: 'kycStatus.Rejected',
  [KycStatus.Expired]: 'kycStatus.Expired',
  [KycStatus.Revoked]: 'kycStatus.Revoked',
};

const KYC_LEVELS_SELECTABLE = [
  { value: KycLevel.Basic, labelKey: 'kycLevel.Basic' },
  { value: KycLevel.Standard, labelKey: 'kycLevel.Standard' },
  { value: KycLevel.Enhanced, labelKey: 'kycLevel.Enhanced' },
  { value: KycLevel.Full, labelKey: 'kycLevel.Full' },
];

// ─── Status Flow Display ────────────────────────────────────

const STATUS_FLOW: KycStatus[] = [
  KycStatus.NotSubmitted,
  KycStatus.Pending,
  KycStatus.Approved,
  KycStatus.Rejected,
  KycStatus.Expired,
  KycStatus.Revoked,
];

function StatusFlowIndicator({ current }: { current: KycStatus }) {
  const te = useTranslations('enums');
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {STATUS_FLOW.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <span className="text-muted-foreground/40">-&gt;</span>}
          <Badge
            variant={current === s ? KYC_STATUS_VARIANT[s] : 'outline'}
            className={cn(
              'text-[10px] px-1.5 py-0',
              current !== s && 'opacity-40'
            )}
          >
            {te(KYC_STATUS_KEY[s])}
          </Badge>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────

function KycSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="h-10 w-24" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-md border p-4 space-y-2">
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Requirement Display & Config ───────────────────────────

function RequirementSection() {
  const { entityId } = useEntityContext();
  const { requirement, setEntityRequirement } = useKyc();
  const t = useTranslations('kyc');
  const tc = useTranslations('common');
  const te = useTranslations('enums');

  const [editing, setEditing] = useState(false);
  const [minLevel, setMinLevel] = useState<KycLevel>(requirement.minLevel);
  const [maxRiskScore, setMaxRiskScore] = useState(requirement.maxRiskScore);

  const handleSave = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setEntityRequirement.mutate([entityId, minLevel, maxRiskScore]);
      setEditing(false);
    },
    [entityId, minLevel, maxRiskScore, setEntityRequirement],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">{t('requirement')}</CardTitle>
          <CardDescription>{t('requirementDesc')}</CardDescription>
        </div>
        <PermissionGuard required={AdminPermission.KYC_MANAGE} fallback={null}>
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMinLevel(requirement.minLevel);
                setMaxRiskScore(requirement.maxRiskScore);
                setEditing(true);
              }}
            >
              {t('configure')}
            </Button>
          )}
        </PermissionGuard>
      </CardHeader>

      <CardContent>
        {editing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('minLevel')}</Label>
                <Select
                  value={String(minLevel)}
                  onValueChange={(v) => setMinLevel(Number(v) as KycLevel)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectLevel')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={String(KycLevel.None)}>{t('noLevel')} (Lv.0)</SelectItem>
                    {KYC_LEVELS_SELECTABLE.map(({ value, labelKey }) => (
                      <SelectItem key={value} value={String(value)}>{te(labelKey)} (Lv.{value})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-risk">{t('maxRiskScore')}</Label>
                <Input
                  id="max-risk"
                  type="number"
                  min={0}
                  max={100}
                  value={maxRiskScore}
                  onChange={(e) => setMaxRiskScore(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={isTxBusy(setEntityRequirement)}>
                {tc('save')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                {tc('cancel')}
              </Button>
              <TxStatusIndicator txState={setEntityRequirement.txState} />
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Card className="shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{t('minLevel')}</p>
                <p className="text-sm font-medium">
                  {te(KYC_LEVEL_KEY[requirement.minLevel] ?? 'kycLevel.None')} (Lv.{requirement.minLevel})
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{t('maxRiskScore')}</p>
                <p className="text-sm font-medium">{requirement.maxRiskScore}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── KYC Application Form ───────────────────────────────────

function ApplicationSection() {
  const { entityId } = useEntityContext();
  const { submitKyc } = useKyc();
  const t = useTranslations('kyc');
  const te = useTranslations('enums');

  const [level, setLevel] = useState<KycLevel>(KycLevel.Basic);
  const [dataCid, setDataCid] = useState('');
  const [countryCode, setCountryCode] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!dataCid.trim()) return;
      const args: (string | number | null)[] = [entityId, level, dataCid.trim()];
      if (countryCode.trim()) args.push(countryCode.trim());
      else args.push(null);
      submitKyc.mutate(args);
      setDataCid('');
      setCountryCode('');
    },
    [entityId, level, dataCid, countryCode, submitKyc],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('submitApplication')}</CardTitle>
        <CardDescription>{t('submitApplicationDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>{t('certificationLevel')}</Label>
              <Select
                value={String(level)}
                onValueChange={(v) => setLevel(Number(v) as KycLevel)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectLevel')} />
                </SelectTrigger>
                <SelectContent>
                  {KYC_LEVELS_SELECTABLE.map(({ value, labelKey }) => (
                    <SelectItem key={value} value={String(value)}>{te(labelKey)} (Lv.{value})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="data-cid">{t('dataCid')}</Label>
              <Input
                id="data-cid"
                value={dataCid}
                onChange={(e) => setDataCid(e.target.value)}
                placeholder={t('dataCidPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country-code">{t('countryCode')}</Label>
              <Input
                id="country-code"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                placeholder={t('countryCodePlaceholder')}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!dataCid.trim() || isTxBusy(submitKyc)}>
              {t('submitApplication_btn')}
            </Button>
            <TxStatusIndicator txState={submitKyc.txState} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── KYC Management (Admin) ─────────────────────────────────

function ManagementSection() {
  const { entityId } = useEntityContext();
  const { kycRecords, approveKyc, rejectKyc, revokeKyc, updateKycData, purgeKycData } = useKyc();
  const t = useTranslations('kyc');
  const tc = useTranslations('common');
  const te = useTranslations('enums');

  const [updateAccount, setUpdateAccount] = useState<string | null>(null);
  const [newCid, setNewCid] = useState('');

  const handleUpdate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!updateAccount || !newCid.trim()) return;
      updateKycData.mutate([entityId, updateAccount, newCid.trim()]);
      setUpdateAccount(null);
      setNewCid('');
    },
    [entityId, updateAccount, newCid, updateKycData],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('kycManagement')}</CardTitle>
        <CardDescription>{t('kycManagementDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {kycRecords.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noKycRecords')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tc('account')}</TableHead>
                <TableHead>{tc('status')}</TableHead>
                <TableHead>{t('levelDisplay')}</TableHead>
                <TableHead>{t('riskScore')}</TableHead>
                <TableHead>{t('dataCid')}</TableHead>
                <TableHead className="text-right">{tc('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kycRecords.map((r) => (
                <TableRow key={r.account}>
                  <TableCell className="font-mono text-xs">{shortAddr(r.account)}</TableCell>
                  <TableCell>
                    <Badge variant={KYC_STATUS_VARIANT[r.status]}>
                      {te(KYC_STATUS_KEY[r.status])}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">Lv.{r.level} {te(KYC_LEVEL_KEY[r.level] ?? 'kycLevel.None')}</Badge>
                  </TableCell>
                  <TableCell>{r.riskScore}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div className="space-y-0.5">
                      <div>CID: {r.dataCid ? shortAddr(r.dataCid) : '---'}</div>
                      {r.countryCode && <div>{t('country')}: {r.countryCode}</div>}
                      {r.expiresAt && <div>{t('expiresAt', { block: String(r.expiresAt) })}</div>}
                      <div>{t('submittedAt', { block: String(r.submittedAt) })}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {r.status === KycStatus.Pending && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => approveKyc.mutate([entityId, r.account])}
                            disabled={isTxBusy(approveKyc)}
                          >
                            {t('approveKyc')}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => rejectKyc.mutate([entityId, r.account])}
                            disabled={isTxBusy(rejectKyc)}
                          >
                            {t('rejectKyc')}
                          </Button>
                        </>
                      )}
                      {r.status === KycStatus.Approved && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => revokeKyc.mutate([entityId, r.account])}
                          disabled={isTxBusy(revokeKyc)}
                        >
                          {t('revokeKyc')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setUpdateAccount(r.account); setNewCid(''); }}
                      >
                        {t('updateData')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => purgeKycData.mutate([entityId, r.account])}
                        disabled={isTxBusy(purgeKycData)}
                      >
                        {t('purgeData')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Update KYC Data Dialog */}
        <Dialog
          open={updateAccount !== null}
          onOpenChange={(open) => { if (!open) setUpdateAccount(null); }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('updateKycData', { address: updateAccount ? shortAddr(updateAccount) : '' })}</DialogTitle>
              <DialogDescription>
                {t('updateKycDataDesc', { address: updateAccount ? shortAddr(updateAccount) : '' })}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-cid">{t('newDataCid')}</Label>
                <Input
                  id="new-cid"
                  value={newCid}
                  onChange={(e) => setNewCid(e.target.value)}
                  placeholder={t('dataCidPlaceholder')}
                />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setUpdateAccount(null)}>
                  {tc('cancel')}
                </Button>
                <Button type="submit" disabled={!newCid.trim() || isTxBusy(updateKycData)}>
                  {t('updateData')}
                </Button>
              </DialogFooter>
            </form>
            <TxStatusIndicator txState={updateKycData.txState} />
          </DialogContent>
        </Dialog>
      </CardContent>
      <CardFooter className="flex-wrap gap-3">
        <TxStatusIndicator txState={approveKyc.txState} />
        <TxStatusIndicator txState={rejectKyc.txState} />
        <TxStatusIndicator txState={revokeKyc.txState} />
        <TxStatusIndicator txState={purgeKycData.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── User KYC Status Section ────────────────────────────────

function UserKycSection() {
  const { kycRecords } = useKyc();
  const t = useTranslations('kyc');
  const te = useTranslations('enums');

  if (kycRecords.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('kycRecords')}</CardTitle>
        <CardDescription>{t('kycRecordsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {kycRecords.map((r) => (
          <Card key={r.account} className="shadow-none">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm">{shortAddr(r.account)}</span>
                <Badge variant={KYC_STATUS_VARIANT[r.status]}>
                  {te(KYC_STATUS_KEY[r.status])}
                </Badge>
                <Badge variant="outline">Lv.{r.level} {te(KYC_LEVEL_KEY[r.level] ?? 'kycLevel.None')}</Badge>
              </div>
              <div className="mt-2">
                <StatusFlowIndicator current={r.status} />
              </div>
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function KycPage() {
  const t = useTranslations('kyc');
  const tc = useTranslations('common');
  const { isLoading, error } = useKyc();

  if (isLoading) {
    return <KycSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="max-w-md border-destructive">
          <CardHeader className="text-center">
            <CardTitle className="text-lg text-destructive">{tc('loadFailed', { error: String(error) })}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <RequirementSection />
      <ApplicationSection />
      <UserKycSection />

      <PermissionGuard required={AdminPermission.KYC_MANAGE} fallback={null}>
        <ManagementSection />
      </PermissionGuard>
    </div>
  );
}
