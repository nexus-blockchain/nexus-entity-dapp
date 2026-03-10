'use client';

import React, { useState, useCallback } from 'react';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { CommissionPlugin } from '@/lib/types/enums';
import { useCommission } from '@/hooks/use-commission';
import { useWalletStore } from '@/stores/wallet-store';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

const PLUGIN_LIST: { key: CommissionPlugin; bit: number }[] = [
  { key: CommissionPlugin.Referral, bit: 0x001 },
  { key: CommissionPlugin.MultiLevel, bit: 0x002 },
  { key: CommissionPlugin.LevelDiff, bit: 0x008 },
  { key: CommissionPlugin.SingleLine, bit: 0x080 },
  { key: CommissionPlugin.Team, bit: 0x004 },
  { key: CommissionPlugin.PoolReward, bit: 0x200 },
];

// ─── Loading Skeleton ───────────────────────────────────────

function CommissionSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border p-4">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-6 w-11 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Overview Section ───────────────────────────────────────

function OverviewSection() {
  const t = useTranslations('commission');
  const { entityId } = useEntityContext();
  const { config, setCommissionRate } = useCommission();
  const [rate, setRate] = useState('');

  const handleSetRate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!rate.trim()) return;
      setCommissionRate.mutate([entityId, Number(rate)]);
      setRate('');
    },
    [entityId, rate, setCommissionRate],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('overview')}</CardTitle>
        <CardDescription>{t('overviewDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('enabledStatus')}</p>
            <Badge variant={config?.enabled ? 'success' : 'secondary'}>
              {config?.enabled ? t('enabled') : t('notEnabled')}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('baseRate')}</p>
            <p className="text-sm font-medium">{config?.baseRate ?? 0}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('enabledModes')}</p>
            <p className="font-mono text-sm font-medium">
              0x{(config?.enabledModes ?? 0).toString(16).toUpperCase().padStart(3, '0')}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('withdrawalStatus')}</p>
            <Badge variant={config?.withdrawalPaused ? 'destructive' : 'success'}>
              {config?.withdrawalPaused ? t('withdrawalPaused') : t('withdrawalNormal')}
            </Badge>
          </div>
        </div>

        <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
          <Separator className="my-4" />
          <form onSubmit={handleSetRate} className="flex items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="rate-input">{t('newRate')}</Label>
              <Input
                id="rate-input"
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder={t('newRate')}
                className="w-40"
              />
            </div>
            <Button type="submit" disabled={isTxBusy(setCommissionRate)}>
              {t('setRate')}
            </Button>
            <TxStatusIndicator txState={setCommissionRate.txState} />
          </form>
        </PermissionGuard>
      </CardContent>
    </Card>
  );
}

// ─── Plugin Config Section ──────────────────────────────────

function PluginSection() {
  const t = useTranslations('commission');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const { config, enablePlugin, disablePlugin } = useCommission();
  const enabledModes = config?.enabledModes ?? 0;

  const handleToggle = useCallback(
    (plugin: CommissionPlugin, bit: number) => {
      const isEnabled = (enabledModes & bit) !== 0;
      if (isEnabled) {
        disablePlugin.mutate([entityId, plugin]);
      } else {
        enablePlugin.mutate([entityId, plugin]);
      }
    },
    [entityId, enabledModes, enablePlugin, disablePlugin],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('pluginConfig')}</CardTitle>
        <CardDescription>{t('pluginConfigDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PLUGIN_LIST.map(({ key, bit }) => {
            const isEnabled = (enabledModes & bit) !== 0;
            return (
              <Card key={key} className="shadow-none">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{te(`commissionPlugin.${key}`)}</p>
                    <p className="text-xs text-muted-foreground">{key}</p>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => handleToggle(key, bit)}
                    disabled={isTxBusy(enablePlugin) || isTxBusy(disablePlugin)}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
      <CardFooter className="gap-3">
        <TxStatusIndicator txState={enablePlugin.txState} />
        <TxStatusIndicator txState={disablePlugin.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Withdrawal Config Section ──────────────────────────────

function WithdrawalSection() {
  const t = useTranslations('commission');
  const { entityId } = useEntityContext();
  const { config, configureWithdrawal, pauseWithdrawal, resumeWithdrawal } = useCommission();

  const [minAmount, setMinAmount] = useState('');
  const [feeRate, setFeeRate] = useState('');
  const [cooldown, setCooldown] = useState('');

  const handleConfigure = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!minAmount.trim() || !feeRate.trim() || !cooldown.trim()) return;
      configureWithdrawal.mutate([entityId, minAmount.trim(), Number(feeRate), Number(cooldown)]);
      setMinAmount('');
      setFeeRate('');
      setCooldown('');
    },
    [entityId, minAmount, feeRate, cooldown, configureWithdrawal],
  );

  const wc = config?.withdrawalConfig;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">{t('withdrawalManagement')}</CardTitle>
          <CardDescription>{t('withdrawalManagementDesc')}</CardDescription>
        </div>
        {config?.withdrawalPaused && (
          <Badge variant="destructive">{t('withdrawalPausedNotice')}</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {wc && (
          <div className="grid grid-cols-3 gap-4">
            <Card className="shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{t('minWithdrawal')}</p>
                <p className="text-sm font-medium">{wc.minAmount.toString()}</p>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{t('feeRate')}</p>
                <p className="text-sm font-medium">{wc.feeRate}</p>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{t('cooldownPeriod')}</p>
                <p className="text-sm font-medium">{wc.cooldown}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Separator />

        <form onSubmit={handleConfigure} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="min-amount">{t('minWithdrawal')}</Label>
              <Input
                id="min-amount"
                type="text"
                inputMode="decimal"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder={t('minWithdrawal')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fee-rate">{t('feeRate')}</Label>
              <Input
                id="fee-rate"
                type="number"
                value={feeRate}
                onChange={(e) => setFeeRate(e.target.value)}
                placeholder={t('feeRate')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cooldown">{t('cooldownPeriod')}</Label>
              <Input
                id="cooldown"
                type="number"
                value={cooldown}
                onChange={(e) => setCooldown(e.target.value)}
                placeholder={t('cooldownPeriod')}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isTxBusy(configureWithdrawal)}>
              {t('updateWithdrawalConfig')}
            </Button>
            <Button
              type="button"
              variant={config?.withdrawalPaused ? 'default' : 'destructive'}
              onClick={() =>
                config?.withdrawalPaused
                  ? resumeWithdrawal.mutate([entityId])
                  : pauseWithdrawal.mutate([entityId])
              }
              disabled={isTxBusy(pauseWithdrawal) || isTxBusy(resumeWithdrawal)}
            >
              {config?.withdrawalPaused ? t('resumeWithdrawal') : t('pauseWithdrawal')}
            </Button>
            <TxStatusIndicator txState={configureWithdrawal.txState} />
            <TxStatusIndicator txState={pauseWithdrawal.txState} />
            <TxStatusIndicator txState={resumeWithdrawal.txState} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Withdraw Section (NEX + Token dual channel) ────────────

function WithdrawSection() {
  const t = useTranslations('commission');
  const { entityId } = useEntityContext();
  const { config, withdrawNex, withdrawToken } = useCommission();
  const [nexAmount, setNexAmount] = useState('');
  const [tokenAmount, setTokenAmount] = useState('');
  const paused = config?.withdrawalPaused ?? false;

  const handleWithdrawNex = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!nexAmount.trim()) return;
      withdrawNex.mutate([entityId, nexAmount.trim()]);
      setNexAmount('');
    },
    [entityId, nexAmount, withdrawNex],
  );

  const handleWithdrawToken = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!tokenAmount.trim()) return;
      withdrawToken.mutate([entityId, tokenAmount.trim()]);
      setTokenAmount('');
    },
    [entityId, tokenAmount, withdrawToken],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('commissionWithdrawal')}</CardTitle>
        <CardDescription>{t('commissionWithdrawalDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {paused && (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {t('withdrawalPausedNotice')}
          </div>
        )}

        <Tabs defaultValue="nex">
          <TabsList className="mb-4">
            <TabsTrigger value="nex">{t('nexWithdrawal')}</TabsTrigger>
            <TabsTrigger value="token">{t('tokenWithdrawal')}</TabsTrigger>
          </TabsList>

          <TabsContent value="nex">
            <form onSubmit={handleWithdrawNex} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nex-amount">{t('withdrawAmount')}</Label>
                <Input
                  id="nex-amount"
                  type="text"
                  inputMode="decimal"
                  value={nexAmount}
                  onChange={(e) => setNexAmount(e.target.value)}
                  placeholder={t('withdrawAmountPlaceholder')}
                  disabled={paused}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={paused || isTxBusy(withdrawNex)}>
                  {t('withdrawNex')}
                </Button>
                <TxStatusIndicator txState={withdrawNex.txState} />
              </div>
            </form>
          </TabsContent>

          <TabsContent value="token">
            <form onSubmit={handleWithdrawToken} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token-amount">{t('withdrawAmount')}</Label>
                <Input
                  id="token-amount"
                  type="text"
                  inputMode="decimal"
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(e.target.value)}
                  placeholder={t('withdrawAmountPlaceholder')}
                  disabled={paused}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={paused || isTxBusy(withdrawToken)}>
                  {t('withdrawToken')}
                </Button>
                <TxStatusIndicator txState={withdrawToken.txState} />
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Member Commission Stats ────────────────────────────────

function MemberStatsSection() {
  const t = useTranslations('commission');
  const address = useWalletStore((s) => s.address);
  const { useMemberCommission } = useCommission();
  const { data } = useMemberCommission(address);

  if (!address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('myCommission')}</CardTitle>
          <CardDescription>{t('connectWalletFirst')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('myCommission')}</CardTitle>
        <CardDescription>{t('myCommissionDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('nexEarnings')}</p>
              <p className="text-lg font-semibold">{data?.nexEarned.toString() ?? '0'}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('tokenEarnings')}</p>
              <p className="text-lg font-semibold">{data?.tokenEarned.toString() ?? '0'}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Order Commission Records ───────────────────────────────

function OrderCommissionsSection() {
  const t = useTranslations('commission');
  const { orderCommissions } = useCommission();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('orderCommissionRecords')}</CardTitle>
        <CardDescription>{t('orderCommissionRecordsDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {orderCommissions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noCommissionRecords')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('orderId')}</TableHead>
                <TableHead>{t('amount')}</TableHead>
                <TableHead>{t('pluginType')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderCommissions.map((oc) => (
                <TableRow key={`${oc.orderId}-${oc.plugin}`}>
                  <TableCell className="font-medium">#{oc.orderId}</TableCell>
                  <TableCell>{oc.amount.toString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{oc.plugin}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function CommissionPage() {
  const t = useTranslations('commission');
  const tc = useTranslations('common');
  const { isLoading, error } = useCommission();

  if (isLoading) {
    return <CommissionSkeleton />;
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
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <OverviewSection />
      <MemberStatsSection />

      <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
        <PluginSection />
        <WithdrawalSection />
      </PermissionGuard>

      <WithdrawSection />
      <OrderCommissionsSection />
    </div>
  );
}
