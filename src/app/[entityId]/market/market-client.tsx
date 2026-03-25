'use client';

import React, { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { useEntityMarket } from '@/hooks/use-entity-market';
import { useNexMarket } from '@/hooks/use-nex-market';
import { useChainConstants } from '@/hooks/use-chain-constants';
import { isTxBusy, useTxLock } from '@/hooks/use-tx-lock';
import { useWalletStore } from '@/stores/wallet-store';
import type { MarketOrder } from '@/lib/types/models';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils/cn';
import { formatNex, formatUsdt } from '@/lib/utils/format';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LabelWithTip } from '@/components/field-help-tip';
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


/** Convert a human-readable USDT price (e.g. "0.5") to chain u64 (precision 10^6, e.g. 500000) */
function usdtPriceToU64(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '0';
  const parts = trimmed.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(6, '0').slice(0, 6);
  const raw = BigInt(whole) * BigInt(1_000_000) + BigInt(frac);
  return raw.toString();
}

/** Convert a human-readable NEX amount (e.g. "1.5") to chain u128 (precision 10^12) */
function nexAmountToChain(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '0';
  const parts = trimmed.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(12, '0').slice(0, 12);
  const raw = BigInt(whole) * BigInt(1_000_000_000_000) + BigInt(frac);
  return raw.toString();
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
              <p className="text-sm font-medium">{stats ? `${formatNex(stats.twapPrice)} NEX` : '—'}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('lastPrice')}</p>
              <p className="text-sm font-medium">{stats ? `${formatNex(stats.lastPrice)} NEX` : '—'}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('volume24h')}</p>
              <p className="text-sm font-medium">{stats ? `${formatNex(stats.volume24h)} NEX` : '—'}</p>
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
    cancelOrder.mutate([orderId]);
  }, [cancelOrder]);

  const handleTake = useCallback((order: MarketOrder) => {
    const amt = takeAmount[order.id];
    if (!amt?.trim()) return;
    takeOrder.mutate([order.id, amt.trim()]);
    setTakeAmount((prev) => ({ ...prev, [order.id]: '' }));
  }, [takeAmount, takeOrder]);

  const renderOrderRow = (o: MarketOrder & { cumulative: bigint }, side: 'buy' | 'sell') => (
    <TableRow key={o.id}>
      <TableCell className={cn('font-medium', side === 'buy' ? 'text-green-600' : 'text-red-600')}>
        {formatNex(o.price)}
      </TableCell>
      <TableCell>{formatNex(o.amount - o.filled)}</TableCell>
      <TableCell className="text-muted-foreground">{formatNex(o.cumulative)}</TableCell>
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
      placeBuyOrder.mutate([entityId, buyAmount.trim(), buyPrice.trim()]);
      setBuyPrice('');
      setBuyAmount('');
    },
    [entityId, buyPrice, buyAmount, placeBuyOrder],
  );

  const handleSell = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!sellPrice.trim() || !sellAmount.trim()) return;
      placeSellOrder.mutate([entityId, sellAmount.trim(), sellPrice.trim()]);
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
              <LabelWithTip htmlFor="limit-buy-price" tip={t('help.price')}>{t('price')}</LabelWithTip>
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
              <LabelWithTip htmlFor="limit-buy-amount" tip={t('help.quantity')}>{t('quantity')}</LabelWithTip>
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
              <LabelWithTip htmlFor="limit-sell-price" tip={t('help.price')}>{t('price')}</LabelWithTip>
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
              <LabelWithTip htmlFor="limit-sell-amount" tip={t('help.quantity')}>{t('quantity')}</LabelWithTip>
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
    [buyAmount, entityId, marketBuy, maxCost],
  );

  const handleMarketSell = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!sellAmount.trim() || !minReceive.trim()) return;
      marketSell.mutate([entityId, sellAmount.trim(), minReceive.trim()]);
      setSellAmount('');
      setMinReceive('');
    },
    [entityId, marketSell, minReceive, sellAmount],
  );

  if (tradingDisabled) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{t('marketBuy')}</CardTitle>
            <Badge variant="success">Buy</Badge>
          </div>
          <CardDescription>链端已验证：marketBuy(entityId, tokenAmount, maxCost)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMarketBuy} className="space-y-4">
            <div className="space-y-2">
              <LabelWithTip htmlFor="market-buy-amount" tip={t('help.buyAmount')}>{t('buyAmount')}</LabelWithTip>
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
              <LabelWithTip htmlFor="market-buy-max-cost" tip={t('help.maxCost')}>{t('maxCost')}</LabelWithTip>
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
              <Button type="submit" disabled={isTxBusy(marketBuy)} className="bg-green-600 hover:bg-green-700">
                {t('marketBuy')}
              </Button>
              <TxStatusIndicator txState={marketBuy.txState} />
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{t('marketSell')}</CardTitle>
            <Badge variant="destructive">Sell</Badge>
          </div>
          <CardDescription>链端已验证：marketSell(entityId, tokenAmount, minReceive)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMarketSell} className="space-y-4">
            <div className="space-y-2">
              <LabelWithTip htmlFor="market-sell-amount" tip={t('help.sellAmount')}>{t('sellAmount')}</LabelWithTip>
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
              <LabelWithTip htmlFor="market-sell-min-receive" tip={t('help.minReceive')}>{t('minReceive')}</LabelWithTip>
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
              <Button type="submit" variant="destructive" disabled={isTxBusy(marketSell)}>
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
  const { stats, priceProtection, lastTradePrice, orders, seedPricePremiumBps } = useNexMarket();
  const t = useTranslations('market');

  // When lastPrice is 0 or stats is null (no trades yet), fall back to lastTradePrice
  const hasLastPrice = stats != null && stats.lastPrice !== BigInt(0);
  const displayLastPrice = hasLastPrice
    ? stats.lastPrice
    : (lastTradePrice ?? null);
  const isUsingInitialPrice = !hasLastPrice && lastTradePrice != null;

  // Derive seed price from depositWaived sell orders in the order book
  const seedPriceInfo = useMemo(() => {
    const seedOrder = orders.find((o) => o.side === 'Sell' && o.depositWaived);
    if (!seedOrder || seedOrder.price <= BigInt(0)) return null;
    const seedPrice = seedOrder.price; // usdt_price (precision 10^6)
    const premiumBps = seedPricePremiumBps > 0 ? seedPricePremiumBps : 4000;
    // ref_price = seed_price * 10000 / (10000 + premium)
    const refPrice = seedPrice * BigInt(10000) / BigInt(10000 + premiumBps);
    const premiumPct = premiumBps / 100;
    return { seedPrice, refPrice, premiumPct };
  }, [orders, seedPricePremiumBps]);

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
              <p className="text-sm font-medium">{stats ? `${formatUsdt(stats.twapPrice)} USDT` : '—'}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">
                {isUsingInitialPrice ? t('initialPrice') : t('lastPrice')}
              </p>
              <p className="text-sm font-medium">
                {displayLastPrice != null ? `${formatUsdt(displayLastPrice)} USDT` : '—'}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('volume24h')}</p>
              <p className="text-sm font-medium">{stats ? `${formatUsdt(stats.volume24h)} USDT` : '—'}</p>
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

        {seedPriceInfo && (
          <>
            <Separator className="my-4" />
            <div>
              <h3 className="mb-3 text-sm font-medium">{t('seedPrice')}</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('seedPrice')}</p>
                  <p className="font-medium">{formatUsdt(seedPriceInfo.seedPrice)} USDT</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('refPrice')}</p>
                  <p className="font-medium">{formatUsdt(seedPriceInfo.refPrice)} USDT</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('premium', { rate: seedPriceInfo.premiumPct })}</p>
                </div>
              </div>
            </div>
          </>
        )}

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
  const { orders, cancelOrder } = useNexMarket();
  const { isReadOnly, isSuspended } = useEntityContext();
  const { stats } = useNexMarket();
  const t = useTranslations('market');
  const tradingDisabled = isReadOnly || isSuspended || !!stats?.circuitBreakerActive;

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
    cancelOrder.mutate([orderId]);
  }, [cancelOrder]);

  const renderOrderRow = (o: MarketOrder & { cumulative: bigint }, side: 'buy' | 'sell') => (
    <TableRow key={o.id}>
      <TableCell className={cn('font-medium', side === 'buy' ? 'text-green-600' : 'text-red-600')}>
        <span className="inline-flex items-center gap-1.5">
          {formatUsdt(o.price)}
          {o.depositWaived && (
            <Badge variant="outline" className="border-green-600 text-green-700 dark:text-green-400 text-[10px] px-1 py-0">
              {t('firstOrder.depositWaived')}
            </Badge>
          )}
        </span>
      </TableCell>
      <TableCell>{formatNex(o.amount - o.filled)}</TableCell>
      <TableCell className="text-muted-foreground">{formatNex(o.cumulative)}</TableCell>
      <TableCell className="text-right">
        {!tradingDisabled && (
          <div className="flex items-center justify-end gap-2">
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
        </div>
      </CardContent>
    </Card>
  );
}

// ─── NEX Limit Trade Forms ──────────────────────────────────

function NexLimitTradeSection() {
  const { isReadOnly, isSuspended } = useEntityContext();
  const { placeBuyOrder, placeSellOrder, stats } = useNexMarket();
  const { nexMarket: nexConsts } = useChainConstants();
  const t = useTranslations('market');
  const tradingDisabled = isReadOnly || isSuspended || !!stats?.circuitBreakerActive;

  const minOrderAmount = nexConsts?.minOrderNexAmount ?? null;
  const maxOrderAmount = nexConsts?.maxOrderNexAmount ?? null;

  const [buyPrice, setBuyPrice] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [buyTronAddress, setBuyTronAddress] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [sellTronAddress, setSellTronAddress] = useState('');
  const [sellMinFill, setSellMinFill] = useState('');

  const handleBuy = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!buyPrice.trim() || !buyAmount.trim() || !buyTronAddress.trim()) return;
      // Pallet: place_buy_order(nex_amount, usdt_price, buyer_tron_address)
      placeBuyOrder.mutate([nexAmountToChain(buyAmount), usdtPriceToU64(buyPrice), buyTronAddress.trim()]);
      setBuyPrice('');
      setBuyAmount('');
      setBuyTronAddress('');
    },
    [buyPrice, buyAmount, buyTronAddress, placeBuyOrder],
  );

  const handleSell = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!sellPrice.trim() || !sellAmount.trim() || !sellTronAddress.trim()) return;
      // Pallet: place_sell_order(nex_amount, usdt_price, tron_address, min_fill_amount)
      placeSellOrder.mutate([nexAmountToChain(sellAmount), usdtPriceToU64(sellPrice), sellTronAddress.trim(), sellMinFill.trim() ? nexAmountToChain(sellMinFill) : null]);
      setSellPrice('');
      setSellAmount('');
      setSellTronAddress('');
      setSellMinFill('');
    },
    [sellPrice, sellAmount, sellTronAddress, sellMinFill, placeSellOrder],
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
              <LabelWithTip htmlFor="nex-limit-buy-amount" tip={t('help.quantity')}>{t('quantity')}</LabelWithTip>
              <Input
                id="nex-limit-buy-amount"
                type="text"
                inputMode="decimal"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                placeholder={t('quantity')}
                required
              />
              {minOrderAmount != null && minOrderAmount > BigInt(0) && (
                <p className="text-xs text-muted-foreground">
                  {t('minOrderAmountHint', { amount: formatNex(minOrderAmount) })}
                  {maxOrderAmount != null && maxOrderAmount > BigInt(0) && (
                    <> · {t('maxOrderAmountHint', { amount: formatNex(maxOrderAmount) })}</>
                  )}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="nex-limit-buy-price" tip={t('help.usdtPrice')}>{t('usdtPrice')}</LabelWithTip>
              <Input
                id="nex-limit-buy-price"
                type="text"
                inputMode="decimal"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                placeholder={t('usdtPrice')}
                required
              />
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="nex-limit-buy-tron" tip={t('help.tronAddress')}>{t('tronAddress')}</LabelWithTip>
              <Input
                id="nex-limit-buy-tron"
                type="text"
                value={buyTronAddress}
                onChange={(e) => setBuyTronAddress(e.target.value)}
                placeholder={t('tronAddress')}
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
              <LabelWithTip htmlFor="nex-limit-sell-amount" tip={t('help.quantity')}>{t('quantity')}</LabelWithTip>
              <Input
                id="nex-limit-sell-amount"
                type="text"
                inputMode="decimal"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder={t('quantity')}
                required
              />
              {minOrderAmount != null && minOrderAmount > BigInt(0) && (
                <p className="text-xs text-muted-foreground">
                  {t('minOrderAmountHint', { amount: formatNex(minOrderAmount) })}
                  {maxOrderAmount != null && maxOrderAmount > BigInt(0) && (
                    <> · {t('maxOrderAmountHint', { amount: formatNex(maxOrderAmount) })}</>
                  )}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="nex-limit-sell-price" tip={t('help.usdtPrice')}>{t('usdtPrice')}</LabelWithTip>
              <Input
                id="nex-limit-sell-price"
                type="text"
                inputMode="decimal"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder={t('usdtPrice')}
                required
              />
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="nex-limit-sell-tron" tip={t('help.tronAddress')}>{t('tronAddress')}</LabelWithTip>
              <Input
                id="nex-limit-sell-tron"
                type="text"
                value={sellTronAddress}
                onChange={(e) => setSellTronAddress(e.target.value)}
                placeholder={t('tronAddress')}
                required
              />
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="nex-limit-sell-min-fill" tip={t('help.minFillAmount')}>{t('minFillAmount')}</LabelWithTip>
              <Input
                id="nex-limit-sell-min-fill"
                type="text"
                inputMode="decimal"
                value={sellMinFill}
                onChange={(e) => setSellMinFill(e.target.value)}
                placeholder={t('minFillAmountOptional')}
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
  const t = useTranslations('market');
  const { acceptBuyOrder, reserveSellOrder, confirmPayment, sellerConfirmReceived, orders, buyerDepositRate, isFirstOrderEligible } = useNexMarket();
  const [acceptOrderId, setAcceptOrderId] = useState('');
  const [acceptAmount, setAcceptAmount] = useState('');
  const [acceptTron, setAcceptTron] = useState('');
  const [reserveOrderId, setReserveOrderId] = useState('');
  const [reserveAmount, setReserveAmount] = useState('');
  const [reserveTron, setReserveTron] = useState('');
  const [paymentOrderId, setPaymentOrderId] = useState('');
  const [receivedOrderId, setReceivedOrderId] = useState('');

  // Look up the order for deposit estimation
  const reserveOrderNum = Number(reserveOrderId);
  const reserveTargetOrder = useMemo(() => {
    if (!Number.isFinite(reserveOrderNum) || reserveOrderNum <= 0) return null;
    return orders.find((o) => o.id === reserveOrderNum) ?? null;
  }, [orders, reserveOrderNum]);

  const depositEstimate = useMemo(() => {
    if (!reserveTargetOrder) return null;
    if (reserveTargetOrder.depositWaived && isFirstOrderEligible) {
      return { waived: true as const };
    }
    if (buyerDepositRate <= 0) return null;
    const remaining = reserveTargetOrder.amount - reserveTargetOrder.filled;
    const deposit = (remaining * BigInt(buyerDepositRate)) / BigInt(10000);
    return { waived: false as const, amount: deposit, rate: buyerDepositRate };
  }, [reserveTargetOrder, buyerDepositRate, isFirstOrderEligible]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('marketTrade')}</CardTitle>
        <CardDescription>NEX 市场后续流程已切换为 Tron 地址驱动</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          当前页面已移除旧的 marketBuy / marketSell / takeOrder 幻想接口，买卖挂单改为真实的 Tron 地址参数。
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>买单：placeBuyOrder(nexAmount, usdtPrice, buyerTronAddress)</li>
          <li>卖单：placeSellOrder(nexAmount, usdtPrice, tronAddress, minFillAmount)</li>
          <li>接受买单：acceptBuyOrder(orderId, amount?, tronAddress)</li>
          <li>预留卖单：reserveSellOrder(orderId, amount?, buyerTronAddress)</li>
          <li>确认付款 / 卖家确认收款：按 tradeId 调用</li>
        </ul>

        <div className="grid gap-4 pt-3 md:grid-cols-2">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">接受买单</CardTitle>
              <CardDescription>卖家接受买单，需要订单 ID、可选成交量和卖家 Tron 地址。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="text" inputMode="numeric" value={acceptOrderId} onChange={(e) => setAcceptOrderId(e.target.value)} placeholder="订单 ID" />
              <Input type="text" inputMode="decimal" value={acceptAmount} onChange={(e) => setAcceptAmount(e.target.value)} placeholder="成交量（可选）" />
              <Input type="text" value={acceptTron} onChange={(e) => setAcceptTron(e.target.value)} placeholder="卖家 Tron 地址" />
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => {
                    const orderId = Number(acceptOrderId);
                    if (!Number.isFinite(orderId) || orderId <= 0 || !acceptTron.trim()) return;
                    acceptBuyOrder.mutate([orderId, acceptAmount.trim() ? nexAmountToChain(acceptAmount) : null, acceptTron.trim()]);
                  }}
                  disabled={isTxBusy(acceptBuyOrder) || !acceptOrderId.trim() || !acceptTron.trim()}
                >
                  接受买单
                </Button>
                <TxStatusIndicator txState={acceptBuyOrder.txState} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">预留卖单</CardTitle>
              <CardDescription>买家预留卖单，需要订单 ID、可选成交量和买家 Tron 地址。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="text" inputMode="numeric" value={reserveOrderId} onChange={(e) => setReserveOrderId(e.target.value)} placeholder="订单 ID" />
              <Input type="text" inputMode="decimal" value={reserveAmount} onChange={(e) => setReserveAmount(e.target.value)} placeholder="成交量（可选）" />
              <Input type="text" value={reserveTron} onChange={(e) => setReserveTron(e.target.value)} placeholder="买家 Tron 地址" />
              {depositEstimate && (
                depositEstimate.waived ? (
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    {t('firstOrder.depositFree')}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('firstOrder.depositRequired', {
                      amount: formatNex(depositEstimate.amount),
                      rate: String(depositEstimate.rate),
                    })}
                  </p>
                )
              )}
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => {
                    const orderId = Number(reserveOrderId);
                    if (!Number.isFinite(orderId) || orderId <= 0 || !reserveTron.trim()) return;
                    reserveSellOrder.mutate([orderId, reserveAmount.trim() ? nexAmountToChain(reserveAmount) : null, reserveTron.trim()]);
                  }}
                  disabled={isTxBusy(reserveSellOrder) || !reserveOrderId.trim() || !reserveTron.trim()}
                >
                  预留卖单
                </Button>
                <TxStatusIndicator txState={reserveSellOrder.txState} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">确认已付款</CardTitle>
              <CardDescription>这里需要传 tradeId，不是 orderId。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="text" inputMode="numeric" value={paymentOrderId} onChange={(e) => setPaymentOrderId(e.target.value)} placeholder="交易 ID" />
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => {
                    const tradeId = Number(paymentOrderId);
                    if (!Number.isFinite(tradeId) || tradeId <= 0) return;
                    confirmPayment.mutate([tradeId]);
                  }}
                  disabled={isTxBusy(confirmPayment) || !paymentOrderId.trim()}
                >
                  确认已付款
                </Button>
                <TxStatusIndicator txState={confirmPayment.txState} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">卖家确认收款</CardTitle>
              <CardDescription>这里需要传 tradeId，不是 orderId。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="text" inputMode="numeric" value={receivedOrderId} onChange={(e) => setReceivedOrderId(e.target.value)} placeholder="交易 ID" />
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => {
                    const tradeId = Number(receivedOrderId);
                    if (!Number.isFinite(tradeId) || tradeId <= 0) return;
                    sellerConfirmReceived.mutate([tradeId]);
                  }}
                  disabled={isTxBusy(sellerConfirmReceived) || !receivedOrderId.trim()}
                >
                  卖家确认收款
                </Button>
                <TxStatusIndicator txState={sellerConfirmReceived.txState} />
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── First Order Status Banner ──────────────────────────────

function FirstOrderStatusBanner() {
  const t = useTranslations('market');
  const {
    isFirstOrderEligible,
    isCompletedBuyer,
    activeWaivedTrades,
    seedOrderUsdtAmount,
    firstOrderTimeout,
  } = useNexMarket();
  const address = useWalletStore((s) => s.address);

  if (!address || isCompletedBuyer) return null;

  if (activeWaivedTrades > 0) {
    return (
      <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
        <CardContent className="flex items-center gap-3 p-4">
          <Badge variant="outline" className="border-yellow-600 text-yellow-700 dark:text-yellow-400">
            {t('firstOrder.bannerActiveTitle')}
          </Badge>
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            {t('firstOrder.bannerActiveDesc')}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isFirstOrderEligible) {
    // seedOrderUsdtAmount is in chain precision (10^6), convert to human-readable
    const maxUsdt = seedOrderUsdtAmount > 0 ? (seedOrderUsdtAmount / 1_000_000).toString() : '0';
    return (
      <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
        <CardContent className="flex items-center gap-3 p-4">
          <Badge variant="outline" className="border-green-600 text-green-700 dark:text-green-400">
            {t('firstOrder.bannerEligibleTitle')}
          </Badge>
          <p className="text-sm text-green-700 dark:text-green-400">
            {t('firstOrder.bannerEligibleDesc', {
              maxAmount: maxUsdt,
              timeout: String(firstOrderTimeout),
            })}
          </p>
        </CardContent>
      </Card>
    );
  }

  return null;
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

      <FirstOrderStatusBanner />
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
