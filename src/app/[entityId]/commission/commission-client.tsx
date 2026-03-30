'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import type { TxState, PluginBudgetCaps } from '@/lib/types/models';
import { CommissionPlugin, WithdrawalModeType } from '@/lib/types/enums';
import { useCommission } from '@/hooks/use-commission';
import { useReferralCommission } from '@/hooks/use-referral-commission';
import { useMultiLevelCommission } from '@/hooks/use-multi-level-commission';
import { useLevelDiffCommission } from '@/hooks/use-level-diff-commission';
import { useSingleLineCommission } from '@/hooks/use-single-line-commission';
import { useTeamCommission } from '@/hooks/use-team-commission';
import { usePoolRewardCommission } from '@/hooks/use-pool-reward-commission';
import { useMembers } from '@/hooks/use-members';
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
import { useTxLock, isTxBusy } from '@/hooks/use-tx-lock';

// ─── Helpers ────────────────────────────────────────────────

const PLUGIN_LIST: { key: CommissionPlugin; bit: number; route: string }[] = [
  { key: CommissionPlugin.Referral, bit: 0x071, route: 'referral' },       // DIRECT_REWARD|FIXED_AMOUNT|FIRST_ORDER|REPEAT_PURCHASE
  { key: CommissionPlugin.MultiLevel, bit: 0x002, route: 'multilevel' },
  { key: CommissionPlugin.LevelDiff, bit: 0x008, route: 'leveldiff' },
  { key: CommissionPlugin.SingleLine, bit: 0x180, route: 'singleline' },   // SINGLE_LINE_UPLINE|SINGLE_LINE_DOWNLINE
  { key: CommissionPlugin.Team, bit: 0x004, route: 'team' },
  { key: CommissionPlugin.PoolReward, bit: 0x200, route: 'poolreward' },
  { key: CommissionPlugin.OwnerReward, bit: 0x400, route: '' },           // OWNER_REWARD — no sub-page
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
    isWithdrawalPaused,
    globalCommissionPaused,
    enableCommission,
    setCommissionRate,
    setOwnerRewardRate,
    setWithdrawalCooldown,
  } = useCommission();

  const { isLocked, setLocked } = useTxLock();
  const localBusy = isTxBusy(enableCommission) || isTxBusy(setCommissionRate) || isTxBusy(setOwnerRewardRate) || isTxBusy(setWithdrawalCooldown);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  const [rate, setRate] = useState('');
  const [ownerRate, setOwnerRate] = useState('');
  const [cooldownNex, setCooldownNex] = useState('');
  const [cooldownToken, setCooldownToken] = useState('');

  const handleSetRate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked || !rate.trim()) return;
      setCommissionRate.mutate([entityId, Number(rate)]);
      setRate('');
    },
    [entityId, rate, setCommissionRate, isLocked],
  );

  const handleSetCreatorRate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked || !ownerRate.trim()) return;
      setOwnerRewardRate.mutate([entityId, Number(ownerRate)]);
      setOwnerRate('');
    },
    [entityId, ownerRate, setOwnerRewardRate, isLocked],
  );

  const handleSetCooldown = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked) return;
      const nex = cooldownNex.trim() ? Number(cooldownNex) : null;
      const token = cooldownToken.trim() ? Number(cooldownToken) : null;
      if (nex === null && token === null) return;
      // Pallet accepts both values in a single call; use current chain value for omitted field
      const nexVal = nex ?? (coreConfig?.withdrawalCooldown ?? 0);
      const tokenVal = token ?? (coreConfig?.tokenWithdrawalCooldown ?? 0);
      setWithdrawalCooldown.mutate([entityId, nexVal, tokenVal]);
      setCooldownNex('');
      setCooldownToken('');
    },
    [entityId, cooldownNex, cooldownToken, setWithdrawalCooldown, isLocked, coreConfig],
  );

  const enabledModes = coreConfig?.enabledModes ?? 0;

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
            <p className="text-xs text-muted-foreground">{t('ownerRewardRate')}</p>
            <p className="text-sm font-medium">{bpsDisplay(coreConfig?.ownerRewardRate ?? 0)}</p>
          </div>

          {/* Enabled modes (hex) */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('enabledModes')}</p>
            <p className="font-mono text-sm font-medium">
              {enabledModes}
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
            <Badge variant={isWithdrawalPaused ? 'destructive' : 'success'}>
              {isWithdrawalPaused ? t('withdrawalPaused') : t('withdrawalNormal')}
            </Badge>
          </div>

          {/* Base rate (legacy) */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('baseRate')}</p>
            <p className="text-sm font-medium">{coreConfig?.maxCommissionRate ?? 0}</p>
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
              onClick={() => { if (!isLocked) enableCommission.mutate([entityId, !coreConfig?.enabled]); }}
              disabled={isLocked}
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
            <Button type="submit" disabled={isLocked}>
              {t('setRate')}
            </Button>
            <TxStatusIndicator txState={setCommissionRate.txState} />
          </form>

          {/* Set creator reward rate */}
          <form onSubmit={handleSetCreatorRate} className="flex items-end gap-3">
            <div className="space-y-2">
              <LabelWithTip htmlFor="owner-rate-input" tip={t('help.ownerRewardRate')}>{t('ownerRewardRate')}</LabelWithTip>
              <Input
                id="owner-rate-input"
                type="number"
                value={ownerRate}
                onChange={(e) => setOwnerRate(e.target.value)}
                placeholder="bps"
                className="w-40"
              />
            </div>
            <Button type="submit" disabled={isLocked}>
              {t('setOwnerRewardRate')}
            </Button>
            <TxStatusIndicator txState={setOwnerRewardRate.txState} />
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
            <Button type="submit" disabled={isLocked}>
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

type PluginCapKey = 'referralCap' | 'multiLevelCap' | 'levelDiffCap' | 'singleLineCap' | 'teamCap';

const PLUGIN_CAP_MAP: Record<string, PluginCapKey | null> = {
  [CommissionPlugin.Referral]: 'referralCap',
  [CommissionPlugin.MultiLevel]: 'multiLevelCap',
  [CommissionPlugin.LevelDiff]: 'levelDiffCap',
  [CommissionPlugin.SingleLine]: 'singleLineCap',
  [CommissionPlugin.Team]: 'teamCap',
  [CommissionPlugin.PoolReward]: null,
  [CommissionPlugin.OwnerReward]: null,
};

function PluginSection() {
  const t = useTranslations('commission');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const { coreConfig, setCommissionModes, setPluginBudgetCaps } = useCommission();
  const enabledModes = coreConfig?.enabledModes ?? 0;

  const { isLocked, setLocked } = useTxLock();
  const localBusy = isTxBusy(setCommissionModes) || isTxBusy(setPluginBudgetCaps);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  // Budget caps local state - initialized from chain
  const [caps, setCaps] = useState<Record<PluginCapKey, string>>({
    referralCap: '',
    multiLevelCap: '',
    levelDiffCap: '',
    singleLineCap: '',
    teamCap: '',
  });
  useEffect(() => {
    const bc = coreConfig?.pluginBudgetCaps;
    if (bc) {
      setCaps({
        referralCap: bc.referralCap > 0 ? String(bc.referralCap) : '',
        multiLevelCap: bc.multiLevelCap > 0 ? String(bc.multiLevelCap) : '',
        levelDiffCap: bc.levelDiffCap > 0 ? String(bc.levelDiffCap) : '',
        singleLineCap: bc.singleLineCap > 0 ? String(bc.singleLineCap) : '',
        teamCap: bc.teamCap > 0 ? String(bc.teamCap) : '',
      });
    }
  }, [coreConfig?.pluginBudgetCaps]);

  const handleToggle = useCallback(
    (_plugin: CommissionPlugin, bit: number) => {
      if (isLocked) return;
      const newModes = enabledModes ^ bit;
      setCommissionModes.mutate([entityId, newModes]);
    },
    [entityId, enabledModes, setCommissionModes, isLocked],
  );

  const handleSaveCaps = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked) return;
      setPluginBudgetCaps.mutate([
        entityId,
        {
          referralCap: Number(caps.referralCap) || 0,
          multiLevelCap: Number(caps.multiLevelCap) || 0,
          levelDiffCap: Number(caps.levelDiffCap) || 0,
          singleLineCap: Number(caps.singleLineCap) || 0,
          teamCap: Number(caps.teamCap) || 0,
        },
      ]);
    },
    [entityId, caps, setPluginBudgetCaps, isLocked],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('pluginConfig')}</CardTitle>
        <CardDescription>{t('pluginConfigDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSaveCaps}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PLUGIN_LIST.map(({ key, bit, route }) => {
              const isEnabled = (enabledModes & bit) !== 0;
              const capKey = PLUGIN_CAP_MAP[key];
              const capValue = capKey ? caps[capKey] : '';
              const chainCap = capKey ? (coreConfig?.pluginBudgetCaps?.[capKey] ?? 0) : 0;
              return (
                <Card key={key} className={`shadow-none transition-colors ${isEnabled ? 'border-primary/40 bg-primary/5' : 'opacity-60'}`}>
                  <CardContent className="space-y-3 p-4">
                    {/* Header row: name + toggle */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{te(`commissionPlugin.${key}`)}</p>
                        <p className="text-xs text-muted-foreground">{key}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {route && (
                          <Link href={`/${entityId}/commission/${route}`}>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                              {tc('viewDetails')}
                            </Button>
                          </Link>
                        )}
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => handleToggle(key, bit)}
                          disabled={isLocked}
                        />
                      </div>
                    </div>

                    {/* Budget cap input */}
                    {isEnabled && capKey && (
                      <div className="space-y-1.5">
                        <LabelWithTip htmlFor={`cap-${capKey}`} tip={t('help.pluginBudgetCap')}>
                          {t('pluginBudgetCap')}
                        </LabelWithTip>
                        <div className="flex items-center gap-2">
                          <Input
                            id={`cap-${capKey}`}
                            type="number"
                            min={0}
                            max={10000}
                            value={capValue}
                            onChange={(e) => setCaps((prev) => ({ ...prev, [capKey]: e.target.value }))}
                            placeholder={t('noCap')}
                            className="h-8 text-sm"
                          />
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {capValue && Number(capValue) > 0
                              ? `${(Number(capValue) / 100).toFixed(2)}%`
                              : t('noCap')}
                          </span>
                        </div>
                        {chainCap > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {t('current')}: {bpsDisplay(chainCap)}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" disabled={isLocked}>
              {t('saveBudgetCaps')}
            </Button>
            <TxStatusIndicator txState={setPluginBudgetCaps.txState} />
          </div>
        </form>
      </CardContent>
      <CardFooter className="gap-3">
        <TxStatusIndicator txState={setCommissionModes.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Commission Preview Section ─────────────────────────────

function CommissionPreviewSection() {
  const t = useTranslations('commission');
  const te = useTranslations('enums');
  const { coreConfig } = useCommission();
  const referral = useReferralCommission();
  const multiLevel = useMultiLevelCommission();
  const levelDiff = useLevelDiffCommission();
  const singleLine = useSingleLineCommission();
  const team = useTeamCommission();
  const poolReward = usePoolRewardCommission();

  const [orderAmount, setOrderAmount] = useState('10000');
  const enabledModes = coreConfig?.enabledModes ?? 0;
  const maxRate = coreConfig?.maxCommissionRate ?? 0;
  const ownerRate = coreConfig?.ownerRewardRate ?? 0;
  const budgetCaps = coreConfig?.pluginBudgetCaps;

  const amount = Number(orderAmount) || 0;

  // Compute Pool B
  const poolB = amount * maxRate / 10000;
  const ownerReward = poolB * ownerRate / 10000;
  const pluginBudget = poolB - ownerReward;

  // Plugin info with caps
  type PluginPreviewInfo = {
    key: CommissionPlugin;
    bit: number;
    capKey: PluginCapKey | null;
    cap: number;
    budget: number;
    rates: { label: string; value: string }[];
    theoreticalMax: number;
  };

  const pluginInfos: PluginPreviewInfo[] = [];
  let usedBudget = 0;

  // Build plugin info for each enabled plugin
  for (const { key, bit } of PLUGIN_LIST) {
    if ((enabledModes & bit) === 0) continue;
    const capKey = PLUGIN_CAP_MAP[key];
    const capBps = capKey ? (budgetCaps?.[capKey] ?? 0) : 0;
    const capAmount = capBps > 0 ? amount * capBps / 10000 : pluginBudget;
    const effectiveBudget = Math.min(pluginBudget - usedBudget, capAmount);
    const rates: { label: string; value: string }[] = [];
    let theoreticalMax = 0;

    switch (key) {
      case CommissionPlugin.Referral: {
        const rc = referral.config;
        if (rc) {
          if (rc.rewardRate > 0) {
            rates.push({ label: t('directRewardRate'), value: bpsDisplay(rc.rewardRate) });
            theoreticalMax += amount * rc.rewardRate / 10000;
          }
        }
        break;
      }
      case CommissionPlugin.MultiLevel: {
        const mc = multiLevel.config;
        if (mc) {
          mc.levels.forEach((tier, i) => {
            rates.push({ label: `L${i}`, value: bpsDisplay(tier.rate) });
            rates.push({ label: `L${i} directs`, value: String(tier.requiredDirects) });
            rates.push({ label: `L${i} team`, value: String(tier.requiredTeamSize) });
            rates.push({ label: `L${i} spend`, value: String(tier.requiredSpent) });
            rates.push({ label: `L${i} level`, value: String(tier.requiredLevelId) });
            theoreticalMax += amount * tier.rate / 10000;
          });
        }
        break;
      }
      case CommissionPlugin.LevelDiff: {
        const ldc = levelDiff.config;
        if (ldc) {
          ldc.levelRates.forEach((rate, i) => {
            rates.push({ label: `L${i}`, value: bpsDisplay(rate) });
          });
          // Level diff uses differential: max payout = highest level rate
          const maxLevelRate = ldc.levelRates.length > 0
            ? Math.max(...ldc.levelRates)
            : 0;
          theoreticalMax = amount * maxLevelRate / 10000;
        }
        break;
      }
      case CommissionPlugin.SingleLine: {
        const slc = singleLine.config;
        if (slc) {
          rates.push({ label: t('uplineRate'), value: bpsDisplay(slc.uplineRate) });
          rates.push({ label: t('downlineRate'), value: bpsDisplay(slc.downlineRate) });
          rates.push({ label: t('uplineLevels'), value: `${slc.baseUplineLevels} (max ${slc.maxUplineLevels})` });
          rates.push({ label: t('downlineLevels'), value: `${slc.baseDownlineLevels} (max ${slc.maxDownlineLevels})` });
          theoreticalMax = amount * (slc.uplineRate * slc.maxUplineLevels + slc.downlineRate * slc.maxDownlineLevels) / 10000;
        }
        break;
      }
      case CommissionPlugin.Team: {
        const tc2 = team.config;
        if (tc2) {
          tc2.tiers.forEach((tier, i) => {
            rates.push({
              label: `Tier ${i}`,
              value: `${bpsDisplay(tier.rate)} (${t('minTeamSize')}: ${tier.minTeamSize})`,
            });
          });
          // Highest tier rate is theoretical max
          const maxTierRate = tc2.tiers.length > 0
            ? Math.max(...tc2.tiers.map((tier) => tier.rate))
            : 0;
          theoreticalMax = amount * maxTierRate / 10000;
        }
        break;
      }
      case CommissionPlugin.PoolReward: {
        const prc = poolReward.config;
        if (prc) {
          prc.levelRules.forEach(([level, rule]) => {
            rates.push({ label: `${t('levelRatio')} L${level}`, value: `${rule.baseCapPercent / 100}%` });
            rates.push({ label: `${t('capBehavior')} L${level}`, value: rule.capBehavior.type });
            if (rule.capBehavior.type === 'UnlockByTeam') {
              rates.push({ label: `${t('directPerUnlock')} L${level}`, value: String(rule.capBehavior.directPerUnlock) });
              rates.push({ label: `${t('teamPerUnlock')} L${level}`, value: String(rule.capBehavior.teamPerUnlock) });
              rates.push({ label: `${t('unlockPercent')} L${level}`, value: `${rule.capBehavior.unlockPercent / 100}%` });
            }
          });
          if (prc.roundDuration > 0) {
            rates.push({ label: t('roundDuration'), value: `${prc.roundDuration} blocks` });
          }
          theoreticalMax = effectiveBudget;
        }
        break;
      }
    }

    const finalBudget = Math.min(effectiveBudget, theoreticalMax > 0 ? theoreticalMax : effectiveBudget);
    usedBudget += capBps > 0 ? Math.min(capAmount, pluginBudget) : 0;

    pluginInfos.push({
      key,
      bit,
      capKey,
      cap: capBps,
      budget: finalBudget,
      rates,
      theoreticalMax,
    });
  }

  const totalPluginUsed = pluginInfos.reduce((sum, p) => sum + p.budget, 0);
  const unallocated = pluginBudget - totalPluginUsed;

  // Colors for the visual bar
  const BAR_COLORS = [
    'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
    'bg-purple-500', 'bg-pink-500', 'bg-orange-500',
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('commissionPreview')}</CardTitle>
        <CardDescription>{t('commissionPreviewDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input */}
        <div className="flex items-end gap-3">
          <div className="space-y-2">
            <LabelWithTip htmlFor="preview-amount" tip={t('help.simulatedOrderAmount')}>
              {t('simulatedOrderAmount')}
            </LabelWithTip>
            <Input
              id="preview-amount"
              type="number"
              min={0}
              value={orderAmount}
              onChange={(e) => setOrderAmount(e.target.value)}
              placeholder="10000"
              className="w-48"
            />
          </div>
        </div>

        {amount > 0 && (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="shadow-none">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">{t('effectiveRate')}</p>
                  <p className="text-lg font-semibold">{(maxRate / 100).toFixed(2)}%</p>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">{t('poolBTotal')}</p>
                  <p className="text-lg font-semibold">{poolB.toFixed(2)} USDT</p>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">{t('ownerReward')} ({(ownerRate / 100).toFixed(1)}%)</p>
                  <p className="text-lg font-semibold">{ownerReward.toFixed(2)} USDT</p>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">{t('pluginBudget')}</p>
                  <p className="text-lg font-semibold">{pluginBudget.toFixed(2)} USDT</p>
                </CardContent>
              </Card>
            </div>

            {/* Visual budget bar */}
            {pluginInfos.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{t('rateBreakdown')}</p>
                <div className="flex h-6 w-full overflow-hidden rounded-md">
                  {/* Creator portion */}
                  {ownerReward > 0 && (
                    <div
                      className="bg-slate-400 flex items-center justify-center text-[10px] text-white"
                      style={{ width: `${(ownerReward / poolB) * 100}%` }}
                      title={`Owner: ${ownerReward.toFixed(2)}`}
                    />
                  )}
                  {pluginInfos.map((p, i) => {
                    const pct = poolB > 0 ? (p.budget / poolB) * 100 : 0;
                    if (pct < 0.5) return null;
                    return (
                      <div
                        key={p.key}
                        className={`${BAR_COLORS[i % BAR_COLORS.length]} flex items-center justify-center text-[10px] text-white`}
                        style={{ width: `${pct}%` }}
                        title={`${p.key}: ${p.budget.toFixed(2)}`}
                      />
                    );
                  })}
                  {unallocated > 0 && (
                    <div
                      className="bg-muted flex items-center justify-center text-[10px] text-muted-foreground"
                      style={{ width: `${(unallocated / poolB) * 100}%` }}
                      title={`Unallocated: ${unallocated.toFixed(2)}`}
                    />
                  )}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-400" />
                    Creator
                  </span>
                  {pluginInfos.map((p, i) => (
                    <span key={p.key} className="flex items-center gap-1">
                      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${BAR_COLORS[i % BAR_COLORS.length]}`} />
                      {te(`commissionPlugin.${p.key}`)}
                    </span>
                  ))}
                  {unallocated > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted border" />
                      {t('unallocatedToPool')}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Plugin detail breakdown */}
            {pluginInfos.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noPluginsEnabled')}</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">{t('pluginDetail')}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Plugin</TableHead>
                      <TableHead>{t('budgetCap')}</TableHead>
                      <TableHead>{t('theoreticalMax')}</TableHead>
                      <TableHead>{t('rateBreakdown')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pluginInfos.map((p) => (
                      <TableRow key={p.key}>
                        <TableCell className="font-medium">
                          {te(`commissionPlugin.${p.key}`)}
                        </TableCell>
                        <TableCell>
                          {p.cap > 0 ? (
                            <span>{bpsDisplay(p.cap)} = {(amount * p.cap / 10000).toFixed(2)} USDT</span>
                          ) : (
                            <span className="text-muted-foreground">{t('noCap')}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {p.theoreticalMax > 0 ? `${p.theoreticalMax.toFixed(2)} USDT` : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            {p.rates.map((r, i) => (
                              <div key={i} className="text-xs">
                                <span className="text-muted-foreground">{r.label}: </span>
                                <span className="font-mono">{r.value}</span>
                              </div>
                            ))}
                            {p.rates.length === 0 && (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Unallocated row */}
                    {unallocated > 0 && (
                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">
                          {t('unallocatedToPool')}
                        </TableCell>
                        <TableCell colSpan={3}>
                          {unallocated.toFixed(2)} USDT ({(unallocated / poolB * 100).toFixed(1)}%)
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Note */}
            <p className="text-xs text-muted-foreground italic">
              {t('previewNote')}
            </p>
          </>
        )}
      </CardContent>
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
  const { customLevels } = useMembers();

  const { isLocked, setLocked } = useTxLock();
  const localBusy = isTxBusy(configureWithdrawal) || isTxBusy(setTokenWithdrawalConfig) || isTxBusy(pauseWithdrawal) || isTxBusy(clearWithdrawalConfig) || isTxBusy(clearTokenWithdrawalConfig) || isTxBusy(setMinWithdrawalInterval);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

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

  // Pre-populate NEX form from chain state
  const nexSyncRef = useRef<string | null>(null);
  useEffect(() => {
    console.log('[WithdrawalConfig] NEX sync effect, withdrawalConfig:', withdrawalConfig);
    if (!withdrawalConfig) return;
    const key = JSON.stringify(withdrawalConfig);
    if (nexSyncRef.current === key) return;
    nexSyncRef.current = key;
    console.log('[WithdrawalConfig] Syncing NEX form, mode:', withdrawalConfig.mode.type, 'overrides:', withdrawalConfig.levelOverrides.length);
    setNexMode(withdrawalConfig.mode.type as WithdrawalModeType);
    if (withdrawalConfig.mode.type === 'FixedRate') setNexFixedRepurchaseRate(String(withdrawalConfig.mode.repurchaseRate));
    if (withdrawalConfig.mode.type === 'MemberChoice') setNexMinRepurchaseRate(String(withdrawalConfig.mode.minRepurchaseRate));
    setNexWithdrawalRate(String(withdrawalConfig.defaultTier.withdrawalRate));
    setNexRepurchaseRate(String(withdrawalConfig.defaultTier.repurchaseRate));
    setNexVoluntaryBonus(String(withdrawalConfig.voluntaryBonusRate));
    setNexEnabled(withdrawalConfig.enabled);
    setNexOverrides(
      withdrawalConfig.levelOverrides.map(([lv, tier]) => ({
        level: String(lv),
        withdrawalRate: String(tier.withdrawalRate),
        repurchaseRate: String(tier.repurchaseRate),
      })),
    );
  }, [withdrawalConfig]);

  // Pre-populate Token form from chain state
  const tokenSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tokenWithdrawalConfig) return;
    const key = JSON.stringify(tokenWithdrawalConfig);
    if (tokenSyncRef.current === key) return;
    tokenSyncRef.current = key;
    setTokenMode(tokenWithdrawalConfig.mode.type as WithdrawalModeType);
    if (tokenWithdrawalConfig.mode.type === 'FixedRate') setTokenFixedRepurchaseRate(String(tokenWithdrawalConfig.mode.repurchaseRate));
    if (tokenWithdrawalConfig.mode.type === 'MemberChoice') setTokenMinRepurchaseRate(String(tokenWithdrawalConfig.mode.minRepurchaseRate));
    setTokenWithdrawalRate(String(tokenWithdrawalConfig.defaultTier.withdrawalRate));
    setTokenRepurchaseRate(String(tokenWithdrawalConfig.defaultTier.repurchaseRate));
    setTokenVoluntaryBonus(String(tokenWithdrawalConfig.voluntaryBonusRate));
    setTokenEnabled(tokenWithdrawalConfig.enabled);
    setTokenOverrides(
      tokenWithdrawalConfig.levelOverrides.map(([lv, tier]) => ({
        level: String(lv),
        withdrawalRate: String(tier.withdrawalRate),
        repurchaseRate: String(tier.repurchaseRate),
      })),
    );
  }, [tokenWithdrawalConfig]);

  // Min withdrawal interval
  const [intervalValue, setIntervalValue] = useState('');

  // Pre-populate interval from chain state
  const intervalSyncRef = useRef(false);
  useEffect(() => {
    if (intervalSyncRef.current) return;
    if (minWithdrawalInterval === undefined || minWithdrawalInterval === null) return;
    intervalSyncRef.current = true;
    setIntervalValue(String(minWithdrawalInterval));
  }, [minWithdrawalInterval]);

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
      if (isLocked) return;
      configureWithdrawal.mutate([
        entityId,
        buildWithdrawalMode(nexMode, nexFixedRepurchaseRate, nexMinRepurchaseRate),
        { withdrawalRate: Number(nexWithdrawalRate) || 10000, repurchaseRate: Number(nexRepurchaseRate) || 0 },
        buildOverrides(nexOverrides),
        Number(nexVoluntaryBonus) || 0,
        nexEnabled,
      ]);
    },
    [entityId, nexMode, nexFixedRepurchaseRate, nexMinRepurchaseRate, nexWithdrawalRate, nexRepurchaseRate, nexOverrides, nexVoluntaryBonus, nexEnabled, configureWithdrawal, isLocked],
  );

  const handleConfigureToken = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked) return;
      setTokenWithdrawalConfig.mutate([
        entityId,
        buildWithdrawalMode(tokenMode, tokenFixedRepurchaseRate, tokenMinRepurchaseRate),
        { withdrawalRate: Number(tokenWithdrawalRate) || 10000, repurchaseRate: Number(tokenRepurchaseRate) || 0 },
        buildOverrides(tokenOverrides),
        Number(tokenVoluntaryBonus) || 0,
        tokenEnabled,
      ]);
    },
    [entityId, tokenMode, tokenFixedRepurchaseRate, tokenMinRepurchaseRate, tokenWithdrawalRate, tokenRepurchaseRate, tokenOverrides, tokenVoluntaryBonus, tokenEnabled, setTokenWithdrawalConfig, isLocked],
  );

  const handleSetInterval = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked || !intervalValue.trim()) return;
      setMinWithdrawalInterval.mutate([entityId, Number(intervalValue)]);
    },
    [entityId, intervalValue, setMinWithdrawalInterval, isLocked],
  );

  const renderCurrentConfig = (label: string, cfg: ReturnType<typeof useCommission>['withdrawalConfig']) => {
    if (!cfg) return null;
    return (
      <div className="rounded-md border bg-muted/50 p-3 space-y-1 text-sm">
        <p className="font-medium">{label}</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <span className="text-muted-foreground">{t('withdrawalMode')}:</span>
          <span>{t(`withdrawalMode${cfg.mode.type}`)}{cfg.mode.type === 'FixedRate' ? ` (${cfg.mode.repurchaseRate})` : ''}{cfg.mode.type === 'MemberChoice' ? ` (min: ${cfg.mode.minRepurchaseRate})` : ''}</span>
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
  ) => {
    // level IDs already used in current overrides
    const usedLevelIds = new Set(overrides.map((o) => Number(o.level)).filter(Boolean));
    // available levels to add (not yet used)
    const availableLevels = customLevels.filter((lv) => !usedLevelIds.has(lv.id));

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('levelOverrides')}</Label>
          {customLevels.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={availableLevels.length === 0}
              onClick={() => {
                const next = availableLevels[0];
                if (next) setOverrides([...overrides, { level: String(next.id), withdrawalRate: '', repurchaseRate: '' }]);
              }}
            >
              {t('addOverride')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOverrides([...overrides, { level: '', withdrawalRate: '', repurchaseRate: '' }])}
            >
              {t('addOverride')}
            </Button>
          )}
        </div>
        {customLevels.length === 0 && overrides.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('noCustomLevelsHint')}</p>
        )}
        {overrides.map((o, idx) => {
          const wVal = Number(o.withdrawalRate) || 0;
          const rVal = Number(o.repurchaseRate) || 0;
          const sum = wVal + rVal;
          const sumValid = o.withdrawalRate === '' && o.repurchaseRate === '' ? true : sum === 10000;
          return (
          <div key={idx} className="space-y-1">
            <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Level</Label>
              {customLevels.length > 0 ? (
                <Select
                  value={o.level}
                  onValueChange={(v) => {
                    const updated = [...overrides];
                    updated[idx] = { ...updated[idx], level: v };
                    setOverrides(updated);
                  }}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    {customLevels.map((lv) => {
                      const inUse = usedLevelIds.has(lv.id) && String(lv.id) !== o.level;
                      return (
                        <SelectItem key={lv.id} value={String(lv.id)} disabled={inUse}>
                          L{lv.id} {lv.name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : (
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
              )}
            </div>
            <div className="space-y-1">
              <LabelWithTip className="text-xs" tip={t('help.withdrawalRate')}>{t('withdrawalRate')}</LabelWithTip>
              <Input
                type="number"
                value={o.withdrawalRate}
                onChange={(e) => {
                  const updated = [...overrides];
                  const v = e.target.value;
                  const n = Number(v);
                  updated[idx] = {
                    ...updated[idx],
                    withdrawalRate: v,
                    repurchaseRate: v !== '' && n >= 0 && n <= 10000 ? String(10000 - n) : updated[idx].repurchaseRate,
                  };
                  setOverrides(updated);
                }}
                className={`w-24 ${!sumValid ? 'border-destructive' : ''}`}
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
                  const v = e.target.value;
                  const n = Number(v);
                  updated[idx] = {
                    ...updated[idx],
                    repurchaseRate: v,
                    withdrawalRate: v !== '' && n >= 0 && n <= 10000 ? String(10000 - n) : updated[idx].withdrawalRate,
                  };
                  setOverrides(updated);
                }}
                className={`w-24 ${!sumValid ? 'border-destructive' : ''}`}
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
            {!sumValid && (
              <p className="text-xs text-destructive">{t('tierSumNote')} ({t('current')}: {sum})</p>
            )}
          </div>
          );
        })}
      </div>
    );
  };

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
            <SelectItem value={WithdrawalModeType.FullWithdrawal}>{t('withdrawalModeFullWithdrawal')}</SelectItem>
            <SelectItem value={WithdrawalModeType.FixedRate}>{t('withdrawalModeFixedRate')}</SelectItem>
            <SelectItem value={WithdrawalModeType.LevelBased}>{t('withdrawalModeLevelBased')}</SelectItem>
            <SelectItem value={WithdrawalModeType.MemberChoice}>{t('withdrawalModeMemberChoice')}</SelectItem>
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
              onChange={(e) => {
                const v = e.target.value;
                const n = Number(v);
                setWRate(v);
                if (v !== '' && n >= 0 && n <= 10000) setRRate(String(10000 - n));
              }}
              placeholder="10000"
              className="w-28"
            />
          </div>
          <div className="space-y-1">
            <LabelWithTip className="text-xs" tip={t('help.repurchaseRate')}>{t('repurchaseRate')}</LabelWithTip>
            <Input
              type="number"
              value={rRate}
              onChange={(e) => {
                const v = e.target.value;
                const n = Number(v);
                setRRate(v);
                if (v !== '' && n >= 0 && n <= 10000) setWRate(String(10000 - n));
              }}
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
        <Button type="submit" disabled={isLocked}>
          {t('updateWithdrawalConfig')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => { if (!isLocked) clearMutation.mutate([entityId]); }}
          disabled={isLocked}
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
            onClick={() => { if (!isLocked) pauseWithdrawal.mutate([entityId]); }}
            disabled={isLocked}
          >
            {isWithdrawalPaused ? t('resumeWithdrawal') : t('pauseWithdrawal')}
          </Button>
          <TxStatusIndicator txState={pauseWithdrawal.txState} />
        </div>

        {/* Min withdrawal interval */}
        <form onSubmit={handleSetInterval} className="flex items-end gap-3">
          <div className="space-y-2">
            <LabelWithTip tip={t('help.minWithdrawalInterval')}>{t('minWithdrawalInterval')}</LabelWithTip>
            <Input
              type="number"
              value={intervalValue}
              onChange={(e) => setIntervalValue(e.target.value)}
              placeholder="blocks"
              className="w-40"
            />
          </div>
          <Button type="submit" disabled={isLocked}>
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

  const { isLocked, setLocked } = useTxLock();
  const localBusy = isTxBusy(withdrawNex) || isTxBusy(withdrawToken);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  const lastCredited = useMemberLastCredited(address);
  const lastWithdrawn = useMemberLastWithdrawn(address);
  const tokenLastCredited = useMemberTokenLastCredited(address);
  const tokenLastWithdrawn = useMemberTokenLastWithdrawn(address);

  const [nexAmount, setNexAmount] = useState('');
  const [nexRepurchaseRate, setNexRepurchaseRate] = useState('');

  const [tokenAmount, setTokenAmount] = useState('');
  const [tokenRepurchaseRate, setTokenRepurchaseRate] = useState('');

  const paused = isWithdrawalPaused;

  const handleWithdrawNex = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked || !nexAmount.trim()) return;
      withdrawNex.mutate([
        nexAmount.trim(),
        nexRepurchaseRate.trim() ? Number(nexRepurchaseRate) : null,
      ]);
      setNexAmount('');
      setNexRepurchaseRate('');
    },
    [nexAmount, nexRepurchaseRate, withdrawNex, isLocked],
  );

  const handleWithdrawToken = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked || !tokenAmount.trim()) return;
      withdrawToken.mutate([
        tokenAmount.trim(),
        tokenRepurchaseRate.trim() ? Number(tokenRepurchaseRate) : null,
      ]);
      setTokenAmount('');
      setTokenRepurchaseRate('');
    },
    [tokenAmount, tokenRepurchaseRate, withdrawToken, isLocked],
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
                <div className="max-w-xs space-y-2">
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
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={paused || isLocked}>
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
                <div className="max-w-xs space-y-2">
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
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={paused || isLocked}>
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

// ─── Repurchase Config Section ──────────────────────────────

function RepurchaseConfigSection() {
  const t = useTranslations('commission');
  const { entityId } = useEntityContext();
  const {
    repurchaseConfig,
    useShoppingBalanceExpiryList,
    setRepurchaseConfig,
    expireShoppingBalance,
  } = useCommission();
  const { isLocked } = useTxLock();

  const cfg = repurchaseConfig;

  // 表单状态
  const [minUsdt, setMinUsdt] = useState(String(cfg?.minPackageUsdt ?? 0));
  const [enforced, setEnforced] = useState(cfg?.enforced ?? false);
  const [autoOrder, setAutoOrder] = useState(cfg?.autoOrder ?? false);
  const [productId, setProductId] = useState(String(cfg?.defaultProductId ?? 0));
  const [ttlBlocks, setTtlBlocks] = useState(String(cfg?.shoppingBalanceTtlBlocks ?? 0));
  const [maxShoppingUsdt, setMaxShoppingUsdt] = useState(String(cfg?.maxShoppingBalanceUsdt ?? 0));

  // 同步链上配置到表单
  React.useEffect(() => {
    if (!cfg) return;
    setMinUsdt(String(cfg.minPackageUsdt));
    setEnforced(cfg.enforced);
    setAutoOrder(cfg.autoOrder);
    setProductId(String(cfg.defaultProductId));
    setTtlBlocks(String(cfg.shoppingBalanceTtlBlocks));
    setMaxShoppingUsdt(String(cfg.maxShoppingBalanceUsdt));
  }, [cfg]);

  // 到期列表（仅 TTL > 0 时有意义）
  const expiryListQuery = useShoppingBalanceExpiryList();
  const expiryList = expiryListQuery.data ?? [];
  const expiredCount = expiryList.filter((e) => e.status === 'expired').length;
  const expiringSoonCount = expiryList.filter((e) => e.status === 'expiring_soon').length;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setRepurchaseConfig.mutate([
      entityId,
      {
        min_package_usdt: Number(minUsdt),
        enforced,
        auto_order: autoOrder,
        default_product_id: Number(productId),
        shopping_balance_ttl_blocks: Number(ttlBlocks),
        max_shopping_balance_usdt: Number(maxShoppingUsdt),
      },
    ]);
  };

  const ttlBlocksNum = Number(ttlBlocks);
  // 6s/block 换算为天数
  const ttlDays = ttlBlocksNum > 0 ? (ttlBlocksNum * 6 / 86400).toFixed(1) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('repurchaseConfig')}</CardTitle>
        <CardDescription>{t('repurchaseConfigDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 当前配置展示 */}
        {cfg ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('minPackageUsdt')}</p>
              <p className="text-sm font-medium">{cfg.minPackageUsdt} USDT</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('enforced')}</p>
              <Badge variant={cfg.enforced ? 'success' : 'secondary'}>
                {cfg.enforced ? t('yes') : t('no')}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('autoOrder')}</p>
              <Badge variant={cfg.autoOrder ? 'success' : 'secondary'}>
                {cfg.autoOrder ? t('enabled') : t('disabled')}
              </Badge>
            </div>
            {cfg.autoOrder && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('defaultProductId')}</p>
                <p className="text-sm font-medium">#{cfg.defaultProductId}</p>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('shoppingBalanceTtl')}</p>
              <p className="text-sm font-medium">
                {cfg.shoppingBalanceTtlBlocks === 0
                  ? t('ttlNeverExpires')
                  : `${cfg.shoppingBalanceTtlBlocks} blocks (~${(cfg.shoppingBalanceTtlBlocks * 6 / 86400).toFixed(1)} ${t('days')})`}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('maxShoppingBalanceUsdt')}</p>
              <p className="text-sm font-medium">
                {cfg.maxShoppingBalanceUsdt === 0
                  ? t('noLimit')
                  : `${cfg.maxShoppingBalanceUsdt} USDT`}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('repurchaseConfigNotSet')}</p>
        )}

        {/* 配置表单（Admin） */}
        <Separator />
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <LabelWithTip htmlFor="rp-min-usdt" tip={t('help.minPackageUsdt')}>
                {t('minPackageUsdt')} (USDT cents)
              </LabelWithTip>
              <Input
                id="rp-min-usdt"
                type="number"
                min={0}
                value={minUsdt}
                onChange={(e) => setMinUsdt(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="rp-product-id" tip={t('help.defaultProductId')}>
                {t('defaultProductId')}
              </LabelWithTip>
              <Input
                id="rp-product-id"
                type="number"
                min={0}
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-40"
                disabled={!autoOrder}
              />
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="rp-ttl" tip={t('help.shoppingBalanceTtl')}>
                {t('shoppingBalanceTtl')} (blocks)
              </LabelWithTip>
              <Input
                id="rp-ttl"
                type="number"
                min={0}
                value={ttlBlocks}
                onChange={(e) => setTtlBlocks(e.target.value)}
                className="w-40"
              />
              {ttlDays && (
                <p className="text-xs text-muted-foreground">≈ {ttlDays} {t('days')}</p>
              )}
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="rp-max-shopping-usdt" tip={t('help.maxShoppingBalanceUsdt')}>
                {t('maxShoppingBalanceUsdt')} (USDT)
              </LabelWithTip>
              <Input
                id="rp-max-shopping-usdt"
                type="number"
                min={0}
                value={maxShoppingUsdt}
                onChange={(e) => setMaxShoppingUsdt(e.target.value)}
                className="w-40"
              />
              <p className="text-xs text-muted-foreground">
                {Number(maxShoppingUsdt) === 0 ? t('noLimit') : `${t('threshold')}: ${maxShoppingUsdt} USDT`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="rp-enforced"
                checked={enforced}
                onCheckedChange={setEnforced}
                disabled={isLocked}
              />
              <Label htmlFor="rp-enforced">{t('enforced')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="rp-auto-order"
                checked={autoOrder}
                onCheckedChange={setAutoOrder}
                disabled={isLocked}
              />
              <Label htmlFor="rp-auto-order">{t('autoOrder')}</Label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isLocked}>
              {t('saveRepurchaseConfig')}
            </Button>
            <TxStatusIndicator txState={setRepurchaseConfig.txState} />
          </div>
        </form>

        {/* 购物余额到期列表 */}
        {cfg && cfg.shoppingBalanceTtlBlocks > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{t('shoppingBalanceExpiryList')}</p>
                <div className="flex gap-2">
                  {expiredCount > 0 && (
                    <Badge variant="destructive">{expiredCount} {t('expired')}</Badge>
                  )}
                  {expiringSoonCount > 0 && (
                    <Badge variant="warning">{expiringSoonCount} {t('expiringSoon')}</Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('expiryListDesc')}</p>

              {expiryListQuery.isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : expiryList.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t('noExpiryEntries')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('account')}</TableHead>
                      <TableHead>{t('lastCreditedBlock')}</TableHead>
                      <TableHead>{t('expiresAtBlock')}</TableHead>
                      <TableHead>{t('status')}</TableHead>
                      <TableHead className="text-right">{t('action')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiryList.map((entry) => (
                      <TableRow key={entry.account}>
                        <TableCell className="font-mono text-xs max-w-[140px] truncate">
                          {entry.account}
                        </TableCell>
                        <TableCell className="text-xs">#{entry.lastCredited}</TableCell>
                        <TableCell className="text-xs">#{entry.expireAtBlock}</TableCell>
                        <TableCell>
                          {entry.status === 'expired' && (
                            <Badge variant="destructive">{t('expired')}</Badge>
                          )}
                          {entry.status === 'expiring_soon' && (
                            <Badge variant="warning">{t('expiringSoon')}</Badge>
                          )}
                          {entry.status === 'active' && (
                            <Badge variant="secondary">
                              {t('blocksLeft', { n: entry.blocksLeft })}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.status === 'expired' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={isLocked}
                              onClick={() => expireShoppingBalance.mutate([entityId, entry.account])}
                            >
                              {t('triggerExpiry')}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Entity Funds Section ───────────────────────────────────

function EntityFundsSection() {
  const t = useTranslations('commission');
  const { entityId } = useEntityContext();
  const { withdrawEntityFunds, withdrawEntityTokenFunds } = useCommission();

  const { isLocked, setLocked } = useTxLock();
  const localBusy = isTxBusy(withdrawEntityFunds) || isTxBusy(withdrawEntityTokenFunds);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  const [nexFundAmount, setNexFundAmount] = useState('');
  const [tokenFundAmount, setTokenFundAmount] = useState('');

  const handleWithdrawNexFunds = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked || !nexFundAmount.trim()) return;
      withdrawEntityFunds.mutate([entityId, nexFundAmount.trim()]);
      setNexFundAmount('');
    },
    [entityId, nexFundAmount, withdrawEntityFunds, isLocked],
  );

  const handleWithdrawTokenFunds = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked || !tokenFundAmount.trim()) return;
      withdrawEntityTokenFunds.mutate([entityId, tokenFundAmount.trim()]);
      setTokenFundAmount('');
    },
    [entityId, tokenFundAmount, withdrawEntityTokenFunds, isLocked],
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
          <Button type="submit" disabled={isLocked}>
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
          <Button type="submit" disabled={isLocked}>
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

  const { isLocked, setLocked } = useTxLock();
  const localBusy = isTxBusy(setGlobalMinRepurchaseRate) || isTxBusy(setGlobalMinTokenRepurchaseRate) || isTxBusy(setGlobalMaxCommissionRate) || isTxBusy(setGlobalMaxTokenCommissionRate) || isTxBusy(setTokenPlatformFeeRate) || isTxBusy(forceDisableEntityCommission) || isTxBusy(forceEnableEntityCommission) || isTxBusy(forceGlobalPause) || isTxBusy(retryCancelCommission);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

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
            if (isLocked || !minRepRate.trim()) return;
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
          <Button type="submit" size="sm" disabled={isLocked}>
            {t('setRate')}
          </Button>
          <TxStatusIndicator txState={setGlobalMinRepurchaseRate.txState} />
        </form>

        {/* Global min token repurchase rate */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isLocked || !minTokenRepRate.trim()) return;
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
          <Button type="submit" size="sm" disabled={isLocked}>
            {t('setRate')}
          </Button>
          <TxStatusIndicator txState={setGlobalMinTokenRepurchaseRate.txState} />
        </form>

        {/* Global max commission rate (NEX) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isLocked || !maxCommRate.trim()) return;
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
          <Button type="submit" size="sm" disabled={isLocked}>
            {t('setRate')}
          </Button>
          <TxStatusIndicator txState={setGlobalMaxCommissionRate.txState} />
        </form>

        {/* Global max token commission rate */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isLocked || !maxTokenCommRate.trim()) return;
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
          <Button type="submit" size="sm" disabled={isLocked}>
            {t('setRate')}
          </Button>
          <TxStatusIndicator txState={setGlobalMaxTokenCommissionRate.txState} />
        </form>

        {/* Token platform fee rate */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isLocked || !platFeeRate.trim()) return;
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
          <Button type="submit" size="sm" disabled={isLocked}>
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
                if (isLocked) return;
                const eid = Number(forceEntityId) || entityId;
                forceDisableEntityCommission.mutate([eid]);
              }}
              disabled={isLocked}
            >
              {t('forceDisableEntity')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (isLocked) return;
                const eid = Number(forceEntityId) || entityId;
                forceEnableEntityCommission.mutate([eid]);
              }}
              disabled={isLocked}
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
            onClick={() => { if (!isLocked) forceGlobalPause.mutate([!globalCommissionPaused]); }}
            disabled={isLocked}
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
              if (isLocked) return;
              const eid = Number(retryEntityId) || entityId;
              retryCancelCommission.mutate([eid]);
            }}
            disabled={isLocked}
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

  const { isLocked, setLocked } = useTxLock();
  const localBusy = isTxBusy(archiveOrderRecords);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  const [archiveOrderId, setArchiveOrderId] = useState('');

  const handleArchive = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked || !archiveOrderId.trim()) return;
      archiveOrderRecords.mutate([entityId, Number(archiveOrderId)]);
      setArchiveOrderId('');
    },
    [entityId, archiveOrderId, archiveOrderRecords, isLocked],
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
          <Button type="submit" disabled={isLocked}>
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
        <CommissionPreviewSection />
        <WithdrawalConfigSection />
        <RepurchaseConfigSection />
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
