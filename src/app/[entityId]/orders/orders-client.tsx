'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useEntitySalesOrders } from '@/hooks/use-orders';
import { useEntityMutation } from '@/hooks/use-entity-mutation';
import { useChainConstants } from '@/hooks/use-chain-constants';
import { useCurrentBlock } from '@/hooks/use-current-block';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { EscrowStatusSection } from '@/components/order/escrow-status-section';
import { DisputeNotice } from '@/components/order/dispute-notice';
import { OrderTimeoutWarning } from '@/components/order/order-timeout-warning';
import { AdminPermission } from '@/lib/types/models';
import { OrderStatus, PaymentAsset, ProductCategory } from '@/lib/types/enums';
import { getDerivedOrderStage, getSellerOrderActions, isServiceLikeCategory } from '@/lib/utils';
import type { OrderData } from '@/lib/types/models';

import { useTranslations } from 'next-intl';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';

// ─── Constants ──────────────────────────────────────────────

const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  [OrderStatus.Created]: 'bg-gray-100 text-gray-800',
  [OrderStatus.Paid]: 'bg-blue-100 text-blue-800',
  [OrderStatus.Shipped]: 'bg-indigo-100 text-indigo-800',
  [OrderStatus.Completed]: 'bg-green-100 text-green-800',
  [OrderStatus.Cancelled]: 'bg-gray-100 text-gray-600',
  [OrderStatus.Disputed]: 'bg-red-100 text-red-800',
  [OrderStatus.Refunded]: 'bg-yellow-100 text-yellow-800',
  [OrderStatus.Expired]: 'bg-gray-100 text-gray-500',
  [OrderStatus.Processing]: 'bg-cyan-100 text-cyan-800',
  [OrderStatus.AwaitingConfirmation]: 'bg-teal-100 text-teal-800',
  [OrderStatus.PartiallyRefunded]: 'bg-orange-100 text-orange-800',
};

const FILTER_STATUSES: OrderStatus[] = [
  OrderStatus.Paid,
  OrderStatus.Shipped,
  OrderStatus.Processing,
  OrderStatus.Disputed,
  OrderStatus.Completed,
  OrderStatus.Cancelled,
];

function formatNexBalance(balance: bigint): string {
  const divisor = BigInt('1000000000000');
  const whole = balance / divisor;
  const remainder = balance % divisor;
  const decStr = remainder.toString().padStart(12, '0').slice(0, 4);
  const trimmed = decStr.replace(/0+$/, '');
  return trimmed ? `${whole.toLocaleString()}.${trimmed}` : whole.toLocaleString();
}

// ─── Loading Skeleton ───────────────────────────────────────

function SalesOrdersSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-56" />
      <div className="flex gap-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
      </div>
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-36" />
          </CardContent>
          <CardFooter>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

// ─── Seller Order Card ──────────────────────────────────────

function SellerOrderCard({
  order,
  shopName,
  currentBlock,
}: {
  order: OrderData;
  shopName: string;
  currentBlock: number;
}) {
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const t = useTranslations('orders');
  const te = useTranslations('enums');
  const tc = useTranslations('common');

  const shopId = order.shopId;

  // Each card creates its own mutations so tx state is per-card
  const shipOrder = useEntityMutation('entityTransaction', 'shipOrder', {
    invalidateKeys: [
      ['entity', entityId, 'shop', shopId, 'orders'],
      ['entity', entityId, 'salesOrders'],
    ],
  });
  const approveRefund = useEntityMutation('entityTransaction', 'approveRefund', {
    invalidateKeys: [
      ['entity', entityId, 'shop', shopId, 'orders'],
      ['entity', entityId, 'salesOrders'],
    ],
  });
  const sellerCancelOrder = useEntityMutation('entityTransaction', 'sellerCancelOrder', {
    invalidateKeys: [
      ['entity', entityId, 'shop', shopId, 'orders'],
      ['entity', entityId, 'salesOrders'],
    ],
  });
  const startService = useEntityMutation('entityTransaction', 'startService', {
    invalidateKeys: [
      ['entity', entityId, 'shop', shopId, 'orders'],
      ['entity', entityId, 'salesOrders'],
    ],
  });
  const completeService = useEntityMutation('entityTransaction', 'completeService', {
    invalidateKeys: [
      ['entity', entityId, 'shop', shopId, 'orders'],
      ['entity', entityId, 'salesOrders'],
    ],
  });

  const statusColor = ORDER_STATUS_COLOR[order.status];
  const canAct = !isReadOnly && !isSuspended;

  const sellerActions = getSellerOrderActions(order);
  const derivedStage = getDerivedOrderStage(order);
  const statusLabel = derivedStage
    ? t(derivedStage)
    : te(`orderStatus.${order.status}`);
  const isServiceLike = isServiceLikeCategory(order.productCategory ?? ProductCategory.Physical);

  const [confirmDialog, setConfirmDialog] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);
  const [trackingCidDialog, setTrackingCidDialog] = useState(false);
  const [trackingCid, setTrackingCid] = useState('');
  const [cancelReasonDialog, setCancelReasonDialog] = useState(false);
  const [cancelReasonCid, setCancelReasonCid] = useState('');

  const handleAction = useCallback((action: 'shipOrder' | 'startService' | 'completeService') => {
    switch (action) {
      case 'shipOrder':
        setTrackingCid('');
        setTrackingCidDialog(true);
        return;
      case 'startService':
        startService.mutate([order.id]);
        return;
      case 'completeService':
        completeService.mutate([order.id]);
        return;
    }
  }, [order.id, startService, completeService]);

  const handleShipConfirm = useCallback(() => {
    if (!trackingCid.trim()) return;
    shipOrder.mutate([order.id, trackingCid.trim()]);
    setTrackingCidDialog(false);
  }, [order.id, trackingCid, shipOrder]);

  const handleApproveRefund = useCallback(() => {
    setConfirmDialog({
      title: t('confirmApproveRefund'),
      description: t('confirmApproveRefundDesc', { id: order.id }),
      onConfirm: () => {
        approveRefund.mutate([order.id]);
        setConfirmDialog(null);
      },
    });
  }, [order.id, approveRefund, t]);

  const handleCancel = useCallback(() => {
    setCancelReasonCid('');
    setCancelReasonDialog(true);
  }, []);

  const handleCancelConfirm = useCallback(() => {
    if (!cancelReasonCid.trim()) return;
    sellerCancelOrder.mutate([order.id, cancelReasonCid.trim()]);
    setCancelReasonDialog(false);
  }, [order.id, cancelReasonCid, sellerCancelOrder]);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-sm font-medium">
                {t('orderNumber', { id: order.id })}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {shopName}
                </span>
              </CardTitle>
              <CardDescription className="mt-0.5">
                {t('productAndQty', { productId: order.productId, quantity: order.quantity })}
              </CardDescription>
            </div>
            <Badge className={cn('shrink-0', statusColor)}>
              {statusLabel}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{t('buyer')}: {order.buyer.slice(0, 8)}...{order.buyer.slice(-6)}</p>
            <p>{t('amount')}: {formatNexBalance(order.totalAmount)} {te(`paymentAsset.${order.paymentAsset}`)}</p>
            {order.escrowId != null && <p>{t('escrowId')}: {order.escrowId}</p>}
            {isServiceLike && derivedStage && <p>{t('servicePhase')}: {t(derivedStage)}</p>}
          </div>

          {order.escrowId != null && (
            <>
              <Separator />
              <EscrowStatusSection escrowId={order.escrowId} />
            </>
          )}

          {order.status === OrderStatus.Disputed && (
            <>
              <Separator />
              <DisputeNotice />
            </>
          )}

          <OrderTimeoutWarning
            updatedAt={order.updatedAt}
            currentBlock={currentBlock}
            status={order.status}
          />
        </CardContent>

        {canAct && (
          <PermissionGuard required={AdminPermission.ORDER_MANAGE} fallback={null}>
            <CardFooter className="flex-col items-start gap-2">
              <div className="flex flex-wrap gap-2">
                {sellerActions.includes('shipOrder') && (
                  <Button size="sm" variant="default" onClick={() => handleAction('shipOrder')}>
                    {t('confirmShipment')}
                  </Button>
                )}
                {sellerActions.includes('startService') && (
                  <Button size="sm" variant="secondary" onClick={() => handleAction('startService')}>
                    {t('startService')}
                  </Button>
                )}
                {sellerActions.includes('completeService') && (
                  <Button size="sm" variant="secondary" onClick={() => handleAction('completeService')}>
                    {t('completeService')}
                  </Button>
                )}
                {sellerActions.includes('approveRefund') && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-orange-300 text-orange-600 hover:bg-orange-50"
                    onClick={handleApproveRefund}
                  >
                    {t('approveRefund')}
                  </Button>
                )}
                {sellerActions.includes('sellerCancelOrder') && (
                  <Button size="sm" variant="ghost" onClick={handleCancel}>
                    {t('sellerCancelOrder')}
                  </Button>
                )}
              </div>
              <div>
                <TxStatusIndicator txState={shipOrder.txState} />
                <TxStatusIndicator txState={startService.txState} />
                <TxStatusIndicator txState={completeService.txState} />
                <TxStatusIndicator txState={approveRefund.txState} />
                <TxStatusIndicator txState={sellerCancelOrder.txState} />
              </div>
            </CardFooter>
          </PermissionGuard>
        )}
      </Card>

      {/* Approve refund confirm dialog */}
      <Dialog open={confirmDialog !== null} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog?.title}</DialogTitle>
            <DialogDescription>{confirmDialog?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>{tc('cancel')}</Button>
            <Button variant="destructive" onClick={confirmDialog?.onConfirm}>{tc('confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tracking CID dialog for shipping */}
      <Dialog open={trackingCidDialog} onOpenChange={setTrackingCidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmShipment')}</DialogTitle>
            <DialogDescription>{t('orderNumber', { id: order.id })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor={`tracking-cid-${order.id}`}>{tc('trackingCidLabel') || 'Tracking CID'}</Label>
            <Input
              id={`tracking-cid-${order.id}`}
              value={trackingCid}
              onChange={(e) => setTrackingCid(e.target.value)}
              placeholder={tc('trackingCidPlaceholder') || 'Qm...'}
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrackingCidDialog(false)}>{tc('cancel')}</Button>
            <Button onClick={handleShipConfirm} disabled={!trackingCid.trim()}>{tc('confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel reason CID dialog for seller cancel */}
      <Dialog open={cancelReasonDialog} onOpenChange={setCancelReasonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sellerCancelOrder')}</DialogTitle>
            <DialogDescription>{t('orderNumber', { id: order.id })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor={`cancel-reason-${order.id}`}>{tc('reasonCidLabel') || 'Reason CID'}</Label>
            <Input
              id={`cancel-reason-${order.id}`}
              value={cancelReasonCid}
              onChange={(e) => setCancelReasonCid(e.target.value)}
              placeholder={tc('reasonCidPlaceholder') || 'Qm...'}
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelReasonDialog(false)}>{tc('cancel')}</Button>
            <Button variant="destructive" onClick={handleCancelConfirm} disabled={!cancelReasonCid.trim()}>{tc('confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Per-Shop Cleanup Warning ───────────────────────────────

function ShopCleanupWarning({
  shopId,
  shopName,
  orderCount,
  maxShopOrders,
}: {
  shopId: number;
  shopName: string;
  orderCount: number;
  maxShopOrders: number;
}) {
  const t = useTranslations('orders');
  const { entityId } = useEntityContext();

  const cleanupShopOrders = useEntityMutation('entityTransaction', 'cleanupShopOrders', {
    invalidateKeys: [
      ['entity', entityId, 'shop', shopId, 'orders'],
      ['entity', entityId, 'salesOrders'],
    ],
  });

  const isFull = maxShopOrders > 0 && orderCount >= maxShopOrders;
  const isNearFull = maxShopOrders > 0 && orderCount >= maxShopOrders * 0.8;
  const isBusy = cleanupShopOrders.txState.status === 'signing' || cleanupShopOrders.txState.status === 'broadcasting';

  if (!isNearFull) return null;

  return (
    <Card className={cn(
      'border',
      isFull ? 'border-destructive bg-destructive/5' : 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20',
    )}>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="space-y-1">
          <p className={cn('text-sm font-medium', isFull ? 'text-destructive' : 'text-yellow-700 dark:text-yellow-400')}>
            {shopName}: {isFull ? t('indexFull') : t('indexNearFull')}
          </p>
          {maxShopOrders > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('indexUsage', { count: String(orderCount), max: String(maxShopOrders) })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t('cleanupDesc')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant={isFull ? 'destructive' : 'outline'}
            size="sm"
            disabled={isBusy}
            onClick={() => cleanupShopOrders.mutate([shopId])}
          >
            {t('cleanupOrders')}
          </Button>
          <TxStatusIndicator txState={cleanupShopOrders.txState} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function SalesOrdersPage() {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { orders, orderCountByShop, isLoading, error, shops } = useEntitySalesOrders();
  const { entityOrder } = useChainConstants();
  const currentBlock = useCurrentBlock();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [shopFilter, setShopFilter] = useState<string>('all');

  const maxShopOrders = entityOrder?.maxShopOrders ?? 0;

  // Build a shopId -> shopName map
  const shopNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const shop of shops) {
      map[shop.id] = shop.name || `#${shop.id}`;
    }
    return map;
  }, [shops]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (statusFilter !== 'all') {
      result = result.filter((o) => o.status === statusFilter);
    }
    if (shopFilter !== 'all') {
      result = result.filter((o) => o.shopId === Number(shopFilter));
    }
    // Sort by updatedAt descending (most recent first)
    return [...result].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [orders, statusFilter, shopFilter]);

  if (isLoading) {
    return <SalesOrdersSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">{tc('loadFailed', { error: String(error) })}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // No shops created yet
  if (shops.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight">{t('salesTitle')}</h1>
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">{t('noShops')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('salesTitle')}</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatuses')}</SelectItem>
            {FILTER_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {te(`orderStatus.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={shopFilter} onValueChange={setShopFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t('allShops')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allShops')}</SelectItem>
            {shops.map((shop) => (
              <SelectItem key={shop.id} value={String(shop.id)}>
                {t('shopLabel', { id: shop.id, name: shop.name || `#${shop.id}` })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Per-shop cleanup warnings */}
      {shops.map((shop) => (
        <ShopCleanupWarning
          key={shop.id}
          shopId={shop.id}
          shopName={shop.name || t('shopIdLabel', { id: shop.id })}
          orderCount={orderCountByShop[shop.id] ?? 0}
          maxShopOrders={maxShopOrders}
        />
      ))}

      {/* Order list */}
      {filteredOrders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">{t('noOrders')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <SellerOrderCard
              key={order.id}
              order={order}
              shopName={shopNameMap[order.shopId] ?? t('shopIdLabel', { id: order.shopId })}
              currentBlock={currentBlock}
            />
          ))}
        </div>
      )}
    </div>
  );
}
