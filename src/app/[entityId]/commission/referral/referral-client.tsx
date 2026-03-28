'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { useReferralCommission } from '@/hooks/use-referral-commission';
import { useWalletStore } from '@/stores/wallet-store';
import { useTxLock, isTxBusy } from '@/hooks/use-tx-lock';
import { useTranslations } from 'next-intl';
import { formatNex } from '@/lib/utils/format';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTip } from '@/components/field-help-tip';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

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

// ─── Config Section (Direct Reward) ─────────────────────────

function ConfigSection() {
  const t = useTranslations('referral');
  const { entityId } = useEntityContext();
  const { config, setDirectRewardConfig } = useReferralCommission();
  const { isLocked, setLocked } = useTxLock();

  const [rewardRate, setRewardRateVal] = useState('');

  const localBusy = isTxBusy(setDirectRewardConfig);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  const handleSaveConfig = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked) return;
      setDirectRewardConfig.mutate([
        entityId,
        Number(rewardRate) || config?.rewardRate || 0,
      ]);
    },
    [entityId, rewardRate, config, setDirectRewardConfig, isLocked],
  );

  const handleToggle = useCallback(() => {
    if (isLocked) return;
    if (config?.enabled) {
      setDirectRewardConfig.mutate([entityId, 0]);
    } else {
      setDirectRewardConfig.mutate([
        entityId,
        Number(rewardRate) || config?.rewardRate || 0,
      ]);
    }
  }, [entityId, config, rewardRate, setDirectRewardConfig, isLocked]);

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
              disabled={isLocked}
            />
            <Label>{t('enableToggle')}</Label>
            <TxStatusIndicator txState={setDirectRewardConfig.txState} />
          </div>

          <Separator className="my-4" />

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="space-y-2 max-w-xs">
              <LabelWithTip htmlFor="ref-reward-rate" tip={t('help.rewardRate')}>{t('rewardRate')}</LabelWithTip>
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
              <Button type="submit" disabled={isLocked}>
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

// ─── Fixed Amount Config Section ────────────────────────────

function FixedAmountConfigSection() {
  const t = useTranslations('referral');
  const { entityId } = useEntityContext();
  const { setFixedAmountConfig } = useReferralCommission();
  const { isLocked, setLocked } = useTxLock();

  const [fixedAmount, setFixedAmount] = useState('');

  const localBusy = isTxBusy(setFixedAmountConfig);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked) return;
      if (!fixedAmount.trim()) return;
      setFixedAmountConfig.mutate([entityId, fixedAmount]);
    },
    [entityId, fixedAmount, setFixedAmountConfig, isLocked],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('fixedAmountConfig')}</CardTitle>
        <CardDescription>{t('fixedAmountConfigDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2 max-w-xs">
            <LabelWithTip htmlFor="ref-fixed-amount" tip={t('help.fixedAmount')}>{t('fixedAmount')}</LabelWithTip>
            <Input
              id="ref-fixed-amount"
              type="text"
              inputMode="numeric"
              value={fixedAmount}
              onChange={(e) => setFixedAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isLocked}>
              {t('setFixedAmountConfig')}
            </Button>
            <TxStatusIndicator txState={setFixedAmountConfig.txState} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── First Order Config Section ─────────────────────────────

function FirstOrderConfigSection() {
  const t = useTranslations('referral');
  const { entityId } = useEntityContext();
  const { setFirstOrderConfig } = useReferralCommission();
  const { isLocked, setLocked } = useTxLock();

  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [useAmount, setUseAmount] = useState(false);

  const localBusy = isTxBusy(setFirstOrderConfig);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked) return;
      setFirstOrderConfig.mutate([
        entityId,
        amount.trim() || '0',
        Number(rate) || 0,
        useAmount,
      ]);
    },
    [entityId, amount, rate, useAmount, setFirstOrderConfig, isLocked],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('firstOrderConfig')}</CardTitle>
        <CardDescription>{t('firstOrderConfigDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
            <div className="space-y-2">
              <LabelWithTip htmlFor="ref-first-order-amount" tip={t('help.firstOrderAmount')}>{t('firstOrderAmount')}</LabelWithTip>
              <Input
                id="ref-first-order-amount"
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="ref-first-order-rate" tip={t('help.firstOrderRate')}>{t('firstOrderRate')}</LabelWithTip>
              <Input
                id="ref-first-order-rate"
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={useAmount}
              onCheckedChange={setUseAmount}
            />
            <Label>{t('useAmount')}</Label>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isLocked}>
              {t('setFirstOrderConfig')}
            </Button>
            <TxStatusIndicator txState={setFirstOrderConfig.txState} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Repeat Purchase Config Section ─────────────────────────

function RepeatPurchaseConfigSection() {
  const t = useTranslations('referral');
  const { entityId } = useEntityContext();
  const { setRepeatPurchaseConfig } = useReferralCommission();
  const { isLocked, setLocked } = useTxLock();

  const [rate, setRate] = useState('');
  const [minOrders, setMinOrders] = useState('');

  const localBusy = isTxBusy(setRepeatPurchaseConfig);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked) return;
      setRepeatPurchaseConfig.mutate([
        entityId,
        Number(rate) || 0,
        Number(minOrders) || 0,
      ]);
    },
    [entityId, rate, minOrders, setRepeatPurchaseConfig, isLocked],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('repeatPurchaseConfig')}</CardTitle>
        <CardDescription>{t('repeatPurchaseConfigDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
            <div className="space-y-2">
              <LabelWithTip htmlFor="ref-repeat-rate" tip={t('help.repeatRate')}>{t('repeatRate')}</LabelWithTip>
              <Input
                id="ref-repeat-rate"
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="ref-min-orders" tip={t('help.minOrders')}>{t('minOrders')}</LabelWithTip>
              <Input
                id="ref-min-orders"
                type="number"
                value={minOrders}
                onChange={(e) => setMinOrders(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isLocked}>
              {t('setRepeatPurchaseConfig')}
            </Button>
            <TxStatusIndicator txState={setRepeatPurchaseConfig.txState} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Referrer Guard Config Section ──────────────────────────

function ReferrerGuardConfigSection() {
  const t = useTranslations('referral');
  const { entityId } = useEntityContext();
  const { guardConfig, setReferrerGuardConfig } = useReferralCommission();
  const { isLocked, setLocked } = useTxLock();

  const [minSpent, setMinSpent] = useState('');
  const [minOrders, setMinOrders] = useState('');

  const localBusy = isTxBusy(setReferrerGuardConfig);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked) return;
      setReferrerGuardConfig.mutate([
        entityId,
        minSpent.trim() || '0',
        Number(minOrders) || 0,
      ]);
    },
    [entityId, minSpent, minOrders, setReferrerGuardConfig, isLocked],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('referrerGuardConfig')}</CardTitle>
        <CardDescription>{t('referrerGuardConfigDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('minReferrerSpent')}</p>
            <p className="text-sm font-medium">{formatNex(guardConfig?.minReferrerSpent ?? BigInt(0))} NEX</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('minReferrerOrders')}</p>
            <p className="text-sm font-medium">{guardConfig?.minReferrerOrders ?? 0}</p>
          </div>
        </div>

        <Separator className="my-4" />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
            <div className="space-y-2">
              <LabelWithTip htmlFor="ref-guard-min-spent" tip={t('help.minReferrerSpent')}>{t('minReferrerSpent')}</LabelWithTip>
              <Input
                id="ref-guard-min-spent"
                type="text"
                inputMode="numeric"
                value={minSpent}
                onChange={(e) => setMinSpent(e.target.value)}
                placeholder={guardConfig?.minReferrerSpent?.toString() ?? '0'}
              />
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="ref-guard-min-orders" tip={t('help.minReferrerOrders')}>{t('minReferrerOrders')}</LabelWithTip>
              <Input
                id="ref-guard-min-orders"
                type="number"
                value={minOrders}
                onChange={(e) => setMinOrders(e.target.value)}
                placeholder={String(guardConfig?.minReferrerOrders ?? 0)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isLocked}>
              {t('setReferrerGuardConfig')}
            </Button>
            <TxStatusIndicator txState={setReferrerGuardConfig.txState} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Commission Cap Config Section ──────────────────────────

function CommissionCapConfigSection() {
  const t = useTranslations('referral');
  const { entityId } = useEntityContext();
  const { capConfig, setCommissionCapConfig } = useReferralCommission();
  const { isLocked, setLocked } = useTxLock();

  const [maxPerOrder, setMaxPerOrder] = useState('');
  const [maxTotalEarned, setMaxTotalEarned] = useState('');

  const localBusy = isTxBusy(setCommissionCapConfig);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked) return;
      setCommissionCapConfig.mutate([
        entityId,
        maxPerOrder.trim() || '0',
        maxTotalEarned.trim() || '0',
      ]);
    },
    [entityId, maxPerOrder, maxTotalEarned, setCommissionCapConfig, isLocked],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('commissionCapConfig')}</CardTitle>
        <CardDescription>{t('commissionCapConfigDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('maxPerOrder')}</p>
            <p className="text-sm font-medium">{formatNex(capConfig?.maxPerOrder ?? BigInt(0))} NEX</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('maxTotalEarned')}</p>
            <p className="text-sm font-medium">{formatNex(capConfig?.maxTotalEarned ?? BigInt(0))} NEX</p>
          </div>
        </div>

        <Separator className="my-4" />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
            <div className="space-y-2">
              <LabelWithTip htmlFor="ref-cap-max-per-order" tip={t('help.maxPerOrder')}>{t('maxPerOrder')}</LabelWithTip>
              <Input
                id="ref-cap-max-per-order"
                type="text"
                inputMode="numeric"
                value={maxPerOrder}
                onChange={(e) => setMaxPerOrder(e.target.value)}
                placeholder={capConfig?.maxPerOrder?.toString() ?? '0'}
              />
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="ref-cap-max-total-earned" tip={t('help.maxTotalEarned')}>{t('maxTotalEarned')}</LabelWithTip>
              <Input
                id="ref-cap-max-total-earned"
                type="text"
                inputMode="numeric"
                value={maxTotalEarned}
                onChange={(e) => setMaxTotalEarned(e.target.value)}
                placeholder={capConfig?.maxTotalEarned?.toString() ?? '0'}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isLocked}>
              {t('setCommissionCapConfig')}
            </Button>
            <TxStatusIndicator txState={setCommissionCapConfig.txState} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Clear Config Section ───────────────────────────────────

function ClearConfigSection() {
  const t = useTranslations('referral');
  const { entityId } = useEntityContext();
  const { clearReferralConfig } = useReferralCommission();
  const { isLocked, setLocked } = useTxLock();

  const localBusy = isTxBusy(clearReferralConfig);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  const handleClear = useCallback(() => {
    if (isLocked) return;
    clearReferralConfig.mutate([entityId]);
  }, [entityId, clearReferralConfig, isLocked]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('clearConfig')}</CardTitle>
        <CardDescription>{t('clearConfigDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Button variant="destructive" onClick={handleClear} disabled={isLocked}>
            {t('clearConfig')}
          </Button>
          <TxStatusIndicator txState={clearReferralConfig.txState} />
        </div>
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
              <p className="text-lg font-semibold">{formatNex(stats?.totalRewardDistributed ?? BigInt(0))} NEX</p>
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
              <p className="text-lg font-semibold">{formatNex(record?.totalEarned ?? BigInt(0))} NEX</p>
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

        <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
          <div className="space-y-6">
            <FixedAmountConfigSection />
            <FirstOrderConfigSection />
            <RepeatPurchaseConfigSection />
            <ReferrerGuardConfigSection />
            <CommissionCapConfigSection />
            <ClearConfigSection />
          </div>
        </PermissionGuard>

        <StatsSection />
        <MyReferralSection />
      </div>
  );
}
