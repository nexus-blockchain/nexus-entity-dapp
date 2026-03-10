'use client';

import React, { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { useEntityMarket } from '@/hooks/use-entity-market';
import { useNexMarket } from '@/hooks/use-nex-market';
import type { MarketOrder } from '@/lib/types/models';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils/cn';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy-load chart component
const MarketChart = dynamic(() => import('@/components/market-chart'), {
  ssr: false,
  loading: () => (
    <Card>
      <CardContent className="flex h-48 items-center justify-center p-6">
        <MarketChartLoadingText />
      </CardContent>
    </Card>
  ),
});

function MarketChartLoadingText() {
  const t = useTranslations('market');
  return <p className="text-sm text-muted-foreground">{t('loadingChart')}</p>;
}

// ─── Helpers ────────────────────────────────────────────────

function formatAmount(amount: bigint): string {
  return amount.toLocaleString();
}

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

// ─── Market Stats Display ───────────────────────────────────

function MarketStatsSection() {
  const { stats, priceProtection } = useEntityMarket();
  const t = useTranslations('market');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{t('marketStats')}</CardTitle>
          {stats?.circuitBreakerActive ? (
            <Badge variant="destructive">{t('triggered')}</Badge>
          ) : (
            <Badge variant="success">{t('normal')}</Badge>
          )}
        </div>
        {stats?.circuitBreakerActive && (
          <CardDescription className="text-destructive">
            {t('circuitBreakerActive')}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('twapPrice')}</p>
              <p className="text-sm font-medium">{stats ? formatAmount(stats.twapPrice) : '—'}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('lastPrice')}</p>
              <p className="text-sm font-medium">{stats ? formatAmount(stats.lastPrice) : '—'}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('volume24h')}</p>
              <p className="text-sm font-medium">{stats ? formatAmount(stats.volume24h) : '—'}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('circuitBreakerStatus')}</p>
              <div className="mt-1">
                {stats?.circuitBreakerActive ? (
                  <Badge variant="destructive">{t('triggered')}</Badge>
                ) : (
                  <Badge variant="success">{t('normal')}</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {priceProtection && (
          <>
            <Separator className="my-4" />
            <div>
              <h3 className="mb-3 text-sm font-medium">{t('priceProtectionConfig')}</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('maxDeviationBps')}</p>
                  <p className="font-medium">{priceProtection.maxDeviationBps}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('circuitBreakerThreshold')}</p>
                  <p className="font-medium">{priceProtection.circuitBreakerThreshold}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('circuitBreakerDuration')}</p>
                  <p className="font-medium">{priceProtection.circuitBreakerDuration} {t('blocksUnit')}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Order Book Display ─────────────────────────────────────

function OrderBookSection() {
  const { orders, cancelOrder, takeOrder } = useEntityMarket();
  const { isReadOnly, isSuspended } = useEntityContext();
  const { stats } = useEntityMarket();
  const t = useTranslations('market');
  const tradingDisabled = isReadOnly || isSuspended || !!stats?.circuitBreakerActive;

  const [takeAmount, setTakeAmount] = useState<Record<number, string>>({});

  const { buyOrders, sellOrders } = useMemo(() => {
    const buys = orders
      .filter((o) => o.side === 'Buy')
      .sort((a, b) => (b.price > a.price ? 1 : b.price < a.price ? -1 : 0));
    const sells = orders
      .filter((o) => o.side === 'Sell')
      .sort((a, b) => (a.price > b.price ? 1 : a.price < b.price ? -1 : 0));

    // Compute cumulative depth
    let cumBuy = BigInt(0);
    const buyWithDepth = buys.map((o) => { cumBuy += o.amount - o.filled; return { ...o, cumulative: cumBuy }; });
    let cumSell = BigInt(0);
    const sellWithDepth = sells.map((o) => { cumSell += o.amount - o.filled; return { ...o, cumulative: cumSell }; });

    return { buyOrders: buyWithDepth, sellOrders: sellWithDepth };
  }, [orders]);

  const handleCancel = useCallback((orderId: number) => {
    const { entityId } = orders.find((o) => o.id === orderId) ?? { entityId: 0 };
    cancelOrder.mutate([entityId, orderId]);
  }, [orders, cancelOrder]);

  const handleTake = useCallback((order: MarketOrder) => {
    const amt = takeAmount[order.id];
    if (!amt?.trim()) return;
    takeOrder.mutate([order.entityId, order.id, amt.trim()]);
    setTakeAmount((prev) => ({ ...prev, [order.id]: '' }));
  }, [takeAmount, takeOrder]);

  const renderOrderRow = (o: MarketOrder & { cumulative: bigint }, side: 'buy' | 'sell') => (
    <TableRow key={o.id}>
      <TableCell className={cn('font-medium', side === 'buy' ? 'text-green-600' : 'text-red-600')}>
        {formatAmount(o.price)}
      </TableCell>
      <TableCell>{formatAmount(o.amount - o.filled)}</TableCell>
      <TableCell className="text-muted-foreground">{formatAmount(o.cumulative)}</TableCell>
      <TableCell className="text-right">
        {!tradingDisabled && (
          <div className="flex items-center justify-end gap-2">
            <Input
              type="text"
              inputMode="decimal"
              value={takeAmount[o.id] ?? ''}
              onChange={(e) => setTakeAmount((prev) => ({ ...prev, [o.id]: e.target.value }))}
              placeholder={t('quantity')}
              className="h-8 w-20 text-xs"
            />
            <Button
              variant="default"
              size="sm"
              onClick={() => handleTake(o)}
              disabled={isTxBusy(takeOrder)}
              className="h-8 text-xs"
            >
              {t('take')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleCancel(o.id)}
              disabled={isTxBusy(cancelOrder)}
              className="h-8 text-xs"
            >
              {t('cancelOrder')}
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('orderBook')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Sell side */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-medium">{t('sellOrders')}</h3>
              <Badge variant="destructive">Sell</Badge>
            </div>
            {sellOrders.length === 0 ? (
              <Card className="border-dashed shadow-none">
                <CardContent className="flex items-center justify-center p-4">
                  <p className="text-sm text-muted-foreground">{t('noSellOrders')}</p>
                </CardContent>
              </Card>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('price')}</TableHead>
                    <TableHead>{t('quantity')}</TableHead>
                    <TableHead>{t('cumulativeDepth')}</TableHead>
                    <TableHead className="text-right">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellOrders.map((o) => renderOrderRow(o, 'sell'))}
                </TableBody>
              </Table>
            )}
          </div>
          {/* Buy side */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-medium">{t('buyOrders')}</h3>
              <Badge variant="success">Buy</Badge>
            </div>
            {buyOrders.length === 0 ? (
              <Card className="border-dashed shadow-none">
                <CardContent className="flex items-center justify-center p-4">
                  <p className="text-sm text-muted-foreground">{t('noBuyOrders')}</p>
                </CardContent>
              </Card>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('price')}</TableHead>
                    <TableHead>{t('quantity')}</TableHead>
                    <TableHead>{t('cumulativeDepth')}</TableHead>
                    <TableHead className="text-right">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buyOrders.map((o) => renderOrderRow(o, 'buy'))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <TxStatusIndicator txState={cancelOrder.txState} />
          <TxStatusIndicator txState={takeOrder.txState} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Limit Trade Forms ──────────────────────────────────────

function LimitTradeSection() {
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const { placeBuyOrder, placeSellOrder, stats } = useEntityMarket();
  const t = useTranslations('market');
  const tradingDisabled = isReadOnly || isSuspended || !!stats?.circuitBreakerActive;

  const [buyPrice, setBuyPrice] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellAmount, setSellAmount] = useState('');

  const handleBuy = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!buyPrice.trim() || !buyAmount.trim()) return;
      placeBuyOrder.mutate([entityId, buyPrice.trim(), buyAmount.trim()]);
      setBuyPrice('');
      setBuyAmount('');
    },
    [entityId, buyPrice, buyAmount, placeBuyOrder],
  );

  const handleSell = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!sellPrice.trim() || !sellAmount.trim()) return;
      placeSellOrder.mutate([entityId, sellPrice.trim(), sellAmount.trim()]);
      setSellPrice('');
      setSellAmount('');
    },
    [entityId, sellPrice, sellAmount, placeSellOrder],
  );

  if (tradingDisabled) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Limit Buy */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{t('limitBuy')}</CardTitle>
            <Badge variant="success">Buy</Badge>
          </div>
          <CardDescription>{t('limitBuyDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBuy} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="limit-buy-price">{t('price')}</Label>
              <Input
                id="limit-buy-price"
                type="text"
                inputMode="decimal"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                placeholder={t('price')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit-buy-amount">{t('quantity')}</Label>
              <Input
                id="limit-buy-amount"
                type="text"
                inputMode="decimal"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                placeholder={t('quantity')}
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={isTxBusy(placeBuyOrder)}
                className="bg-green-600 hover:bg-green-700"
              >
                {t('buy')}
              </Button>
              <TxStatusIndicator txState={placeBuyOrder.txState} />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Limit Sell */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{t('limitSell')}</CardTitle>
            <Badge variant="destructive">Sell</Badge>
          </div>
          <CardDescription>{t('limitSellDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSell} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="limit-sell-price">{t('price')}</Label>
              <Input
                id="limit-sell-price"
                type="text"
                inputMode="decimal"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder={t('price')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit-sell-amount">{t('quantity')}</Label>
              <Input
                id="limit-sell-amount"
                type="text"
                inputMode="decimal"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder={t('quantity')}
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                variant="destructive"
                disabled={isTxBusy(placeSellOrder)}
              >
                {t('sell')}
              </Button>
              <TxStatusIndicator txState={placeSellOrder.txState} />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Market Trade Forms ─────────────────────────────────────

function MarketTradeSection() {
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const { marketBuy, marketSell, stats } = useEntityMarket();
  const t = useTranslations('market');
  const tradingDisabled = isReadOnly || isSuspended || !!stats?.circuitBreakerActive;

  const [buyAmount, setBuyAmount] = useState('');
  const [maxCost, setMaxCost] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [minReceive, setMinReceive] = useState('');

  const handleMarketBuy = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!buyAmount.trim() || !maxCost.trim()) return;
      marketBuy.mutate([entityId, buyAmount.trim(), maxCost.trim()]);
      setBuyAmount('');
      setMaxCost('');
    },
    [entityId, buyAmount, maxCost, marketBuy],
  );

  const handleMarketSell = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!sellAmount.trim() || !minReceive.trim()) return;
      marketSell.mutate([entityId, sellAmount.trim(), minReceive.trim()]);
      setSellAmount('');
      setMinReceive('');
    },
    [entityId, sellAmount, minReceive, marketSell],
  );

  if (tradingDisabled) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Market Buy */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{t('marketBuy')}</CardTitle>
            <Badge variant="success">Buy</Badge>
          </div>
          <CardDescription>{t('marketBuyDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMarketBuy} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="market-buy-amount">{t('buyAmount')}</Label>
              <Input
                id="market-buy-amount"
                type="text"
                inputMode="decimal"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                placeholder={t('buyAmount')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="market-buy-max-cost">{t('maxCost')}</Label>
              <Input
                id="market-buy-max-cost"
                type="text"
                inputMode="decimal"
                value={maxCost}
                onChange={(e) => setMaxCost(e.target.value)}
                placeholder={t('maxCost')}
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={isTxBusy(marketBuy)}
                className="bg-green-600 hover:bg-green-700"
              >
                {t('marketBuy')}
              </Button>
              <TxStatusIndicator txState={marketBuy.txState} />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Market Sell */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{t('marketSell')}</CardTitle>
            <Badge variant="destructive">Sell</Badge>
          </div>
          <CardDescription>{t('marketSellDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMarketSell} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="market-sell-amount">{t('sellAmount')}</Label>
              <Input
                id="market-sell-amount"
                type="text"
                inputMode="decimal"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder={t('sellAmount')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="market-sell-min-receive">{t('minReceive')}</Label>
              <Input
                id="market-sell-min-receive"
                type="text"
                inputMode="decimal"
                value={minReceive}
                onChange={(e) => setMinReceive(e.target.value)}
                placeholder={t('minReceive')}
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                variant="destructive"
                disabled={isTxBusy(marketSell)}
              >
                {t('marketSell')}
              </Button>
              <TxStatusIndicator txState={marketSell.txState} />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── NEX Market Stats Display ───────────────────────────────

function NexMarketStatsSection() {
  const { stats, priceProtection, initialPrice } = useNexMarket();
  const t = useTranslations('market');

  // When lastPrice is 0 or stats is null (no trades yet), fall back to initialPrice
  const hasLastPrice = stats != null && stats.lastPrice !== BigInt(0);
  const displayLastPrice = hasLastPrice
    ? stats.lastPrice
    : (initialPrice ?? null);
  const isUsingInitialPrice = !hasLastPrice && initialPrice != null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{t('marketStats')}</CardTitle>
          {stats?.circuitBreakerActive ? (
            <Badge variant="destructive">{t('triggered')}</Badge>
          ) : (
            <Badge variant="success">{t('normal')}</Badge>
          )}
        </div>
        {stats?.circuitBreakerActive && (
          <CardDescription className="text-destructive">
            {t('circuitBreakerActive')}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('twapPrice')}</p>
              <p className="text-sm font-medium">{stats ? formatAmount(stats.twapPrice) : '—'}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">
                {isUsingInitialPrice ? t('initialPrice') : t('lastPrice')}
              </p>
              <p className="text-sm font-medium">
                {displayLastPrice != null ? formatAmount(displayLastPrice) : '—'}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('volume24h')}</p>
              <p className="text-sm font-medium">{stats ? formatAmount(stats.volume24h) : '—'}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('circuitBreakerStatus')}</p>
              <div className="mt-1">
                {stats?.circuitBreakerActive ? (
                  <Badge variant="destructive">{t('triggered')}</Badge>
                ) : (
                  <Badge variant="success">{t('normal')}</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {priceProtection && (
          <>
            <Separator className="my-4" />
            <div>
              <h3 className="mb-3 text-sm font-medium">{t('priceProtectionConfig')}</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('maxDeviationBps')}</p>
                  <p className="font-medium">{priceProtection.maxDeviationBps}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('circuitBreakerThreshold')}</p>
                  <p className="font-medium">{priceProtection.circuitBreakerThreshold}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('circuitBreakerDuration')}</p>
                  <p className="font-medium">{priceProtection.circuitBreakerDuration} {t('blocksUnit')}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── NEX Order Book Display ─────────────────────────────────

function NexOrderBookSection() {
  const { orders, cancelOrder, takeOrder } = useNexMarket();
  const { isReadOnly, isSuspended } = useEntityContext();
  const { stats } = useNexMarket();
  const t = useTranslations('market');
  const tradingDisabled = isReadOnly || isSuspended || !!stats?.circuitBreakerActive;

  const [takeAmount, setTakeAmount] = useState<Record<number, string>>({});

  const { buyOrders, sellOrders } = useMemo(() => {
    const buys = orders
      .filter((o) => o.side === 'Buy')
      .sort((a, b) => (b.price > a.price ? 1 : b.price < a.price ? -1 : 0));
    const sells = orders
      .filter((o) => o.side === 'Sell')
      .sort((a, b) => (a.price > b.price ? 1 : a.price < b.price ? -1 : 0));

    let cumBuy = BigInt(0);
    const buyWithDepth = buys.map((o) => { cumBuy += o.amount - o.filled; return { ...o, cumulative: cumBuy }; });
    let cumSell = BigInt(0);
    const sellWithDepth = sells.map((o) => { cumSell += o.amount - o.filled; return { ...o, cumulative: cumSell }; });

    return { buyOrders: buyWithDepth, sellOrders: sellWithDepth };
  }, [orders]);

  const handleCancel = useCallback((orderId: number) => {
    const { entityId } = orders.find((o) => o.id === orderId) ?? { entityId: 0 };
    cancelOrder.mutate([entityId, orderId]);
  }, [orders, cancelOrder]);

  const handleTake = useCallback((order: MarketOrder) => {
    const amt = takeAmount[order.id];
    if (!amt?.trim()) return;
    takeOrder.mutate([order.entityId, order.id, amt.trim()]);
    setTakeAmount((prev) => ({ ...prev, [order.id]: '' }));
  }, [takeAmount, takeOrder]);

  const renderOrderRow = (o: MarketOrder & { cumulative: bigint }, side: 'buy' | 'sell') => (
    <TableRow key={o.id}>
      <TableCell className={cn('font-medium', side === 'buy' ? 'text-green-600' : 'text-red-600')}>
        {formatAmount(o.price)}
      </TableCell>
      <TableCell>{formatAmount(o.amount - o.filled)}</TableCell>
      <TableCell className="text-muted-foreground">{formatAmount(o.cumulative)}</TableCell>
      <TableCell className="text-right">
        {!tradingDisabled && (
          <div className="flex items-center justify-end gap-2">
            <Input
              type="text"
              inputMode="decimal"
              value={takeAmount[o.id] ?? ''}
              onChange={(e) => setTakeAmount((prev) => ({ ...prev, [o.id]: e.target.value }))}
              placeholder={t('quantity')}
              className="h-8 w-20 text-xs"
            />
            <Button
              variant="default"
              size="sm"
              onClick={() => handleTake(o)}
              disabled={isTxBusy(takeOrder)}
              className="h-8 text-xs"
            >
              {t('take')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleCancel(o.id)}
              disabled={isTxBusy(cancelOrder)}
              className="h-8 text-xs"
            >
              {t('cancelOrder')}
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('orderBook')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Sell side */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-medium">{t('sellOrders')}</h3>
              <Badge variant="destructive">Sell</Badge>
            </div>
            {sellOrders.length === 0 ? (
              <Card className="border-dashed shadow-none">
                <CardContent className="flex items-center justify-center p-4">
                  <p className="text-sm text-muted-foreground">{t('noSellOrders')}</p>
                </CardContent>
              </Card>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('price')}</TableHead>
                    <TableHead>{t('quantity')}</TableHead>
                    <TableHead>{t('cumulativeDepth')}</TableHead>
                    <TableHead className="text-right">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellOrders.map((o) => renderOrderRow(o, 'sell'))}
                </TableBody>
              </Table>
            )}
          </div>
          {/* Buy side */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-medium">{t('buyOrders')}</h3>
              <Badge variant="success">Buy</Badge>
            </div>
            {buyOrders.length === 0 ? (
              <Card className="border-dashed shadow-none">
                <CardContent className="flex items-center justify-center p-4">
                  <p className="text-sm text-muted-foreground">{t('noBuyOrders')}</p>
                </CardContent>
              </Card>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('price')}</TableHead>
                    <TableHead>{t('quantity')}</TableHead>
                    <TableHead>{t('cumulativeDepth')}</TableHead>
                    <TableHead className="text-right">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buyOrders.map((o) => renderOrderRow(o, 'buy'))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <TxStatusIndicator txState={cancelOrder.txState} />
          <TxStatusIndicator txState={takeOrder.txState} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── NEX Limit Trade Forms ──────────────────────────────────

function NexLimitTradeSection() {
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const { placeBuyOrder, placeSellOrder, stats } = useNexMarket();
  const t = useTranslations('market');
  const tradingDisabled = isReadOnly || isSuspended || !!stats?.circuitBreakerActive;

  const [buyPrice, setBuyPrice] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellAmount, setSellAmount] = useState('');

  const handleBuy = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!buyPrice.trim() || !buyAmount.trim()) return;
      placeBuyOrder.mutate([entityId, buyPrice.trim(), buyAmount.trim()]);
      setBuyPrice('');
      setBuyAmount('');
    },
    [entityId, buyPrice, buyAmount, placeBuyOrder],
  );

  const handleSell = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!sellPrice.trim() || !sellAmount.trim()) return;
      placeSellOrder.mutate([entityId, sellPrice.trim(), sellAmount.trim()]);
      setSellPrice('');
      setSellAmount('');
    },
    [entityId, sellPrice, sellAmount, placeSellOrder],
  );

  if (tradingDisabled) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Limit Buy */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{t('limitBuy')}</CardTitle>
            <Badge variant="success">Buy</Badge>
          </div>
          <CardDescription>{t('limitBuyDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBuy} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nex-limit-buy-price">{t('price')}</Label>
              <Input
                id="nex-limit-buy-price"
                type="text"
                inputMode="decimal"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                placeholder={t('price')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nex-limit-buy-amount">{t('quantity')}</Label>
              <Input
                id="nex-limit-buy-amount"
                type="text"
                inputMode="decimal"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                placeholder={t('quantity')}
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={isTxBusy(placeBuyOrder)}
                className="bg-green-600 hover:bg-green-700"
              >
                {t('buy')}
              </Button>
              <TxStatusIndicator txState={placeBuyOrder.txState} />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Limit Sell */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{t('limitSell')}</CardTitle>
            <Badge variant="destructive">Sell</Badge>
          </div>
          <CardDescription>{t('limitSellDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSell} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nex-limit-sell-price">{t('price')}</Label>
              <Input
                id="nex-limit-sell-price"
                type="text"
                inputMode="decimal"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder={t('price')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nex-limit-sell-amount">{t('quantity')}</Label>
              <Input
                id="nex-limit-sell-amount"
                type="text"
                inputMode="decimal"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder={t('quantity')}
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                variant="destructive"
                disabled={isTxBusy(placeSellOrder)}
              >
                {t('sell')}
              </Button>
              <TxStatusIndicator txState={placeSellOrder.txState} />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── NEX Market Trade Forms ─────────────────────────────────

function NexMarketTradeSection() {
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const { marketBuy, marketSell, stats } = useNexMarket();
  const t = useTranslations('market');
  const tradingDisabled = isReadOnly || isSuspended || !!stats?.circuitBreakerActive;

  const [buyAmount, setBuyAmount] = useState('');
  const [maxCost, setMaxCost] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [minReceive, setMinReceive] = useState('');

  const handleMarketBuy = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!buyAmount.trim() || !maxCost.trim()) return;
      marketBuy.mutate([entityId, buyAmount.trim(), maxCost.trim()]);
      setBuyAmount('');
      setMaxCost('');
    },
    [entityId, buyAmount, maxCost, marketBuy],
  );

  const handleMarketSell = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!sellAmount.trim() || !minReceive.trim()) return;
      marketSell.mutate([entityId, sellAmount.trim(), minReceive.trim()]);
      setSellAmount('');
      setMinReceive('');
    },
    [entityId, sellAmount, minReceive, marketSell],
  );

  if (tradingDisabled) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Market Buy */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{t('marketBuy')}</CardTitle>
            <Badge variant="success">Buy</Badge>
          </div>
          <CardDescription>{t('marketBuyDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMarketBuy} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nex-market-buy-amount">{t('buyAmount')}</Label>
              <Input
                id="nex-market-buy-amount"
                type="text"
                inputMode="decimal"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                placeholder={t('buyAmount')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nex-market-buy-max-cost">{t('maxCost')}</Label>
              <Input
                id="nex-market-buy-max-cost"
                type="text"
                inputMode="decimal"
                value={maxCost}
                onChange={(e) => setMaxCost(e.target.value)}
                placeholder={t('maxCost')}
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={isTxBusy(marketBuy)}
                className="bg-green-600 hover:bg-green-700"
              >
                {t('marketBuy')}
              </Button>
              <TxStatusIndicator txState={marketBuy.txState} />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Market Sell */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{t('marketSell')}</CardTitle>
            <Badge variant="destructive">Sell</Badge>
          </div>
          <CardDescription>{t('marketSellDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMarketSell} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nex-market-sell-amount">{t('sellAmount')}</Label>
              <Input
                id="nex-market-sell-amount"
                type="text"
                inputMode="decimal"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder={t('sellAmount')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nex-market-sell-min-receive">{t('minReceive')}</Label>
              <Input
                id="nex-market-sell-min-receive"
                type="text"
                inputMode="decimal"
                value={minReceive}
                onChange={(e) => setMinReceive(e.target.value)}
                placeholder={t('minReceive')}
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                variant="destructive"
                disabled={isTxBusy(marketSell)}
              >
                {t('marketSell')}
              </Button>
              <TxStatusIndicator txState={marketSell.txState} />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── NEX Market Tab Content ─────────────────────────────────

function NexMarketTabContent() {
  const t = useTranslations('market');
  const { isLoading, error, stats } = useNexMarket();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  {Array.from({ length: 3 }).map((_, j) => (
                    <Skeleton key={j} className="h-10 w-full" />
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="p-6 text-sm text-destructive">
          {t('loading')}: {String(error)}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {stats?.circuitBreakerActive && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 p-4">
            <Badge variant="destructive">{t('triggered')}</Badge>
            <p className="text-sm text-destructive">
              {t('circuitBreakerNotice')}
            </p>
          </CardContent>
        </Card>
      )}

      <NexMarketStatsSection />
      <NexOrderBookSection />

      <Tabs defaultValue="limit" className="space-y-6">
        <TabsList>
          <TabsTrigger value="limit">{t('limitTrade')}</TabsTrigger>
          <TabsTrigger value="market">{t('marketTrade')}</TabsTrigger>
        </TabsList>

        <TabsContent value="limit">
          <NexLimitTradeSection />
        </TabsContent>

        <TabsContent value="market">
          <NexMarketTradeSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Entity Market Tab Content ──────────────────────────────

function EntityMarketTabContent() {
  const t = useTranslations('market');
  const { stats } = useEntityMarket();

  return (
    <div className="space-y-6">
      {stats?.circuitBreakerActive && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 p-4">
            <Badge variant="destructive">{t('triggered')}</Badge>
            <p className="text-sm text-destructive">
              {t('circuitBreakerNotice')}
            </p>
          </CardContent>
        </Card>
      )}

      <MarketStatsSection />
      <MarketChart />
      <OrderBookSection />

      <Tabs defaultValue="limit" className="space-y-6">
        <TabsList>
          <TabsTrigger value="limit">{t('limitTrade')}</TabsTrigger>
          <TabsTrigger value="market">{t('marketTrade')}</TabsTrigger>
        </TabsList>

        <TabsContent value="limit">
          <LimitTradeSection />
        </TabsContent>

        <TabsContent value="market">
          <MarketTradeSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Skeleton Loading ───────────────────────────────────────

function MarketPageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Skeleton className="h-48 w-full rounded-lg" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-16" />
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-10 w-full" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="mt-3 h-10 w-full" />
              <Skeleton className="mt-3 h-9 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function MarketPage() {
  const t = useTranslations('market');
  const { isLoading, error } = useEntityMarket();

  if (isLoading) {
    return <MarketPageSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="border-destructive/50">
          <CardContent className="p-6 text-sm text-destructive">
            {t('loading')}: {String(error)}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>

      <Tabs defaultValue="entity" className="space-y-6">
        <TabsList>
          <TabsTrigger value="entity">{t('entityMarketTab')}</TabsTrigger>
          <TabsTrigger value="nex">{t('nexMarketTab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="entity">
          <EntityMarketTabContent />
        </TabsContent>

        <TabsContent value="nex">
          <NexMarketTabContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}
