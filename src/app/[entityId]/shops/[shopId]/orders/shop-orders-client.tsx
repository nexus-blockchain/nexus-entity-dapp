'use client';

import React, { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useShopOrders } from '@/hooks/use-orders';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';

// ─── Constants ──────────────────────────────────────────────

const ORDER_STATUS_CONFIG: Record<OrderStatus, { color: string }> = {
  [OrderStatus.Created]: { color: 'bg-gray-100 text-gray-800' },
  [OrderStatus.Paid]: { color: 'bg-blue-100 text-blue-800' },
  [OrderStatus.Shipped]: { color: 'bg-indigo-100 text-indigo-800' },
  [OrderStatus.Completed]: { color: 'bg-green-100 text-green-800' },
  [OrderStatus.Cancelled]: { color: 'bg-gray-100 text-gray-600' },
  [OrderStatus.Disputed]: { color: 'bg-red-100 text-red-800' },
  [OrderStatus.Refunded]: { color: 'bg-yellow-100 text-yellow-800' },
  [OrderStatus.Expired]: { color: 'bg-gray-100 text-gray-500' },
  [OrderStatus.Processing]: { color: 'bg-cyan-100 text-cyan-800' },
  [OrderStatus.AwaitingConfirmation]: { color: 'bg-teal-100 text-teal-800' },
  [OrderStatus.PartiallyRefunded]: { color: 'bg-orange-100 text-orange-800' },
};

function formatNexBalance(balance: bigint): string {
  const divisor = BigInt('1000000000000');
  const whole = balance / divisor;
  const remainder = balance % divisor;
  const decStr = remainder.toString().padStart(12, '0').slice(0, 4);
  const trimmed = decStr.replace(/0+$/, '');
  return trimmed ? `${whole.toLocaleString()}.${trimmed}` : whole.toLocaleString();
}

// ─── Loading Skeleton ───────────────────────────────────────

function ShopOrdersSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-56" />
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

function SellerOrderCard({ order, shopId, currentBlock }: { order: OrderData; shopId: number; currentBlock: number }) {
  const { isReadOnly, isSuspended } = useEntityContext();
  const t = useTranslations('shops');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const {
    shipOrder, approveRefund, cancelOrder, sellerCancelOrder,
    startService, completeService,
  } = useShopOrders(shopId);
  const statusCfg = ORDER_STATUS_CONFIG[order.status];
  const canAct = !isReadOnly && !isSuspended;

  const sellerActions = getSellerOrderActions(order);
  const derivedStage = getDerivedOrderStage(order);
  const statusLabel = derivedStage
    ? t(`orders.${derivedStage}`)
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
        // Pallet: ship_order(order_id, tracking_cid: Vec<u8>) — tracking_cid is required
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
      title: '确认批准退款',
      description: `确定要批准订单 #${order.id} 的退款请求吗？`,
      onConfirm: () => {
        approveRefund.mutate([order.id]);
        setConfirmDialog(null);
      },
    });
  }, [order.id, approveRefund]);

  const handleCancel = useCallback(() => {
    setCancelReasonCid('');
    setCancelReasonDialog(true);
  }, []);

  const handleCancelConfirm = useCallback(() => {
    if (!cancelReasonCid.trim()) return;
    // Pallet: seller_cancel_order(order_id, reason_cid: Vec<u8>)
    sellerCancelOrder.mutate([order.id, cancelReasonCid.trim()]);
    setCancelReasonDialog(false);
  }, [order.id, cancelReasonCid, sellerCancelOrder]);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-sm font-medium">订单 #{order.id}</CardTitle>
              <CardDescription className="mt-0.5">
                商品 #{order.productId} · 数量 {order.quantity}
              </CardDescription>
            </div>
            <Badge className={cn('shrink-0', statusCfg.color)}>
              {statusLabel}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>买家: {order.buyer.slice(0, 8)}...{order.buyer.slice(-6)}</p>
            <p>金额: {formatNexBalance(order.totalAmount)} {order.paymentAsset === PaymentAsset.Native ? 'NEX' : 'Entity Token'}</p>
            {order.shoppingBalanceUsed > BigInt(0) && <p>购物余额支付: {formatNexBalance(order.shoppingBalanceUsed)} NEX</p>}
            {order.tokenDiscountTokensBurned > BigInt(0) && <p>折扣代币燃烧: {formatNexBalance(order.tokenDiscountTokensBurned)} Token</p>}
            {order.escrowId != null && <p>托管 ID: {order.escrowId}</p>}
            {isServiceLike && derivedStage && <p>服务阶段: {t(`orders.${derivedStage}`)}</p>}
          </div>

          {/* Escrow status display */}
          {order.escrowId != null && (
            <>
              <Separator />
              <EscrowStatusSection escrowId={order.escrowId} />
            </>
          )}

          {/* Dispute notice */}
          {order.status === OrderStatus.Disputed && (
            <>
              <Separator />
              <DisputeNotice />
            </>
          )}

          {/* Timeout warning */}
          <OrderTimeoutWarning
            updatedAt={order.updatedAt}
            currentBlock={currentBlock}
            status={order.status}
          />
        </CardContent>

        {/* Seller actions -- driven by order flow transitions */}
        {canAct && (
          <PermissionGuard required={AdminPermission.ORDER_MANAGE} fallback={null}>
            <CardFooter className="flex-col items-start gap-2">
              <div className="flex flex-wrap gap-2">
                {sellerActions.includes('shipOrder') && (
                  <Button size="sm" variant="default" onClick={() => handleAction('shipOrder')}>
                    {t('orders.confirmShipment')}
                  </Button>
                )}
                {sellerActions.includes('startService') && (
                  <Button size="sm" variant="secondary" onClick={() => handleAction('startService')}>
                    {t('orders.startService')}
                  </Button>
                )}
                {sellerActions.includes('completeService') && (
                  <Button size="sm" variant="secondary" onClick={() => handleAction('completeService')}>
                    {t('orders.completeService')}
                  </Button>
                )}
                {sellerActions.includes('approveRefund') && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-orange-300 text-orange-600 hover:bg-orange-50"
                    onClick={handleApproveRefund}
                  >
                    {t('orders.approveRefund')}
                  </Button>
                )}
                {sellerActions.includes('sellerCancelOrder') && (
                  <Button size="sm" variant="ghost" onClick={handleCancel}>
                    {t('orders.cancelOrder')}
                  </Button>
                )}
              </div>
              <div>
                <TxStatusIndicator txState={shipOrder.txState} />
                <TxStatusIndicator txState={startService.txState} />
                <TxStatusIndicator txState={completeService.txState} />
                <TxStatusIndicator txState={approveRefund.txState} />
                <TxStatusIndicator txState={cancelOrder.txState} />
                <TxStatusIndicator txState={sellerCancelOrder.txState} />
              </div>
            </CardFooter>
          </PermissionGuard>
        )}
      </Card>

      <Dialog open={confirmDialog !== null} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog?.title}</DialogTitle>
            <DialogDescription>{confirmDialog?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>{t('orders.cancelOrder') || 'Cancel'}</Button>
            <Button variant="destructive" onClick={confirmDialog?.onConfirm}>{tc('confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tracking CID dialog for shipping */}
      <Dialog open={trackingCidDialog} onOpenChange={setTrackingCidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('orders.confirmShipment')}</DialogTitle>
            <DialogDescription>{t('orders.orderNumber', { id: order.id }) || `Order #${order.id}`}</DialogDescription>
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
            <DialogTitle>{t('orders.cancelOrder')}</DialogTitle>
            <DialogDescription>{t('orders.orderNumber', { id: order.id }) || `Order #${order.id}`}</DialogDescription>
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

// ─── Page ───────────────────────────────────────────────────

export function ShopOrdersPage() {
  const t = useTranslations('shops');
  const tc = useTranslations('common');
  const params = useParams();
  const shopId = Number(params.shopId);
  const { orders, orderIndexCount, isLoading, error, cleanupShopOrders } = useShopOrders(shopId);
  const { entityOrder } = useChainConstants();
  const currentBlock = useCurrentBlock();

  const maxShopOrders = entityOrder?.maxShopOrders ?? 0;
  const isFull = maxShopOrders > 0 && orderIndexCount >= maxShopOrders;
  const isNearFull = maxShopOrders > 0 && orderIndexCount >= maxShopOrders * 0.8;
  const isBusy = cleanupShopOrders.txState.status === 'signing' || cleanupShopOrders.txState.status === 'broadcasting';

  if (isLoading) {
    return <ShopOrdersSkeleton />;
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('orders.title')}</h1>

      {isNearFull && (
        <Card className={cn(
          'border',
          isFull ? 'border-destructive bg-destructive/5' : 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20',
        )}>
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="space-y-1">
              <p className={cn('text-sm font-medium', isFull ? 'text-destructive' : 'text-yellow-700 dark:text-yellow-400')}>
                {isFull ? t('orders.indexFull') : t('orders.indexNearFull')}
              </p>
              {maxShopOrders > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('orders.indexUsage', { count: String(orderIndexCount), max: String(maxShopOrders) })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t('orders.cleanupDesc')}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant={isFull ? 'destructive' : 'outline'}
                size="sm"
                disabled={isBusy}
                onClick={() => cleanupShopOrders.mutate([shopId])}
              >
                {t('orders.cleanupOrders')}
              </Button>
              <TxStatusIndicator txState={cleanupShopOrders.txState} />
            </div>
          </CardContent>
        </Card>
      )}

      {orders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">{t('orders.noOrders')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <SellerOrderCard key={order.id} order={order} shopId={shopId} currentBlock={currentBlock} />
          ))}
        </div>
      )}
    </div>
  );
}
