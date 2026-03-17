'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import type { TxState } from '@/lib/types/models';
import { CommissionPlugin, WithdrawalModeType } from '@/lib/types/enums';
import { useCommission } from '@/hooks/use-commission';
import { useWalletStore } from '@/stores/wallet-store';
import { useTranslations } from 'next-intl';
import { formatNex, formatToken } from '@/lib/utils/format';
// UI components:
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTip } from '@/components/field-help-tip';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

const PLUGIN_LIST: { key: CommissionPlugin; bit: number; route: string }[] = [
  { key: CommissionPlugin.Referral, bit: 0x001, route: 'referral' },
  { key: CommissionPlugin.MultiLevel, bit: 0x002, route: 'multilevel' },
  { key: CommissionPlugin.LevelDiff, bit: 0x008, route: 'leveldiff' },
  { key: CommissionPlugin.SingleLine, bit: 0x080, route: 'singleline' },
  { key: CommissionPlugin.Team, bit: 0x004, route: 'team' },
  { key: CommissionPlugin.PoolReward, bit: 0x200, route: 'poolreward' },
];

function bpsDisplay(bps: number): string {
  return `${bps} bps = ${(bps / 100).toFixed(2)}%`;
}

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
            {Array.from({ length: 8 }).map((_, i) => (
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
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
          <div className="grid gap-4 sm:grid-cols-2">
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
  const {
    coreConfig,
    config,
    globalCommissionPaused,
    enableCommission,
    setCommissionRate,
    setCreatorRewardRate,
    setWithdrawalCooldown,
  } = useCommission();

  const [rate, setRate] = useState('');
  const [creatorRate, setCreatorRate] = useState('');
  const [cooldownNex, setCooldownNex] = useState('');
  const [cooldownToken, setCooldownToken] = useState('');

  const handleSetRate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!rate.trim()) return;
      setCommissionRate.mutate([entityId, Number(rate)]);
      setRate('');
    },
    [entityId, rate, setCommissionRate],
  );

  const handleSetCreatorRate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!creatorRate.trim()) return;
      setCreatorRewardRate.mutate([entityId, Number(creatorRate)]);
      setCreatorRate('');
    },
    [entityId, creatorRate, setCreatorRewardRate],
  );

  const handleSetCooldown = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const nex = cooldownNex.trim() ? Number(cooldownNex) : null;
      const token = cooldownToken.trim() ? Number(cooldownToken) : null;
      if (nex !== null) {
        setWithdrawalCooldown.mutate([entityId, nex]);
      }
      if (token !== null) {
        setWithdrawalCooldown.mutate([entityId, token]);
      }
      setCooldownNex('');
      setCooldownToken('');
    },
    [entityId, cooldownNex, cooldownToken, setWithdrawalCooldown],
  );

  const enabledModes = coreConfig?.enabledModes ?? config?.enabledModes ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('overview')}</CardTitle>
        <CardDescription>{t('overviewDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {globalCommissionPaused && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {t('globalPausedWarning')}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {/* Enabled status */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('enabledStatus')}</p>
            <Badge variant={coreConfig?.enabled ? 'success' : 'secondary'}>
              {coreConfig?.enabled ? t('enabled') : t('notEnabled')}
            </Badge>
          </div>

          {/* Max commission rate */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('maxCommissionRate')}</p>
            <p className="text-sm font-medium">{bpsDisplay(coreConfig?.maxCommissionRate ?? 0)}</p>
          </div>

          {/* Creator reward rate */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('creatorRewardRate')}</p>
            <p className="text-sm font-medium">{bpsDisplay(coreConfig?.creatorRewardRate ?? 0)}</p>
          </div>

          {/* Enabled modes (hex) */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('enabledModes')}</p>
            <p className="font-mono text-sm font-medium">
              0x{enabledModes.toString(16).toUpperCase().padStart(3, '0')}
            </p>
          </div>

          {/* NEX Withdrawal Cooldown */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('withdrawalCooldown')}</p>
            <p className="text-sm font-medium">{coreConfig?.withdrawalCooldown ?? 0} blocks</p>
          </div>

          {/* Token Withdrawal Cooldown */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('tokenWithdrawalCooldown')}</p>
            <p className="text-sm font-medium">{coreConfig?.tokenWithdrawalCooldown ?? 0} blocks</p>
          </div>

          {/* Withdrawal status */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('withdrawalStatus')}</p>
            <Badge variant={config?.withdrawalPaused ? 'destructive' : 'success'}>
              {config?.withdrawalPaused ? t('withdrawalPaused') : t('withdrawalNormal')}
            </Badge>
          </div>

          {/* Base rate (legacy) */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('baseRate')}</p>
            <p className="text-sm font-medium">{config?.baseRate ?? 0}</p>
          </div>
        </div>

        {/* Enabled plugin badges */}
        {enabledModes > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('enabledModes')}</p>
              <div className="flex flex-wrap gap-2">
                {PLUGIN_LIST.filter(({ bit }) => (enabledModes & bit) !== 0).map(({ key }) => (
                  <Badge key={key} variant="outline">
                    {key}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Admin controls */}
        <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
          <Separator />

          {/* Enable / Disable toggle */}
          <div className="flex items-center gap-3">
            <Button
              variant={coreConfig?.enabled ? 'destructive' : 'default'}
              size="sm"
              onClick={() => enableCommission.mutate([entityId, !coreConfig?.enabled])}
              disabled={isTxBusy(enableCommission)}
            >
              {coreConfig?.enabled ? t('suspendEnable') : t('reEnable')}
            </Button>
            <TxStatusIndicator txState={enableCommission.txState} />
          </div>

          <Separator />

          {/* Set commission rate */}
          <form onSubmit={handleSetRate} className="flex items-end gap-3">
            <div className="space-y-2">
              <LabelWithTip htmlFor="rate-input" tip={t('help.newRate')}>{t('newRate')}</LabelWithTip>
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

          {/* Set creator reward rate */}
          <form onSubmit={handleSetCreatorRate} className="flex items-end gap-3">
            <div className="space-y-2">
              <LabelWithTip htmlFor="creator-rate-input" tip={t('help.creatorRewardRate')}>{t('creatorRewardRate')}</LabelWithTip>
              <Input
                id="creator-rate-input"
                type="number"
                value={creatorRate}
                onChange={(e) => setCreatorRate(e.target.value)}
                placeholder="bps"
                className="w-40"
              />
            </div>
            <Button type="submit" disabled={isTxBusy(setCreatorRewardRate)}>
              {t('setCreatorRewardRate')}
            </Button>
            <TxStatusIndicator txState={setCreatorRewardRate.txState} />
          </form>

          {/* Set withdrawal cooldown */}
          <form onSubmit={handleSetCooldown} className="flex items-end gap-3 flex-wrap">
            <div className="space-y-2">
              <LabelWithTip htmlFor="cooldown-nex" tip={t('help.withdrawalCooldown')}>{t('withdrawalCooldown')}</LabelWithTip>
              <Input
                id="cooldown-nex"
                type="number"
                value={cooldownNex}
                onChange={(e) => setCooldownNex(e.target.value)}
                placeholder="blocks"
                className="w-40"
              />
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="cooldown-token" tip={t('help.tokenWithdrawalCooldown')}>{t('tokenWithdrawalCooldown')}</LabelWithTip>
              <Input
                id="cooldown-token"
                type="number"
                value={cooldownToken}
                onChange={(e) => setCooldownToken(e.target.value)}
                placeholder="blocks"
                className="w-40"
              />
            </div>
            <Button type="submit" disabled={isTxBusy(setWithdrawalCooldown)}>
              {t('setWithdrawalCooldown')}
            </Button>
            <TxStatusIndicator txState={setWithdrawalCooldown.txState} />
          </form>
        </PermissionGuard>
      </CardContent>
    </Card>
  );
}

// ─── Entity Stats Section ───────────────────────────────────

function EntityStatsSection() {
  const t = useTranslations('commission');
  const {
    shopCommissionTotals,
    shopPendingTotal,
    tokenPendingTotal,
    unallocatedPool,
    unallocatedTokenPool,
  } = useCommission();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('entityStats')}</CardTitle>
        <CardDescription>{t('entityStatsDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('totalDistributed')}</p>
              <p className="text-lg font-semibold">
                {formatNex(shopCommissionTotals?.totalDistributed ?? BigInt(0))} NEX
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('totalOrders')}</p>
              <p className="text-lg font-semibold">
                {shopCommissionTotals?.totalOrders ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('nexPending')}</p>
              <p className="text-lg font-semibold">{formatNex(shopPendingTotal)} NEX</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('tokenPending')}</p>
              <p className="text-lg font-semibold">{formatToken(tokenPendingTotal)}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('nexUnallocated')}</p>
              <p className="text-lg font-semibold">{formatNex(unallocatedPool)} NEX</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('tokenUnallocated')}</p>
              <p className="text-lg font-semibold">{formatToken(unallocatedTokenPool)}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Member Commission Stats ────────────────────────────────

function MemberStatsSection() {
  const t = useTranslations('commission');
  const address = useWalletStore((s) => s.address);
  const {
    useMemberCommissionStats,
    useMemberTokenCommissionStats,
    useMemberLastCredited,
    useMemberLastWithdrawn,
    useMemberTokenLastCredited,
    useMemberTokenLastWithdrawn,
  } = useCommission();

  const nexStats = useMemberCommissionStats(address);
  const tokenStats = useMemberTokenCommissionStats(address);
  const lastCredited = useMemberLastCredited(address);
  const lastWithdrawn = useMemberLastWithdrawn(address);
  const tokenLastCredited = useMemberTokenLastCredited(address);
  const tokenLastWithdrawn = useMemberTokenLastWithdrawn(address);

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

  const nex = nexStats.data;
  const token = tokenStats.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('myCommission')}</CardTitle>
        <CardDescription>{t('myCommissionDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* NEX column */}
          <Card className="shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t('nexEarnings')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('pending')}</span>
                <span className="text-sm font-medium">{formatNex(nex?.pending ?? BigInt(0))} NEX</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('totalEarned')}</span>
                <span className="text-sm font-medium">{formatNex(nex?.totalEarned ?? BigInt(0))} NEX</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('withdrawn')}</span>
                <span className="text-sm font-medium">{formatNex(nex?.withdrawn ?? BigInt(0))} NEX</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('repurchased')}</span>
                <span className="text-sm font-medium">{formatNex(nex?.repurchased ?? BigInt(0))} NEX</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('orderCount')}</span>
                <span className="text-sm font-medium">{nex?.orderCount ?? 0}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('lastCredited')}</span>
                <span className="font-mono text-xs">{lastCredited.data ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('lastWithdrawn')}</span>
                <span className="font-mono text-xs">{lastWithdrawn.data ?? 0}</span>
              </div>
            </CardContent>
          </Card>

          {/* Token column */}
          <Card className="shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t('tokenEarnings')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('pending')}</span>
                <span className="text-sm font-medium">{formatToken(token?.pending ?? BigInt(0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('totalEarned')}</span>
                <span className="text-sm font-medium">{formatToken(token?.totalEarned ?? BigInt(0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('withdrawn')}</span>
                <span className="text-sm font-medium">{formatToken(token?.withdrawn ?? BigInt(0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('repurchased')}</span>
                <span className="text-sm font-medium">{formatToken(token?.repurchased ?? BigInt(0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('orderCount')}</span>
                <span className="text-sm font-medium">{token?.orderCount ?? 0}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('lastCredited')}</span>
                <span className="font-mono text-xs">{tokenLastCredited.data ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t('lastWithdrawn')}</span>
                <span className="font-mono text-xs">{tokenLastWithdrawn.data ?? 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Plugin Config Section ──────────────────────────────────

function PluginSection() {
  const t = useTranslations('commission');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const { coreConfig, config, setCommissionModes } = useCommission();
  const enabledModes = coreConfig?.enabledModes ?? config?.enabledModes ?? 0;

  const handleToggle = useCallback(
    (_plugin: CommissionPlugin, bit: number) => {
      const newModes = enabledModes ^ bit;
      setCommissionModes.mutate([entityId, newModes]);
    },
    [entityId, enabledModes, setCommissionModes],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('pluginConfig')}</CardTitle>
        <CardDescription>{t('pluginConfigDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PLUGIN_LIST.map(({ key, bit, route }) => {
            const isEnabled = (enabledModes & bit) !== 0;
            return (
              <Card key={key} className="shadow-none">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{te(`commissionPlugin.${key}`)}</p>
                    <p className="text-xs text-muted-foreground">{key}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/${entityId}/commission/${route}`}>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                        {tc('viewDetails')}
                      </Button>
                    </Link>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => handleToggle(key, bit)}
                      disabled={isTxBusy(setCommissionModes)}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
      <CardFooter className="gap-3">
        <TxStatusIndicator txState={setCommissionModes.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Withdrawal Config Section ──────────────────────────────

function WithdrawalConfigSection() {
  const t = useTranslations('commission');
  const { entityId } = useEntityContext();
  const {
    withdrawalConfig,
    tokenWithdrawalConfig,
    isWithdrawalPaused,
    minWithdrawalInterval,
    configureWithdrawal,
    setTokenWithdrawalConfig,
    pauseWithdrawal,
    clearWithdrawalConfig,
    clearTokenWithdrawalConfig,
    setMinWithdrawalInterval,
  } = useCommission();

  // NEX form state
  const [nexMode, setNexMode] = useState<WithdrawalModeType>(WithdrawalModeType.FullWithdrawal);
  const [nexFixedRepurchaseRate, setNexFixedRepurchaseRate] = useState('');
  const [nexMinRepurchaseRate, setNexMinRepurchaseRate] = useState('');
  const [nexWithdrawalRate, setNexWithdrawalRate] = useState('');
  const [nexRepurchaseRate, setNexRepurchaseRate] = useState('');
  const [nexVoluntaryBonus, setNexVoluntaryBonus] = useState('');
  const [nexEnabled, setNexEnabled] = useState(true);
  const [nexOverrides, setNexOverrides] = useState<{ level: string; withdrawalRate: string; repurchaseRate: string }[]>([]);

  // Token form state
  const [tokenMode, setTokenMode] = useState<WithdrawalModeType>(WithdrawalModeType.FullWithdrawal);
  const [tokenFixedRepurchaseRate, setTokenFixedRepurchaseRate] = useState('');
  const [tokenMinRepurchaseRate, setTokenMinRepurchaseRate] = useState('');
  const [tokenWithdrawalRate, setTokenWithdrawalRate] = useState('');
  const [tokenRepurchaseRate, setTokenRepurchaseRate] = useState('');
  const [tokenVoluntaryBonus, setTokenVoluntaryBonus] = useState('');
  const [tokenEnabled, setTokenEnabled] = useState(true);
  const [tokenOverrides, setTokenOverrides] = useState<{ level: string; withdrawalRate: string; repurchaseRate: string }[]>([]);

  // Min withdrawal interval
  const [intervalValue, setIntervalValue] = useState('');

  const buildWithdrawalMode = (
    mode: WithdrawalModeType,
    fixedRate: string,
    minRate: string,
  ) => {
    switch (mode) {
      case WithdrawalModeType.FullWithdrawal:
        return { FullWithdrawal: null };
      case WithdrawalModeType.FixedRate:
        return { FixedRate: { repurchaseRate: Number(fixedRate) || 0 } };
      case WithdrawalModeType.LevelBased:
        return { LevelBased: null };
      case WithdrawalModeType.MemberChoice:
        return { MemberChoice: { minRepurchaseRate: Number(minRate) || 0 } };
    }
  };

  const buildOverrides = (overrides: { level: string; withdrawalRate: string; repurchaseRate: string }[]) => {
    if (overrides.length === 0) return null;
    return overrides.map((o) => [
      Number(o.level) || 0,
      {
        withdrawalRate: Number(o.withdrawalRate) || 0,
        repurchaseRate: Number(o.repurchaseRate) || 0,
      },
    ]);
  };

  const handleConfigureNex = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      configureWithdrawal.mutate([
        entityId,
        buildWithdrawalMode(nexMode, nexFixedRepurchaseRate, nexMinRepurchaseRate),
        { withdrawalRate: Number(nexWithdrawalRate) || 10000, repurchaseRate: Number(nexRepurchaseRate) || 0 },
        buildOverrides(nexOverrides),
        Number(nexVoluntaryBonus) || 0,
        nexEnabled,
      ]);
    },
    [entityId, nexMode, nexFixedRepurchaseRate, nexMinRepurchaseRate, nexWithdrawalRate, nexRepurchaseRate, nexOverrides, nexVoluntaryBonus, nexEnabled, configureWithdrawal],
  );

  const handleConfigureToken = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setTokenWithdrawalConfig.mutate([
        entityId,
        buildWithdrawalMode(tokenMode, tokenFixedRepurchaseRate, tokenMinRepurchaseRate),
        { withdrawalRate: Number(tokenWithdrawalRate) || 10000, repurchaseRate: Number(tokenRepurchaseRate) || 0 },
        buildOverrides(tokenOverrides),
        Number(tokenVoluntaryBonus) || 0,
        tokenEnabled,
      ]);
    },
    [entityId, tokenMode, tokenFixedRepurchaseRate, tokenMinRepurchaseRate, tokenWithdrawalRate, tokenRepurchaseRate, tokenOverrides, tokenVoluntaryBonus, tokenEnabled, setTokenWithdrawalConfig],
  );

  const handleSetInterval = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!intervalValue.trim()) return;
      setMinWithdrawalInterval.mutate([entityId, Number(intervalValue)]);
      setIntervalValue('');
    },
    [entityId, intervalValue, setMinWithdrawalInterval],
  );

  const renderCurrentConfig = (label: string, cfg: ReturnType<typeof useCommission>['withdrawalConfig']) => {
    if (!cfg) return null;
    return (
      <div className="rounded-md border bg-muted/50 p-3 space-y-1 text-sm">
        <p className="font-medium">{label}</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <span className="text-muted-foreground">{t('withdrawalMode')}:</span>
          <span>{cfg.mode.type}{cfg.mode.type === 'FixedRate' ? ` (${cfg.mode.repurchaseRate})` : ''}{cfg.mode.type === 'MemberChoice' ? ` (min: ${cfg.mode.minRepurchaseRate})` : ''}</span>
          <span className="text-muted-foreground">{t('defaultTier')}:</span>
          <span>{cfg.defaultTier.withdrawalRate} / {cfg.defaultTier.repurchaseRate}</span>
          <span className="text-muted-foreground">{t('voluntaryBonusRate')}:</span>
          <span>{cfg.voluntaryBonusRate}</span>
          <span className="text-muted-foreground">{t('enabled')}:</span>
          <span>{cfg.enabled ? 'Yes' : 'No'}</span>
          <span className="text-muted-foreground">{t('levelOverrides')}:</span>
          <span>{cfg.levelOverrides.length > 0 ? cfg.levelOverrides.map(([lv, tier]) => `L${lv}: ${tier.withdrawalRate}/${tier.repurchaseRate}`).join(', ') : 'None'}</span>
        </div>
      </div>
    );
  };

  const renderModeFields = (
    mode: WithdrawalModeType,
    fixedRate: string,
    setFixedRate: (v: string) => void,
    minRate: string,
    setMinRate: (v: string) => void,
  ) => (
    <>
      {mode === WithdrawalModeType.FixedRate && (
        <div className="space-y-2">
          <LabelWithTip tip={t('help.fixedRepurchaseRate')}>{t('fixedRepurchaseRate')}</LabelWithTip>
          <Input
            type="number"
            value={fixedRate}
            onChange={(e) => setFixedRate(e.target.value)}
            placeholder="bps"
            className="w-40"
          />
        </div>
      )}
      {mode === WithdrawalModeType.MemberChoice && (
        <div className="space-y-2">
          <LabelWithTip tip={t('help.minRepurchaseRate')}>{t('minRepurchaseRate')}</LabelWithTip>
          <Input
            type="number"
            value={minRate}
            onChange={(e) => setMinRate(e.target.value)}
            placeholder="bps"
            className="w-40"
          />
        </div>
      )}
    </>
  );

  const renderOverridesEditor = (
    overrides: { level: string; withdrawalRate: string; repurchaseRate: string }[],
    setOverrides: React.Dispatch<React.SetStateAction<{ level: string; withdrawalRate: string; repurchaseRate: string }[]>>,
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{t('levelOverrides')}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOverrides([...overrides, { level: '', withdrawalRate: '', repurchaseRate: '' }])}
        >
          {t('addOverride')}
        </Button>
      </div>
      {overrides.map((o, idx) => (
        <div key={idx} className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Level</Label>
            <Input
              type="number"
              value={o.level}
              onChange={(e) => {
                const updated = [...overrides];
                updated[idx] = { ...updated[idx], level: e.target.value };
                setOverrides(updated);
              }}
              className="w-20"
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <LabelWithTip className="text-xs" tip={t('help.withdrawalRate')}>{t('withdrawalRate')}</LabelWithTip>
            <Input
              type="number"
              value={o.withdrawalRate}
              onChange={(e) => {
                const updated = [...overrides];
                updated[idx] = { ...updated[idx], withdrawalRate: e.target.value };
                setOverrides(updated);
              }}
              className="w-24"
              placeholder="bps"
            />
          </div>
          <div className="space-y-1">
            <LabelWithTip className="text-xs" tip={t('help.repurchaseRate')}>{t('repurchaseRate')}</LabelWithTip>
            <Input
              type="number"
              value={o.repurchaseRate}
              onChange={(e) => {
                const updated = [...overrides];
                updated[idx] = { ...updated[idx], repurchaseRate: e.target.value };
                setOverrides(updated);
              }}
              className="w-24"
              placeholder="bps"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setOverrides(overrides.filter((_, i) => i !== idx))}
          >
            {t('removeOverride')}
          </Button>
        </div>
      ))}
    </div>
  );

  const renderConfigForm = (
    prefix: 'nex' | 'token',
    mode: WithdrawalModeType,
    setMode: (v: WithdrawalModeType) => void,
    fixedRate: string,
    setFixedRate: (v: string) => void,
    minRate: string,
    setMinRate: (v: string) => void,
    wRate: string,
    setWRate: (v: string) => void,
    rRate: string,
    setRRate: (v: string) => void,
    bonus: string,
    setBonus: (v: string) => void,
    enabled: boolean,
    setEnabledFn: (v: boolean) => void,
    overrides: { level: string; withdrawalRate: string; repurchaseRate: string }[],
    setOverrides: React.Dispatch<React.SetStateAction<{ level: string; withdrawalRate: string; repurchaseRate: string }[]>>,
    onSubmit: (e: React.FormEvent) => void,
    mutation: { txState: TxState },
    clearMutation: { txState: TxState; mutate: (args: any[]) => void },
  ) => (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Mode selector */}
      <div className="space-y-2">
        <LabelWithTip htmlFor={`${prefix}-mode-select`} tip={t('help.withdrawalMode')}>{t('withdrawalMode')}</LabelWithTip>
        <Select value={mode} onValueChange={(v) => setMode(v as WithdrawalModeType)}>
          <SelectTrigger id={`${prefix}-mode-select`} className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={WithdrawalModeType.FullWithdrawal}>{t('withdrawalModes.FullWithdrawal')}</SelectItem>
            <SelectItem value={WithdrawalModeType.FixedRate}>{t('withdrawalModes.FixedRate')}</SelectItem>
            <SelectItem value={WithdrawalModeType.LevelBased}>{t('withdrawalModes.LevelBased')}</SelectItem>
            <SelectItem value={WithdrawalModeType.MemberChoice}>{t('withdrawalModes.MemberChoice')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {renderModeFields(mode, fixedRate, setFixedRate, minRate, setMinRate)}

      {/* Default tier */}
      <div className="space-y-2">
        <Label>{t('defaultTier')}</Label>
        <p className="text-xs text-muted-foreground">{t('tierSumNote')}</p>
        <div className="flex gap-3">
          <div className="space-y-1">
            <LabelWithTip className="text-xs" tip={t('help.withdrawalRate')}>{t('withdrawalRate')}</LabelWithTip>
            <Input
              type="number"
              value={wRate}
              onChange={(e) => setWRate(e.target.value)}
              placeholder="10000"
              className="w-28"
            />
          </div>
          <div className="space-y-1">
            <LabelWithTip className="text-xs" tip={t('help.repurchaseRate')}>{t('repurchaseRate')}</LabelWithTip>
            <Input
              type="number"
              value={rRate}
              onChange={(e) => setRRate(e.target.value)}
              placeholder="0"
              className="w-28"
            />
          </div>
        </div>
      </div>

      {/* Level overrides */}
      {renderOverridesEditor(overrides, setOverrides)}

      {/* Voluntary bonus rate */}
      <div className="space-y-2">
        <LabelWithTip tip={t('help.voluntaryBonusRate')}>{t('voluntaryBonusRate')}</LabelWithTip>
        <Input
          type="number"
          value={bonus}
          onChange={(e) => setBonus(e.target.value)}
          placeholder="0"
          className="w-40"
        />
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center gap-2">
        <Switch checked={enabled} onCheckedChange={setEnabledFn} />
        <Label>{t('enabled')}</Label>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button type="submit" disabled={isTxBusy(mutation)}>
          {t('updateWithdrawalConfig')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => clearMutation.mutate([entityId])}
          disabled={isTxBusy(clearMutation)}
        >
          {prefix === 'nex' ? t('clearWithdrawalConfig') : t('clearTokenWithdrawalConfig')}
        </Button>
        <TxStatusIndicator txState={mutation.txState} />
        <TxStatusIndicator txState={clearMutation.txState} />
      </div>
    </form>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">{t('withdrawalConfig')}</CardTitle>
          <CardDescription>{t('withdrawalConfigDesc')}</CardDescription>
        </div>
        {isWithdrawalPaused && (
          <Badge variant="destructive">{t('withdrawalPausedNotice')}</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pause / Resume */}
        <div className="flex items-center gap-3">
          <Button
            variant={isWithdrawalPaused ? 'default' : 'destructive'}
            size="sm"
            onClick={() => pauseWithdrawal.mutate([entityId])}
            disabled={isTxBusy(pauseWithdrawal)}
          >
            {isWithdrawalPaused ? t('resumeWithdrawal') : t('pauseWithdrawal')}
          </Button>
          <TxStatusIndicator txState={pauseWithdrawal.txState} />
        </div>

        {/* Min withdrawal interval */}
        <form onSubmit={handleSetInterval} className="flex items-end gap-3">
          <div className="space-y-2">
            <LabelWithTip tip={t('help.minWithdrawalInterval')}>{t('minWithdrawalInterval')}</LabelWithTip>
            <p className="text-xs text-muted-foreground">
              {t('minWithdrawalInterval')}: {minWithdrawalInterval} blocks
            </p>
            <Input
              type="number"
              value={intervalValue}
              onChange={(e) => setIntervalValue(e.target.value)}
              placeholder="blocks"
              className="w-40"
            />
          </div>
          <Button type="submit" disabled={isTxBusy(setMinWithdrawalInterval)}>
            {t('setMinWithdrawalInterval')}
          </Button>
          <TxStatusIndicator txState={setMinWithdrawalInterval.txState} />
        </form>

        <Separator />

        {/* NEX / Token tabs */}
        <Tabs defaultValue="nex">
          <TabsList className="mb-4">
            <TabsTrigger value="nex">{t('nexWithdrawalConfig')}</TabsTrigger>
            <TabsTrigger value="token">{t('tokenWithdrawalConfig')}</TabsTrigger>
          </TabsList>

          <TabsContent value="nex" className="space-y-4">
            {renderCurrentConfig(t('nexWithdrawalConfig'), withdrawalConfig)}
            {renderConfigForm(
              'nex',
              nexMode, setNexMode,
              nexFixedRepurchaseRate, setNexFixedRepurchaseRate,
              nexMinRepurchaseRate, setNexMinRepurchaseRate,
              nexWithdrawalRate, setNexWithdrawalRate,
              nexRepurchaseRate, setNexRepurchaseRate,
              nexVoluntaryBonus, setNexVoluntaryBonus,
              nexEnabled, setNexEnabled,
              nexOverrides, setNexOverrides,
              handleConfigureNex,
              configureWithdrawal,
              clearWithdrawalConfig,
            )}
          </TabsContent>

          <TabsContent value="token" className="space-y-4">
            {renderCurrentConfig(t('tokenWithdrawalConfig'), tokenWithdrawalConfig)}
            {renderConfigForm(
              'token',
              tokenMode, setTokenMode,
              tokenFixedRepurchaseRate, setTokenFixedRepurchaseRate,
              tokenMinRepurchaseRate, setTokenMinRepurchaseRate,
              tokenWithdrawalRate, setTokenWithdrawalRate,
              tokenRepurchaseRate, setTokenRepurchaseRate,
              tokenVoluntaryBonus, setTokenVoluntaryBonus,
              tokenEnabled, setTokenEnabled,
              tokenOverrides, setTokenOverrides,
              handleConfigureToken,
              setTokenWithdrawalConfig,
              clearTokenWithdrawalConfig,
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Withdraw Section (NEX + Token dual channel) ────────────

function WithdrawSection() {
  const t = useTranslations('commission');
  const { isWithdrawalPaused, withdrawNex, withdrawToken, coreConfig } = useCommission();
  const address = useWalletStore((s) => s.address);

  const {
    useMemberLastCredited,
    useMemberLastWithdrawn,
    useMemberTokenLastCredited,
    useMemberTokenLastWithdrawn,
  } = useCommission();

  const lastCredited = useMemberLastCredited(address);
  const lastWithdrawn = useMemberLastWithdrawn(address);
  const tokenLastCredited = useMemberTokenLastCredited(address);
  const tokenLastWithdrawn = useMemberTokenLastWithdrawn(address);

  const [nexAmount, setNexAmount] = useState('');
  const [nexRepurchaseRate, setNexRepurchaseRate] = useState('');
  const [nexRepurchaseTarget, setNexRepurchaseTarget] = useState('');

  const [tokenAmount, setTokenAmount] = useState('');
  const [tokenRepurchaseRate, setTokenRepurchaseRate] = useState('');
  const [tokenRepurchaseTarget, setTokenRepurchaseTarget] = useState('');

  const paused = isWithdrawalPaused;

  const handleWithdrawNex = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!nexAmount.trim()) return;
      withdrawNex.mutate([
        nexAmount.trim(),
        nexRepurchaseRate.trim() ? Number(nexRepurchaseRate) : null,
        nexRepurchaseTarget.trim() || null,
      ]);
      setNexAmount('');
      setNexRepurchaseRate('');
      setNexRepurchaseTarget('');
    },
    [nexAmount, nexRepurchaseRate, nexRepurchaseTarget, withdrawNex],
  );

  const handleWithdrawToken = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!tokenAmount.trim()) return;
      withdrawToken.mutate([
        tokenAmount.trim(),
        tokenRepurchaseRate.trim() ? Number(tokenRepurchaseRate) : null,
        tokenRepurchaseTarget.trim() || null,
      ]);
      setTokenAmount('');
      setTokenRepurchaseRate('');
      setTokenRepurchaseTarget('');
    },
    [tokenAmount, tokenRepurchaseRate, tokenRepurchaseTarget, withdrawToken],
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
            <div className="space-y-4">
              {/* Cooldown info */}
              <div className="rounded-md border bg-muted/50 p-3 text-xs space-y-1">
                <p>{t('lastCredited')}: <span className="font-mono">{lastCredited.data ?? 0}</span></p>
                <p>{t('withdrawalCooldown')}: <span className="font-mono">{coreConfig?.withdrawalCooldown ?? 0} blocks</span></p>
                <p>{t('lastWithdrawn')}: <span className="font-mono">{lastWithdrawn.data ?? 0}</span></p>
              </div>

              <form onSubmit={handleWithdrawNex} className="space-y-4">
                <div className="space-y-2">
                  <LabelWithTip htmlFor="nex-wd-amount" tip={t('help.withdrawAmount')}>{t('withdrawAmount')}</LabelWithTip>
                  <Input
                    id="nex-wd-amount"
                    type="text"
                    inputMode="decimal"
                    value={nexAmount}
                    onChange={(e) => setNexAmount(e.target.value)}
                    placeholder={t('withdrawAmountPlaceholder')}
                    disabled={paused}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <LabelWithTip htmlFor="nex-wd-repurchase-rate" tip={t('help.requestedRepurchaseRate')}>{t('requestedRepurchaseRate')}</LabelWithTip>
                    <Input
                      id="nex-wd-repurchase-rate"
                      type="number"
                      value={nexRepurchaseRate}
                      onChange={(e) => setNexRepurchaseRate(e.target.value)}
                      placeholder="bps"
                      disabled={paused}
                    />
                  </div>
                  <div className="space-y-2">
                    <LabelWithTip htmlFor="nex-wd-target" tip={t('help.repurchaseTarget')}>{t('repurchaseTarget')}</LabelWithTip>
                    <Input
                      id="nex-wd-target"
                      type="text"
                      value={nexRepurchaseTarget}
                      onChange={(e) => setNexRepurchaseTarget(e.target.value)}
                      placeholder="account address"
                      disabled={paused}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={paused || isTxBusy(withdrawNex)}>
                    {t('withdrawNex')}
                  </Button>
                  <TxStatusIndicator txState={withdrawNex.txState} />
                </div>
              </form>
            </div>
          </TabsContent>

          <TabsContent value="token">
            <div className="space-y-4">
              {/* Cooldown info */}
              <div className="rounded-md border bg-muted/50 p-3 text-xs space-y-1">
                <p>{t('lastCredited')}: <span className="font-mono">{tokenLastCredited.data ?? 0}</span></p>
                <p>{t('tokenWithdrawalCooldown')}: <span className="font-mono">{coreConfig?.tokenWithdrawalCooldown ?? 0} blocks</span></p>
                <p>{t('lastWithdrawn')}: <span className="font-mono">{tokenLastWithdrawn.data ?? 0}</span></p>
              </div>

              <form onSubmit={handleWithdrawToken} className="space-y-4">
                <div className="space-y-2">
                  <LabelWithTip htmlFor="token-wd-amount" tip={t('help.withdrawAmount')}>{t('withdrawAmount')}</LabelWithTip>
                  <Input
                    id="token-wd-amount"
                    type="text"
                    inputMode="decimal"
                    value={tokenAmount}
                    onChange={(e) => setTokenAmount(e.target.value)}
                    placeholder={t('withdrawAmountPlaceholder')}
                    disabled={paused}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <LabelWithTip htmlFor="token-wd-repurchase-rate" tip={t('help.requestedRepurchaseRate')}>{t('requestedRepurchaseRate')}</LabelWithTip>
                    <Input
                      id="token-wd-repurchase-rate"
                      type="number"
                      value={tokenRepurchaseRate}
                      onChange={(e) => setTokenRepurchaseRate(e.target.value)}
                      placeholder="bps"
                      disabled={paused}
                    />
                  </div>
                  <div className="space-y-2">
                    <LabelWithTip htmlFor="token-wd-target" tip={t('help.repurchaseTarget')}>{t('repurchaseTarget')}</LabelWithTip>
                    <Input
                      id="token-wd-target"
                      type="text"
                      value={tokenRepurchaseTarget}
                      onChange={(e) => setTokenRepurchaseTarget(e.target.value)}
                      placeholder="account address"
                      disabled={paused}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={paused || isTxBusy(withdrawToken)}>
                    {t('withdrawToken')}
                  </Button>
                  <TxStatusIndicator txState={withdrawToken.txState} />
                </div>
              </form>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Entity Funds Section ───────────────────────────────────

function EntityFundsSection() {
  const t = useTranslations('commission');
  const { entityId } = useEntityContext();
  const { withdrawEntityFunds, withdrawEntityTokenFunds } = useCommission();

  const [nexFundAmount, setNexFundAmount] = useState('');
  const [tokenFundAmount, setTokenFundAmount] = useState('');

  const handleWithdrawNexFunds = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!nexFundAmount.trim()) return;
      withdrawEntityFunds.mutate([entityId, nexFundAmount.trim()]);
      setNexFundAmount('');
    },
    [entityId, nexFundAmount, withdrawEntityFunds],
  );

  const handleWithdrawTokenFunds = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!tokenFundAmount.trim()) return;
      withdrawEntityTokenFunds.mutate([entityId, tokenFundAmount.trim()]);
      setTokenFundAmount('');
    },
    [entityId, tokenFundAmount, withdrawEntityTokenFunds],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('entityFunds')}</CardTitle>
        <CardDescription>{t('entityFundsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleWithdrawNexFunds} className="flex items-end gap-3">
          <div className="space-y-2">
            <LabelWithTip htmlFor="nex-fund-amount" tip={t('help.feeRate')}>{t('entityFundAmount')} (NEX)</LabelWithTip>
            <Input
              id="nex-fund-amount"
              type="text"
              inputMode="decimal"
              value={nexFundAmount}
              onChange={(e) => setNexFundAmount(e.target.value)}
              placeholder="0"
              className="w-48"
            />
          </div>
          <Button type="submit" disabled={isTxBusy(withdrawEntityFunds)}>
            {t('withdrawEntityFunds')}
          </Button>
          <TxStatusIndicator txState={withdrawEntityFunds.txState} />
        </form>

        <Separator />

        <form onSubmit={handleWithdrawTokenFunds} className="flex items-end gap-3">
          <div className="space-y-2">
            <LabelWithTip htmlFor="token-fund-amount" tip={t('help.feeRate')}>{t('entityFundAmount')} (Token)</LabelWithTip>
            <Input
              id="token-fund-amount"
              type="text"
              inputMode="decimal"
              value={tokenFundAmount}
              onChange={(e) => setTokenFundAmount(e.target.value)}
              placeholder="0"
              className="w-48"
            />
          </div>
          <Button type="submit" disabled={isTxBusy(withdrawEntityTokenFunds)}>
            {t('withdrawEntityTokenFunds')}
          </Button>
          <TxStatusIndicator txState={withdrawEntityTokenFunds.txState} />
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Governance Section ─────────────────────────────────────

function GovernanceSection() {
  const t = useTranslations('commission');
  const { entityId } = useEntityContext();
  const {
    globalMinRepurchaseRate,
    globalMinTokenRepurchaseRate,
    globalMaxCommissionRate,
    globalMaxTokenCommissionRate,
    tokenPlatformFeeRate,
    globalCommissionPaused,
    setGlobalMinRepurchaseRate,
    setGlobalMinTokenRepurchaseRate,
    setGlobalMaxCommissionRate,
    setGlobalMaxTokenCommissionRate,
    setTokenPlatformFeeRate,
    forceDisableEntityCommission,
    forceEnableEntityCommission,
    forceGlobalPause,
    retryCancelCommission,
  } = useCommission();

  const [minRepRate, setMinRepRate] = useState('');
  const [minTokenRepRate, setMinTokenRepRate] = useState('');
  const [maxCommRate, setMaxCommRate] = useState('');
  const [maxTokenCommRate, setMaxTokenCommRate] = useState('');
  const [platFeeRate, setPlatFeeRate] = useState('');
  const [forceEntityId, setForceEntityId] = useState('');
  const [retryEntityId, setRetryEntityId] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('governance')}</CardTitle>
        <CardDescription>{t('governanceDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current global values */}
        <div className="rounded-md border bg-muted/50 p-4 space-y-2">
          <p className="text-sm font-medium">{t('currentGlobalValues')}</p>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground">{t('globalMinRepurchaseRate')}</p>
              <p className="font-mono font-medium">{globalMinRepurchaseRate}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('globalMinTokenRepurchaseRate')}</p>
              <p className="font-mono font-medium">{globalMinTokenRepurchaseRate}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('globalMaxCommissionRate')}</p>
              <p className="font-mono font-medium">{globalMaxCommissionRate}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('globalMaxTokenCommissionRate')}</p>
              <p className="font-mono font-medium">{globalMaxTokenCommissionRate}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('tokenPlatformFeeRate')}</p>
              <p className="font-mono font-medium">{tokenPlatformFeeRate}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('forceGlobalPause')}</p>
              <Badge variant={globalCommissionPaused ? 'destructive' : 'success'}>
                {globalCommissionPaused ? 'Paused' : 'Active'}
              </Badge>
            </div>
          </div>
        </div>

        <Separator />

        {/* Global min repurchase rate (NEX) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!minRepRate.trim()) return;
            setGlobalMinRepurchaseRate.mutate([Number(minRepRate)]);
            setMinRepRate('');
          }}
          className="flex items-end gap-3"
        >
          <div className="space-y-2">
            <Label>{t('globalMinRepurchaseRate')}</Label>
            <Input
              type="number"
              value={minRepRate}
              onChange={(e) => setMinRepRate(e.target.value)}
              placeholder="bps"
              className="w-40"
            />
          </div>
          <Button type="submit" size="sm" disabled={isTxBusy(setGlobalMinRepurchaseRate)}>
            {t('setRate')}
          </Button>
          <TxStatusIndicator txState={setGlobalMinRepurchaseRate.txState} />
        </form>

        {/* Global min token repurchase rate */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!minTokenRepRate.trim()) return;
            setGlobalMinTokenRepurchaseRate.mutate([Number(minTokenRepRate)]);
            setMinTokenRepRate('');
          }}
          className="flex items-end gap-3"
        >
          <div className="space-y-2">
            <Label>{t('globalMinTokenRepurchaseRate')}</Label>
            <Input
              type="number"
              value={minTokenRepRate}
              onChange={(e) => setMinTokenRepRate(e.target.value)}
              placeholder="bps"
              className="w-40"
            />
          </div>
          <Button type="submit" size="sm" disabled={isTxBusy(setGlobalMinTokenRepurchaseRate)}>
            {t('setRate')}
          </Button>
          <TxStatusIndicator txState={setGlobalMinTokenRepurchaseRate.txState} />
        </form>

        {/* Global max commission rate (NEX) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!maxCommRate.trim()) return;
            setGlobalMaxCommissionRate.mutate([Number(maxCommRate)]);
            setMaxCommRate('');
          }}
          className="flex items-end gap-3"
        >
          <div className="space-y-2">
            <Label>{t('globalMaxCommissionRate')}</Label>
            <Input
              type="number"
              value={maxCommRate}
              onChange={(e) => setMaxCommRate(e.target.value)}
              placeholder="bps"
              className="w-40"
            />
          </div>
          <Button type="submit" size="sm" disabled={isTxBusy(setGlobalMaxCommissionRate)}>
            {t('setRate')}
          </Button>
          <TxStatusIndicator txState={setGlobalMaxCommissionRate.txState} />
        </form>

        {/* Global max token commission rate */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!maxTokenCommRate.trim()) return;
            setGlobalMaxTokenCommissionRate.mutate([Number(maxTokenCommRate)]);
            setMaxTokenCommRate('');
          }}
          className="flex items-end gap-3"
        >
          <div className="space-y-2">
            <Label>{t('globalMaxTokenCommissionRate')}</Label>
            <Input
              type="number"
              value={maxTokenCommRate}
              onChange={(e) => setMaxTokenCommRate(e.target.value)}
              placeholder="bps"
              className="w-40"
            />
          </div>
          <Button type="submit" size="sm" disabled={isTxBusy(setGlobalMaxTokenCommissionRate)}>
            {t('setRate')}
          </Button>
          <TxStatusIndicator txState={setGlobalMaxTokenCommissionRate.txState} />
        </form>

        {/* Token platform fee rate */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!platFeeRate.trim()) return;
            setTokenPlatformFeeRate.mutate([Number(platFeeRate)]);
            setPlatFeeRate('');
          }}
          className="flex items-end gap-3"
        >
          <div className="space-y-2">
            <Label>{t('tokenPlatformFeeRate')}</Label>
            <Input
              type="number"
              value={platFeeRate}
              onChange={(e) => setPlatFeeRate(e.target.value)}
              placeholder="bps"
              className="w-40"
            />
          </div>
          <Button type="submit" size="sm" disabled={isTxBusy(setTokenPlatformFeeRate)}>
            {t('setRate')}
          </Button>
          <TxStatusIndicator txState={setTokenPlatformFeeRate.txState} />
        </form>

        <Separator />

        {/* Force disable / enable entity commission */}
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="space-y-2">
              <Label>Entity ID</Label>
              <Input
                type="number"
                value={forceEntityId}
                onChange={(e) => setForceEntityId(e.target.value)}
                placeholder={String(entityId)}
                className="w-32"
              />
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                const eid = Number(forceEntityId) || entityId;
                forceDisableEntityCommission.mutate([eid]);
              }}
              disabled={isTxBusy(forceDisableEntityCommission)}
            >
              {t('forceDisableEntity')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const eid = Number(forceEntityId) || entityId;
                forceEnableEntityCommission.mutate([eid]);
              }}
              disabled={isTxBusy(forceEnableEntityCommission)}
            >
              {t('forceEnableEntity')}
            </Button>
          </div>
          <div className="flex gap-2">
            <TxStatusIndicator txState={forceDisableEntityCommission.txState} />
            <TxStatusIndicator txState={forceEnableEntityCommission.txState} />
          </div>
        </div>

        <Separator />

        {/* Force global pause */}
        <div className="flex items-center gap-3">
          <Button
            variant={globalCommissionPaused ? 'default' : 'destructive'}
            size="sm"
            onClick={() => forceGlobalPause.mutate([!globalCommissionPaused])}
            disabled={isTxBusy(forceGlobalPause)}
          >
            {t('forceGlobalPause')}: {globalCommissionPaused ? 'Resume' : 'Pause'}
          </Button>
          <TxStatusIndicator txState={forceGlobalPause.txState} />
        </div>

        <Separator />

        {/* Retry cancel commission */}
        <div className="flex items-end gap-3">
          <div className="space-y-2">
            <Label>Entity ID</Label>
            <Input
              type="number"
              value={retryEntityId}
              onChange={(e) => setRetryEntityId(e.target.value)}
              placeholder={String(entityId)}
              className="w-32"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              const eid = Number(retryEntityId) || entityId;
              retryCancelCommission.mutate([eid]);
            }}
            disabled={isTxBusy(retryCancelCommission)}
          >
            {t('retryCancelCommission')}
          </Button>
          <TxStatusIndicator txState={retryCancelCommission.txState} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Maintenance Section ────────────────────────────────────

function MaintenanceSection() {
  const t = useTranslations('commission');
  const { entityId } = useEntityContext();
  const { archiveOrderRecords } = useCommission();

  const [archiveOrderId, setArchiveOrderId] = useState('');

  const handleArchive = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!archiveOrderId.trim()) return;
      archiveOrderRecords.mutate([entityId, Number(archiveOrderId)]);
      setArchiveOrderId('');
    },
    [entityId, archiveOrderId, archiveOrderRecords],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('maintenance')}</CardTitle>
        <CardDescription>{t('maintenanceDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleArchive} className="flex items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="archive-order-id">{t('archiveOrderId')}</Label>
            <Input
              id="archive-order-id"
              type="number"
              value={archiveOrderId}
              onChange={(e) => setArchiveOrderId(e.target.value)}
              placeholder="Order ID"
              className="w-40"
            />
          </div>
          <Button type="submit" disabled={isTxBusy(archiveOrderRecords)}>
            {t('archiveOrderRecords')}
          </Button>
          <TxStatusIndicator txState={archiveOrderRecords.txState} />
        </form>
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
                  <TableCell>{formatNex(oc.amount)} NEX</TableCell>
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
      <EntityStatsSection />
      <MemberStatsSection />

      <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
        <PluginSection />
        <WithdrawalConfigSection />
      </PermissionGuard>

      <WithdrawSection />
      <OrderCommissionsSection />

      <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
        <EntityFundsSection />
        <GovernanceSection />
        <MaintenanceSection />
      </PermissionGuard>
    </div>
  );
}
