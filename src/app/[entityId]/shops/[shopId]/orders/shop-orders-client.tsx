'use client';

import React, { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useShopOrders } from '@/hooks/use-orders';
import { useCurrentBlock } from '@/hooks/use-current-block';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { EscrowStatusSection } from '@/components/order/escrow-status-section';
import { DisputeNotice } from '@/components/order/dispute-notice';
import { OrderTimeoutWarning } from '@/components/order/order-timeout-warning';
import { AdminPermission } from '@/lib/types/models';
import { OrderStatus, PaymentAsset, ProductCategory } from '@/lib/types/enums';
import { getValidOrderTransitions } from '@/lib/utils';
import type { OrderData } from '@/lib/types/models';

import { useTranslations } from 'next-intl';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils/cn';

// ─── Constants ──────────────────────────────────────────────

const ORDER_STATUS_CONFIG: Record<OrderStatus, { color: string }> = {
  [OrderStatus.Created]: { color: 'bg-gray-100 text-gray-800' },
  [OrderStatus.Paid]: { color: 'bg-blue-100 text-blue-800' },
  [OrderStatus.Shipped]: { color: 'bg-indigo-100 text-indigo-800' },
  [OrderStatus.ServiceStarted]: { color: 'bg-cyan-100 text-cyan-800' },
  [OrderStatus.ServiceCompleted]: { color: 'bg-teal-100 text-teal-800' },
  [OrderStatus.Confirmed]: { color: 'bg-emerald-100 text-emerald-800' },
  [OrderStatus.Completed]: { color: 'bg-green-100 text-green-800' },
  [OrderStatus.RefundRequested]: { color: 'bg-orange-100 text-orange-800' },
  [OrderStatus.Refunded]: { color: 'bg-yellow-100 text-yellow-800' },
  [OrderStatus.Disputed]: { color: 'bg-red-100 text-red-800' },
  [OrderStatus.Cancelled]: { color: 'bg-gray-100 text-gray-600' },
  [OrderStatus.Expired]: { color: 'bg-gray-100 text-gray-500' },
};

const PAYMENT_LABELS: Record<PaymentAsset, string> = {
  [PaymentAsset.Native]: 'NEX',
  [PaymentAsset.EntityToken]: 'Entity Token',
};

/** Seller transition config: target status → variant */
const SELLER_TRANSITION_CONFIG: Partial<Record<OrderStatus, { variant: 'default' | 'secondary' | 'outline' }>> = {
  [OrderStatus.Shipped]: { variant: 'default' },
  [OrderStatus.Completed]: { variant: 'default' },
  [OrderStatus.ServiceStarted]: { variant: 'secondary' },
  [OrderStatus.ServiceCompleted]: { variant: 'secondary' },
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
    confirmShipment, approveRefund, cancelOrder,
    completeOrder, startService, completeService,
  } = useShopOrders(shopId);
  const statusCfg = ORDER_STATUS_CONFIG[order.status];
  const canAct = !isReadOnly && !isSuspended;

  const category = order.productCategory ?? ProductCategory.Physical;
  const validTransitions = getValidOrderTransitions(category, order.status);

  const [confirmDialog, setConfirmDialog] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);

  const handleTransition = useCallback((target: OrderStatus) => {
    switch (target) {
      case OrderStatus.Shipped:
        confirmShipment.mutate([order.id]);
        break;
      case OrderStatus.Completed:
        completeOrder.mutate([order.id]);
        break;
      case OrderStatus.ServiceStarted:
        startService.mutate([order.id]);
        break;
      case OrderStatus.ServiceCompleted:
        completeService.mutate([order.id]);
        break;
    }
  }, [order.id, confirmShipment, completeOrder, startService, completeService]);

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
    setConfirmDialog({
      title: '确认取消订单',
      description: `确定要取消订单 #${order.id} 吗？`,
      onConfirm: () => {
        cancelOrder.mutate([order.id]);
        setConfirmDialog(null);
      },
    });
  }, [order.id, cancelOrder]);

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
              {order.status}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>买家: {order.buyer.slice(0, 8)}...{order.buyer.slice(-6)}</p>
            <p>金额: {formatNexBalance(order.totalAmount)} {PAYMENT_LABELS[order.paymentAsset]}</p>
            {order.escrowId != null && <p>托管 ID: {order.escrowId}</p>}
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
                {validTransitions.map((target) => {
                  const cfg = SELLER_TRANSITION_CONFIG[target];
                  if (!cfg) return null;
                  return (
                    <Button
                      key={target}
                      size="sm"
                      variant={cfg.variant}
                      onClick={() => handleTransition(target)}
                    >
                      {target}
                    </Button>
                  );
                })}
                {order.status === OrderStatus.RefundRequested && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-orange-300 text-orange-600 hover:bg-orange-50"
                    onClick={handleApproveRefund}
                  >
                    批准退款
                  </Button>
                )}
                {(order.status === OrderStatus.Created || order.status === OrderStatus.Paid) && (
                  <Button size="sm" variant="ghost" onClick={handleCancel}>
                    取消订单
                  </Button>
                )}
              </div>
              <div>
                <TxStatusIndicator txState={confirmShipment.txState} />
                <TxStatusIndicator txState={completeOrder.txState} />
                <TxStatusIndicator txState={startService.txState} />
                <TxStatusIndicator txState={completeService.txState} />
                <TxStatusIndicator txState={approveRefund.txState} />
                <TxStatusIndicator txState={cancelOrder.txState} />
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
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>取消</Button>
            <Button variant="destructive" onClick={confirmDialog?.onConfirm}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function ShopOrdersPage() {
  const t = useTranslations('shops');
  const params = useParams();
  const shopId = Number(params.shopId);
  const { orders, isLoading, error } = useShopOrders(shopId);
  const currentBlock = useCurrentBlock();

  if (isLoading) {
    return <ShopOrdersSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">加载失败</CardTitle>
            <CardDescription>{String(error)}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('orders.title')}</h1>

      {orders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">暂无订单</p>
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
