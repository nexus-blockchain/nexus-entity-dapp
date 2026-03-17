'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { useLevelDiffCommission } from '@/hooks/use-level-diff-commission';

import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LabelWithTip } from '@/components/field-help-tip';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

// ─── Loading Skeleton ───────────────────────────────────────

function LevelDiffSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-56" />
      {Array.from({ length: 3 }).map((_, i) => (
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
  const t = useTranslations('levelDiff');
  const { entityId } = useEntityContext();
  const { config, setLevelDiffConfig, clearLevelDiffConfig } = useLevelDiffCommission();

  const [levelRatesInput, setLevelRatesInput] = useState('');
  const [maxDepth, setMaxDepth] = useState('');

  const handleSaveConfig = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const rates = levelRatesInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);
      // setLevelDiffConfig(entityId:u64, levelRates:Vec<u16>, maxDepth:u8)
      setLevelDiffConfig.mutate([
        entityId,
        rates.length > 0 ? rates : config?.levelRates ?? [],
        Number(maxDepth) || config?.maxDepth || 3,
      ]);
    },
    [entityId, levelRatesInput, maxDepth, config, setLevelDiffConfig],
  );

  const handleClear = useCallback(() => {
    // clearLevelDiffConfig(entityId)
    clearLevelDiffConfig.mutate([entityId]);
  }, [entityId, clearLevelDiffConfig]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('configSection')}</CardTitle>
        <CardDescription>{t('configSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('maxDepth')}</p>
            <p className="text-sm font-medium">{config?.maxDepth ?? 0}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('levelRates')}</p>
            <p className="font-mono text-sm font-medium">
              {config?.levelRates?.join(', ') || '-'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('levelCount')}</p>
            <p className="text-sm font-medium">{config?.levelRates?.length ?? 0}</p>
          </div>
        </div>

        <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
          <Separator className="my-4" />

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <LabelWithTip htmlFor="ld-level-rates" tip={t('help.levelRates')}>{t('levelRates')}</LabelWithTip>
                <Input
                  id="ld-level-rates"
                  type="text"
                  value={levelRatesInput}
                  onChange={(e) => setLevelRatesInput(e.target.value)}
                  placeholder={config?.levelRates?.join(', ') || t('levelRatesPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">{t('levelRatesDesc')}</p>
              </div>
              <div className="space-y-2">
                <LabelWithTip htmlFor="ld-max-depth" tip={t('help.maxDepth')}>{t('maxDepth')}</LabelWithTip>
                <Input
                  id="ld-max-depth"
                  type="number"
                  value={maxDepth}
                  onChange={(e) => setMaxDepth(e.target.value)}
                  placeholder={String(config?.maxDepth ?? 3)}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">{t('maxDepthDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isTxBusy(setLevelDiffConfig)}>
                {t('saveConfig')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleClear}
                disabled={isTxBusy(clearLevelDiffConfig)}
              >
                {t('clearConfig')}
              </Button>
              <TxStatusIndicator txState={setLevelDiffConfig.txState} />
              <TxStatusIndicator txState={clearLevelDiffConfig.txState} />
            </div>
          </form>
        </PermissionGuard>
      </CardContent>
    </Card>
  );
}

function RuntimeNoticeSection() {
  const t = useTranslations('levelDiff');

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

export function LevelDiffPage() {
  const t = useTranslations('levelDiff');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { isLoading, error } = useLevelDiffCommission();

  if (isLoading) return <LevelDiffSkeleton />;

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
      <RuntimeNoticeSection />
    </div>
  );
}
