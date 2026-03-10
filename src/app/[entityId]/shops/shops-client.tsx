'use client';

import React, { useState, useCallback } from 'react';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useShops } from '@/hooks/use-shops';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { ShopType, EffectiveShopStatus } from '@/lib/types/enums';
import type { ShopData } from '@/lib/types/models';
import { isFundWarning } from '@/lib/utils/fund-warning';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Constants ──────────────────────────────────────────────

/** Fund warning threshold: 1 NEX (10^12) */
const FUND_WARNING_THRESHOLD = BigInt('1000000000000');

const STATUS_BADGE_VARIANT: Record<EffectiveShopStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'; className?: string }> = {
  [EffectiveShopStatus.Active]: { variant: 'success' },
  [EffectiveShopStatus.PausedBySelf]: { variant: 'warning' },
  [EffectiveShopStatus.PausedByEntity]: { variant: 'warning', className: 'bg-orange-500 hover:bg-orange-500/80' },
  [EffectiveShopStatus.FundDepleted]: { variant: 'destructive' },
  [EffectiveShopStatus.Closed]: { variant: 'secondary' },
  [EffectiveShopStatus.ClosedByEntity]: { variant: 'secondary' },
  [EffectiveShopStatus.Closing]: { variant: 'outline' },
  [EffectiveShopStatus.Banned]: { variant: 'destructive' },
};

// ─── Helpers ────────────────────────────────────────────────

function formatNexBalance(balance: bigint): string {
  const divisor = BigInt('1000000000000');
  const whole = balance / divisor;
  const remainder = balance % divisor;
  const decStr = remainder.toString().padStart(12, '0').slice(0, 4);
  const trimmed = decStr.replace(/0+$/, '');
  return trimmed ? `${whole.toLocaleString()}.${trimmed}` : whole.toLocaleString();
}

// ─── Loading Skeleton ────────────────────────────────────────

function ShopsLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-24" />
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Shop Card ──────────────────────────────────────────────

function ShopCard({ shop, onTopUp }: { shop: ShopData; onTopUp: (shopId: number) => void }) {
  const t = useTranslations('shops');
  const te = useTranslations('enums');
  const badgeCfg = STATUS_BADGE_VARIANT[shop.effectiveStatus];
  const showFundWarning =
    shop.effectiveStatus === EffectiveShopStatus.FundDepleted ||
    isFundWarning(shop.fundBalance, FUND_WARNING_THRESHOLD);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base">{shop.name}</CardTitle>
          <CardDescription>
            ID: {shop.id} · {te(`shopType.${shop.shopType as ShopType}`) ?? shop.shopType}
          </CardDescription>
        </div>
        <Badge variant={badgeCfg.variant} className={badgeCfg.className}>
          {te(`effectiveShopStatus.${shop.effectiveStatus}`)}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('operatingFund')}: <span className="font-medium text-foreground">{formatNexBalance(shop.fundBalance)} NEX</span>
        </p>

        {showFundWarning && (
          <div className="flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2">
            <span className="text-xs text-destructive">
              {t('fundWarning')}
            </span>
            <Button
              variant="destructive"
              size="sm"
              className="ml-2 h-7 text-xs"
              onClick={() => onTopUp(shop.id)}
            >
              {t('quickTopUp')}
            </Button>
          </div>
        )}

        {shop.pointsConfig && (
          <p className="text-xs text-muted-foreground">
            {t('pointsReward', { reward: shop.pointsConfig.rewardRateBps / 100, exchange: shop.pointsConfig.exchangeRateBps / 100 })}
            {shop.pointsConfig.transferable ? t('pointsTransferable') : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Create Shop Form ───────────────────────────────────────

function CreateShopForm() {
  const { entityId } = useEntityContext();
  const { createShop } = useShops();
  const t = useTranslations('shops');
  const te = useTranslations('enums');

  const [name, setName] = useState('');
  const [shopType, setShopType] = useState<ShopType>(ShopType.OnlineStore);
  const [initialFund, setInitialFund] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedName = name.trim();
      if (!trimmedName) return;

      // Convert NEX amount to chain balance (12 decimals)
      const parts = initialFund.trim().split('.');
      const whole = parts[0] ?? '0';
      const frac = (parts[1] ?? '').padEnd(12, '0').slice(0, 12);
      const rawFund = BigInt(whole) * BigInt('1000000000000') + BigInt(frac);

      createShop.mutate([entityId, trimmedName, shopType, rawFund.toString()]);
      setName('');
      setInitialFund('');
    },
    [entityId, name, shopType, initialFund, createShop],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('createShop')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shop-name">{t('shopName')}</Label>
            <Input
              id="shop-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('shopNamePlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shop-type">{t('shopType')}</Label>
            <Select value={shopType} onValueChange={(v) => setShopType(v as ShopType)}>
              <SelectTrigger id="shop-type">
                <SelectValue placeholder={t('shopType')} />
              </SelectTrigger>
              <SelectContent>
                {Object.values(ShopType).map((st) => (
                  <SelectItem key={st} value={st}>
                    {te(`shopType.${st}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="initial-fund">{t('initialFund')}</Label>
            <Input
              id="initial-fund"
              type="text"
              inputMode="decimal"
              value={initialFund}
              onChange={(e) => setInitialFund(e.target.value)}
              placeholder="0.0"
              required
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={createShop.txState.status === 'signing' || createShop.txState.status === 'broadcasting'}
            >
              {t('createShop')}
            </Button>
            <TxStatusIndicator txState={createShop.txState} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Top-Up Dialog ──────────────────────────────────────────

function TopUpDialog({
  shopId,
  onClose,
}: {
  shopId: number;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const { depositFund } = useShops();
  const t = useTranslations('shops');
  const tc = useTranslations('common');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const parts = amount.trim().split('.');
      const whole = parts[0] ?? '0';
      const frac = (parts[1] ?? '').padEnd(12, '0').slice(0, 12);
      const rawAmount = BigInt(whole) * BigInt('1000000000000') + BigInt(frac);
      depositFund.mutate([shopId, rawAmount.toString()]);
      setAmount('');
      onClose();
    },
    [shopId, amount, depositFund, onClose],
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('topUpFundTitle', { shopId })}</DialogTitle>
          <DialogDescription>Shop #{shopId}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="topup-shop-amount">{t('topUpAmount')}</Label>
            <Input
              id="topup-shop-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={!amount.trim()}>
              {tc('confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function ShopsPage() {
  const t = useTranslations('shops');
  const tc = useTranslations('common');
  const { isReadOnly, isSuspended } = useEntityContext();
  const { shops, isLoading, error } = useShops();
  const [topUpShopId, setTopUpShopId] = useState<number | null>(null);

  if (isLoading) {
    return <ShopsLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-destructive">
        {tc('loadFailed', { error: String(error) })}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>

      {/* Create shop form — requires SHOP_MANAGE permission, not in readonly/suspended */}
      {!isReadOnly && !isSuspended && (
        <PermissionGuard required={AdminPermission.SHOP_MANAGE} fallback={null}>
          <CreateShopForm />
        </PermissionGuard>
      )}

      {/* Shop list */}
      {shops.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">{t('noShops')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {shops.map((shop) => (
            <ShopCard key={shop.id} shop={shop} onTopUp={setTopUpShopId} />
          ))}
        </div>
      )}

      {/* Top-up dialog */}
      {topUpShopId !== null && (
        <TopUpDialog shopId={topUpShopId} onClose={() => setTopUpShopId(null)} />
      )}
    </div>
  );
}
