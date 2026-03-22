'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useShops } from '@/hooks/use-shops';
import { useEntityQuery, hasPallet } from '@/hooks/use-entity-query';
import { useEntityMutation } from '@/hooks/use-entity-mutation';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import type { ShopPointsConfig } from '@/lib/types/models';
import { ShopType, EffectiveShopStatus } from '@/lib/types/enums';
import { STALE_TIMES } from '@/lib/chain/constants';
import { decodeChainString } from '@/lib/utils/codec';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LabelWithTip } from '@/components/field-help-tip';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil, Check, X } from 'lucide-react';

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

// ─── Helpers ─────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
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
  const [pointsName, setPointsName] = useState('');
  const [pointsSymbol, setPointsSymbol] = useState('');
  const [rewardRateBps, setRewardRateBps] = useState('100');
  const [exchangeRateBps, setExchangeRateBps] = useState('100');
  const [transferable, setTransferable] = useState(false);

  const enablePoints = useEntityMutation('entityLoyalty', 'enablePoints', {
    invalidateKeys: [['entity', entityId, 'shops']],
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!pointsName.trim() || !pointsSymbol.trim()) return;
      enablePoints.mutate([shopId, pointsName.trim(), pointsSymbol.trim(), Number(rewardRateBps), Number(exchangeRateBps), transferable]);
    },
    [shopId, pointsName, pointsSymbol, rewardRateBps, exchangeRateBps, transferable, enablePoints],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm font-medium">{t('detail.enablePoints')}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <LabelWithTip htmlFor="reward-rate" className="text-xs text-muted-foreground" tip={t('help.rewardRate')}>
            {t('detail.rewardRate')}
          </LabelWithTip>
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
          <LabelWithTip htmlFor="exchange-rate" className="text-xs text-muted-foreground" tip={t('help.exchangeRate')}>
            {t('detail.exchangeRate')}
          </LabelWithTip>
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
        <LabelWithTip htmlFor="transferable" className="text-sm" tip={t('help.allowTransfer')}>{t('detail.allowTransfer')}</LabelWithTip>
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

  const updatePointsConfig = useEntityMutation('entityLoyalty', 'updatePointsConfig', {
    invalidateKeys: [['entity', entityId, 'shops']],
  });

  const disablePoints = useEntityMutation('entityLoyalty', 'disablePoints', {
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
            <LabelWithTip htmlFor="update-reward-rate" className="text-xs text-muted-foreground" tip={t('help.rewardRate')}>
              {t('detail.rewardRate')}
            </LabelWithTip>
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
            <LabelWithTip htmlFor="update-exchange-rate" className="text-xs text-muted-foreground" tip={t('help.exchangeRate')}>
              {t('detail.exchangeRate')}
            </LabelWithTip>
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
          <LabelWithTip htmlFor="update-transferable" className="text-sm" tip={t('help.allowTransfer')}>{t('detail.allowTransfer')}</LabelWithTip>
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
  const { getShop, isLoading, error, updateShop } = useShops();

  const shop = getShop(shopId);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  // Query points config separately from entityLoyalty pallet
  const pointsConfigQuery = useEntityQuery<ShopPointsConfig | null>(
    ['entity', entityId, 'shop', shopId, 'pointsConfig'],
    async (api) => {
      if (!hasPallet(api, 'entityLoyalty')) return null;
      const fn = (api.query as any).entityLoyalty.shopPointsConfigs;
      if (!fn) return null;
      const raw = await fn(shopId);
      if (!raw || (raw as any).isNone) return null;
      const obj = (raw as any).unwrapOr?.(null) ?? raw;
      if (!obj) return null;
      const data = (obj as any).toJSON?.() ?? obj;
      return {
        name: decodeChainString(data.name),
        symbol: decodeChainString(data.symbol),
        rewardRateBps: Number(data.rewardRateBps ?? data.reward_rate_bps ?? data.rewardRate ?? data.reward_rate ?? 0),
        exchangeRateBps: Number(data.exchangeRateBps ?? data.exchange_rate_bps ?? data.exchangeRate ?? data.exchange_rate ?? 0),
        transferable: Boolean(data.transferable),
      } as ShopPointsConfig;
    },
    { staleTime: STALE_TIMES.token, enabled: !!shop },
  );
  const pointsConfig = pointsConfigQuery.data ?? null;

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
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 w-48"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editName.trim()) {
                      updateShop.mutate([shop.id, editName.trim(), null, null, null, null]);
                      setIsEditingName(false);
                    } else if (e.key === 'Escape') {
                      setIsEditingName(false);
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={!editName.trim() || isTxBusy(updateShop)}
                  onClick={() => {
                    updateShop.mutate([shop.id, editName.trim(), null, null, null, null]);
                    setIsEditingName(false);
                  }}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setIsEditingName(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{shop.name}</CardTitle>
                {!isReadOnly && !isSuspended && (
                  <PermissionGuard required={AdminPermission.SHOP_MANAGE} fallback={null}>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditName(shop.name);
                        setIsEditingName(true);
                      }}
                      title={t('detail.editName')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </PermissionGuard>
                )}
                <TxStatusIndicator txState={updateShop.txState} />
              </div>
            )}
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
              {pointsConfig ? (
                <UpdatePointsForm shopId={shop.id} currentConfig={pointsConfig} />
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
