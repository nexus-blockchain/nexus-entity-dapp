'use client';

import React, { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { useTokensale, computeDutchAuctionPrice } from '@/hooks/use-tokensale';
import { AdminPermission } from '@/lib/types/models';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

const STATUS_VARIANT: Record<string, 'secondary' | 'default' | 'warning' | 'destructive' | 'success'> = {
  Created: 'secondary',
  Started: 'default',
  Subscribing: 'warning',
  Ended: 'destructive',
  Claiming: 'success',
};

type SaleRoundFormKey =
  | 'name'
  | 'totalSupply'
  | 'price'
  | 'startBlock'
  | 'endBlock'
  | 'minPurchase'
  | 'maxPurchase'
  | 'softCap'
  | 'hardCap';

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

function TokenSaleSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-40" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-28" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-40" />
          <div className="mt-3 flex gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CreateSaleRoundForm() {
  const t = useTranslations('tokensale');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { createSaleRound } = useTokensale();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<SaleRoundFormKey, string>>({
    name: '',
    totalSupply: '',
    price: '',
    startBlock: '',
    endBlock: '',
    minPurchase: '',
    maxPurchase: '',
    softCap: '',
    hardCap: '',
  });

  const setField = useCallback((key: SaleRoundFormKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    const {
      name,
      totalSupply,
      price,
      startBlock,
      endBlock,
      minPurchase,
      maxPurchase,
      softCap,
      hardCap,
    } = form;

    if (!name.trim() || !totalSupply || !price) return;

    createSaleRound.mutate([
      entityId,
      name.trim(),
      totalSupply,
      price,
      Number(startBlock),
      Number(endBlock),
      minPurchase,
      maxPurchase,
      softCap,
      hardCap,
    ]);
  }, [createSaleRound, entityId, form]);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>{t('createSaleRound')}</Button>;
  }

  const fields: Array<{ key: SaleRoundFormKey; label: string; type: string; placeholder: string }> = [
    { key: 'name', label: t('roundName'), type: 'text', placeholder: t('roundNamePlaceholder') },
    { key: 'totalSupply', label: t('totalSupply'), type: 'text', placeholder: t('totalSupply') },
    { key: 'price', label: t('price'), type: 'text', placeholder: t('price') },
    { key: 'startBlock', label: t('startBlock'), type: 'number', placeholder: t('startBlock') },
    { key: 'endBlock', label: t('endBlock'), type: 'number', placeholder: t('endBlock') },
    { key: 'minPurchase', label: t('minPurchase'), type: 'text', placeholder: t('minPurchase') },
    { key: 'maxPurchase', label: t('maxPurchase'), type: 'text', placeholder: t('maxPurchase') },
    { key: 'softCap', label: t('softCap'), type: 'text', placeholder: t('softCap') },
    { key: 'hardCap', label: t('hardCap'), type: 'text', placeholder: t('hardCap') },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('createSaleRound')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(({ key, label, type, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`sale-${key}`}>{label}</Label>
              <Input
                id={`sale-${key}`}
                type={type}
                value={form[key]}
                onChange={(e) => setField(key, e.target.value)}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="gap-3">
        <Button onClick={handleSubmit} disabled={!form.name.trim() || isTxBusy(createSaleRound)}>
          {tc('submit')}
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)}>
          {tc('cancel')}
        </Button>
        <TxStatusIndicator txState={createSaleRound.txState} />
      </CardFooter>
    </Card>
  );
}

function DutchAuctionSection() {
  const t = useTranslations('tokensale');
  const { entityId } = useEntityContext();
  const { configureDutchAuction } = useTokensale();
  const [roundId, setRoundId] = useState('');
  const [startPrice, setStartPrice] = useState('');
  const [endPrice, setEndPrice] = useState('');
  const [decayBlocks, setDecayBlocks] = useState('');
  const [elapsed, setElapsed] = useState('');

  const calculatedPrice =
    startPrice && endPrice && decayBlocks && elapsed
      ? computeDutchAuctionPrice(
          {
            startPrice: BigInt(startPrice),
            endPrice: BigInt(endPrice),
            decayBlocks: Number(decayBlocks),
          },
          Number(elapsed),
        ).toString()
      : null;

  const handleSubmit = useCallback(() => {
    if (!roundId || !startPrice || !endPrice || !decayBlocks) return;
    configureDutchAuction.mutate([entityId, Number(roundId), startPrice, endPrice, Number(decayBlocks)]);
  }, [configureDutchAuction, decayBlocks, endPrice, entityId, roundId, startPrice]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('dutchAuctionConfig')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="da-round">{t('roundId')}</Label>
            <Input id="da-round" type="number" value={roundId} onChange={(e) => setRoundId(e.target.value)} placeholder={t('roundId')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="da-start">{t('startPrice')}</Label>
            <Input id="da-start" value={startPrice} onChange={(e) => setStartPrice(e.target.value)} placeholder={t('startPrice')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="da-end">{t('endPrice')}</Label>
            <Input id="da-end" value={endPrice} onChange={(e) => setEndPrice(e.target.value)} placeholder={t('endPrice')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="da-decay">{t('decayBlocks')}</Label>
            <Input
              id="da-decay"
              type="number"
              value={decayBlocks}
              onChange={(e) => setDecayBlocks(e.target.value)}
              placeholder={t('decayBlocks')}
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-1.5">
          <Label htmlFor="da-elapsed">{t('priceCalculator')}</Label>
          <div className="flex items-center gap-3">
            <Input
              id="da-elapsed"
              type="number"
              value={elapsed}
              onChange={(e) => setElapsed(e.target.value)}
              placeholder={t('elapsedBlocks')}
              className="w-40"
            />
            {calculatedPrice && <span className="text-sm font-medium">{t('currentPrice', { price: calculatedPrice })}</span>}
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-3">
        <Button onClick={handleSubmit} disabled={isTxBusy(configureDutchAuction)}>
          {t('configureDutchAuction')}
        </Button>
        <TxStatusIndicator txState={configureDutchAuction.txState} />
      </CardFooter>
    </Card>
  );
}

function VestingSection() {
  const t = useTranslations('tokensale');
  const { entityId } = useEntityContext();
  const { configureVesting } = useTokensale();
  const [roundId, setRoundId] = useState('');
  const [cliffBlocks, setCliffBlocks] = useState('');
  const [vestingBlocks, setVestingBlocks] = useState('');

  const handleSubmit = useCallback(() => {
    if (!roundId || !cliffBlocks || !vestingBlocks) return;
    configureVesting.mutate([entityId, Number(roundId), Number(cliffBlocks), Number(vestingBlocks)]);
  }, [cliffBlocks, configureVesting, entityId, roundId, vestingBlocks]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('vestingConfig')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="vest-round">{t('roundId')}</Label>
            <Input id="vest-round" type="number" value={roundId} onChange={(e) => setRoundId(e.target.value)} placeholder={t('roundId')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vest-cliff">{t('cliffPeriod')}</Label>
            <Input
              id="vest-cliff"
              type="number"
              value={cliffBlocks}
              onChange={(e) => setCliffBlocks(e.target.value)}
              placeholder={t('cliffPeriod')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vest-period">{t('vestingPeriod')}</Label>
            <Input
              id="vest-period"
              type="number"
              value={vestingBlocks}
              onChange={(e) => setVestingBlocks(e.target.value)}
              placeholder={t('vestingPeriod')}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-3">
        <Button onClick={handleSubmit} disabled={isTxBusy(configureVesting)}>
          {t('configureVesting')}
        </Button>
        <TxStatusIndicator txState={configureVesting.txState} />
      </CardFooter>
    </Card>
  );
}

function SubscribeSection() {
  const t = useTranslations('tokensale');
  const { entityId } = useEntityContext();
  const { subscribe, increaseSubscription } = useTokensale();
  const [roundId, setRoundId] = useState('');
  const [amount, setAmount] = useState('');
  const [increaseAmt, setIncreaseAmt] = useState('');

  const handleSubscribe = useCallback(() => {
    if (!roundId || !amount) return;
    subscribe.mutate([entityId, Number(roundId), amount]);
    setAmount('');
  }, [amount, entityId, roundId, subscribe]);

  const handleIncrease = useCallback(() => {
    if (!roundId || !increaseAmt) return;
    increaseSubscription.mutate([entityId, Number(roundId), increaseAmt]);
    setIncreaseAmt('');
  }, [entityId, increaseAmt, increaseSubscription, roundId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('subscribe')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="sub-round">{t('roundId')}</Label>
          <Input
            id="sub-round"
            type="number"
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            placeholder={t('roundId')}
            className="w-40"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t('newSubscription')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sub-amount">{t('subscriptionAmount')}</Label>
                <Input
                  id="sub-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t('subscriptionAmount')}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleSubscribe} disabled={isTxBusy(subscribe)}>
                  {t('subscribe')}
                </Button>
                <TxStatusIndicator txState={subscribe.txState} />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t('increaseSubscription')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sub-increase">{t('increaseAmount')}</Label>
                <Input
                  id="sub-increase"
                  value={increaseAmt}
                  onChange={(e) => setIncreaseAmt(e.target.value)}
                  placeholder={t('increaseAmount')}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleIncrease} disabled={isTxBusy(increaseSubscription)}>
                  {t('increase')}
                </Button>
                <TxStatusIndicator txState={increaseSubscription.txState} />
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

function WhitelistSection() {
  const t = useTranslations('tokensale');
  const { entityId } = useEntityContext();
  const { addToWhitelist, removeFromWhitelist } = useTokensale();
  const [roundId, setRoundId] = useState('');
  const [account, setAccount] = useState('');

  const handleAdd = useCallback(() => {
    if (!roundId || !account.trim()) return;
    addToWhitelist.mutate([entityId, Number(roundId), account.trim()]);
    setAccount('');
  }, [account, addToWhitelist, entityId, roundId]);

  const handleRemove = useCallback(() => {
    if (!roundId || !account.trim()) return;
    removeFromWhitelist.mutate([entityId, Number(roundId), account.trim()]);
    setAccount('');
  }, [account, entityId, removeFromWhitelist, roundId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('whitelistManagement')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="wl-round">{t('roundId')}</Label>
            <Input id="wl-round" type="number" value={roundId} onChange={(e) => setRoundId(e.target.value)} placeholder={t('roundId')} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="wl-account">{t('accountAddress')}</Label>
            <Input id="wl-account" value={account} onChange={(e) => setAccount(e.target.value)} placeholder={t('accountAddress')} />
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-3">
        <Button onClick={handleAdd} disabled={isTxBusy(addToWhitelist)}>
          {t('addWhitelist')}
        </Button>
        <Button variant="destructive" onClick={handleRemove} disabled={isTxBusy(removeFromWhitelist)}>
          {t('removeWhitelist')}
        </Button>
        <TxStatusIndicator txState={addToWhitelist.txState} />
        <TxStatusIndicator txState={removeFromWhitelist.txState} />
      </CardFooter>
    </Card>
  );
}

function LifecycleActions() {
  const t = useTranslations('tokensale');
  const { entityId } = useEntityContext();
  const { startSaleRound, endSaleRound, claimTokens, unlockTokens, claimRefund } = useTokensale();
  const [roundId, setRoundId] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('roundActions')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="lc-round">{t('roundId')}</Label>
          <Input
            id="lc-round"
            type="number"
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            placeholder={t('roundId')}
            className="w-40"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => roundId && startSaleRound.mutate([entityId, Number(roundId)])} disabled={!roundId || isTxBusy(startSaleRound)}>
            {t('startRound')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => roundId && endSaleRound.mutate([entityId, Number(roundId)])}
            disabled={!roundId || isTxBusy(endSaleRound)}
          >
            {t('endRound')}
          </Button>
          <Button
            variant="default"
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={() => roundId && claimTokens.mutate([entityId, Number(roundId)])}
            disabled={!roundId || isTxBusy(claimTokens)}
          >
            {t('claimTokens')}
          </Button>
          <Button
            variant="secondary"
            className="bg-purple-600 text-white hover:bg-purple-700"
            onClick={() => roundId && unlockTokens.mutate([entityId, Number(roundId)])}
            disabled={!roundId || isTxBusy(unlockTokens)}
          >
            {t('unlockTokens')}
          </Button>
          <Button variant="outline" onClick={() => roundId && claimRefund.mutate([entityId, Number(roundId)])} disabled={!roundId || isTxBusy(claimRefund)}>
            {t('claimRefund')}
          </Button>
        </div>
      </CardContent>
      <CardFooter className="flex-wrap gap-3">
        <TxStatusIndicator txState={startSaleRound.txState} />
        <TxStatusIndicator txState={endSaleRound.txState} />
        <TxStatusIndicator txState={claimTokens.txState} />
        <TxStatusIndicator txState={unlockTokens.txState} />
        <TxStatusIndicator txState={claimRefund.txState} />
      </CardFooter>
    </Card>
  );
}

function SaleRoundsList() {
  const t = useTranslations('tokensale');
  const te = useTranslations('enums');
  const { saleRounds } = useTokensale();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">{t('saleRounds')}</CardTitle>
          {saleRounds.length > 0 && <Badge variant="secondary">{saleRounds.length}</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {saleRounds.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noSaleRounds')}</p>
        ) : (
          <div className="space-y-3">
            {saleRounds.map((round) => (
              <Card key={round.id} className="shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">#{round.id} {round.name}</span>
                    <Badge variant={STATUS_VARIANT[round.status] ?? 'secondary'}>
                      {te(`saleRoundStatus.${round.status}` as const)}
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                    <span>{t('priceLabel')}: {round.price.toString()}</span>
                    <span>{t('totalSupplyLabel')}: {round.totalSupply.toString()}</span>
                    <span>{t('totalRaised')}: {round.totalRaised.toString()}</span>
                    <span>{t('participants')}: {round.participantCount}</span>
                    <span>{t('blockRange')}: {round.startBlock}--{round.endBlock}</span>
                    <span>{t('purchaseRange')}: {round.minPurchase.toString()}--{round.maxPurchase.toString()}</span>
                    <span>{t('softCap')}: {round.softCap.toString()}</span>
                    <span>{t('hardCap')}: {round.hardCap.toString()}</span>
                  </div>
                  {round.dutchAuction && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('dutchAuctionValue', {
                        start: round.dutchAuction.startPrice.toString(),
                        end: round.dutchAuction.endPrice.toString(),
                        blocks: round.dutchAuction.decayBlocks,
                      })}
                    </p>
                  )}
                  {round.vestingConfig && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('vestingLabel', {
                        cliff: round.vestingConfig.cliffBlocks,
                        vesting: round.vestingConfig.vestingBlocks,
                      })}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TokenSalePage() {
  const t = useTranslations('tokensale');
  const tc = useTranslations('common');
  const { isLoading, error } = useTokensale();

  if (isLoading) {
    return <TokenSaleSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center text-sm text-destructive">
            {tc('loadFailed')}: {String(error)}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
          <CreateSaleRoundForm />
        </PermissionGuard>
      </div>

      <SaleRoundsList />
      <SubscribeSection />
      <LifecycleActions />

      <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
        <DutchAuctionSection />
        <VestingSection />
        <WhitelistSection />
      </PermissionGuard>
    </div>
  );
}
