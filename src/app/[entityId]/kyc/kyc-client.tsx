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
import { LabelWithTip } from '@/components/field-help-tip';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
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
import { CopyableAddress } from '@/components/copyable-address';

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

function encodeCountryCode(value: string): [number, number] | null {
  const normalized = value.trim().toUpperCase();
  if (normalized.length !== 2) return null;
  return [normalized.charCodeAt(0), normalized.charCodeAt(1)];
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
  const [mandatory, setMandatory] = useState(requirement.mandatory);
  const [gracePeriod, setGracePeriod] = useState(requirement.gracePeriod);
  const [allowHighRiskCountries, setAllowHighRiskCountries] = useState(requirement.allowHighRiskCountries);
  const [maxRiskScore, setMaxRiskScore] = useState(requirement.maxRiskScore);

  const handleSave = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setEntityRequirement.mutate([
        entityId,
        minLevel,
        mandatory,
        gracePeriod,
        allowHighRiskCountries,
        maxRiskScore,
      ]);
      setEditing(false);
    },
    [allowHighRiskCountries, entityId, gracePeriod, mandatory, maxRiskScore, minLevel, setEntityRequirement],
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
                setMandatory(requirement.mandatory);
                setGracePeriod(requirement.gracePeriod);
                setAllowHighRiskCountries(requirement.allowHighRiskCountries);
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <LabelWithTip tip={t('help.minLevel')}>{t('minLevel')}</LabelWithTip>
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
                <LabelWithTip htmlFor="max-risk" tip={t('help.maxRiskScore')}>{t('maxRiskScore')}</LabelWithTip>
                <Input
                  id="max-risk"
                  type="number"
                  min={0}
                  max={100}
                  value={maxRiskScore}
                  onChange={(e) => setMaxRiskScore(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <LabelWithTip htmlFor="grace-period" tip={t('help.gracePeriod')}>{t('gracePeriod')}</LabelWithTip>
                <Input
                  id="grace-period"
                  type="number"
                  min={0}
                  value={gracePeriod}
                  onChange={(e) => setGracePeriod(Number(e.target.value))}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="space-y-1">
                  <LabelWithTip htmlFor="mandatory-switch" tip={t('help.mandatory')}>{t('mandatory')}</LabelWithTip>
                  <p className="text-xs text-muted-foreground">{t('requirementDesc')}</p>
                </div>
                <Switch id="mandatory-switch" checked={mandatory} onCheckedChange={setMandatory} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="space-y-1">
                  <LabelWithTip htmlFor="high-risk-switch" tip={t('help.allowHighRiskCountries')}>{t('allowHighRiskCountries')}</LabelWithTip>
                  <p className="text-xs text-muted-foreground">{t('maxRiskScore')}</p>
                </div>
                <Switch
                  id="high-risk-switch"
                  checked={allowHighRiskCountries}
                  onCheckedChange={setAllowHighRiskCountries}
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <Card className="shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{t('mandatory')}</p>
                <p className="text-sm font-medium">{requirement.mandatory ? tc('enabled') : tc('disabled')}</p>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{t('gracePeriod')}</p>
                <p className="text-sm font-medium">{requirement.gracePeriod}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('allowHighRiskCountries')}: {requirement.allowHighRiskCountries ? tc('enabled') : tc('disabled')}
                </p>
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
  const isCountryCodeValid = !countryCode.trim() || countryCode.trim().length === 2;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!dataCid.trim()) return;
      submitKyc.mutate([
        entityId,
        level,
        dataCid.trim(),
        encodeCountryCode(countryCode),
      ]);
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
              <LabelWithTip tip={t('help.certificationLevel')}>{t('certificationLevel')}</LabelWithTip>
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
              <LabelWithTip htmlFor="data-cid" tip={t('help.dataCid')}>{t('dataCid')}</LabelWithTip>
              <Input
                id="data-cid"
                value={dataCid}
                onChange={(e) => setDataCid(e.target.value)}
                placeholder={t('dataCidPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="country-code" tip={t('help.countryCode')}>{t('countryCode')}</LabelWithTip>
              <Input
                id="country-code"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                placeholder={t('countryCodePlaceholder')}
                maxLength={2}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!dataCid.trim() || !isCountryCodeValid || isTxBusy(submitKyc)}>
              {t('submitApplication_btn')}
            </Button>
            <TxStatusIndicator txState={submitKyc.txState} />
            {!isCountryCodeValid && (
              <p className="text-xs text-destructive">{t('countryCodePlaceholder')}</p>
            )}
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
  const [riskScores, setRiskScores] = useState<Record<string, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [rejectDetails, setRejectDetails] = useState<Record<string, string>>({});
  const [revokeReasons, setRevokeReasons] = useState<Record<string, string>>({});

  const handleUpdate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!updateAccount || !newCid.trim()) return;
      updateKycData.mutate([entityId, newCid.trim()]);
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
                  <TableCell><CopyableAddress address={r.account} textClassName="text-xs" /></TableCell>
                  <TableCell>
                    <Badge variant={KYC_STATUS_VARIANT[r.status]}>
                      {te(KYC_STATUS_KEY[r.status])}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">Lv.{r.level} {te(KYC_LEVEL_KEY[r.level] ?? 'kycLevel.None')}</Badge>
                  </TableCell>
                  <TableCell>
                    {r.status === KycStatus.Pending ? (
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="w-24"
                        value={riskScores[r.account] ?? String(r.riskScore ?? 0)}
                        onChange={(e) => setRiskScores((prev) => ({ ...prev, [r.account]: e.target.value }))}
                      />
                    ) : (
                      r.riskScore
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div className="space-y-0.5">
                      <div className="inline-flex items-center gap-1">CID: {r.dataCid ? <CopyableAddress address={r.dataCid} textClassName="text-xs" /> : '---'}</div>
                      {r.countryCode && <div>{t('country')}: {r.countryCode}</div>}
                      {r.expiresAt && <div>{t('expiresAt', { block: String(r.expiresAt) })}</div>}
                      <div>{t('submittedAt', { block: String(r.submittedAt) })}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-2">
                      {r.status === KycStatus.Pending && (
                        <div className="space-y-2 rounded-md border p-2">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input
                              value={rejectReasons[r.account] ?? ''}
                              onChange={(e) => setRejectReasons((prev) => ({ ...prev, [r.account]: e.target.value }))}
                              placeholder={t('rejectReason')}
                            />
                            <Input
                              value={rejectDetails[r.account] ?? ''}
                              onChange={(e) => setRejectDetails((prev) => ({ ...prev, [r.account]: e.target.value }))}
                              placeholder={t('rejectDetailsCid')}
                            />
                          </div>
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => approveKyc.mutate([
                                entityId,
                                r.account,
                                Number(riskScores[r.account] ?? r.riskScore ?? 0),
                              ])}
                              disabled={isTxBusy(approveKyc)}
                            >
                              {t('approveKyc')}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => rejectKyc.mutate([
                                entityId,
                                r.account,
                                (rejectReasons[r.account] ?? '').trim(),
                                (rejectDetails[r.account] ?? '').trim() || null,
                              ])}
                              disabled={isTxBusy(rejectKyc) || !(rejectReasons[r.account] ?? '').trim()}
                            >
                              {t('rejectKyc')}
                            </Button>
                          </div>
                        </div>
                      )}
                      {r.status === KycStatus.Approved && (
                        <div className="space-y-2 rounded-md border p-2">
                          <Input
                            value={revokeReasons[r.account] ?? ''}
                            onChange={(e) => setRevokeReasons((prev) => ({ ...prev, [r.account]: e.target.value }))}
                            placeholder={t('revokeReason')}
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => revokeKyc.mutate([
                              entityId,
                              r.account,
                              (revokeReasons[r.account] ?? '').trim(),
                            ])}
                            disabled={isTxBusy(revokeKyc) || !(revokeReasons[r.account] ?? '').trim()}
                          >
                            {t('revokeKyc')}
                          </Button>
                        </div>
                      )}
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setUpdateAccount(r.account); setNewCid(''); }}
                        >
                          {t('updateData')}
                        </Button>
                      </div>
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
              <DialogTitle>{t('updateKycData', { address: updateAccount ?? '' })}</DialogTitle>
              <DialogDescription>
                {t('updateKycDataDesc', { address: updateAccount ?? '' })}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="space-y-2">
                <LabelWithTip htmlFor="new-cid" tip={t('help.newDataCid')}>{t('newDataCid')}</LabelWithTip>
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
        <Button
          variant="destructive"
          size="sm"
          onClick={() => purgeKycData.mutate([entityId])}
          disabled={isTxBusy(purgeKycData)}
        >
          {t('purgeEntityData')}
        </Button>
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
                <CopyableAddress address={r.account} textClassName="text-xs" />
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
