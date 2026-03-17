'use client';

import React, { useState, useCallback } from 'react';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useBuyerOrders } from '@/hooks/use-orders';
import { useChainConstants } from '@/hooks/use-chain-constants';
import { useCurrentBlock } from '@/hooks/use-current-block';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { EscrowStatusSection } from '@/components/order/escrow-status-section';
import { DisputeNotice } from '@/components/order/dispute-notice';
import { OrderTimeoutWarning } from '@/components/order/order-timeout-warning';
import { OrderStatus, PaymentAsset, ProductCategory } from '@/lib/types/enums';
import { getBuyerOrderActions, getDerivedOrderStage, isServiceLikeCategory } from '@/lib/utils';
import type { OrderData } from '@/lib/types/models';

import { useTranslations } from 'next-intl';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTip } from '@/components/field-help-tip';
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
  [OrderStatus.Completed]: 'bg-green-100 text-green-800',
  [OrderStatus.Cancelled]: 'bg-gray-100 text-gray-600',
  [OrderStatus.Disputed]: 'bg-red-100 text-red-800',
  [OrderStatus.Refunded]: 'bg-yellow-100 text-yellow-800',
  [OrderStatus.Expired]: 'bg-gray-100 text-gray-500',
  [OrderStatus.Processing]: 'bg-cyan-100 text-cyan-800',
  [OrderStatus.AwaitingConfirmation]: 'bg-teal-100 text-teal-800',
  [OrderStatus.PartiallyRefunded]: 'bg-orange-100 text-orange-800',
};

function formatNexBalance(balance: bigint): string {
  const divisor = BigInt('1000000000000');
  const whole = balance / divisor;
  const remainder = balance % divisor;
  const decStr = remainder.toString().padStart(12, '0').slice(0, 4);
  const trimmed = decStr.replace(/0+$/, '');
  return trimmed ? `${whole.toLocaleString()}.${trimmed}` : whole.toLocaleString();
}

function nexAmountToChain(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '0';
  const parts = trimmed.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(12, '0').slice(0, 12);
  return (BigInt(whole) * BigInt(1_000_000_000_000) + BigInt(frac)).toString();
}

function isPositiveAmountInput(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) return false;
  return BigInt(nexAmountToChain(trimmed)) > 0n;
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
    productId: '',
    quantity: '1',
    shippingCid: '',
    useTokens: false,
    tokenAmount: '',
    paymentAsset: PaymentAsset.Native as PaymentAsset,
    useShoppingBalance: false,
    shoppingBalanceAmount: '',
    noteCid: '',
    referrer: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const setField = useCallback((key: string, value: string | boolean) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'paymentAsset' && value === PaymentAsset.EntityToken) {
        next.useTokens = false;
        next.tokenAmount = '';
        next.useShoppingBalance = false;
        next.shoppingBalanceAmount = '';
      }
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const validate = useCallback((): boolean => {
    const fieldErrors: Record<string, string> = {};

    const productId = Number(form.productId);
    if (!Number.isInteger(productId) || productId <= 0) fieldErrors.productId = t('validProductId');

    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) fieldErrors.quantity = t('validQuantity');

    if (form.paymentAsset === PaymentAsset.Native && form.useTokens && !isPositiveAmountInput(form.tokenAmount)) {
      fieldErrors.tokenAmount = t('validTokenAmount');
    }

    if (
      form.paymentAsset === PaymentAsset.Native &&
      form.useShoppingBalance &&
      !isPositiveAmountInput(form.shoppingBalanceAmount)
    ) {
      fieldErrors.shoppingBalanceAmount = t('validShoppingBalanceAmount');
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return false;
    }
    return true;
  }, [form, t]);

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
    const productId = Number(form.productId);
    const quantity = Number(form.quantity);
    const shippingCid = form.shippingCid.trim() || null;
    const noteCid = form.noteCid.trim() || null;
    const referrer = form.referrer.trim() || null;
    const useTokens = form.paymentAsset === PaymentAsset.Native && form.useTokens
      ? nexAmountToChain(form.tokenAmount)
      : null;
    const useShoppingBalance = form.paymentAsset === PaymentAsset.Native && form.useShoppingBalance
      ? nexAmountToChain(form.shoppingBalanceAmount)
      : null;

    // Pallet: place_order(product_id, quantity, shipping_cid, use_tokens, use_shopping_balance,
    //                      payment_asset, note_cid, referrer, max_nex_amount, max_token_amount)
    placeOrder.mutate([
      productId,
      quantity,
      shippingCid,
      useTokens,
      useShoppingBalance,
      form.paymentAsset,
      noteCid,
      referrer,
      null, // max_nex_amount
      null, // max_token_amount
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <LabelWithTip htmlFor="order-product-id" tip={t('help.productId')}>{t('productId')}</LabelWithTip>
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
                <LabelWithTip htmlFor="order-quantity" tip={t('help.quantity')}>{t('quantity')}</LabelWithTip>
                <Input
                  id="order-quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={form.quantity}
                  onChange={(e) => setField('quantity', e.target.value)}
                  required
                />
                {errors.quantity && <p className="text-xs text-destructive">{errors.quantity}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <LabelWithTip tip={t('help.paymentMethod')}>{t('paymentMethod')}</LabelWithTip>
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
                <LabelWithTip htmlFor="order-referrer" tip={t('help.referrerAddress')}>{t('referrerAddress')}</LabelWithTip>
                <Input
                  id="order-referrer"
                  type="text"
                  value={form.referrer}
                  onChange={(e) => setField('referrer', e.target.value)}
                  placeholder={t('referrerPlaceholder')}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="order-shipping-cid">{t('shippingCid') ?? 'Shipping CID'}</Label>
                <Input
                  id="order-shipping-cid"
                  type="text"
                  value={form.shippingCid}
                  onChange={(e) => setField('shippingCid', e.target.value)}
                  placeholder="Qm..."
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-note-cid">{t('noteCid') ?? 'Note CID'}</Label>
                <Input
                  id="order-note-cid"
                  type="text"
                  value={form.noteCid}
                  onChange={(e) => setField('noteCid', e.target.value)}
                  placeholder="Qm..."
                  className="font-mono text-sm"
                />
              </div>
            </div>

            {form.paymentAsset === PaymentAsset.Native ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="use-shopping-balance"
                      checked={form.useShoppingBalance}
                      onCheckedChange={(checked) => setField('useShoppingBalance', checked)}
                    />
                    <LabelWithTip htmlFor="use-shopping-balance" tip={t('help.useShoppingBalance')}>{t('useShoppingBalance')}</LabelWithTip>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="use-tokens"
                      checked={form.useTokens}
                      onCheckedChange={(checked) => setField('useTokens', checked)}
                    />
                    <LabelWithTip htmlFor="use-tokens" tip={t('help.useTokens')}>{t('useTokens')}</LabelWithTip>
                  </div>
                </div>

                {(form.useShoppingBalance || form.useTokens) && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {form.useShoppingBalance && (
                      <div className="space-y-2">
                        <LabelWithTip htmlFor="shopping-balance-amount" tip={t('help.shoppingBalanceAmount')}>
                          {t('shoppingBalanceAmount')}
                        </LabelWithTip>
                        <Input
                          id="shopping-balance-amount"
                          type="text"
                          inputMode="decimal"
                          value={form.shoppingBalanceAmount}
                          onChange={(e) => setField('shoppingBalanceAmount', e.target.value)}
                          placeholder={t('shoppingBalanceAmountPlaceholder')}
                        />
                        {errors.shoppingBalanceAmount && (
                          <p className="text-xs text-destructive">{errors.shoppingBalanceAmount}</p>
                        )}
                      </div>
                    )}

                    {form.useTokens && (
                      <div className="space-y-2">
                        <LabelWithTip htmlFor="token-amount" tip={t('help.tokenAmount')}>
                          {t('tokenAmount')}
                        </LabelWithTip>
                        <Input
                          id="token-amount"
                          type="text"
                          inputMode="decimal"
                          value={form.tokenAmount}
                          onChange={(e) => setField('tokenAmount', e.target.value)}
                          placeholder={t('tokenAmountPlaceholder')}
                        />
                        {errors.tokenAmount && (
                          <p className="text-xs text-destructive">{errors.tokenAmount}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('loyaltyDeductionNativeOnly')}</p>
            )}

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
  const { confirmReceipt, requestRefund, cancelOrder, confirmService } = useBuyerOrders();
  const statusColor = ORDER_STATUS_COLOR[order.status];
  const canAct = !isReadOnly && !isSuspended;

  const buyerActions = getBuyerOrderActions(order);
  const derivedStage = getDerivedOrderStage(order);
  const statusLabel = derivedStage
    ? t(derivedStage)
    : te(`orderStatus.${order.status}`);
  const isServiceLike = isServiceLikeCategory(order.productCategory ?? ProductCategory.Physical);

  const [confirmDialog, setConfirmDialog] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);
  const [refundReasonDialog, setRefundReasonDialog] = useState(false);
  const [refundReasonCid, setRefundReasonCid] = useState('');

  const handleAction = useCallback((action: 'confirmReceipt' | 'confirmService') => {
    switch (action) {
      case 'confirmReceipt':
        confirmReceipt.mutate([order.id]);
        return;
      case 'confirmService':
        confirmService.mutate([order.id]);
        return;
    }
  }, [order.id, confirmReceipt, confirmService]);

  const handleRequestRefund = useCallback(() => {
    setRefundReasonCid('');
    setRefundReasonDialog(true);
  }, []);

  const handleRefundConfirm = useCallback(() => {
    if (!refundReasonCid.trim()) return;
    // Pallet: request_refund(order_id, reason_cid: Vec<u8>) — reason_cid is required
    requestRefund.mutate([order.id, refundReasonCid.trim()]);
    setRefundReasonDialog(false);
  }, [order.id, refundReasonCid, requestRefund]);

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
              {statusLabel}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{t('amount')}: {formatNexBalance(order.totalAmount)} {te(`paymentAsset.${order.paymentAsset}`)}</p>
            {order.escrowId != null && <p>{t('escrowId')}: {order.escrowId}</p>}
            {isServiceLike && derivedStage && <p>{t('servicePhase')}: {t(derivedStage)}</p>}
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
              {buyerActions.includes('confirmReceipt') && (
                <Button size="sm" variant="default" onClick={() => handleAction('confirmReceipt')}>
                  {t('confirmReceipt')}
                </Button>
              )}
              {buyerActions.includes('confirmService') && (
                <Button size="sm" variant="default" onClick={() => handleAction('confirmService')}>
                  {t('confirmServiceCompletion')}
                </Button>
              )}
              {buyerActions.includes('requestRefund') && (
                <Button size="sm" variant="outline" className="border-orange-300 text-orange-600 hover:bg-orange-50" onClick={handleRequestRefund}>
                  {t('requestRefund')}
                </Button>
              )}
              {buyerActions.includes('cancelOrder') && (
                <Button size="sm" variant="ghost" onClick={handleCancel}>
                  {t('cancelOrder')}
                </Button>
              )}
            </div>
            <div>
              <TxStatusIndicator txState={confirmReceipt.txState} />
              <TxStatusIndicator txState={confirmService.txState} />
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

      {/* Refund reason CID dialog */}
      <Dialog open={refundReasonDialog} onOpenChange={setRefundReasonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('requestRefund')}</DialogTitle>
            <DialogDescription>{t('orderNumber', { id: order.id })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor={`refund-reason-${order.id}`}>{tc('reasonCidLabel') || 'Reason CID'}</Label>
            <Input
              id={`refund-reason-${order.id}`}
              value={refundReasonCid}
              onChange={(e) => setRefundReasonCid(e.target.value)}
              placeholder={tc('reasonCidPlaceholder') || 'Qm...'}
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundReasonDialog(false)}>{tc('cancel')}</Button>
            <Button variant="destructive" onClick={handleRefundConfirm} disabled={!refundReasonCid.trim()}>{tc('confirm')}</Button>
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
  const { orders, orderIndexCount, isLoading, error, cleanupBuyerOrders } = useBuyerOrders();
  const { entityOrder } = useChainConstants();
  const currentBlock = useCurrentBlock();

  const maxBuyerOrders = entityOrder?.maxBuyerOrders ?? 0;
  const isFull = maxBuyerOrders > 0 && orderIndexCount >= maxBuyerOrders;
  const isNearFull = maxBuyerOrders > 0 && orderIndexCount >= maxBuyerOrders * 0.8;
  const isBusy = cleanupBuyerOrders.txState.status === 'signing' || cleanupBuyerOrders.txState.status === 'broadcasting';

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

      {isNearFull && (
        <Card className={cn(
          'border',
          isFull ? 'border-destructive bg-destructive/5' : 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20',
        )}>
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="space-y-1">
              <p className={cn('text-sm font-medium', isFull ? 'text-destructive' : 'text-yellow-700 dark:text-yellow-400')}>
                {isFull ? t('indexFull') : t('indexNearFull')}
              </p>
              {maxBuyerOrders > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('indexUsage', { count: String(orderIndexCount), max: String(maxBuyerOrders) })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t('cleanupDesc')}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant={isFull ? 'destructive' : 'outline'}
                size="sm"
                disabled={isBusy}
                onClick={() => cleanupBuyerOrders.mutate([])}
              >
                {t('cleanupOrders')}
              </Button>
              <TxStatusIndicator txState={cleanupBuyerOrders.txState} />
            </div>
          </CardContent>
        </Card>
      )}

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
