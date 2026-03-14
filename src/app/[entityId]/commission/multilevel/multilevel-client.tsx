'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { useMultiLevelCommission } from '@/hooks/use-multi-level-commission';
import { useWalletStore } from '@/stores/wallet-store';

import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

// ─── Loading Skeleton ───────────────────────────────────────

function MultiLevelSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-56" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
  const t = useTranslations('multiLevel');
  const { entityId } = useEntityContext();
  const { config, setMultiLevelConfig, pauseMultiLevel, resumeMultiLevel } = useMultiLevelCommission();

  const [maxTotalRate, setMaxTotalRate] = useState('');
  // Tiers input as comma-separated "rate:minSales" pairs, e.g. "500:0, 300:1000000"
  const [tiersInput, setTiersInput] = useState('');

  const parseTiersInput = useCallback(() => {
    return tiersInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const [rateStr, minSalesStr] = pair.split(':').map((s) => s.trim());
        return { rate: Number(rateStr) || 0, minSales: minSalesStr || '0' };
      });
  }, [tiersInput]);

  const handleSaveConfig = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const tiers = parseTiersInput();
      // setMultiLevelConfig(entityId, levels:Vec<MultiLevelTier>, maxTotalRate:u16)
      setMultiLevelConfig.mutate([
        entityId,
        tiers.length > 0
          ? tiers.map((t) => ({ rate: t.rate, minSales: t.minSales }))
          : config?.tiers?.map((t) => ({ rate: t.rate, minSales: t.minSales.toString() })) ?? [],
        Number(maxTotalRate) || config?.maxTotalRate || 0,
      ]);
    },
    [entityId, maxTotalRate, parseTiersInput, config, setMultiLevelConfig],
  );

  const handleToggle = useCallback(() => {
    if (config) {
      if (config.tiers.length > 0) {
        // Config exists, toggle pause/resume
        pauseMultiLevel.mutate([entityId]);
      } else {
        resumeMultiLevel.mutate([entityId]);
      }
    } else {
      // No config, create one
      const tiers = parseTiersInput();
      setMultiLevelConfig.mutate([
        entityId,
        tiers.length > 0 ? tiers.map((t) => ({ rate: t.rate, minSales: t.minSales })) : [],
        Number(maxTotalRate) || 0,
      ]);
    }
  }, [entityId, config, maxTotalRate, parseTiersInput, pauseMultiLevel, resumeMultiLevel, setMultiLevelConfig]);

  const isToggleBusy = isTxBusy(pauseMultiLevel) || isTxBusy(resumeMultiLevel) || isTxBusy(setMultiLevelConfig);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('configSection')}</CardTitle>
        <CardDescription>{t('configSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current config display */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('maxTotalRate')}</p>
            <p className="text-sm font-medium">{config?.maxTotalRate ?? 0} {t('bps')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('tierCount')}</p>
            <p className="text-sm font-medium">{config?.tiers?.length ?? 0}</p>
          </div>
        </div>

        <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
          <Separator className="my-4" />

          {/* Full config form */}
          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ml-max-total-rate">{t('maxTotalRate')}</Label>
                <Input
                  id="ml-max-total-rate"
                  type="number"
                  value={maxTotalRate}
                  onChange={(e) => setMaxTotalRate(e.target.value)}
                  placeholder={String(config?.maxTotalRate ?? 0)}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">{t('maxTotalRateDesc')}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ml-tiers">{t('tiersInput')}</Label>
                <Input
                  id="ml-tiers"
                  type="text"
                  value={tiersInput}
                  onChange={(e) => setTiersInput(e.target.value)}
                  placeholder={t('tiersInputPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">{t('tiersInputDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isTxBusy(setMultiLevelConfig)}>
                {t('saveConfig')}
              </Button>
              <TxStatusIndicator txState={setMultiLevelConfig.txState} />
            </div>
          </form>
        </PermissionGuard>
      </CardContent>
    </Card>
  );
}

// ─── Tiers Table Section ──────────────────────────────────

function TiersSection() {
  const t = useTranslations('multiLevel');
  const { entityId } = useEntityContext();
  const { config, addTier, removeTier } = useMultiLevelCommission();

  const [newRate, setNewRate] = useState('');
  const [newMinSales, setNewMinSales] = useState('');
  const [newIndex, setNewIndex] = useState('');

  const tiers = config?.tiers ?? [];

  const handleAddTier = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newRate.trim()) return;
      const index = newIndex.trim() ? Number(newIndex) : tiers.length;
      // addTier(entityId, index:u32, tier:Tier)
      addTier.mutate([
        entityId,
        index,
        { rate: Number(newRate), minSales: newMinSales.trim() || '0' },
      ]);
      setNewRate('');
      setNewMinSales('');
      setNewIndex('');
    },
    [entityId, newRate, newMinSales, newIndex, tiers.length, addTier],
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
                <TableHead>{t('tierIndex')}</TableHead>
                <TableHead>{t('rate')}</TableHead>
                <TableHead>{t('minSales')}</TableHead>
                <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
                  <TableHead className="w-[120px]" />
                </PermissionGuard>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map((tier, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">L{i}</TableCell>
                  <TableCell>{tier.rate} {t('bps')}</TableCell>
                  <TableCell>{tier.minSales.toString()}</TableCell>
                  <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => removeTier.mutate([entityId, i])}
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
              <Label htmlFor="ml-new-index">{t('tierIndex')}</Label>
              <Input
                id="ml-new-index"
                type="number"
                value={newIndex}
                onChange={(e) => setNewIndex(e.target.value)}
                placeholder={String(tiers.length)}
                className="w-20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ml-new-rate">{t('newTierRate')}</Label>
              <Input
                id="ml-new-rate"
                type="number"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="w-28"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ml-new-min-sales">{t('minSales')}</Label>
              <Input
                id="ml-new-min-sales"
                type="text"
                inputMode="decimal"
                value={newMinSales}
                onChange={(e) => setNewMinSales(e.target.value)}
                className="w-36"
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

// ─── Stats Section ──────────────────────────────────────────

function StatsSection() {
  const t = useTranslations('multiLevel');
  const { stats } = useMultiLevelCommission();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('statsSection')}</CardTitle>
        <CardDescription>{t('statsSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('totalMembers')}</p>
              <p className="text-lg font-semibold">{stats?.totalMembers ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('totalDistributed')}</p>
              <p className="text-lg font-semibold">{stats?.totalDistributed?.toString() ?? '0'}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('maxDepthReached')}</p>
              <p className="text-lg font-semibold">{stats?.maxDepthReached ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Member Tree Preview ────────────────────────────────────

function MemberTreePreview() {
  const t = useTranslations('multiLevel');
  const address = useWalletStore((s) => s.address);
  const { useMemberRelation } = useMultiLevelCommission();
  const { data: relation } = useMemberRelation(address);

  if (!address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('memberPreview')}</CardTitle>
          <CardDescription>{t('connectWalletFirst')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('memberPreview')}</CardTitle>
        <CardDescription>{t('memberPreviewDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('myDepth')}</p>
              <p className="text-lg font-semibold">{relation?.depth ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('myParent')}</p>
              <p className="truncate font-mono text-sm font-medium">
                {relation?.parent ?? t('noParent')}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('myDirectReferrals')}</p>
              <p className="text-lg font-semibold">{relation?.directReferrals ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function MultiLevelPage() {
  const t = useTranslations('multiLevel');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { isLoading, error } = useMultiLevelCommission();

  if (isLoading) {
    return <MultiLevelSkeleton />;
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
        <Link href={`/${entityId}/commission`}>
          <Button variant="outline" size="sm">
            {t('backToCommission')}
          </Button>
        </Link>
      </div>

      <ConfigSection />
      <TiersSection />
      <StatsSection />
      <MemberTreePreview />
    </div>
  );
}
