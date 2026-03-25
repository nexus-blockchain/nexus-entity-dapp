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
import { CopyableAddress } from '@/components/copyable-address';
import { AdminPermission } from '@/lib/types/models';
import { usePaginatedQuery } from '@/hooks/use-paginated-query';
import { PaginationControls } from '@/components/pagination-controls';
import { OrderStatus, PaymentAsset, ProductCategory } from '@/lib/types/enums';
import { getDerivedOrderStage, getSellerOrderActions, isServiceLikeCategory } from '@/lib/utils';
import { formatNex } from '@/lib/utils/format';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils/cn';
import {
  Package,
  ShoppingCart,
  Truck,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Ban,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────

const ORDER_STATUS_VARIANT: Record<OrderStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  [OrderStatus.Created]: 'outline',
  [OrderStatus.Paid]: 'default',
  [OrderStatus.Shipped]: 'default',
  [OrderStatus.Completed]: 'success',
  [OrderStatus.Cancelled]: 'secondary',
  [OrderStatus.Disputed]: 'destructive',
  [OrderStatus.Refunded]: 'warning',
  [OrderStatus.Expired]: 'secondary',
  [OrderStatus.Processing]: 'default',
  [OrderStatus.AwaitingConfirmation]: 'warning',
  [OrderStatus.PartiallyRefunded]: 'warning',
};

const FILTER_STATUSES: OrderStatus[] = [
  OrderStatus.Paid,
  OrderStatus.Shipped,
  OrderStatus.Processing,
  OrderStatus.AwaitingConfirmation,
  OrderStatus.Disputed,
  OrderStatus.Completed,
  OrderStatus.Cancelled,
  OrderStatus.Refunded,
  OrderStatus.Expired,
];

// ─── Loading Skeleton ───────────────────────────────────────

function SalesOrdersSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-56" />
      {/* Stats cards skeleton */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="mb-2 h-4 w-20" />
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Filters skeleton */}
      <div className="flex gap-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
      </div>
      {/* Table skeleton */}
      <Card>
        <CardContent className="p-0">
          <div className="space-y-0">
            <Skeleton className="h-12 w-full" />
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Summary Stats ──────────────────────────────────────────

function SummaryStats({ orders }: { orders: OrderData[] }) {
  const t = useTranslations('orders');

  const stats = useMemo(() => {
    let pendingCount = 0;
    let shippedCount = 0;
    let completedCount = 0;
    let disputedCount = 0;
    let totalRevenue = BigInt(0);

    for (const o of orders) {
      switch (o.status) {
        case OrderStatus.Paid:
        case OrderStatus.Processing:
          pendingCount++;
          break;
        case OrderStatus.Shipped:
        case OrderStatus.AwaitingConfirmation:
          shippedCount++;
          break;
        case OrderStatus.Completed:
          completedCount++;
          totalRevenue += o.totalAmount;
          break;
        case OrderStatus.Disputed:
          disputedCount++;
          break;
      }
    }
    return { total: orders.length, pendingCount, shippedCount, completedCount, disputedCount, totalRevenue };
  }, [orders]);

  const cards = [
    { label: t('statTotal'), value: stats.total, icon: ShoppingCart, color: 'text-foreground' },
    { label: t('statPending'), value: stats.pendingCount, icon: Clock, color: 'text-blue-600 dark:text-blue-400' },
    { label: t('statShipped'), value: stats.shippedCount, icon: Truck, color: 'text-indigo-600 dark:text-indigo-400' },
    { label: t('statCompleted'), value: stats.completedCount, icon: CheckCircle2, color: 'text-green-600 dark:text-green-400' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="flex items-center gap-3 p-4">
            <c.icon className={cn('h-5 w-5 shrink-0', c.color)} />
            <div>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-xl font-semibold tabular-nums">{c.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Order Row Actions ──────────────────────────────────────

function OrderRowActions({ order }: { order: OrderData }) {
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const shopId = order.shopId;
  const canAct = !isReadOnly && !isSuspended;

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

  const sellerActions = getSellerOrderActions(order);

  const [confirmDialog, setConfirmDialog] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);
  const [trackingCidDialog, setTrackingCidDialog] = useState(false);
  const [trackingCid, setTrackingCid] = useState('');
  const [cancelReasonDialog, setCancelReasonDialog] = useState(false);
  const [cancelReasonCid, setCancelReasonCid] = useState('');

  const handleShipConfirm = useCallback(() => {
    if (!trackingCid.trim()) return;
    shipOrder.mutate([order.id, trackingCid.trim()]);
    setTrackingCidDialog(false);
  }, [order.id, trackingCid, shipOrder]);

  const handleCancelConfirm = useCallback(() => {
    if (!cancelReasonCid.trim()) return;
    sellerCancelOrder.mutate([order.id, cancelReasonCid.trim()]);
    setCancelReasonDialog(false);
  }, [order.id, cancelReasonCid, sellerCancelOrder]);

  if (!canAct || sellerActions.length === 0) return null;

  return (
    <PermissionGuard required={AdminPermission.ORDER_MANAGE} fallback={null}>
      <div className="flex flex-wrap items-center gap-1.5">
        {sellerActions.includes('shipOrder') && (
          <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => { setTrackingCid(''); setTrackingCidDialog(true); }}>
            {t('confirmShipment')}
          </Button>
        )}
        {sellerActions.includes('startService') && (
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => startService.mutate([order.id])}>
            {t('startService')}
          </Button>
        )}
        {sellerActions.includes('completeService') && (
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => completeService.mutate([order.id])}>
            {t('completeService')}
          </Button>
        )}
        {sellerActions.includes('approveRefund') && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-orange-300 text-xs text-orange-600 hover:bg-orange-50"
            onClick={() =>
              setConfirmDialog({
                title: t('confirmApproveRefund'),
                description: t('confirmApproveRefundDesc', { id: order.id }),
                onConfirm: () => {
                  approveRefund.mutate([order.id]);
                  setConfirmDialog(null);
                },
              })
            }
          >
            {t('approveRefund')}
          </Button>
        )}
        {sellerActions.includes('sellerCancelOrder') && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setCancelReasonCid(''); setCancelReasonDialog(true); }}>
            {t('sellerCancelOrder')}
          </Button>
        )}

        <TxStatusIndicator txState={shipOrder.txState} />
        <TxStatusIndicator txState={startService.txState} />
        <TxStatusIndicator txState={completeService.txState} />
        <TxStatusIndicator txState={approveRefund.txState} />
        <TxStatusIndicator txState={sellerCancelOrder.txState} />
      </div>

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

      {/* Tracking CID dialog */}
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

      {/* Cancel reason CID dialog */}
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
    </PermissionGuard>
  );
}

// ─── Order Detail Row (expanded) ────────────────────────────

function OrderDetailRow({ order, currentBlock }: { order: OrderData; currentBlock: number }) {
  const t = useTranslations('orders');
  const te = useTranslations('enums');
  const derivedStage = getDerivedOrderStage(order);
  const isServiceLike = isServiceLikeCategory(order.productCategory ?? ProductCategory.Physical);

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={7} className="p-0">
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Order details */}
          <div className="space-y-2 text-sm">
            <p className="font-medium text-muted-foreground">{t('detailInfo')}</p>
            <div className="space-y-1 text-xs">
              <p>
                <span className="text-muted-foreground">{t('seller')}: </span>
                <CopyableAddress address={order.seller} textClassName="text-xs" />
              </p>
              <p>
                <span className="text-muted-foreground">{t('payer')}: </span>
                <CopyableAddress address={order.payer} textClassName="text-xs" />
              </p>
              <p>
                <span className="text-muted-foreground">{t('unitPrice')}: </span>
                {formatNex(order.unitPrice)} {te(`paymentAsset.${order.paymentAsset}`)}
              </p>
              <p>
                <span className="text-muted-foreground">{t('platformFee')}: </span>
                {formatNex(order.platformFee)} NEX
              </p>
              <p>
                <span className="text-muted-foreground">{t('category')}: </span>
                {te(`productCategory.${order.productCategory}`)}
              </p>
              {isServiceLike && derivedStage && (
                <p>
                  <span className="text-muted-foreground">{t('servicePhase')}: </span>
                  {t(derivedStage)}
                </p>
              )}
            </div>
          </div>

          {/* CID references */}
          <div className="space-y-2 text-sm">
            <p className="font-medium text-muted-foreground">{t('detailCids')}</p>
            <div className="space-y-1 text-xs">
              {order.shippingCid && (
                <p>
                  <span className="text-muted-foreground">{t('shippingCid')}: </span>
                  <span className="font-mono break-all">{order.shippingCid}</span>
                </p>
              )}
              {order.trackingCid && (
                <p>
                  <span className="text-muted-foreground">{t('trackingCid')}: </span>
                  <span className="font-mono break-all">{order.trackingCid}</span>
                </p>
              )}
              {order.noteCid && (
                <p>
                  <span className="text-muted-foreground">{t('noteCid')}: </span>
                  <span className="font-mono break-all">{order.noteCid}</span>
                </p>
              )}
              {order.refundReasonCid && (
                <p>
                  <span className="text-muted-foreground">{t('refundReasonCid')}: </span>
                  <span className="font-mono break-all">{order.refundReasonCid}</span>
                </p>
              )}
              {!order.shippingCid && !order.trackingCid && !order.noteCid && !order.refundReasonCid && (
                <p className="text-muted-foreground">-</p>
              )}
            </div>
          </div>

          {/* Timestamps & flags */}
          <div className="space-y-2 text-sm">
            <p className="font-medium text-muted-foreground">{t('detailTimestamps')}</p>
            <div className="space-y-1 text-xs">
              <p>
                <span className="text-muted-foreground">{t('createdAt')}: </span>
                #{order.createdAt.toLocaleString()}
              </p>
              {order.shippedAt && (
                <p>
                  <span className="text-muted-foreground">{t('shippedAt')}: </span>
                  #{order.shippedAt.toLocaleString()}
                </p>
              )}
              {order.completedAt && (
                <p>
                  <span className="text-muted-foreground">{t('completedAt')}: </span>
                  #{order.completedAt.toLocaleString()}
                </p>
              )}
              {order.serviceStartedAt && (
                <p>
                  <span className="text-muted-foreground">{t('serviceStartedAt')}: </span>
                  #{order.serviceStartedAt.toLocaleString()}
                </p>
              )}
              {order.serviceCompletedAt && (
                <p>
                  <span className="text-muted-foreground">{t('serviceCompletedAt')}: </span>
                  #{order.serviceCompletedAt.toLocaleString()}
                </p>
              )}
              {order.confirmExtended && (
                <Badge variant="outline" className="mt-1 text-[10px]">{t('confirmExtended')}</Badge>
              )}
              {order.disputeRejected && (
                <Badge variant="outline" className="mt-1 ml-1 text-[10px]">{t('disputeRejected')}</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Escrow, Dispute, Timeout */}
        <div className="space-y-2 px-4 pb-4">
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

          {/* Actions */}
          <div className="pt-2">
            <OrderRowActions order={order} />
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── Order Table Row ────────────────────────────────────────

function OrderTableRow({
  order,
  shopName,
  currentBlock,
  expanded,
  onToggle,
}: {
  order: OrderData;
  shopName: string;
  currentBlock: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const te = useTranslations('enums');
  const t = useTranslations('orders');
  const derivedStage = getDerivedOrderStage(order);
  const statusLabel = derivedStage ? t(derivedStage) : te(`orderStatus.${order.status}`);
  const variant = ORDER_STATUS_VARIANT[order.status];
  const sellerActions = getSellerOrderActions(order);
  const hasActions = sellerActions.length > 0;

  return (
    <>
      <TableRow
        className={cn(
          'cursor-pointer',
          expanded && 'border-b-0 bg-muted/20',
          hasActions && !expanded && 'border-l-2 border-l-primary/40',
        )}
        onClick={onToggle}
      >
        <TableCell className="w-8 pl-3">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-mono text-xs font-medium">
          #{order.id}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {shopName}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <CopyableAddress
              address={order.buyer}
              textClassName="text-xs"
              hideCopyIcon
            />
          </div>
        </TableCell>
        <TableCell className="text-right font-mono text-xs tabular-nums">
          <span>{formatNex(order.totalAmount)}</span>
          <span className="ml-1 text-muted-foreground">{te(`paymentAsset.${order.paymentAsset}`)}</span>
        </TableCell>
        <TableCell>
          <Badge variant={variant} className="text-[10px]">
            {statusLabel}
          </Badge>
        </TableCell>
        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
          #{order.updatedAt.toLocaleString()}
        </TableCell>
      </TableRow>
      {expanded && <OrderDetailRow order={order} currentBlock={currentBlock} />}
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
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

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

  const paginated = usePaginatedQuery(filteredOrders, { pageSize: 20 });

  const toggleOrder = useCallback((orderId: number) => {
    setExpandedOrderId((prev) => (prev === orderId ? null : orderId));
  }, []);

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
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight">{t('salesTitle')}</h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12">
            <Package className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('noShops')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('salesTitle')}</h1>

      {/* Summary stats */}
      <SummaryStats orders={orders} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
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

        <span className="text-xs text-muted-foreground">
          {t('resultCount', { count: filteredOrders.length })}
        </span>
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

      {/* Order Table */}
      {filteredOrders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12">
            <Ban className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('noOrders')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="w-20">{t('colOrderId')}</TableHead>
                  <TableHead>{t('colShop')}</TableHead>
                  <TableHead>{t('colBuyer')}</TableHead>
                  <TableHead className="text-right">{t('colAmount')}</TableHead>
                  <TableHead>{t('colStatus')}</TableHead>
                  <TableHead className="text-right">{t('colUpdated')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.items.map((order) => (
                  <OrderTableRow
                    key={order.id}
                    order={order}
                    shopName={shopNameMap[order.shopId] ?? t('shopIdLabel', { id: order.shopId })}
                    currentBlock={currentBlock}
                    expanded={expandedOrderId === order.id}
                    onToggle={() => toggleOrder(order.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <PaginationControls
            page={paginated.page}
            totalPages={paginated.totalPages}
            totalCount={paginated.totalCount}
            hasNextPage={paginated.hasNextPage}
            hasPrevPage={paginated.hasPrevPage}
            onPrevPage={paginated.prevPage}
            onNextPage={paginated.nextPage}
            onSetPage={paginated.setPage}
          />
        </Card>
      )}
    </div>
  );
}
