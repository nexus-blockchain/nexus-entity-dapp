'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { useReferralCommission } from '@/hooks/use-referral-commission';
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

function ReferralSkeleton() {
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
  const t = useTranslations('referral');
  const { entityId } = useEntityContext();
  const { config, setDirectRewardConfig, pauseReferral, resumeReferral } = useReferralCommission();

  const [rewardRate, setRewardRateVal] = useState('');

  const handleSaveConfig = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      // setDirectRewardConfig(entityId:u64, rate:u16)
      setDirectRewardConfig.mutate([
        entityId,
        Number(rewardRate) || config?.rewardRate || 0,
      ]);
    },
    [entityId, rewardRate, config, setDirectRewardConfig],
  );

  const handleToggle = useCallback(() => {
    if (config?.enabled) {
      pauseReferral.mutate([entityId]);
    } else if (config) {
      resumeReferral.mutate([entityId]);
    } else {
      // setDirectRewardConfig(entityId:u64, rate:u16)
      setDirectRewardConfig.mutate([
        entityId,
        Number(rewardRate) || 0,
      ]);
    }
  }, [entityId, config, rewardRate, pauseReferral, resumeReferral, setDirectRewardConfig]);

  const isToggleBusy = isTxBusy(pauseReferral) || isTxBusy(resumeReferral) || isTxBusy(setDirectRewardConfig);
  const toggleTxState = config?.enabled
    ? pauseReferral.txState
    : config
      ? resumeReferral.txState
      : setDirectRewardConfig.txState;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('configSection')}</CardTitle>
        <CardDescription>{t('configSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('enableToggle')}</p>
            <Badge variant={config?.enabled ? 'success' : 'secondary'}>
              {config?.enabled ? t('enabled') : t('notEnabled')}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('rewardRate')}</p>
            <p className="text-sm font-medium">{config?.rewardRate ?? 0} {t('bps')}</p>
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
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="ref-reward-rate">{t('rewardRate')}</Label>
              <Input
                id="ref-reward-rate"
                type="number"
                value={rewardRate}
                onChange={(e) => setRewardRateVal(e.target.value)}
                placeholder={String(config?.rewardRate ?? 0)}
              />
              <p className="text-xs text-muted-foreground">{t('rewardRateDesc')}</p>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isTxBusy(setDirectRewardConfig)}>
                {t('saveConfig')}
              </Button>
              <TxStatusIndicator txState={setDirectRewardConfig.txState} />
            </div>
          </form>
        </PermissionGuard>
      </CardContent>
    </Card>
  );
}

// ─── Stats Section ──────────────────────────────────────────

function StatsSection() {
  const t = useTranslations('referral');
  const { stats } = useReferralCommission();

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
              <p className="text-xs text-muted-foreground">{t('totalReferrals')}</p>
              <p className="text-lg font-semibold">{stats?.totalReferrals ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('totalRewardDistributed')}</p>
              <p className="text-lg font-semibold">{stats?.totalRewardDistributed?.toString() ?? '0'}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('activeReferrers')}</p>
              <p className="text-lg font-semibold">{stats?.activeReferrers ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── My Referral Info ───────────────────────────────────────

function MyReferralSection() {
  const t = useTranslations('referral');
  const address = useWalletStore((s) => s.address);
  const { useReferrerRecord } = useReferralCommission();
  const { data: record } = useReferrerRecord(address);

  if (!address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('myReferral')}</CardTitle>
          <CardDescription>{t('connectWalletFirst')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('myReferral')}</CardTitle>
        <CardDescription>{t('myReferralDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('myReferrer')}</p>
              <p className="truncate font-mono text-sm font-medium">
                {record?.referrer ?? t('noReferrer')}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('myTotalReferred')}</p>
              <p className="text-lg font-semibold">{record?.totalReferred ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('myTotalEarned')}</p>
              <p className="text-lg font-semibold">{record?.totalEarned?.toString() ?? '0'}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function ReferralPage() {
  const t = useTranslations('referral');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { isLoading, error } = useReferralCommission();

  if (isLoading) return <ReferralSkeleton />;

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
      <MyReferralSection />
    </div>
  );
}
