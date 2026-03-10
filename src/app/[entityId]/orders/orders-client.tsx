'use client';

import React, { useState, useCallback } from 'react';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useBuyerOrders } from '@/hooks/use-orders';
import { useCurrentBlock } from '@/hooks/use-current-block';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { EscrowStatusSection } from '@/components/order/escrow-status-section';
import { DisputeNotice } from '@/components/order/dispute-notice';
import { OrderTimeoutWarning } from '@/components/order/order-timeout-warning';
import { OrderStatus, PaymentAsset, ProductCategory } from '@/lib/types/enums';
import { getValidOrderTransitions } from '@/lib/utils';
import type { OrderData } from '@/lib/types/models';

import { useTranslations } from 'next-intl';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils/cn';

// ─── Constants ──────────────────────────────────────────────

const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  [OrderStatus.Created]: 'bg-gray-100 text-gray-800',
  [OrderStatus.Paid]: 'bg-blue-100 text-blue-800',
  [OrderStatus.Shipped]: 'bg-indigo-100 text-indigo-800',
  [OrderStatus.ServiceStarted]: 'bg-cyan-100 text-cyan-800',
  [OrderStatus.ServiceCompleted]: 'bg-teal-100 text-teal-800',
  [OrderStatus.Confirmed]: 'bg-emerald-100 text-emerald-800',
  [OrderStatus.Completed]: 'bg-green-100 text-green-800',
  [OrderStatus.RefundRequested]: 'bg-orange-100 text-orange-800',
  [OrderStatus.Refunded]: 'bg-yellow-100 text-yellow-800',
  [OrderStatus.Disputed]: 'bg-red-100 text-red-800',
  [OrderStatus.Cancelled]: 'bg-gray-100 text-gray-600',
  [OrderStatus.Expired]: 'bg-gray-100 text-gray-500',
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

function OrdersSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-36" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Place Order Form ───────────────────────────────────────

function PlaceOrderForm() {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const { isReadOnly, isSuspended } = useEntityContext();
  const { placeOrder } = useBuyerOrders();

  const [form, setForm] = useState({
    shopId: '',
    productId: '',
    quantity: '1',
    paymentAsset: PaymentAsset.Native as PaymentAsset,
    useShoppingBalance: false,
    referrer: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const setField = useCallback((key: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const validate = useCallback((): boolean => {
    const fieldErrors: Record<string, string> = {};

    const shopId = Number(form.shopId);
    if (!Number.isInteger(shopId) || shopId <= 0) fieldErrors.shopId = t('validShopId');

    const productId = Number(form.productId);
    if (!Number.isInteger(productId) || productId <= 0) fieldErrors.productId = t('validProductId');

    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) fieldErrors.quantity = t('validQuantity');

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return false;
    }
    return true;
  }, [form]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (validate()) {
        setShowConfirmDialog(true);
      }
    },
    [validate],
  );

  const handleConfirmOrder = useCallback(() => {
    const shopId = Number(form.shopId);
    const productId = Number(form.productId);
    const quantity = Number(form.quantity);
    const referrer = form.referrer.trim() || null;

    placeOrder.mutate([
      shopId,
      productId,
      quantity,
      form.paymentAsset,
      form.useShoppingBalance,
      referrer,
    ]);
    setShowConfirmDialog(false);
  }, [form, placeOrder]);

  if (isReadOnly || isSuspended) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('placeOrder')}</CardTitle>
          <CardDescription>{t('placeOrderDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="order-shop-id">{t('shopId')}</Label>
                <Input
                  id="order-shop-id"
                  type="number"
                  min="1"
                  value={form.shopId}
                  onChange={(e) => setField('shopId', e.target.value)}
                  required
                />
                {errors.shopId && <p className="text-xs text-destructive">{errors.shopId}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-product-id">{t('productId')}</Label>
                <Input
                  id="order-product-id"
                  type="number"
                  min="1"
                  value={form.productId}
                  onChange={(e) => setField('productId', e.target.value)}
                  required
                />
                {errors.productId && <p className="text-xs text-destructive">{errors.productId}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-quantity">{t('quantity')}</Label>
                <Input
                  id="order-quantity"
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) => setField('quantity', e.target.value)}
                  required
                />
                {errors.quantity && <p className="text-xs text-destructive">{errors.quantity}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('paymentMethod')}</Label>
                <Select
                  value={String(form.paymentAsset)}
                  onValueChange={(value) => setField('paymentAsset', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectPaymentMethod')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={String(PaymentAsset.Native)}>{t('nexNative')}</SelectItem>
                    <SelectItem value={String(PaymentAsset.EntityToken)}>{t('entityToken')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-referrer">{t('referrerAddress')}</Label>
                <Input
                  id="order-referrer"
                  type="text"
                  value={form.referrer}
                  onChange={(e) => setField('referrer', e.target.value)}
                  placeholder={t('referrerPlaceholder')}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="use-shopping-balance"
                checked={form.useShoppingBalance}
                onCheckedChange={(checked) => setField('useShoppingBalance', checked)}
              />
              <Label htmlFor="use-shopping-balance">{t('useShoppingBalance')}</Label>
            </div>

            <Separator />

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={placeOrder.txState.status === 'signing' || placeOrder.txState.status === 'broadcasting'}
              >
                {t('submitOrder')}
              </Button>
              <TxStatusIndicator txState={placeOrder.txState} />
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmOrder')}</DialogTitle>
            <DialogDescription>
              {t('orderInfo')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleConfirmOrder}>
              {tc('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Buyer Order Card ───────────────────────────────────────

function BuyerOrderCard({ order, currentBlock }: { order: OrderData; currentBlock: number }) {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { isReadOnly, isSuspended } = useEntityContext();
  const { confirmReceipt, requestRefund, cancelOrder, confirmServiceCompletion } = useBuyerOrders();
  const statusColor = ORDER_STATUS_COLOR[order.status];
  const canAct = !isReadOnly && !isSuspended;

  const category = order.productCategory ?? ProductCategory.Physical;
  const validTransitions = getValidOrderTransitions(category, order.status);

  const [confirmDialog, setConfirmDialog] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);

  const BUYER_TRANSITION_LABEL: Partial<Record<OrderStatus, string>> = {
    [OrderStatus.Completed]: t('confirmReceipt'),
    [OrderStatus.Confirmed]: t('confirmServiceCompletion'),
  };

  const handleTransition = useCallback((target: OrderStatus) => {
    switch (target) {
      case OrderStatus.Completed:
        confirmReceipt.mutate([order.id]);
        break;
      case OrderStatus.Confirmed:
        confirmServiceCompletion.mutate([order.id]);
        break;
    }
  }, [order.id, confirmReceipt, confirmServiceCompletion]);

  const handleRequestRefund = useCallback(() => {
    setConfirmDialog({
      title: t('requestRefund'),
      description: t('orderNumber', { id: order.id }),
      onConfirm: () => {
        requestRefund.mutate([order.id]);
        setConfirmDialog(null);
      },
    });
  }, [order.id, requestRefund, t]);

  const handleCancel = useCallback(() => {
    setConfirmDialog({
      title: t('cancelOrder'),
      description: t('orderNumber', { id: order.id }),
      onConfirm: () => {
        cancelOrder.mutate([order.id]);
        setConfirmDialog(null);
      },
    });
  }, [order.id, cancelOrder, t]);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-sm font-medium">{t('orderNumber', { id: order.id })}</CardTitle>
              <CardDescription className="mt-0.5">
                {t('shopAndProduct', { shopId: order.shopId, productId: order.productId, quantity: order.quantity })}
              </CardDescription>
            </div>
            <Badge className={cn('shrink-0', statusColor)}>
              {te(`orderStatus.${order.status}`)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{t('amount')}: {formatNexBalance(order.totalAmount)} {te(`paymentAsset.${order.paymentAsset}`)}</p>
            {order.escrowId != null && <p>{t('escrowId')}: {order.escrowId}</p>}
          </div>

          {/* Escrow status display */}
          {order.escrowId != null && <EscrowStatusSection escrowId={order.escrowId} />}

          {/* Dispute notice */}
          {order.status === OrderStatus.Disputed && <DisputeNotice />}

          {/* Timeout warning */}
          <OrderTimeoutWarning
            updatedAt={order.updatedAt}
            currentBlock={currentBlock}
            status={order.status}
          />
        </CardContent>

        {/* Buyer actions -- driven by order flow transitions */}
        {canAct && (
          <CardFooter className="flex-col items-start gap-2">
            <div className="flex flex-wrap gap-2">
              {validTransitions.map((target) => {
                const label = BUYER_TRANSITION_LABEL[target];
                if (!label) return null;
                return (
                  <Button
                    key={target}
                    size="sm"
                    variant="default"
                    onClick={() => handleTransition(target)}
                  >
                    {label}
                  </Button>
                );
              })}
              {(order.status === OrderStatus.Paid || order.status === OrderStatus.Shipped) && (
                <Button size="sm" variant="outline" className="border-orange-300 text-orange-600 hover:bg-orange-50" onClick={handleRequestRefund}>
                  {t('requestRefund')}
                </Button>
              )}
              {order.status === OrderStatus.Created && (
                <Button size="sm" variant="ghost" onClick={handleCancel}>
                  {t('cancelOrder')}
                </Button>
              )}
            </div>
            <div>
              <TxStatusIndicator txState={confirmReceipt.txState} />
              <TxStatusIndicator txState={confirmServiceCompletion.txState} />
              <TxStatusIndicator txState={requestRefund.txState} />
              <TxStatusIndicator txState={cancelOrder.txState} />
            </div>
          </CardFooter>
        )}
      </Card>

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
    </>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function BuyerOrdersPage() {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const { orders, isLoading, error } = useBuyerOrders();
  const currentBlock = useCurrentBlock();

  if (isLoading) {
    return <OrdersSkeleton />;
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
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>

      <PlaceOrderForm />

      {orders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">{t('noOrders')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <BuyerOrderCard key={order.id} order={order} currentBlock={currentBlock} />
          ))}
        </div>
      )}
    </div>
  );
}
