'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { useSingleLineCommission } from '@/hooks/use-single-line-commission';
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

function SingleLineSkeleton() {
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
  const t = useTranslations('singleLine');
  const { entityId } = useEntityContext();
  const { config, configureSingleLine, pauseSingleLine, resumeSingleLine } = useSingleLineCommission();

  const [uplineRate, setUplineRate] = useState('');
  const [downlineRate, setDownlineRate] = useState('');
  const [baseUplineLevels, setBaseUplineLevels] = useState('');
  const [baseDownlineLevels, setBaseDownlineLevels] = useState('');
  const [levelIncrementThreshold, setLevelIncrementThreshold] = useState('');
  const [maxUplineLevels, setMaxUplineLevels] = useState('');
  const [maxDownlineLevels, setMaxDownlineLevels] = useState('');

  const buildParams = () => [
    entityId,
    Number(uplineRate) || config?.uplineRate || 100,
    Number(downlineRate) || config?.downlineRate || 100,
    Number(baseUplineLevels) || config?.baseUplineLevels || 3,
    Number(baseDownlineLevels) || config?.baseDownlineLevels || 3,
    BigInt(levelIncrementThreshold || String(config?.levelIncrementThreshold ?? 0)),
    Number(maxUplineLevels) || config?.maxUplineLevels || 10,
    Number(maxDownlineLevels) || config?.maxDownlineLevels || 10,
  ];

  const handleSaveConfig = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      configureSingleLine.mutate(buildParams());
    },
    [entityId, uplineRate, downlineRate, baseUplineLevels, baseDownlineLevels, levelIncrementThreshold, maxUplineLevels, maxDownlineLevels, config, configureSingleLine],
  );

  const handleToggle = useCallback(() => {
    if (config?.enabled) {
      pauseSingleLine.mutate([entityId]);
    } else if (config && !config.enabled) {
      resumeSingleLine.mutate([entityId]);
    } else {
      configureSingleLine.mutate(buildParams());
    }
  }, [entityId, config, uplineRate, downlineRate, baseUplineLevels, baseDownlineLevels, levelIncrementThreshold, maxUplineLevels, maxDownlineLevels, pauseSingleLine, resumeSingleLine, configureSingleLine]);

  const isToggleBusy = isTxBusy(pauseSingleLine) || isTxBusy(resumeSingleLine) || isTxBusy(configureSingleLine);
  const toggleTxState = config?.enabled
    ? pauseSingleLine.txState
    : config
      ? resumeSingleLine.txState
      : configureSingleLine.txState;

  const statusVariant = config?.enabled ? 'success' : config ? 'destructive' : 'secondary';
  const statusLabel = config?.enabled ? t('enabled') : config ? t('paused') : t('notEnabled');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('configSection')}</CardTitle>
        <CardDescription>{t('configSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('enableToggle')}</p>
            <Badge variant={statusVariant}>
              {statusLabel}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('uplineRate')}</p>
            <p className="text-sm font-medium">{config?.uplineRate ?? 0} {t('bps')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('downlineRate')}</p>
            <p className="text-sm font-medium">{config?.downlineRate ?? 0} {t('bps')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('maxUplineLevels')}</p>
            <p className="text-sm font-medium">{config?.maxUplineLevels ?? 0}</p>
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
            <Label>
              {config?.enabled
                ? t('pauseToggle')
                : config
                  ? t('resumeToggle')
                  : t('enableToggle')}
            </Label>
            <TxStatusIndicator txState={toggleTxState} />
          </div>

          <Separator className="my-4" />

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="sl-upline-rate">{t('uplineRate')}</Label>
                <Input id="sl-upline-rate" type="number" value={uplineRate} onChange={(e) => setUplineRate(e.target.value)} placeholder={String(config?.uplineRate ?? 100)} />
                <p className="text-xs text-muted-foreground">{t('bps')}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sl-downline-rate">{t('downlineRate')}</Label>
                <Input id="sl-downline-rate" type="number" value={downlineRate} onChange={(e) => setDownlineRate(e.target.value)} placeholder={String(config?.downlineRate ?? 100)} />
                <p className="text-xs text-muted-foreground">{t('bps')}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sl-base-up">{t('baseUplineLevels')}</Label>
                <Input id="sl-base-up" type="number" value={baseUplineLevels} onChange={(e) => setBaseUplineLevels(e.target.value)} placeholder={String(config?.baseUplineLevels ?? 3)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sl-base-down">{t('baseDownlineLevels')}</Label>
                <Input id="sl-base-down" type="number" value={baseDownlineLevels} onChange={(e) => setBaseDownlineLevels(e.target.value)} placeholder={String(config?.baseDownlineLevels ?? 3)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sl-threshold">{t('levelIncrementThreshold')}</Label>
                <Input id="sl-threshold" type="number" value={levelIncrementThreshold} onChange={(e) => setLevelIncrementThreshold(e.target.value)} placeholder={String(config?.levelIncrementThreshold ?? 0)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sl-max-up">{t('maxUplineLevels')}</Label>
                <Input id="sl-max-up" type="number" value={maxUplineLevels} onChange={(e) => setMaxUplineLevels(e.target.value)} placeholder={String(config?.maxUplineLevels ?? 10)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sl-max-down">{t('maxDownlineLevels')}</Label>
                <Input id="sl-max-down" type="number" value={maxDownlineLevels} onChange={(e) => setMaxDownlineLevels(e.target.value)} placeholder={String(config?.maxDownlineLevels ?? 10)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isTxBusy(configureSingleLine)}>
                {t('saveConfig')}
              </Button>
              <TxStatusIndicator txState={configureSingleLine.txState} />
            </div>
          </form>
        </PermissionGuard>
      </CardContent>
    </Card>
  );
}

// ─── Stats Section ──────────────────────────────────────────

function StatsSection() {
  const t = useTranslations('singleLine');
  const { stats } = useSingleLineCommission();

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
              <p className="text-xs text-muted-foreground">{t('totalDistributed')}</p>
              <p className="text-lg font-semibold">{stats?.totalDistributed?.toString() ?? '0'}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('totalLines')}</p>
              <p className="text-lg font-semibold">{stats?.totalLines ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('avgLineDepth')}</p>
              <p className="text-lg font-semibold">{stats?.avgLineDepth ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── My Position ────────────────────────────────────────────

function MyPositionSection() {
  const t = useTranslations('singleLine');
  const address = useWalletStore((s) => s.address);
  const { useLinePosition } = useSingleLineCommission();
  const { data: position } = useLinePosition(address);

  if (!address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('myPosition')}</CardTitle>
          <CardDescription>{t('connectWalletFirst')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('myPosition')}</CardTitle>
        <CardDescription>{t('myPositionDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('position')}</p>
              <p className="text-lg font-semibold">{position?.position ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('upline')}</p>
              <p className="truncate font-mono text-sm font-medium">
                {position?.upline ?? t('noUpline')}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('downlineCount')}</p>
              <p className="text-lg font-semibold">{position?.downlineCount ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function SingleLinePage() {
  const t = useTranslations('singleLine');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { isLoading, error } = useSingleLineCommission();

  if (isLoading) return <SingleLineSkeleton />;

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
      <MyPositionSection />
    </div>
  );
}
