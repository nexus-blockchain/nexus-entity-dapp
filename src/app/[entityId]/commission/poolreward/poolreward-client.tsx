'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { usePoolRewardCommission } from '@/hooks/use-pool-reward-commission';
import { useWalletStore } from '@/stores/wallet-store';

import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

// ─── Loading Skeleton ───────────────────────────────────────

function PoolRewardSkeleton() {
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
  const t = useTranslations('poolReward');
  const { entityId } = useEntityContext();
  const { config, setPoolRewardConfig, startNewRound, pausePoolReward, resumePoolReward } = usePoolRewardCommission();

  // levelRatios as comma-separated "level:ratio" pairs, e.g. "1:500, 2:300"
  const [levelRatiosInput, setLevelRatiosInput] = useState('');
  const [roundDuration, setRoundDuration] = useState('');

  const parseLevelRatios = useCallback(() => {
    return levelRatiosInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const [levelStr, ratioStr] = pair.split(':').map((s) => s.trim());
        return [Number(levelStr) || 0, Number(ratioStr) || 0] as [number, number];
      });
  }, [levelRatiosInput]);

  const handleSaveConfig = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const ratios = parseLevelRatios();
      // setPoolRewardConfig(entityId, levelRatios:Vec<(u8,u16)>, roundDuration:u32)
      setPoolRewardConfig.mutate([
        entityId,
        ratios.length > 0 ? ratios : config?.levelRatios ?? [],
        Number(roundDuration) || config?.roundDuration || 0,
      ]);
    },
    [entityId, parseLevelRatios, roundDuration, config, setPoolRewardConfig],
  );

  const handleToggle = useCallback(() => {
    if (config?.enabled) {
      pausePoolReward.mutate([entityId]);
    } else if (config) {
      resumePoolReward.mutate([entityId]);
    } else {
      const ratios = parseLevelRatios();
      setPoolRewardConfig.mutate([
        entityId,
        ratios.length > 0 ? ratios : [],
        Number(roundDuration) || 0,
      ]);
    }
  }, [entityId, config, parseLevelRatios, roundDuration, pausePoolReward, resumePoolReward, setPoolRewardConfig]);

  const isToggleBusy = isTxBusy(pausePoolReward) || isTxBusy(resumePoolReward) || isTxBusy(setPoolRewardConfig);
  const toggleTxState = config?.enabled
    ? pausePoolReward.txState
    : config
      ? resumePoolReward.txState
      : setPoolRewardConfig.txState;

  const handleStartNewRound = useCallback(() => {
    // startNewRound(entityId)
    startNewRound.mutate([entityId]);
  }, [entityId, startNewRound]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('configSection')}</CardTitle>
        <CardDescription>{t('configSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('enableToggle')}</p>
            <Badge variant={config?.enabled ? 'success' : 'secondary'}>
              {config?.enabled ? t('enabled') : t('notEnabled')}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('levelRatios')}</p>
            <p className="font-mono text-sm font-medium">
              {config?.levelRatios?.map(([l, r]) => `${l}:${r}`).join(', ') || '-'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('roundDuration')}</p>
            <p className="text-sm font-medium">{config?.roundDuration ?? 0} {t('blocks')}</p>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pr-level-ratios">{t('levelRatios')}</Label>
                <Input
                  id="pr-level-ratios"
                  type="text"
                  value={levelRatiosInput}
                  onChange={(e) => setLevelRatiosInput(e.target.value)}
                  placeholder={t('levelRatiosPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">{t('levelRatiosDesc')}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pr-round-duration">{t('roundDuration')}</Label>
                <Input
                  id="pr-round-duration"
                  type="number"
                  value={roundDuration}
                  onChange={(e) => setRoundDuration(e.target.value)}
                  placeholder={String(config?.roundDuration ?? 0)}
                />
                <p className="text-xs text-muted-foreground">{t('roundDurationDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isTxBusy(setPoolRewardConfig)}>
                {t('saveConfig')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleStartNewRound}
                disabled={isTxBusy(startNewRound)}
              >
                {t('startNewRound')}
              </Button>
              <TxStatusIndicator txState={setPoolRewardConfig.txState} />
              <TxStatusIndicator txState={startNewRound.txState} />
            </div>
          </form>
        </PermissionGuard>
      </CardContent>
    </Card>
  );
}

// ─── Stats Section ──────────────────────────────────────────

function StatsSection() {
  const t = useTranslations('poolReward');
  const { stats } = usePoolRewardCommission();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('statsSection')}</CardTitle>
        <CardDescription>{t('statsSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('poolBalance')}</p>
              <p className="text-lg font-semibold">{stats?.poolBalance?.toString() ?? '0'}</p>
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
              <p className="text-xs text-muted-foreground">{t('totalParticipants')}</p>
              <p className="text-lg font-semibold">{stats?.totalParticipants ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('lastDistributionBlock')}</p>
              <p className="text-lg font-semibold">#{stats?.lastDistributionBlock ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── My Participation ───────────────────────────────────────

function MyParticipationSection() {
  const t = useTranslations('poolReward');
  const address = useWalletStore((s) => s.address);
  const { useParticipant } = usePoolRewardCommission();
  const { data: participant } = useParticipant(address);

  if (!address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('myParticipation')}</CardTitle>
          <CardDescription>{t('connectWalletFirst')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('myParticipation')}</CardTitle>
        <CardDescription>{t('myParticipationDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('contribution')}</p>
              <p className="text-lg font-semibold">{participant?.contribution?.toString() ?? '0'}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('share')}</p>
              <p className="text-lg font-semibold">{participant?.share ?? 0} {t('bps')}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('totalClaimed')}</p>
              <p className="text-lg font-semibold">{participant?.totalClaimed?.toString() ?? '0'}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function PoolRewardPage() {
  const t = useTranslations('poolReward');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { isLoading, error } = usePoolRewardCommission();

  if (isLoading) return <PoolRewardSkeleton />;

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
      <StatsSection />
      <MyParticipationSection />
    </div>
  );
}
