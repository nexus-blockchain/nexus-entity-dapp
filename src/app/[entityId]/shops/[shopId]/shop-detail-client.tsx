'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useShops } from '@/hooks/use-shops';
import { useEntityMutation } from '@/hooks/use-entity-mutation';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { ShopType, EffectiveShopStatus } from '@/lib/types/enums';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Constants ──────────────────────────────────────────────

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

function formatNexBalance(balance: bigint): string {
  const divisor = BigInt('1000000000000');
  const whole = balance / divisor;
  const remainder = balance % divisor;
  const decStr = remainder.toString().padStart(12, '0').slice(0, 4);
  const trimmed = decStr.replace(/0+$/, '');
  return trimmed ? `${whole.toLocaleString()}.${trimmed}` : whole.toLocaleString();
}

// ─── Loading Skeleton ────────────────────────────────────────

function ShopDetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-muted p-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-2 h-7 w-32" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-36" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-24" />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Points Config Form ─────────────────────────────────────

function EnablePointsForm({ shopId }: { shopId: number }) {
  const { entityId } = useEntityContext();
  const t = useTranslations('shops');
  const [rewardRateBps, setRewardRateBps] = useState('100');
  const [exchangeRateBps, setExchangeRateBps] = useState('100');
  const [transferable, setTransferable] = useState(false);

  const enablePoints = useEntityMutation('entityShop', 'enablePoints', {
    invalidateKeys: [['entity', entityId, 'shops']],
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      enablePoints.mutate([shopId, Number(rewardRateBps), Number(exchangeRateBps), transferable]);
    },
    [shopId, rewardRateBps, exchangeRateBps, transferable, enablePoints],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm font-medium">{t('detail.enablePoints')}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="reward-rate" className="text-xs text-muted-foreground">
            {t('detail.rewardRate')}
          </Label>
          <Input
            id="reward-rate"
            type="number"
            min="0"
            value={rewardRateBps}
            onChange={(e) => setRewardRateBps(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exchange-rate" className="text-xs text-muted-foreground">
            {t('detail.exchangeRate')}
          </Label>
          <Input
            id="exchange-rate"
            type="number"
            min="0"
            value={exchangeRateBps}
            onChange={(e) => setExchangeRateBps(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="transferable"
          checked={transferable}
          onCheckedChange={setTransferable}
        />
        <Label htmlFor="transferable" className="text-sm">{t('detail.allowTransfer')}</Label>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={enablePoints.txState.status === 'signing' || enablePoints.txState.status === 'broadcasting'}
        >
          {t('detail.enablePointsBtn')}
        </Button>
        <TxStatusIndicator txState={enablePoints.txState} />
      </div>
    </form>
  );
}

// ─── Update Points Config Form ──────────────────────────────

function UpdatePointsForm({ shopId, currentConfig }: {
  shopId: number;
  currentConfig: { rewardRateBps: number; exchangeRateBps: number; transferable: boolean };
}) {
  const { entityId } = useEntityContext();
  const t = useTranslations('shops');
  const [rewardRateBps, setRewardRateBps] = useState(String(currentConfig.rewardRateBps));
  const [exchangeRateBps, setExchangeRateBps] = useState(String(currentConfig.exchangeRateBps));
  const [transferable, setTransferable] = useState(currentConfig.transferable);

  const updatePointsConfig = useEntityMutation('entityShop', 'updatePointsConfig', {
    invalidateKeys: [['entity', entityId, 'shops']],
  });

  const disablePoints = useEntityMutation('entityShop', 'disablePoints', {
    invalidateKeys: [['entity', entityId, 'shops']],
  });

  const handleUpdate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      updatePointsConfig.mutate([shopId, Number(rewardRateBps), Number(exchangeRateBps), transferable]);
    },
    [shopId, rewardRateBps, exchangeRateBps, transferable, updatePointsConfig],
  );

  const handleDisable = useCallback(() => {
    disablePoints.mutate([shopId]);
  }, [shopId, disablePoints]);

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-green-500/10 px-4 py-3">
        <p className="text-sm font-medium text-green-700 dark:text-green-300">{t('detail.pointsEnabled')}</p>
        <p className="mt-1 text-xs text-green-600 dark:text-green-400">
          {t('detail.pointsEnabledDesc', { reward: currentConfig.rewardRateBps / 100, exchange: currentConfig.exchangeRateBps / 100 })}
          {currentConfig.transferable ? t('pointsTransferable') : ''}
        </p>
      </div>

      <form onSubmit={handleUpdate} className="space-y-4">
        <p className="text-sm font-medium">{t('detail.updatePointsConfig')}</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="update-reward-rate" className="text-xs text-muted-foreground">
              {t('detail.rewardRate')}
            </Label>
            <Input
              id="update-reward-rate"
              type="number"
              min="0"
              value={rewardRateBps}
              onChange={(e) => setRewardRateBps(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="update-exchange-rate" className="text-xs text-muted-foreground">
              {t('detail.exchangeRate')}
            </Label>
            <Input
              id="update-exchange-rate"
              type="number"
              min="0"
              value={exchangeRateBps}
              onChange={(e) => setExchangeRateBps(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="update-transferable"
            checked={transferable}
            onCheckedChange={setTransferable}
          />
          <Label htmlFor="update-transferable" className="text-sm">{t('detail.allowTransfer')}</Label>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={updatePointsConfig.txState.status === 'signing' || updatePointsConfig.txState.status === 'broadcasting'}
          >
            {t('detail.updateConfig')}
          </Button>
          <TxStatusIndicator txState={updatePointsConfig.txState} />
        </div>
      </form>

      <Separator />

      <div className="space-y-2">
        <p className="text-sm font-medium text-destructive">{t('detail.disablePoints')}</p>
        <p className="text-xs text-muted-foreground">{t('detail.disablePointsDesc')}</p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="destructive"
            onClick={handleDisable}
            disabled={disablePoints.txState.status === 'signing' || disablePoints.txState.status === 'broadcasting'}
          >
            {t('detail.disablePoints')}
          </Button>
          <TxStatusIndicator txState={disablePoints.txState} />
        </div>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function ShopDetailPage() {
  const t = useTranslations('shops');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const params = useParams();
  const shopId = Number(params.shopId);
  const { isReadOnly, isSuspended, entityId } = useEntityContext();
  const { getShop, isLoading, error } = useShops();

  const shop = getShop(shopId);

  if (isLoading) {
    return <ShopDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-destructive">
        {tc('loadFailed', { error: String(error) })}
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
        {t('detail.notFound')}
      </div>
    );
  }

  const badgeCfg = STATUS_BADGE_VARIANT[shop.effectiveStatus];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('detail.title')}</h1>

      {/* Shop Info */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-lg">{shop.name}</CardTitle>
            <CardDescription>
              ID: {shop.id} · {te(`shopType.${shop.shopType as ShopType}`) ?? shop.shopType}
            </CardDescription>
          </div>
          <Badge variant={badgeCfg.variant} className={badgeCfg.className}>
            {te(`effectiveShopStatus.${shop.effectiveStatus}`)}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-muted px-4 py-3">
            <p className="text-sm text-muted-foreground">{t('detail.operatingFund')}</p>
            <p className="mt-1 text-xl font-bold">
              {formatNexBalance(shop.fundBalance)}{' '}
              <span className="text-sm font-normal text-muted-foreground">NEX</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Quick navigation */}
      <div className="flex gap-3">
        <Button asChild>
          <Link href={`/${entityId}/shops/${shopId}/products`}>
            {t('detail.manageProducts')}
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/${entityId}/shops/${shopId}/orders`}>
            {t('detail.viewOrders')}
          </Link>
        </Button>
      </div>

      {/* Points System Management — requires SHOP_MANAGE */}
      {!isReadOnly && !isSuspended && (
        <PermissionGuard required={AdminPermission.SHOP_MANAGE} fallback={null}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('detail.pointsSystem')}</CardTitle>
            </CardHeader>
            <CardContent>
              {shop.pointsConfig ? (
                <UpdatePointsForm shopId={shop.id} currentConfig={shop.pointsConfig} />
              ) : (
                <EnablePointsForm shopId={shop.id} />
              )}
            </CardContent>
          </Card>
        </PermissionGuard>
      )}
    </div>
  );
}
