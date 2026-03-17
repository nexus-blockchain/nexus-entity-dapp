'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { SalesThresholdMode } from '@/lib/types/enums';
import { useTeamCommission } from '@/hooks/use-team-commission';

import { useTranslations } from 'next-intl';
import { formatNex } from '@/lib/utils/format';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTip } from '@/components/field-help-tip';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

// ─── Loading Skeleton ───────────────────────────────────────

function TeamSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-56" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Config Section ─────────────────────────────────────────

function ConfigSection() {
  const t = useTranslations('team');
  const { entityId } = useEntityContext();
  const { config, setTeamPerformanceConfig, clearTeamPerformanceConfig, pauseTeamPerformance, resumeTeamPerformance } = useTeamCommission();

  const [maxDepth, setMaxDepth] = useState('');
  const [allowStacking, setAllowStacking] = useState(false);
  const [thresholdMode, setThresholdMode] = useState<SalesThresholdMode>(SalesThresholdMode.PersonalOnly);

  const handleSaveConfig = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      // setTeamPerformanceConfig(entityId, tiers:Vec<TeamPerformanceTier>, maxDepth:u8, allowStacking:bool, thresholdMode:SalesThresholdMode)
      setTeamPerformanceConfig.mutate([
        entityId,
        config?.tiers?.map((t) => ({
          tier: t.tier,
          rate: t.rate,
          minTeamPerformance: t.minTeamPerformance.toString(),
          minDirectCount: t.minDirectCount,
        })) ?? [],
        Number(maxDepth) || config?.maxDepth || 3,
        allowStacking,
        thresholdMode,
      ]);
    },
    [entityId, maxDepth, allowStacking, thresholdMode, config, setTeamPerformanceConfig],
  );

  const handleToggle = useCallback(() => {
    if (config?.enabled) {
      pauseTeamPerformance.mutate([entityId]);
    } else if (config) {
      resumeTeamPerformance.mutate([entityId]);
    } else {
      setTeamPerformanceConfig.mutate([
        entityId,
        [],
        Number(maxDepth) || 3,
        allowStacking,
        thresholdMode,
      ]);
    }
  }, [entityId, config, maxDepth, allowStacking, thresholdMode, pauseTeamPerformance, resumeTeamPerformance, setTeamPerformanceConfig]);

  const isToggleBusy = isTxBusy(pauseTeamPerformance) || isTxBusy(resumeTeamPerformance) || isTxBusy(setTeamPerformanceConfig);
  const toggleTxState = config?.enabled
    ? pauseTeamPerformance.txState
    : config
      ? resumeTeamPerformance.txState
      : setTeamPerformanceConfig.txState;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('configSection')}</CardTitle>
        <CardDescription>{t('configSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('enableToggle')}</p>
            <Badge variant={config?.enabled ? 'success' : 'secondary'}>
              {config?.enabled ? t('enabled') : t('notEnabled')}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('maxDepth')}</p>
            <p className="text-sm font-medium">{config?.maxDepth ?? 0}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('allowStacking')}</p>
            <Badge variant={config?.allowStacking ? 'success' : 'secondary'}>
              {config?.allowStacking ? t('yes') : t('no')}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('thresholdMode')}</p>
            <p className="text-sm font-medium">{config?.thresholdMode ?? '-'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('tiersSection')}</p>
            <p className="text-sm font-medium">{config?.tiers?.length ?? 0}</p>
          </div>
        </div>

        <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
          <Separator className="my-4" />

          <div className="flex items-center gap-3">
            <Switch
              checked={config?.enabled ?? false}
              onCheckedChange={handleToggle}
              disabled={isToggleBusy}
            />
            <Label>{t('enableToggle')}</Label>
            <TxStatusIndicator txState={toggleTxState} />
          </div>

          <Separator className="my-4" />

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <LabelWithTip htmlFor="tm-max-depth" tip={t('help.maxDepth')}>{t('maxDepth')}</LabelWithTip>
                <Input
                  id="tm-max-depth"
                  type="number"
                  value={maxDepth}
                  onChange={(e) => setMaxDepth(e.target.value)}
                  placeholder={String(config?.maxDepth ?? 3)}
                />
                <p className="text-xs text-muted-foreground">{t('maxDepthDesc')}</p>
              </div>
              <div className="space-y-2">
                <LabelWithTip htmlFor="tm-threshold-mode" tip={t('help.thresholdMode')}>{t('thresholdMode')}</LabelWithTip>
                <Select value={thresholdMode} onValueChange={(v) => setThresholdMode(v as SalesThresholdMode)}>
                  <SelectTrigger id="tm-threshold-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SalesThresholdMode.PersonalOnly}>{t('personalOnly')}</SelectItem>
                    <SelectItem value={SalesThresholdMode.TeamTotal}>{t('teamTotal')}</SelectItem>
                    <SelectItem value={SalesThresholdMode.WeightedMix}>{t('weightedMix')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end space-y-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="tm-allow-stacking"
                    checked={allowStacking}
                    onCheckedChange={setAllowStacking}
                  />
                  <Label htmlFor="tm-allow-stacking">{t('allowStacking')}</Label>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isTxBusy(setTeamPerformanceConfig)}>
                {t('saveConfig')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => clearTeamPerformanceConfig.mutate([entityId])}
                disabled={isTxBusy(clearTeamPerformanceConfig)}
              >
                {t('clearConfig')}
              </Button>
              <TxStatusIndicator txState={setTeamPerformanceConfig.txState} />
              <TxStatusIndicator txState={clearTeamPerformanceConfig.txState} />
            </div>
          </form>
        </PermissionGuard>
      </CardContent>
    </Card>
  );
}

// ─── Tiers Section ──────────────────────────────────────────

function TiersSection() {
  const t = useTranslations('team');
  const { entityId } = useEntityContext();
  const { config, addTier, removeTier } = useTeamCommission();

  const [newRate, setNewRate] = useState('');
  const [newMinPerf, setNewMinPerf] = useState('');
  const [newMinDirect, setNewMinDirect] = useState('');

  const tiers = config?.tiers ?? [];

  const handleAddTier = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newRate.trim()) return;
      // addTier(entityId, tier:TeamPerformanceTier) — struct
      addTier.mutate([
        entityId,
        {
          tier: tiers.length,
          rate: Number(newRate),
          minTeamPerformance: newMinPerf.trim() || '0',
          minDirectCount: Number(newMinDirect) || 0,
        },
      ]);
      setNewRate('');
      setNewMinPerf('');
      setNewMinDirect('');
    },
    [entityId, newRate, newMinPerf, newMinDirect, tiers.length, addTier],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('tiersSection')}</CardTitle>
        <CardDescription>{t('tiersSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {tiers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noTiers')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tier')}</TableHead>
                <TableHead>{t('rate')}</TableHead>
                <TableHead>{t('minPerformance')}</TableHead>
                <TableHead>{t('minDirectCount')}</TableHead>
                <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
                  <TableHead className="w-[100px]" />
                </PermissionGuard>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map((tier, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">T{tier.tier}</TableCell>
                  <TableCell>{tier.rate} {t('bps')}</TableCell>
                  <TableCell>{formatNex(tier.minTeamPerformance)} NEX</TableCell>
                  <TableCell>{tier.minDirectCount}</TableCell>
                  <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => removeTier.mutate([entityId, index])}
                        disabled={isTxBusy(removeTier)}
                      >
                        {t('removeTier')}
                      </Button>
                    </TableCell>
                  </PermissionGuard>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
          <Separator className="my-4" />
          <form onSubmit={handleAddTier} className="flex items-end gap-3 flex-wrap">
            <div className="space-y-2">
              <LabelWithTip htmlFor="tm-new-rate" tip={t('help.newTierRate')}>{t('newTierRate')}</LabelWithTip>
              <Input
                id="tm-new-rate"
                type="number"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="w-28"
              />
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="tm-new-perf" tip={t('help.newTierMinPerformance')}>{t('newTierMinPerformance')}</LabelWithTip>
              <Input
                id="tm-new-perf"
                type="text"
                inputMode="decimal"
                value={newMinPerf}
                onChange={(e) => setNewMinPerf(e.target.value)}
                className="w-36"
              />
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="tm-new-direct" tip={t('help.newTierMinDirect')}>{t('newTierMinDirect')}</LabelWithTip>
              <Input
                id="tm-new-direct"
                type="number"
                value={newMinDirect}
                onChange={(e) => setNewMinDirect(e.target.value)}
                className="w-24"
              />
            </div>
            <Button type="submit" disabled={isTxBusy(addTier)}>
              {t('addTier')}
            </Button>
          </form>
        </PermissionGuard>
      </CardContent>
      <CardFooter className="gap-3">
        <TxStatusIndicator txState={addTier.txState} />
        <TxStatusIndicator txState={removeTier.txState} />
      </CardFooter>
    </Card>
  );
}

function RuntimeNoticeSection() {
  const t = useTranslations('team');

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-lg">{t('statsSection')}</CardTitle>
        <CardDescription>{t('runtimeDerivedOnly')}</CardDescription>
      </CardHeader>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function TeamPage() {
  const t = useTranslations('team');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { isLoading, error } = useTeamCommission();

  if (isLoading) return <TeamSkeleton />;

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
        <Link href={`/${entityId}/commission`}>
          <Button variant="outline" size="sm">{t('backToCommission')}</Button>
        </Link>
      </div>

      <ConfigSection />
      <TiersSection />
      <RuntimeNoticeSection />
    </div>
  );
}
