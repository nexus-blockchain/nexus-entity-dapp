'use client';

import React, { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { useTokensale, computeDutchAuctionPrice } from '@/hooks/use-tokensale';
import { isTxBusy, useTxLock } from '@/hooks/use-tx-lock';
import { AdminPermission } from '@/lib/types/models';
import { SaleMode } from '@/lib/types/enums';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { LabelWithTip } from '@/components/field-help-tip';
import { formatNex } from '@/lib/utils/format';

const STATUS_VARIANT: Record<string, 'secondary' | 'default' | 'warning' | 'destructive' | 'success' | 'outline'> = {
  NotStarted: 'secondary',
  Active: 'default',
  Ended: 'destructive',
  Cancelled: 'outline',
  Completed: 'success',
  Paused: 'warning',
};

type SaleRoundFormKey =
  | 'mode'
  | 'totalSupply'
  | 'startBlock'
  | 'endBlock'
  | 'kycRequired'
  | 'minKycLevel'
  | 'softCap';

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
    mode: SaleMode.FixedPrice,
    totalSupply: '',
    startBlock: '',
    endBlock: '',
    kycRequired: '',
    minKycLevel: '0',
    softCap: '',
  });

  const setField = useCallback((key: SaleRoundFormKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    const {
      mode,
      totalSupply,
      startBlock,
      endBlock,
      kycRequired,
      minKycLevel,
      softCap,
    } = form;

    if (!mode.trim() || !totalSupply) return;

    // Pallet: create_sale_round(entity_id, mode, total_supply, start_block, end_block, kyc_required, min_kyc_level, soft_cap)
    createSaleRound.mutate([
      entityId,
      mode.trim(),
      totalSupply,
      Number(startBlock),
      Number(endBlock),
      kycRequired === 'true',
      Number(minKycLevel),
      softCap || '0',
    ]);
  }, [createSaleRound, entityId, form]);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>{t('createSaleRound')}</Button>;
  }

  const fields: Array<{ key: SaleRoundFormKey; label: string; type: string; placeholder: string }> = [
    { key: 'totalSupply', label: t('totalSupply'), type: 'text', placeholder: t('totalSupply') },
    { key: 'startBlock', label: t('startBlock'), type: 'number', placeholder: t('startBlock') },
    { key: 'endBlock', label: t('endBlock'), type: 'number', placeholder: t('endBlock') },
    { key: 'kycRequired', label: t('kycRequired'), type: 'text', placeholder: 'true / false' },
    { key: 'minKycLevel', label: t('minKycLevel'), type: 'number', placeholder: '0' },
    { key: 'softCap', label: t('softCap'), type: 'text', placeholder: t('softCap') },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('createSaleRound')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Sale Mode select */}
          <div className="space-y-1.5">
            <Label htmlFor="sale-mode">{t('saleMode')}</Label>
            <Select value={form.mode} onValueChange={(v) => setField('mode', v)}>
              <SelectTrigger id="sale-mode">
                <SelectValue placeholder={t('saleMode')} />
              </SelectTrigger>
              <SelectContent>
                {Object.values(SaleMode).map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
        <Button onClick={handleSubmit} disabled={!form.mode.trim() || isTxBusy(createSaleRound)}>
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
  const { configureDutchAuction } = useTokensale();
  const [roundId, setRoundId] = useState('');
  const [startPrice, setStartPrice] = useState('');
  const [endPrice, setEndPrice] = useState('');
  const [decayBlocks, setDecayBlocks] = useState('');
  const [elapsed, setElapsed] = useState('');

  const calculatedPrice =
    startPrice && endPrice && decayBlocks && elapsed
      ? computeDutchAuctionPrice(
          BigInt(startPrice),
          BigInt(endPrice),
          Number(decayBlocks),
          Number(elapsed),
        ).toString()
      : null;

  const handleSubmit = useCallback(() => {
    if (!roundId || !startPrice || !endPrice) return;
    // Pallet: configure_dutch_auction(round_id, start_price, end_price)
    configureDutchAuction.mutate([Number(roundId), startPrice, endPrice]);
  }, [configureDutchAuction, endPrice, roundId, startPrice]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('dutchAuctionConfig')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="da-round" tip={t('help.roundName')}>{t('roundId')}</LabelWithTip>
            <Input id="da-round" type="number" value={roundId} onChange={(e) => setRoundId(e.target.value)} placeholder={t('roundId')} />
          </div>
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="da-start" tip={t('help.startPrice')}>{t('startPrice')}</LabelWithTip>
            <Input id="da-start" value={startPrice} onChange={(e) => setStartPrice(e.target.value)} placeholder={t('startPrice')} />
          </div>
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="da-end" tip={t('help.endPrice')}>{t('endPrice')}</LabelWithTip>
            <Input id="da-end" value={endPrice} onChange={(e) => setEndPrice(e.target.value)} placeholder={t('endPrice')} />
          </div>
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="da-decay" tip={t('help.decayBlocks')}>{t('decayBlocks')}</LabelWithTip>
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
  const { setVestingConfig } = useTokensale();
  const [roundId, setRoundId] = useState('');
  const [vestingType, setVestingType] = useState('');
  const [initialUnlockBps, setInitialUnlockBps] = useState('');
  const [cliffDuration, setCliffDuration] = useState('');
  const [totalDuration, setTotalDuration] = useState('');
  const [unlockInterval, setUnlockInterval] = useState('');

  const handleSubmit = useCallback(() => {
    if (!roundId || !vestingType) return;
    // Pallet: set_vesting_config(round_id, vesting_type, initial_unlock_bps, cliff_duration, total_duration, unlock_interval)
    setVestingConfig.mutate([
      Number(roundId),
      vestingType.trim(),
      Number(initialUnlockBps || '0'),
      Number(cliffDuration || '0'),
      Number(totalDuration || '0'),
      Number(unlockInterval || '0'),
    ]);
  }, [setVestingConfig, roundId, vestingType, initialUnlockBps, cliffDuration, totalDuration, unlockInterval]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('vestingConfig')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="vest-round" tip={t('help.roundName')}>{t('roundId')}</LabelWithTip>
            <Input id="vest-round" type="number" value={roundId} onChange={(e) => setRoundId(e.target.value)} placeholder={t('roundId')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vest-type">{t('vestingType')}</Label>
            <Input id="vest-type" value={vestingType} onChange={(e) => setVestingType(e.target.value)} placeholder={t('vestingTypePlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="vest-initial-unlock" tip={t('help.initialUnlockBps')}>{t('initialUnlockBps')}</LabelWithTip>
            <Input id="vest-initial-unlock" type="number" value={initialUnlockBps} onChange={(e) => setInitialUnlockBps(e.target.value)} placeholder={t('initialUnlockBps')} />
          </div>
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="vest-cliff" tip={t('help.cliffPeriod')}>{t('cliffPeriod')}</LabelWithTip>
            <Input
              id="vest-cliff"
              type="number"
              value={cliffDuration}
              onChange={(e) => setCliffDuration(e.target.value)}
              placeholder={t('cliffPeriod')}
            />
          </div>
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="vest-total" tip={t('help.totalDuration')}>{t('totalDuration')}</LabelWithTip>
            <Input
              id="vest-total"
              type="number"
              value={totalDuration}
              onChange={(e) => setTotalDuration(e.target.value)}
              placeholder={t('totalDuration')}
            />
          </div>
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="vest-interval" tip={t('help.unlockInterval')}>{t('unlockInterval')}</LabelWithTip>
            <Input
              id="vest-interval"
              type="number"
              value={unlockInterval}
              onChange={(e) => setUnlockInterval(e.target.value)}
              placeholder={t('unlockInterval')}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-3">
        <Button onClick={handleSubmit} disabled={isTxBusy(setVestingConfig)}>
          {t('configureVesting')}
        </Button>
        <TxStatusIndicator txState={setVestingConfig.txState} />
      </CardFooter>
    </Card>
  );
}

function SubscribeSection() {
  const t = useTranslations('tokensale');
  const { subscribe, increaseSubscription } = useTokensale();
  const [roundId, setRoundId] = useState('');
  const [amount, setAmount] = useState('');
  const [increaseAmt, setIncreaseAmt] = useState('');

  const handleSubscribe = useCallback(() => {
    if (!roundId || !amount) return;
    // Pallet: subscribe(round_id, amount, payment_asset)
    subscribe.mutate([Number(roundId), amount, null]);
    setAmount('');
  }, [amount, roundId, subscribe]);

  const handleIncrease = useCallback(() => {
    if (!roundId || !increaseAmt) return;
    // Pallet: increase_subscription(round_id, additional_amount, payment_asset)
    increaseSubscription.mutate([Number(roundId), increaseAmt, null]);
    setIncreaseAmt('');
  }, [increaseAmt, increaseSubscription, roundId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('subscribe')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <LabelWithTip htmlFor="sub-round" tip={t('help.roundName')}>{t('roundId')}</LabelWithTip>
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
                <LabelWithTip htmlFor="sub-amount" tip={t('help.subscriptionAmount')}>{t('subscriptionAmount')}</LabelWithTip>
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
  const { addToWhitelist, removeFromWhitelist } = useTokensale();
  const [roundId, setRoundId] = useState('');
  const [account, setAccount] = useState('');

  const handleAdd = useCallback(() => {
    if (!roundId || !account.trim()) return;
    // Pallet: add_to_whitelist(round_id, accounts) where accounts = Vec<(AccountId, Option<Balance>)>
    addToWhitelist.mutate([Number(roundId), [[account.trim(), null]]]);
    setAccount('');
  }, [account, addToWhitelist, roundId]);

  const handleRemove = useCallback(() => {
    if (!roundId || !account.trim()) return;
    // Pallet: remove_from_whitelist(round_id, accounts) where accounts = Vec<AccountId>
    removeFromWhitelist.mutate([Number(roundId), [account.trim()]]);
    setAccount('');
  }, [account, removeFromWhitelist, roundId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('whitelistManagement')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="wl-round" tip={t('help.roundName')}>{t('roundId')}</LabelWithTip>
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
  const { startSale, endSale, claimTokens, unlockTokens, claimRefund } = useTokensale();
  const [roundId, setRoundId] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('roundActions')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <LabelWithTip htmlFor="lc-round" tip={t('help.roundName')}>{t('roundId')}</LabelWithTip>
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
          <Button onClick={() => roundId && startSale.mutate([Number(roundId)])} disabled={!roundId || isTxBusy(startSale)}>
            {t('startRound')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => roundId && endSale.mutate([Number(roundId)])}
            disabled={!roundId || isTxBusy(endSale)}
          >
            {t('endRound')}
          </Button>
          <Button
            variant="default"
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={() => roundId && claimTokens.mutate([Number(roundId)])}
            disabled={!roundId || isTxBusy(claimTokens)}
          >
            {t('claimTokens')}
          </Button>
          <Button
            variant="secondary"
            className="bg-purple-600 text-white hover:bg-purple-700"
            onClick={() => roundId && unlockTokens.mutate([Number(roundId)])}
            disabled={!roundId || isTxBusy(unlockTokens)}
          >
            {t('unlockTokens')}
          </Button>
          <Button variant="outline" onClick={() => roundId && claimRefund.mutate([Number(roundId)])} disabled={!roundId || isTxBusy(claimRefund)}>
            {t('claimRefund')}
          </Button>
        </div>
      </CardContent>
      <CardFooter className="flex-wrap gap-3">
        <TxStatusIndicator txState={startSale.txState} />
        <TxStatusIndicator txState={endSale.txState} />
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
                    <span className="text-sm font-medium">#{round.id} [{round.mode}]</span>
                    <Badge variant={STATUS_VARIANT[round.status] ?? 'secondary'}>
                      {round.status}
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                    <span>{t('totalSupplyLabel')}: {formatNex(round.totalSupply)}</span>
                    <span>{t('soldAmount')}: {formatNex(round.soldAmount)}</span>
                    <span>{t('remainingAmount')}: {formatNex(round.remainingAmount)}</span>
                    <span>{t('participants')}: {round.participantsCount}</span>
                    <span>{t('blockRange')}: {round.startBlock}--{round.endBlock}</span>
                    <span>{t('softCap')}: {formatNex(round.softCap)} NEX</span>
                    <span>{t('kycRequired')}: {round.kycRequired ? 'Yes' : 'No'}</span>
                    <span>{t('minKycLevel')}: {round.minKycLevel}</span>
                  </div>
                  {round.dutchStartPrice != null && round.dutchEndPrice != null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('dutchAuction')}: {formatNex(round.dutchStartPrice)} → {formatNex(round.dutchEndPrice)}
                    </p>
                  )}
                  {round.vestingConfig && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Vesting: {round.vestingConfig.vestingType}, cliff {round.vestingConfig.cliffDuration} blocks, total {round.vestingConfig.totalDuration} blocks
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

function PaymentOptionSection() {
  const t = useTranslations('tokensale');
  const tc = useTranslations('common');
  const { addPaymentOption } = useTokensale();
  const [roundId, setRoundId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [price, setPrice] = useState('');
  const [minPurchase, setMinPurchase] = useState('');
  const [maxPurchasePerAccount, setMaxPurchasePerAccount] = useState('');

  const handleSubmit = useCallback(() => {
    if (!roundId || !price) return;
    // Pallet: add_payment_option(round_id, asset_id, price, min_purchase, max_purchase_per_account)
    addPaymentOption.mutate([
      Number(roundId),
      assetId.trim() ? Number(assetId) : null,
      price,
      minPurchase || '0',
      maxPurchasePerAccount || '0',
    ]);
  }, [addPaymentOption, roundId, assetId, price, minPurchase, maxPurchasePerAccount]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('addPaymentOption')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="po-round" tip={t('help.roundName')}>{t('roundId')}</LabelWithTip>
            <Input id="po-round" type="number" value={roundId} onChange={(e) => setRoundId(e.target.value)} placeholder={t('roundId')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-asset">{t('assetId')}</Label>
            <Input id="po-asset" type="number" value={assetId} onChange={(e) => setAssetId(e.target.value)} placeholder={t('assetIdPlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="po-price" tip={t('help.price')}>{t('price')}</LabelWithTip>
            <Input id="po-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={t('price')} />
          </div>
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="po-min" tip={t('help.minPurchase')}>{t('minPurchase')}</LabelWithTip>
            <Input id="po-min" value={minPurchase} onChange={(e) => setMinPurchase(e.target.value)} placeholder={t('minPurchase')} />
          </div>
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="po-max" tip={t('help.maxPurchase')}>{t('maxPurchasePerAccount')}</LabelWithTip>
            <Input id="po-max" value={maxPurchasePerAccount} onChange={(e) => setMaxPurchasePerAccount(e.target.value)} placeholder={t('maxPurchasePerAccount')} />
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-3">
        <Button onClick={handleSubmit} disabled={!roundId || !price || isTxBusy(addPaymentOption)}>
          {tc('submit')}
        </Button>
        <TxStatusIndicator txState={addPaymentOption.txState} />
      </CardFooter>
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
        <PaymentOptionSection />
        <DutchAuctionSection />
        <VestingSection />
        <WhitelistSection />
      </PermissionGuard>
    </div>
  );
}
