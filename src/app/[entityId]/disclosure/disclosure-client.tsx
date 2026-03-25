'use client';

import React, { useState, useCallback } from 'react';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useDisclosure } from '@/hooks/use-disclosure';
import type { DisclosureConfigData, ApprovalConfigData } from '@/hooks/use-disclosure';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import {
  DisclosureLevel, DisclosureStatus, InsiderRole, DisclosureType,
  AnnouncementCategory, PenaltyLevel, InsiderTransactionType, ViolationType,
  AuditStatus,
} from '@/lib/types/enums';
import { useCurrentBlock } from '@/hooks/use-current-block';
import { isTxBusy, useTxLock } from '@/hooks/use-tx-lock';

import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils/cn';
import { CopyableAddress } from '@/components/copyable-address';
import { LabelWithTip } from '@/components/field-help-tip';
import {
  AlertTriangle, Shield, Clock, FileText, Users, Megaphone,
  ShieldAlert, Settings, CheckCircle2, XCircle, Zap,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────

const DISCLOSURE_LEVELS: DisclosureLevel[] = [
  DisclosureLevel.Basic,
  DisclosureLevel.Standard,
  DisclosureLevel.Enhanced,
  DisclosureLevel.Full,
];

const STATUS_VARIANT: Record<DisclosureStatus, 'secondary' | 'success' | 'destructive' | 'warning'> = {
  [DisclosureStatus.Draft]: 'secondary',
  [DisclosureStatus.Published]: 'success',
  [DisclosureStatus.Withdrawn]: 'destructive',
  [DisclosureStatus.Corrected]: 'warning',
};

const PENALTY_VARIANT: Record<PenaltyLevel, 'secondary' | 'warning' | 'destructive'> = {
  [PenaltyLevel.None]: 'secondary',
  [PenaltyLevel.Warning]: 'warning',
  [PenaltyLevel.Restricted]: 'warning',
  [PenaltyLevel.Suspended]: 'destructive',
  [PenaltyLevel.Delisted]: 'destructive',
};

const INSIDER_ROLE_BIT: Record<InsiderRole, number> = {
  [InsiderRole.Owner]: 0x01,
  [InsiderRole.Admin]: 0x02,
  [InsiderRole.Auditor]: 0x04,
  [InsiderRole.Advisor]: 0x08,
  [InsiderRole.MajorHolder]: 0x10,
};

// ─── Loading Skeleton ───────────────────────────────────────

function DisclosureSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <Card>
        <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-1/3" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Overview / Status Cards ────────────────────────────────

function OverviewSection() {
  const t = useTranslations('disclosure');
  const te = useTranslations('enums');
  const { config, penalty, highRisk } = useDisclosure();
  const currentBlock = useCurrentBlock();

  if (!config) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <FileText className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">{t('notConfigured')}</p>
          <p className="text-xs text-muted-foreground">{t('notConfiguredDesc')}</p>
        </CardContent>
      </Card>
    );
  }

  const blocksRemaining = config.nextRequiredDisclosure > currentBlock
    ? config.nextRequiredDisclosure - currentBlock
    : 0;
  const isOverdue = currentBlock > config.nextRequiredDisclosure && config.nextRequiredDisclosure > 0;

  return (
    <div className="space-y-4">
      {highRisk && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <p className="text-sm font-medium text-destructive">{t('highRiskWarning')}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Level */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              {t('currentLevel')}
            </div>
            <p className="mt-1 text-xl font-semibold">{te(`disclosureLevel.${config.level}`) || config.level}</p>
          </CardContent>
        </Card>

        {/* Next Deadline */}
        <Card className={cn(isOverdue && 'border-destructive/50')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {t('nextDeadline')}
            </div>
            {config.nextRequiredDisclosure > 0 ? (
              <>
                <p className={cn('mt-1 text-xl font-semibold', isOverdue && 'text-destructive')}>
                  {t('nextDeadlineBlock', { block: config.nextRequiredDisclosure })}
                </p>
                {isOverdue ? (
                  <p className="text-xs text-destructive">OVERDUE</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{blocksRemaining} blocks remaining</p>
                )}
              </>
            ) : (
              <p className="mt-1 text-xl font-semibold text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>

        {/* Violations */}
        <Card className={cn(config.violationCount > 0 && 'border-yellow-500/50')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              {t('violationCount')}
            </div>
            <p className={cn('mt-1 text-xl font-semibold', config.violationCount > 0 && 'text-yellow-600 dark:text-yellow-400')}>
              {config.violationCount}
            </p>
          </CardContent>
        </Card>

        {/* Penalty */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldAlert className="h-4 w-4" />
              {t('penaltyStatus')}
            </div>
            <div className="mt-1">
              <Badge variant={PENALTY_VARIANT[penalty]} className="text-sm">
                {te(`penaltyLevel.${penalty}`)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Blackout Period ─────────────────────────────────────────

function BlackoutSection() {
  const t = useTranslations('disclosure');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const { blackout, insiders, startBlackout, endBlackout } = useDisclosure();
  const currentBlock = useCurrentBlock();

  const [duration, setDuration] = useState('');

  const isActive = blackout ? currentBlock >= blackout.start && currentBlock <= blackout.end : false;

  if (!blackout && !isActive) {
    return null;
  }

  return (
    <Card className={cn(
      isActive
        ? 'border-destructive/50 bg-destructive/5'
        : 'border-yellow-500/50 bg-yellow-500/5',
    )}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className={cn(
              'text-lg',
              isActive ? 'text-destructive' : 'text-yellow-700 dark:text-yellow-400',
            )}>
              {isActive ? t('blackoutActive') : t('blackoutConfigured')}
            </CardTitle>
            <Badge variant={isActive ? 'destructive' : 'warning'}>
              {isActive ? t('blackoutActiveLabel') : t('blackoutConfiguredLabel')}
            </Badge>
          </div>
          <PermissionGuard required={AdminPermission.DISCLOSURE_MANAGE} fallback={null}>
            {isActive ? (
              <Button variant="destructive" size="sm" onClick={() => endBlackout.mutate([entityId])}
                disabled={isTxBusy(endBlackout)}>
                {t('endBlackout')}
              </Button>
            ) : null}
          </PermissionGuard>
        </div>
        <CardDescription className={cn(
          isActive ? 'text-destructive/80' : 'text-yellow-700/80 dark:text-yellow-400/80',
        )}>
          {isActive
            ? t('blackoutActiveDesc', { start: blackout!.start, end: blackout!.end, current: currentBlock })
            : t('blackoutConfiguredDesc', { start: blackout!.start, end: blackout!.end, current: currentBlock })}
        </CardDescription>
      </CardHeader>
      {isActive && insiders.length > 0 && (
        <CardContent>
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-xs font-medium text-destructive">{t('restrictedInsiders')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {insiders.map((i) => (
                <Badge key={i.account} variant="destructive" className="text-xs">
                  <CopyableAddress address={i.account} textClassName="text-xs" hideCopyIcon /> ({te(`insiderRole.${i.role}`)})
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      )}
      <CardFooter className="gap-3">
        <TxStatusIndicator txState={endBlackout.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Configuration Tab ──────────────────────────────────────

function ConfigurationSection() {
  const t = useTranslations('disclosure');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const {
    config, approvalConfig, fiscalYear,
    configureDisclosure, configureApprovalRequirements, configureFiscalYear,
    startBlackout,
  } = useDisclosure();

  // Disclosure config
  const [level, setLevel] = useState<DisclosureLevel>(config?.level ?? DisclosureLevel.Basic);
  const [insiderControl, setInsiderControl] = useState(config?.insiderTradingControl ?? false);
  const [blackoutAfter, setBlackoutAfter] = useState(String(config?.blackoutPeriodAfter ?? 0));

  // Approval config
  const [reqApprovals, setReqApprovals] = useState(String(approvalConfig?.requiredApprovals ?? 0));
  const [allowedRoles, setAllowedRoles] = useState<InsiderRole[]>(() => {
    if (!approvalConfig) return [];
    return Object.values(InsiderRole).filter(r => (approvalConfig.allowedRoles & INSIDER_ROLE_BIT[r]) !== 0);
  });

  // Fiscal year
  const [yearStart, setYearStart] = useState(String(fiscalYear?.yearStartBlock ?? ''));
  const [yearLen, setYearLen] = useState(String(fiscalYear?.yearLength ?? ''));

  // Blackout manual start
  const [blackoutDuration, setBlackoutDuration] = useState('');

  const handleSaveConfig = useCallback(() => {
    configureDisclosure.mutate([entityId, level, insiderControl, Number(blackoutAfter) || 0]);
  }, [entityId, level, insiderControl, blackoutAfter, configureDisclosure]);

  const handleSaveApproval = useCallback(() => {
    const roleBits = allowedRoles.reduce((acc, r) => acc | INSIDER_ROLE_BIT[r], 0);
    configureApprovalRequirements.mutate([entityId, Number(reqApprovals) || 0, roleBits]);
  }, [entityId, reqApprovals, allowedRoles, configureApprovalRequirements]);

  const handleSaveFiscalYear = useCallback(() => {
    configureFiscalYear.mutate([entityId, Number(yearStart) || 0, Number(yearLen) || 0]);
  }, [entityId, yearStart, yearLen, configureFiscalYear]);

  const handleStartBlackout = useCallback(() => {
    if (!blackoutDuration.trim()) return;
    startBlackout.mutate([entityId, Number(blackoutDuration)]);
    setBlackoutDuration('');
  }, [entityId, blackoutDuration, startBlackout]);

  const toggleRole = useCallback((role: InsiderRole) => {
    setAllowedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  }, []);

  return (
    <div className="space-y-6">
      {/* Disclosure Level Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            {t('levelConfig')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DISCLOSURE_LEVELS.map((lv) => {
              const keyMap: Record<DisclosureLevel, { label: string; desc: string }> = {
                [DisclosureLevel.Basic]: { label: t('basic'), desc: t('basicDesc') },
                [DisclosureLevel.Standard]: { label: t('standard'), desc: t('standardDesc') },
                [DisclosureLevel.Enhanced]: { label: t('enhanced'), desc: t('enhancedDesc') },
                [DisclosureLevel.Full]: { label: t('full'), desc: t('fullDesc') },
              };
              return (
                <Button
                  key={lv}
                  variant={level === lv ? 'default' : 'outline'}
                  className={cn(
                    'h-auto flex-col items-start px-4 py-3',
                    level === lv && 'ring-2 ring-primary ring-offset-2',
                  )}
                  onClick={() => setLevel(lv)}
                >
                  <span className="text-sm font-medium">{keyMap[lv].label}</span>
                  <span className={cn(
                    'mt-1 text-xs font-normal',
                    level === lv ? 'text-primary-foreground/80' : 'text-muted-foreground',
                  )}>{keyMap[lv].desc}</span>
                </Button>
              );
            })}
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="insider-control"
                checked={insiderControl}
                onChange={(e) => setInsiderControl(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <LabelWithTip htmlFor="insider-control" tip={t('help.insiderControl')}>{t('insiderControl')}</LabelWithTip>
            </div>
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="blackout-after" tip={t('help.blackoutDuration')}>{t('blackoutDuration')}</LabelWithTip>
              <Input id="blackout-after" type="number" value={blackoutAfter}
                onChange={(e) => setBlackoutAfter(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSaveConfig} disabled={isTxBusy(configureDisclosure)}>
              {t('saveConfig')}
            </Button>
            <TxStatusIndicator txState={configureDisclosure.txState} />
          </div>
        </CardContent>
      </Card>

      {/* Manual Blackout Start */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" />
            {t('startBlackout')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="blackout-dur">{t('blackoutBlocks')}</Label>
              <Input id="blackout-dur" type="number" value={blackoutDuration}
                onChange={(e) => setBlackoutDuration(e.target.value)} placeholder="100" className="w-40" />
            </div>
            <Button onClick={handleStartBlackout} disabled={!blackoutDuration.trim() || isTxBusy(startBlackout)}>
              {t('startBlackout')}
            </Button>
            <TxStatusIndicator txState={startBlackout.txState} />
          </div>
        </CardContent>
      </Card>

      {/* Approval Requirements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5" />
            {t('approvalConfig')}
          </CardTitle>
          <CardDescription>{t('approvalConfigDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="req-approvals" tip={t('help.requiredApprovals')}>{t('requiredApprovals')}</LabelWithTip>
            <Input id="req-approvals" type="number" value={reqApprovals}
              onChange={(e) => setReqApprovals(e.target.value)} placeholder="0" className="w-40" />
          </div>
          <div className="space-y-1.5">
            <LabelWithTip tip={t('help.allowedRoles')}>{t('allowedRoles')}</LabelWithTip>
            <div className="flex flex-wrap gap-2">
              {Object.values(InsiderRole).map((role) => (
                <Button key={role} size="sm"
                  variant={allowedRoles.includes(role) ? 'default' : 'outline'}
                  onClick={() => toggleRole(role)}>
                  {te(`insiderRole.${role}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveApproval} disabled={isTxBusy(configureApprovalRequirements)}>
              {t('saveApprovalConfig')}
            </Button>
            <TxStatusIndicator txState={configureApprovalRequirements.txState} />
          </div>
        </CardContent>
      </Card>

      {/* Fiscal Year */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="h-5 w-5" />
            {t('fiscalYearConfig')}
          </CardTitle>
          <CardDescription>{t('fiscalYearDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fiscalYear && (
            <p className="text-sm text-muted-foreground">
              {t('fiscalYearDisplay', { start: fiscalYear.yearStartBlock, length: fiscalYear.yearLength })}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="fy-start" tip={t('help.yearStartBlock')}>{t('yearStartBlock')}</LabelWithTip>
              <Input id="fy-start" type="number" value={yearStart}
                onChange={(e) => setYearStart(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="fy-len" tip={t('help.yearLength')}>{t('yearLength')}</LabelWithTip>
              <Input id="fy-len" type="number" value={yearLen}
                onChange={(e) => setYearLen(e.target.value)} placeholder="5256000" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveFiscalYear} disabled={isTxBusy(configureFiscalYear)}>
              {t('saveFiscalYear')}
            </Button>
            <TxStatusIndicator txState={configureFiscalYear.txState} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Disclosure Lifecycle ───────────────────────────────────

function DisclosureListSection() {
  const t = useTranslations('disclosure');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const {
    disclosures, approvalConfig,
    createDraftDisclosure, updateDraft, deleteDraft, publishDraft,
    withdrawDisclosure, correctDisclosure,
    approveDisclosure, rejectDisclosure, publishEmergencyDisclosure,
    setDisclosureMetadata, auditDisclosure,
  } = useDisclosure();

  const [disclosureType, setDisclosureType] = useState<string>(DisclosureType.AnnualReport);
  const [contentCid, setContentCid] = useState('');
  const [summaryCid, setSummaryCid] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editCid, setEditCid] = useState('');
  const [editSummaryCid, setEditSummaryCid] = useState('');
  const [correctId, setCorrectId] = useState<number | null>(null);
  const [correctCid, setCorrectCid] = useState('');
  const [correctSummaryCid, setCorrectSummaryCid] = useState('');
  const [metaId, setMetaId] = useState<number | null>(null);
  const [metaPeriodStart, setMetaPeriodStart] = useState('');
  const [metaPeriodEnd, setMetaPeriodEnd] = useState('');
  const [metaRequiresAudit, setMetaRequiresAudit] = useState(false);

  // Emergency publish form
  const [showEmergency, setShowEmergency] = useState(false);
  const [emergencyType, setEmergencyType] = useState<string>(DisclosureType.MaterialEvent);
  const [emergencyCid, setEmergencyCid] = useState('');
  const [emergencySummary, setEmergencySummary] = useState('');

  const hasApprovalFlow = approvalConfig && approvalConfig.requiredApprovals > 0;

  const handleCreate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!contentCid.trim()) return;
      createDraftDisclosure.mutate([entityId, disclosureType, contentCid.trim(), summaryCid.trim() || null]);
      setContentCid('');
      setSummaryCid('');
    },
    [entityId, disclosureType, contentCid, summaryCid, createDraftDisclosure],
  );

  const handleUpdate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (editId === null || !editCid.trim()) return;
      updateDraft.mutate([editId, editCid.trim(), editSummaryCid.trim() || null]);
      setEditId(null);
    },
    [editId, editCid, editSummaryCid, updateDraft],
  );

  const handleCorrect = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (correctId === null || !correctCid.trim()) return;
      correctDisclosure.mutate([correctId, correctCid.trim(), correctSummaryCid.trim() || null]);
      setCorrectId(null);
      setCorrectSummaryCid('');
    },
    [correctCid, correctId, correctSummaryCid, correctDisclosure],
  );

  const handleEmergencyPublish = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!emergencyCid.trim()) return;
      publishEmergencyDisclosure.mutate([entityId, emergencyType, emergencyCid.trim(), emergencySummary.trim() || null]);
      setEmergencyCid('');
      setEmergencySummary('');
      setShowEmergency(false);
    },
    [entityId, emergencyType, emergencyCid, emergencySummary, publishEmergencyDisclosure],
  );

  const handleSetMetadata = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (metaId === null) return;
      setDisclosureMetadata.mutate([
        metaId,
        metaPeriodStart.trim() ? Number(metaPeriodStart) : null,
        metaPeriodEnd.trim() ? Number(metaPeriodEnd) : null,
        metaRequiresAudit,
      ]);
      setMetaId(null);
    },
    [metaId, metaPeriodStart, metaPeriodEnd, metaRequiresAudit, setDisclosureMetadata],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            {t('disclosureManagement')}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowEmergency(!showEmergency)}
            className="border-red-500 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950">
            <Zap className="mr-1 h-3 w-3" />
            {t('emergencyPublish')}
          </Button>
        </div>
        {hasApprovalFlow && (
          <CardDescription>
            {t('approvalCount', { count: approvalConfig!.requiredApprovals })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Emergency publish form */}
        {showEmergency && (
          <>
            <form onSubmit={handleEmergencyPublish} className="space-y-3 rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-900 dark:bg-red-950/30">
              <h3 className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
                <Zap className="h-4 w-4" />
                {t('emergencyPublish')}
              </h3>
              <p className="text-xs text-red-600/80 dark:text-red-400/80">{t('emergencyPublishDesc')}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>{t('disclosureType')}</Label>
                  <Select value={emergencyType} onValueChange={setEmergencyType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.values(DisclosureType).map((dt) => (
                        <SelectItem key={dt} value={dt}>{te(`disclosureType.${dt}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('contentCid')}</Label>
                  <Input value={emergencyCid} onChange={(e) => setEmergencyCid(e.target.value)} placeholder={t('contentCid')} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('summaryCid')}</Label>
                  <Input value={emergencySummary} onChange={(e) => setEmergencySummary(e.target.value)} placeholder={t('summaryCidOptional')} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" variant="destructive" disabled={isTxBusy(publishEmergencyDisclosure)}>
                  <Zap className="mr-1 h-3 w-3" />
                  {t('emergencyPublish')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowEmergency(false)}>{tc('cancel')}</Button>
                <TxStatusIndicator txState={publishEmergencyDisclosure.txState} />
              </div>
            </form>
            <Separator />
          </>
        )}

        {/* Create draft form */}
        <form onSubmit={handleCreate} className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">{t('createDraft')}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="disc-type" tip={t('help.disclosureType')}>{t('disclosureType')}</LabelWithTip>
              <Select value={disclosureType} onValueChange={setDisclosureType}>
                <SelectTrigger id="disc-type"><SelectValue placeholder={t('disclosureType')} /></SelectTrigger>
                <SelectContent>
                  {Object.values(DisclosureType).map((dtype) => (
                    <SelectItem key={dtype} value={dtype}>{te(`disclosureType.${dtype}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="disc-cid" tip={t('help.contentCid')}>{t('contentCid')}</LabelWithTip>
              <Input id="disc-cid" value={contentCid} onChange={(e) => setContentCid(e.target.value)} placeholder={t('contentCid')} />
            </div>
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="disc-summary" tip={t('help.summaryCid')}>{t('summaryCid')}</LabelWithTip>
              <Input id="disc-summary" value={summaryCid} onChange={(e) => setSummaryCid(e.target.value)} placeholder={t('summaryCidOptional')} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isTxBusy(createDraftDisclosure)}>{t('createDraft')}</Button>
            <TxStatusIndicator txState={createDraftDisclosure.txState} />
          </div>
        </form>

        <Separator />

        {/* Disclosure list */}
        {disclosures.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noDisclosures')}</p>
        ) : (
          <div className="space-y-3">
            {disclosures.map((d) => (
              <Card key={d.id} className="shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">#{d.id}</span>
                      <Badge variant="outline" className="text-xs">{te(`disclosureType.${d.disclosureType}`)}</Badge>
                      <Badge variant={STATUS_VARIANT[d.status]}>
                        {te(`disclosureStatus.${d.status}`)}
                      </Badge>
                      {d.previousId !== null && (
                        <span className="text-xs text-muted-foreground">corrects #{d.previousId}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {d.status === DisclosureStatus.Draft && (
                        <>
                          <Button variant="secondary" size="sm"
                            onClick={() => { setEditId(d.id); setEditCid(d.contentCid); setEditSummaryCid(''); }}>
                            {tc('edit')}
                          </Button>
                          <Button variant="outline" size="sm"
                            onClick={() => { setMetaId(d.id); setMetaPeriodStart(''); setMetaPeriodEnd(''); setMetaRequiresAudit(false); }}>
                            {t('metadata')}
                          </Button>
                          {hasApprovalFlow ? (
                            <>
                              <Button variant="default" size="sm"
                                onClick={() => approveDisclosure.mutate([d.id])}
                                disabled={isTxBusy(approveDisclosure)}>
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                {t('approveBtn')}
                              </Button>
                              <Button variant="outline" size="sm"
                                className="border-red-300 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                                onClick={() => rejectDisclosure.mutate([d.id])}
                                disabled={isTxBusy(rejectDisclosure)}>
                                <XCircle className="mr-1 h-3 w-3" />
                                {t('rejectBtn')}
                              </Button>
                            </>
                          ) : null}
                          <Button variant="default" size="sm"
                            onClick={() => publishDraft.mutate([d.id])}
                            disabled={isTxBusy(publishDraft)}>
                            {t('publish')}
                          </Button>
                          <Button variant="destructive" size="sm"
                            onClick={() => deleteDraft.mutate([d.id])}
                            disabled={isTxBusy(deleteDraft)}>
                            {t('deleteDraft')}
                          </Button>
                        </>
                      )}
                      {d.status === DisclosureStatus.Published && (
                        <>
                          <Button variant="outline" size="sm"
                            onClick={() => { setMetaId(d.id); setMetaPeriodStart(''); setMetaPeriodEnd(''); setMetaRequiresAudit(false); }}>
                            {t('metadata')}
                          </Button>
                          <Button variant="outline" size="sm"
                            onClick={() => auditDisclosure.mutate([d.id, true])}
                            disabled={isTxBusy(auditDisclosure)}>
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            {t('auditApprove')}
                          </Button>
                          <Button variant="destructive" size="sm"
                            onClick={() => withdrawDisclosure.mutate([d.id])}
                            disabled={isTxBusy(withdrawDisclosure)}>
                            {t('withdraw')}
                          </Button>
                          <Button variant="outline" size="sm"
                            className="border-yellow-500 text-yellow-700 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-950"
                            onClick={() => { setCorrectId(d.id); setCorrectCid(''); setCorrectSummaryCid(''); }}>
                            {t('correct')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    CID: {d.contentCid}
                    {d.summaryCid && <> · Summary: {d.summaryCid}</>}
                    {' · '}Block #{d.disclosedAt}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit draft form */}
        {editId !== null && (
          <>
            <Separator />
            <form onSubmit={handleUpdate} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t('editDraft', { id: editId })}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="edit-cid" tip={t('help.contentCid')}>{t('contentCid')}</LabelWithTip>
                  <Input id="edit-cid" value={editCid} onChange={(e) => setEditCid(e.target.value)} placeholder={t('contentCid')} />
                </div>
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="edit-summary" tip={t('help.summaryCid')}>{t('summaryCid')}</LabelWithTip>
                  <Input id="edit-summary" value={editSummaryCid} onChange={(e) => setEditSummaryCid(e.target.value)} placeholder={t('summaryCidOptional')} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isTxBusy(updateDraft)}>{t('updateDraft')}</Button>
                <Button type="button" variant="ghost" onClick={() => setEditId(null)}>{tc('cancel')}</Button>
                <TxStatusIndicator txState={updateDraft.txState} />
              </div>
            </form>
          </>
        )}

        {/* Correct disclosure form */}
        {correctId !== null && (
          <>
            <Separator />
            <form onSubmit={handleCorrect} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t('correctDisclosure', { id: correctId })}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="correct-cid">{t('correctContentCid')}</Label>
                  <Input id="correct-cid" value={correctCid} onChange={(e) => setCorrectCid(e.target.value)} placeholder={t('correctContentCid')} />
                </div>
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="correct-summary" tip={t('help.summaryCid')}>{t('summaryCid')}</LabelWithTip>
                  <Input id="correct-summary" value={correctSummaryCid} onChange={(e) => setCorrectSummaryCid(e.target.value)} placeholder={t('summaryCidOptional')} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" variant="outline"
                  className="border-yellow-500 text-yellow-700 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-950"
                  disabled={isTxBusy(correctDisclosure)}>
                  {t('submitCorrection')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setCorrectId(null)}>{tc('cancel')}</Button>
                <TxStatusIndicator txState={correctDisclosure.txState} />
              </div>
            </form>
          </>
        )}

        {/* Set metadata form */}
        {metaId !== null && (
          <>
            <Separator />
            <form onSubmit={handleSetMetadata} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t('metadata')} — #{metaId}</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="meta-start" tip={t('help.periodStart')}>{t('periodStart')}</LabelWithTip>
                  <Input id="meta-start" type="number" value={metaPeriodStart}
                    onChange={(e) => setMetaPeriodStart(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="meta-end" tip={t('help.periodEnd')}>{t('periodEnd')}</LabelWithTip>
                  <Input id="meta-end" type="number" value={metaPeriodEnd}
                    onChange={(e) => setMetaPeriodEnd(e.target.value)} placeholder="0" />
                </div>
                <div className="flex items-end gap-3 pb-1">
                  <input type="checkbox" id="meta-audit" checked={metaRequiresAudit}
                    onChange={(e) => setMetaRequiresAudit(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300" />
                  <Label htmlFor="meta-audit">{t('requiresAudit')}</Label>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isTxBusy(setDisclosureMetadata)}>{t('setMetadata')}</Button>
                <Button type="button" variant="ghost" onClick={() => setMetaId(null)}>{tc('cancel')}</Button>
                <TxStatusIndicator txState={setDisclosureMetadata.txState} />
              </div>
            </form>
          </>
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-3">
        <TxStatusIndicator txState={publishDraft.txState} />
        <TxStatusIndicator txState={deleteDraft.txState} />
        <TxStatusIndicator txState={withdrawDisclosure.txState} />
        <TxStatusIndicator txState={approveDisclosure.txState} />
        <TxStatusIndicator txState={rejectDisclosure.txState} />
        <TxStatusIndicator txState={auditDisclosure.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Insider Management ─────────────────────────────────────

function InsiderSection() {
  const t = useTranslations('disclosure');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const {
    insiders, insiderTransactions,
    addInsider, updateInsiderRole, removeInsider,
    batchAddInsiders, batchRemoveInsiders,
    reportInsiderTransaction,
  } = useDisclosure();

  const [account, setAccount] = useState('');
  const [role, setRole] = useState<InsiderRole>(InsiderRole.Admin);
  const [showBatchAdd, setShowBatchAdd] = useState(false);
  const [batchAddInput, setBatchAddInput] = useState('');
  const [showBatchRemove, setShowBatchRemove] = useState(false);
  const [batchRemoveInput, setBatchRemoveInput] = useState('');

  // Transaction report
  const [showTxReport, setShowTxReport] = useState(false);
  const [txType, setTxType] = useState<InsiderTransactionType>(InsiderTransactionType.Buy);
  const [txAmount, setTxAmount] = useState('');
  const [txBlock, setTxBlock] = useState('');

  const handleAdd = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!account.trim()) return;
      addInsider.mutate([entityId, account.trim(), role]);
      setAccount('');
    },
    [entityId, account, role, addInsider],
  );

  const handleBatchAdd = useCallback(() => {
    const lines = batchAddInput.trim().split('\n').filter(Boolean);
    const parsed = lines.map(line => {
      const [addr, r] = line.split(',').map(s => s.trim());
      return [addr, r || 'Admin'] as [string, string];
    });
    if (parsed.length === 0) return;
    batchAddInsiders.mutate([entityId, parsed]);
    setBatchAddInput('');
    setShowBatchAdd(false);
  }, [entityId, batchAddInput, batchAddInsiders]);

  const handleBatchRemove = useCallback(() => {
    const addrs = batchRemoveInput.trim().split('\n').filter(Boolean).map(s => s.trim());
    if (addrs.length === 0) return;
    batchRemoveInsiders.mutate([entityId, addrs]);
    setBatchRemoveInput('');
    setShowBatchRemove(false);
  }, [entityId, batchRemoveInput, batchRemoveInsiders]);

  const handleReportTx = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!txAmount.trim() || !txBlock.trim()) return;
      reportInsiderTransaction.mutate([entityId, txType, txAmount.trim(), Number(txBlock)]);
      setTxAmount('');
      setTxBlock('');
      setShowTxReport(false);
    },
    [entityId, txType, txAmount, txBlock, reportInsiderTransaction],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              {t('insiderManagement')}
            </CardTitle>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setShowBatchAdd(!showBatchAdd)}>
                {t('batchAdd')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowBatchRemove(!showBatchRemove)}>
                {t('batchRemove')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Single add form */}
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="insider-account" tip={t('help.accountAddress')}>{t('accountAddress')}</LabelWithTip>
              <Input id="insider-account" value={account} onChange={(e) => setAccount(e.target.value)}
                placeholder={t('accountAddress')} className="w-64" />
            </div>
            <div className="space-y-1.5">
              <Label>{tc('role')}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as InsiderRole)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(InsiderRole).map((r) => (
                    <SelectItem key={r} value={r}>{te(`insiderRole.${r}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={isTxBusy(addInsider)}>{tc('add')}</Button>
            <TxStatusIndicator txState={addInsider.txState} />
          </form>

          {/* Batch add */}
          {showBatchAdd && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">{t('batchAddDesc')}</h3>
                <textarea
                  value={batchAddInput}
                  onChange={(e) => setBatchAddInput(e.target.value)}
                  placeholder={t('batchInputPlaceholder')}
                  className="min-h-[100px] w-full rounded-md border bg-background p-3 text-sm"
                  rows={5}
                />
                <div className="flex items-center gap-3">
                  <Button onClick={handleBatchAdd} disabled={isTxBusy(batchAddInsiders)}>{t('batchAdd')}</Button>
                  <Button variant="ghost" onClick={() => setShowBatchAdd(false)}>{tc('cancel')}</Button>
                  <TxStatusIndicator txState={batchAddInsiders.txState} />
                </div>
              </div>
            </>
          )}

          {/* Batch remove */}
          {showBatchRemove && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">{t('batchRemoveDesc')}</h3>
                <textarea
                  value={batchRemoveInput}
                  onChange={(e) => setBatchRemoveInput(e.target.value)}
                  placeholder={t('batchRemovePlaceholder')}
                  className="min-h-[100px] w-full rounded-md border bg-background p-3 text-sm"
                  rows={5}
                />
                <div className="flex items-center gap-3">
                  <Button variant="destructive" onClick={handleBatchRemove} disabled={isTxBusy(batchRemoveInsiders)}>{t('batchRemove')}</Button>
                  <Button variant="ghost" onClick={() => setShowBatchRemove(false)}>{tc('cancel')}</Button>
                  <TxStatusIndicator txState={batchRemoveInsiders.txState} />
                </div>
              </div>
            </>
          )}

          {/* Insider table */}
          {insiders.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('noInsiders')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tc('account')}</TableHead>
                  <TableHead>{tc('role')}</TableHead>
                  <TableHead className="text-right">{tc('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insiders.map((ins) => (
                  <TableRow key={ins.account}>
                    <TableCell><CopyableAddress address={ins.account} textClassName="text-xs" /></TableCell>
                    <TableCell>
                      <Badge variant="secondary">{te(`insiderRole.${ins.role}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {Object.values(InsiderRole).filter((r) => r !== ins.role).map((r) => (
                          <Button key={r} variant="ghost" size="sm"
                            onClick={() => updateInsiderRole.mutate([entityId, ins.account, r])}
                            disabled={isTxBusy(updateInsiderRole)}>
                            {t('changeRole', { role: te(`insiderRole.${r}`) })}
                          </Button>
                        ))}
                        <Button variant="destructive" size="sm"
                          onClick={() => removeInsider.mutate([entityId, ins.account])}
                          disabled={isTxBusy(removeInsider)}>
                          {tc('remove')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter className="flex-wrap gap-3">
          <TxStatusIndicator txState={updateInsiderRole.txState} />
          <TxStatusIndicator txState={removeInsider.txState} />
        </CardFooter>
      </Card>

      {/* Insider Transaction Reports */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{t('insiderTransactions')}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowTxReport(!showTxReport)}>
              {t('reportTransaction')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showTxReport && (
            <>
              <form onSubmit={handleReportTx} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <LabelWithTip tip={t('help.transactionType')}>{t('transactionType')}</LabelWithTip>
                    <Select value={txType} onValueChange={(v) => setTxType(v as InsiderTransactionType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.values(InsiderTransactionType).map((tt) => (
                          <SelectItem key={tt} value={tt}>{te(`insiderTransactionType.${tt}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <LabelWithTip tip={t('help.tokenAmount')}>{t('tokenAmount')}</LabelWithTip>
                    <Input type="number" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <LabelWithTip tip={t('help.transactionBlock')}>{t('transactionBlock')}</LabelWithTip>
                    <Input type="number" value={txBlock} onChange={(e) => setTxBlock(e.target.value)} placeholder="0" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={isTxBusy(reportInsiderTransaction)}>{t('reportTransaction')}</Button>
                  <Button type="button" variant="ghost" onClick={() => setShowTxReport(false)}>{tc('cancel')}</Button>
                  <TxStatusIndicator txState={reportInsiderTransaction.txState} />
                </div>
              </form>
              <Separator />
            </>
          )}

          {insiderTransactions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('noTransactions')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tc('account')}</TableHead>
                  <TableHead>{t('transactionType')}</TableHead>
                  <TableHead>{t('tokenAmount')}</TableHead>
                  <TableHead>{t('transactionBlock')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insiderTransactions.map((tx, idx) => (
                  <TableRow key={`${tx.account}-${tx.reportedAt}-${idx}`}>
                    <TableCell><CopyableAddress address={tx.account} textClassName="text-xs" /></TableCell>
                    <TableCell>
                      <Badge variant="outline">{te(`insiderTransactionType.${tx.transactionType}`)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{tx.tokenAmount}</TableCell>
                    <TableCell className="text-sm">#{tx.transactionBlock}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Announcement Management ────────────────────────────────

function AnnouncementSection() {
  const t = useTranslations('disclosure');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const {
    announcements,
    publishAnnouncement,
    updateAnnouncement,
    withdrawAnnouncement,
    pinAnnouncement,
    unpinAnnouncement,
    expireAnnouncement,
  } = useDisclosure();

  const ANNOUNCEMENT_CATEGORIES = Object.values(AnnouncementCategory);

  const [title, setTitle] = useState('');
  const [contentCid, setContentCid] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory>(AnnouncementCategory.General);
  const [expiresAt, setExpiresAt] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCid, setEditCid] = useState('');
  const [editCategory, setEditCategory] = useState<AnnouncementCategory | ''>('');
  const [editExpiresAt, setEditExpiresAt] = useState('');

  const handlePublish = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim() || !contentCid.trim()) return;
      publishAnnouncement.mutate([
        entityId, category, title.trim(), contentCid.trim(),
        expiresAt.trim() ? Number(expiresAt) : null,
      ]);
      setTitle('');
      setContentCid('');
      setCategory(AnnouncementCategory.General);
      setExpiresAt('');
    },
    [category, contentCid, entityId, expiresAt, publishAnnouncement, title],
  );

  const handleUpdate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (editId === null) return;
      updateAnnouncement.mutate([
        editId,
        editTitle.trim() || null,
        editCid.trim() || null,
        editCategory || null,
        editExpiresAt.trim() ? Number(editExpiresAt) : null,
      ]);
      setEditId(null);
      setEditTitle('');
      setEditCid('');
      setEditCategory('');
      setEditExpiresAt('');
    },
    [editCategory, editCid, editExpiresAt, editId, editTitle, updateAnnouncement],
  );

  const sorted = [...announcements].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Megaphone className="h-5 w-5" />
          {t('announcementManagement')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Publish form */}
        <form onSubmit={handlePublish} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="ann-title" tip={t('help.announcementTitle')}>{t('announcementTitle')}</LabelWithTip>
              <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('announcementTitle')} />
            </div>
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="ann-cid" tip={t('help.contentCid')}>{t('contentCid')}</LabelWithTip>
              <Input id="ann-cid" value={contentCid} onChange={(e) => setContentCid(e.target.value)} placeholder={t('contentCid')} />
            </div>
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="ann-cat" tip={t('help.categoryLabel')}>{t('categoryLabel')}</LabelWithTip>
              <Select value={category} onValueChange={(v) => setCategory(v as AnnouncementCategory)}>
                <SelectTrigger id="ann-cat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANNOUNCEMENT_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>{te(`announcementCategory.${item}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="ann-exp" tip={t('help.expiresAtBlock')}>{t('expiresAtBlock')}</LabelWithTip>
              <Input id="ann-exp" type="number" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} placeholder={t('expiresAtBlock')} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isTxBusy(publishAnnouncement)}>{t('publishAnnouncement')}</Button>
            <TxStatusIndicator txState={publishAnnouncement.txState} />
          </div>
        </form>

        <Separator />

        {/* Announcement list */}
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noAnnouncements')}</p>
        ) : (
          <div className="space-y-3">
            {sorted.map((a) => (
              <Card key={a.id} className="shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {a.isPinned && <Badge variant="warning" className="text-xs">{t('pinned')}</Badge>}
                      <span className="text-sm font-medium">{a.title}</span>
                      <Badge variant="outline" className="text-xs">{te(`announcementCategory.${a.category}`)}</Badge>
                      {a.status !== 'Active' && (
                        <Badge variant={a.status === 'Expired' ? 'secondary' : 'destructive'} className="text-xs">
                          {te(`announcementStatus.${a.status}`)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {a.status === 'Active' && (
                        <>
                          <Button variant="outline" size="sm"
                            className="border-orange-500 text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950"
                            onClick={() => (a.isPinned ? unpinAnnouncement : pinAnnouncement).mutate([entityId, a.id])}
                            disabled={isTxBusy(a.isPinned ? unpinAnnouncement : pinAnnouncement)}>
                            {a.isPinned ? t('unpin') : t('pin')}
                          </Button>
                          <Button variant="secondary" size="sm"
                            onClick={() => {
                              setEditId(a.id);
                              setEditTitle(a.title);
                              setEditCid(a.contentCid);
                              setEditCategory(ANNOUNCEMENT_CATEGORIES.includes(a.category as AnnouncementCategory) ? (a.category as AnnouncementCategory) : '');
                              setEditExpiresAt(a.expiresAt ? String(a.expiresAt) : '');
                            }}>
                            {tc('edit')}
                          </Button>
                          <Button variant="destructive" size="sm"
                            onClick={() => withdrawAnnouncement.mutate([a.id])}
                            disabled={isTxBusy(withdrawAnnouncement)}>
                            {t('withdrawAnnouncement')}
                          </Button>
                          {a.expiresAt && (
                            <Button variant="outline" size="sm"
                              onClick={() => expireAnnouncement.mutate([a.id])}
                              disabled={isTxBusy(expireAnnouncement)}>
                              {t('expireAnnouncement')}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    CID: {a.contentCid}
                    {a.expiresAt && <> · {t('expiresAtBlockLabel', { block: a.expiresAt })}</>}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit announcement form */}
        {editId !== null && (
          <>
            <Separator />
            <form onSubmit={handleUpdate} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t('editAnnouncement', { id: editId })}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="edit-ann-title" tip={t('help.announcementTitle')}>{t('titleLabel')}</LabelWithTip>
                  <Input id="edit-ann-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder={t('titleLabel')} />
                </div>
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="edit-ann-cid" tip={t('help.contentCid')}>{t('contentCid')}</LabelWithTip>
                  <Input id="edit-ann-cid" value={editCid} onChange={(e) => setEditCid(e.target.value)} placeholder={t('contentCid')} />
                </div>
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="edit-ann-category" tip={t('help.categoryLabel')}>{t('categoryLabel')}</LabelWithTip>
                  <Select value={editCategory || '__none__'} onValueChange={(v) => setEditCategory(v === '__none__' ? '' : v as AnnouncementCategory)}>
                    <SelectTrigger id="edit-ann-category"><SelectValue placeholder={t('categoryLabel')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-</SelectItem>
                      {ANNOUNCEMENT_CATEGORIES.map((item) => (
                        <SelectItem key={item} value={item}>{te(`announcementCategory.${item}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="edit-ann-exp" tip={t('help.expiresAtBlock')}>{t('expiresAtBlock')}</LabelWithTip>
                  <Input id="edit-ann-exp" type="number" value={editExpiresAt}
                    onChange={(e) => setEditExpiresAt(e.target.value)} placeholder={t('expiresAtBlock')} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isTxBusy(updateAnnouncement)}>{t('updateAnnouncement')}</Button>
                <Button type="button" variant="ghost" onClick={() => setEditId(null)}>{tc('cancel')}</Button>
                <TxStatusIndicator txState={updateAnnouncement.txState} />
              </div>
            </form>
          </>
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-3">
        <TxStatusIndicator txState={pinAnnouncement.txState} />
        <TxStatusIndicator txState={unpinAnnouncement.txState} />
        <TxStatusIndicator txState={withdrawAnnouncement.txState} />
        <TxStatusIndicator txState={expireAnnouncement.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Compliance Section ──────────────────────────────────────

function ComplianceSection() {
  const t = useTranslations('disclosure');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const {
    config, penalty,
    reportDisclosureViolation, resetViolationCount,
    cleanupDisclosureHistory, cleanupAnnouncementHistory, cleanupExpiredCooldowns,
    disclosures, announcements,
  } = useDisclosure();

  const [violationType, setViolationType] = useState<ViolationType>(ViolationType.LateDisclosure);
  const [cleanupDisclosureId, setCleanupDisclosureId] = useState('');
  const [cleanupAnnouncementId, setCleanupAnnouncementId] = useState('');
  const [maxCooldownCount, setMaxCooldownCount] = useState('10');

  const handleReportViolation = useCallback(() => {
    reportDisclosureViolation.mutate([entityId, violationType]);
  }, [entityId, violationType, reportDisclosureViolation]);

  // Terminal disclosures (Withdrawn/Corrected) that can be cleaned
  const cleanableDisclosures = disclosures.filter(d =>
    d.status === DisclosureStatus.Withdrawn || d.status === DisclosureStatus.Corrected
  );
  // Terminal announcements (Withdrawn/Expired)
  const cleanableAnnouncements = announcements.filter(a =>
    a.status === 'Withdrawn' || a.status === 'Expired'
  );

  return (
    <div className="space-y-6">
      {/* Violation Reporting & Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="h-5 w-5" />
            {t('compliance')}
          </CardTitle>
          <CardDescription>{t('complianceDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {config && (
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">{t('violationCount')}</p>
                <p className={cn('text-xl font-bold', config.violationCount > 0 && 'text-yellow-600 dark:text-yellow-400')}>
                  {config.violationCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('penaltyStatus')}</p>
                <Badge variant={PENALTY_VARIANT[penalty]} className="mt-1">
                  {te(`penaltyLevel.${penalty}`)}
                </Badge>
              </div>
            </div>
          )}

          <Separator />

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <LabelWithTip tip={t('help.violationType')}>{t('violationType')}</LabelWithTip>
              <Select value={violationType} onValueChange={(v) => setViolationType(v as ViolationType)}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(ViolationType).map((vt) => (
                    <SelectItem key={vt} value={vt}>{te(`violationType.${vt}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleReportViolation} disabled={isTxBusy(reportDisclosureViolation)}>
              {t('reportViolation')}
            </Button>
            <TxStatusIndicator txState={reportDisclosureViolation.txState} />
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => resetViolationCount.mutate([entityId])}
              disabled={isTxBusy(resetViolationCount)}>
              {t('resetViolations')}
            </Button>
            <TxStatusIndicator txState={resetViolationCount.txState} />
          </div>
        </CardContent>
      </Card>

      {/* Cleanup Operations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('cleanupHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cleanup disclosure history */}
          {cleanableDisclosures.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t('tabDisclosures')}</p>
              <div className="flex flex-wrap gap-2">
                {cleanableDisclosures.map(d => (
                  <Button key={d.id} variant="outline" size="sm"
                    onClick={() => cleanupDisclosureHistory.mutate([entityId, d.id])}
                    disabled={isTxBusy(cleanupDisclosureHistory)}>
                    {t('cleanupDisclosure', { id: d.id })}
                  </Button>
                ))}
              </div>
              <TxStatusIndicator txState={cleanupDisclosureHistory.txState} />
            </div>
          )}

          {/* Cleanup announcement history */}
          {cleanableAnnouncements.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t('tabAnnouncements')}</p>
              <div className="flex flex-wrap gap-2">
                {cleanableAnnouncements.map(a => (
                  <Button key={a.id} variant="outline" size="sm"
                    onClick={() => cleanupAnnouncementHistory.mutate([entityId, a.id])}
                    disabled={isTxBusy(cleanupAnnouncementHistory)}>
                    {t('cleanupAnnouncement', { id: a.id })}
                  </Button>
                ))}
              </div>
              <TxStatusIndicator txState={cleanupAnnouncementHistory.txState} />
            </div>
          )}

          {/* Cleanup expired cooldowns */}
          <Separator />
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label>{t('maxCleanupCount')}</Label>
              <Input type="number" value={maxCooldownCount}
                onChange={(e) => setMaxCooldownCount(e.target.value)}
                className="w-24" placeholder="10" />
            </div>
            <Button variant="outline"
              onClick={() => cleanupExpiredCooldowns.mutate([entityId, Number(maxCooldownCount) || 10])}
              disabled={isTxBusy(cleanupExpiredCooldowns)}>
              {t('cleanupCooldowns')}
            </Button>
            <TxStatusIndicator txState={cleanupExpiredCooldowns.txState} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function DisclosurePage() {
  const t = useTranslations('disclosure');
  const tc = useTranslations('common');
  const { isLoading, error } = useDisclosure();

  if (isLoading) {
    return <DisclosureSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center text-sm text-destructive">
            {tc('loadFailed', { error: String(error) })}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>

      <OverviewSection />
      <BlackoutSection />

      <PermissionGuard required={AdminPermission.DISCLOSURE_MANAGE} fallback={null}>
        <Tabs defaultValue="disclosures">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="disclosures">{t('tabDisclosures')}</TabsTrigger>
            <TabsTrigger value="insiders">{t('tabInsiders')}</TabsTrigger>
            <TabsTrigger value="announcements">{t('tabAnnouncements')}</TabsTrigger>
            <TabsTrigger value="compliance">{t('tabCompliance')}</TabsTrigger>
            <TabsTrigger value="config">{t('tabConfig')}</TabsTrigger>
          </TabsList>

          <TabsContent value="disclosures">
            <DisclosureListSection />
          </TabsContent>

          <TabsContent value="insiders">
            <InsiderSection />
          </TabsContent>

          <TabsContent value="announcements">
            <AnnouncementSection />
          </TabsContent>

          <TabsContent value="compliance">
            <ComplianceSection />
          </TabsContent>

          <TabsContent value="config">
            <ConfigurationSection />
          </TabsContent>
        </Tabs>
      </PermissionGuard>
    </div>
  );
}
