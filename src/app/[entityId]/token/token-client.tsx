'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useEntityToken } from '@/hooks/use-entity-token';
import { PermissionGuard } from '@/components/permission-guard';
import { TxConfirmDialog } from '@/components/tx-confirm-dialog';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { TokenType, TransferRestrictionMode } from '@/lib/types/enums';
import { isTxBusy, useTxLock } from '@/hooks/use-tx-lock';

import { useTranslations } from 'next-intl';
import { LabelWithTip } from '@/components/field-help-tip';
import { CopyableAddress } from '@/components/copyable-address';
import { isValidSubstrateAddress } from '@/lib/utils/address';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Coins, Shield, Users, Flame, Hammer,
  Settings, Tag, FileText,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────

function formatTokenAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toLocaleString();
  const divisor = BigInt('1' + '0'.repeat(decimals));
  const whole = amount / divisor;
  const remainder = amount % divisor;
  const decStr = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return decStr ? `${whole.toLocaleString()}.${decStr}` : whole.toLocaleString();
}

function parseTokenInput(value: string, decimals: number): string {
  // Convert human-readable amount to chain raw integer string
  const parts = value.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').slice(0, decimals).padEnd(decimals, '0');
  const raw = BigInt(whole + frac).toString();
  return raw;
}

// ─── Create Token Form ──────────────────────────────────────

function CreateTokenForm() {
  const t = useTranslations('token');
  const { entityId } = useEntityContext();
  const { createToken } = useEntityToken();
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState('12');
  const [rewardRate, setRewardRate] = useState('0');
  const [exchangeRate, setExchangeRate] = useState('0');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !symbol.trim()) return;
      const decimalsNum = Number(decimals) || 12;
      const rr = Number(rewardRate) || 0;
      const er = Number(exchangeRate) || 0;
      createToken.mutate([entityId, name.trim(), symbol.trim(), decimalsNum, rr, er]);
    },
    [entityId, name, symbol, decimals, rewardRate, exchangeRate, createToken],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <PermissionGuard
        required={AdminPermission.TOKEN_MANAGE}
        fallback={
          <Card>
            <CardContent className="flex items-center justify-center p-12">
              <p className="text-sm text-muted-foreground">{t('noTokenNoPermission')}</p>
            </CardContent>
          </Card>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('createToken')}</CardTitle>
            <CardDescription>{t('createTokenDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <LabelWithTip className="text-sm font-medium" tip={t('help.tokenName')}>
                    {t('tokenName')}
                  </LabelWithTip>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('namePlaceholder')}
                    maxLength={32}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithTip className="text-sm font-medium" tip={t('help.symbol')}>
                    {t('symbol')}
                  </LabelWithTip>
                  <Input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    placeholder={t('symbolPlaceholder')}
                    maxLength={10}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithTip className="text-sm font-medium" tip={t('help.decimals')}>
                    {t('decimals')}
                  </LabelWithTip>
                  <Input
                    type="number"
                    min="0"
                    max="18"
                    value={decimals}
                    onChange={(e) => setDecimals(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithTip className="text-sm font-medium" tip={t('help.rewardRate')}>
                    {t('rewardRateBps')}
                  </LabelWithTip>
                  <Input
                    type="number"
                    min="0"
                    max="10000"
                    value={rewardRate}
                    onChange={(e) => setRewardRate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithTip className="text-sm font-medium" tip={t('help.exchangeRate')}>
                    {t('exchangeRateBps')}
                  </LabelWithTip>
                  <Input
                    type="number"
                    min="0"
                    max="10000"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={isTxBusy(createToken)}>
                  {t('createTokenButton')}
                </Button>
                <TxStatusIndicator txState={createToken.txState} />
              </div>
            </form>
          </CardContent>
        </Card>
      </PermissionGuard>
    </div>
  );
}

// ─── Supply Overview Card ───────────────────────────────────

function SupplyOverviewCard({
  tokenConfig,
  assetId,
  holderCount,
}: {
  tokenConfig: NonNullable<ReturnType<typeof useEntityToken>['tokenConfig']>;
  assetId: number;
  holderCount: number;
}) {
  const t = useTranslations('token');
  const decimals = tokenConfig.decimals;
  const hasMaxSupply = tokenConfig.maxSupply > BigInt(0);
  const supplyPercent = hasMaxSupply
    ? Number((tokenConfig.totalSupply * BigInt(10000)) / tokenConfig.maxSupply) / 100
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{t('supplyOverview')}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={tokenConfig.enabled ? 'success' : 'destructive'}>
              {tokenConfig.enabled ? t('enabled') : t('disabled')}
            </Badge>
            <Badge variant="outline">
              {t('tokenTypes.' + tokenConfig.tokenType)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatItem
            label={t('tokenName')}
            value={`${tokenConfig.name} (${tokenConfig.symbol})`}
          />
          <StatItem
            label={t('assetId')}
            value={String(assetId)}
          />
          <StatItem
            label={t('totalSupply')}
            value={formatTokenAmount(tokenConfig.totalSupply, decimals)}
          />
          <StatItem
            label={t('maxSupply')}
            value={hasMaxSupply ? formatTokenAmount(tokenConfig.maxSupply, decimals) : t('unlimited')}
          />
        </div>

        {/* Supply progress bar */}
        {hasMaxSupply && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('supplyProgress')}</span>
              <span>{supplyPercent.toFixed(1)}%</span>
            </div>
            <Progress value={supplyPercent} className="h-2" />
          </div>
        )}

        <Separator />

        {/* Secondary stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatItem
            label={t('decimals')}
            value={String(decimals)}
          />
          <StatItem
            label={t('holderCount')}
            value={String(holderCount)}
          />
          <StatItem
            label={t('transferRestriction')}
            value={t('transferRestrictions.' + tokenConfig.transferRestriction)}
          />
          <StatItem
            label={t('transferable')}
            value={tokenConfig.transferable ? t('yes') : t('no')}
          />
        </div>

        {/* Rights badge */}
        <div className="rounded-md bg-blue-50 px-4 py-3 dark:bg-blue-900/20">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
            {t('rightsLabel', { rights: t('tokenRightsDesc.' + tokenConfig.tokenType) })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold">{value}</dd>
    </div>
  );
}

// ─── Token Config Editor ────────────────────────────────────

function TokenConfigSection() {
  const t = useTranslations('token');
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const { tokenConfig, updateTokenConfig } = useEntityToken();

  const [rewardRate, setRewardRate] = useState(String(tokenConfig?.rewardRate ?? 0));
  const [exchangeRate, setExchangeRate] = useState(String(tokenConfig?.exchangeRate ?? 0));
  const [minRedeem, setMinRedeem] = useState('0');
  const [maxRedeemPerOrder, setMaxRedeemPerOrder] = useState('0');
  const [transferable, setTransferable] = useState(tokenConfig?.transferable ?? true);
  const [enabled, setEnabled] = useState(tokenConfig?.enabled ?? true);

  useEffect(() => {
    if (tokenConfig) {
      setRewardRate(String(tokenConfig.rewardRate));
      setExchangeRate(String(tokenConfig.exchangeRate));
      setMinRedeem(formatTokenAmount(tokenConfig.minRedeem, tokenConfig.decimals));
      setMaxRedeemPerOrder(formatTokenAmount(tokenConfig.maxRedeemPerOrder, tokenConfig.decimals));
      setTransferable(tokenConfig.transferable);
      setEnabled(tokenConfig.enabled);
    }
  }, [tokenConfig]);

  const handleSave = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!tokenConfig) return;
      const rr = Number(rewardRate) || 0;
      const er = Number(exchangeRate) || 0;
      const mr = parseTokenInput(minRedeem, tokenConfig.decimals);
      const mrpo = parseTokenInput(maxRedeemPerOrder, tokenConfig.decimals);
      // useEntityMutation passes Option<T> as null to skip, or value to update
      updateTokenConfig.mutate([
        entityId,
        rr,      // reward_rate
        er,      // exchange_rate
        mr,      // min_redeem
        mrpo,    // max_redeem_per_order
        transferable,
        enabled,
      ]);
    },
    [entityId, rewardRate, exchangeRate, minRedeem, maxRedeemPerOrder, transferable, enabled, tokenConfig, updateTokenConfig],
  );

  if (isReadOnly || isSuspended) return null;

  return (
    <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-lg">{t('configSection')}</CardTitle>
              <CardDescription>{t('configSectionDesc')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <LabelWithTip className="text-sm font-medium" tip={t('help.rewardRate')}>
                  {t('rewardRateBps')}
                </LabelWithTip>
                <Input
                  type="number"
                  min="0"
                  max="10000"
                  value={rewardRate}
                  onChange={(e) => setRewardRate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <LabelWithTip className="text-sm font-medium" tip={t('help.exchangeRate')}>
                  {t('exchangeRateBps')}
                </LabelWithTip>
                <Input
                  type="number"
                  min="0"
                  max="10000"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('minRedeemAmount')}</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={minRedeem}
                  onChange={(e) => setMinRedeem(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('maxRedeemPerOrder')}</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={maxRedeemPerOrder}
                  onChange={(e) => setMaxRedeemPerOrder(e.target.value)}
                />
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="transferable"
                  checked={transferable}
                  onCheckedChange={setTransferable}
                />
                <Label htmlFor="transferable" className="text-sm">{t('transferable')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="token-enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
                <Label htmlFor="token-enabled" className="text-sm">{t('tokenEnabled')}</Label>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={isTxBusy(updateTokenConfig)}>
                {isTxBusy(updateTokenConfig) ? t('saving') : t('save')}
              </Button>
              <TxStatusIndicator txState={updateTokenConfig.txState} />
            </div>
          </form>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}

// ─── Max Supply Section ─────────────────────────────────────

function MaxSupplySection() {
  const t = useTranslations('token');
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const { tokenConfig, setMaxSupply } = useEntityToken();
  const [newMaxSupply, setNewMaxSupplyInput] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!tokenConfig) return;
      const raw = parseTokenInput(newMaxSupply || '0', tokenConfig.decimals);
      setMaxSupply.mutate([entityId, raw]);
    },
    [entityId, newMaxSupply, tokenConfig, setMaxSupply],
  );

  if (isReadOnly || isSuspended || !tokenConfig) return null;

  return (
    <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-lg">{t('setMaxSupply')}</CardTitle>
              <CardDescription>{t('setMaxSupplyDesc')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 text-sm text-muted-foreground">
            {t('currentMaxSupply')}:{' '}
            <span className="font-semibold text-foreground">
              {tokenConfig.maxSupply > BigInt(0)
                ? formatTokenAmount(tokenConfig.maxSupply, tokenConfig.decimals)
                : t('unlimited')}
            </span>
          </div>
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <LabelWithTip className="text-sm font-medium" tip={t('help.maxSupply')}>
                {t('newMaxSupply')}
              </LabelWithTip>
              <Input
                type="text"
                inputMode="decimal"
                value={newMaxSupply}
                onChange={(e) => setNewMaxSupplyInput(e.target.value)}
                placeholder="0"
              />
            </div>
            <Button type="submit" disabled={isTxBusy(setMaxSupply)}>
              {t('update')}
            </Button>
            <TxStatusIndicator txState={setMaxSupply.txState} />
          </form>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}

// ─── Token Type Section ─────────────────────────────────────

function ChangeTokenTypeSection() {
  const t = useTranslations('token');
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const { tokenConfig, changeTokenType } = useEntityToken();
  const [newType, setNewType] = useState<TokenType>(tokenConfig?.tokenType ?? TokenType.Points);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      changeTokenType.mutate([entityId, newType]);
    },
    [entityId, newType, changeTokenType],
  );

  if (isReadOnly || isSuspended || !tokenConfig) return null;

  return (
    <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-lg">{t('changeTokenType')}</CardTitle>
              <CardDescription>{t('changeTokenTypeDesc')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 text-sm text-muted-foreground">
            {t('currentType')}:{' '}
            <Badge variant="outline">{t('tokenTypes.' + tokenConfig.tokenType)}</Badge>
          </div>
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label className="text-sm font-medium">{t('newType')}</Label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as TokenType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {Object.values(TokenType).map((tt) => (
                  <option key={tt} value={tt}>
                    {t('tokenTypes.' + tt)} — {t('tokenRightsDesc.' + tt)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={isTxBusy(changeTokenType)}>
              {t('update')}
            </Button>
            <TxStatusIndicator txState={changeTokenType.txState} />
          </form>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}

// ─── Metadata Update Section ────────────────────────────────

function UpdateMetadataSection() {
  const t = useTranslations('token');
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const { tokenConfig, updateTokenMetadata } = useEntityToken();
  const [newName, setNewName] = useState(tokenConfig?.name ?? '');
  const [newSymbol, setNewSymbol] = useState(tokenConfig?.symbol ?? '');

  useEffect(() => {
    if (tokenConfig) {
      setNewName(tokenConfig.name);
      setNewSymbol(tokenConfig.symbol);
    }
  }, [tokenConfig]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName.trim() || !newSymbol.trim()) return;
      updateTokenMetadata.mutate([entityId, newName.trim(), newSymbol.trim()]);
    },
    [entityId, newName, newSymbol, updateTokenMetadata],
  );

  if (isReadOnly || isSuspended || !tokenConfig) return null;

  return (
    <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-lg">{t('updateMetadata')}</CardTitle>
              <CardDescription>{t('updateMetadataDesc')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('newName')}</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={32}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('newSymbol')}</Label>
                <Input
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  maxLength={10}
                  required
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isTxBusy(updateTokenMetadata)}>
                {t('update')}
              </Button>
              <TxStatusIndicator txState={updateTokenMetadata.txState} />
            </div>
          </form>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}

// ─── Mint / Burn Section ────────────────────────────────────

function MintBurnSection() {
  const t = useTranslations('token');
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const { mintTokens, burnTokens } = useEntityToken();
  const [mintAccount, setMintAccount] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [burnAmount, setBurnAmount] = useState('');
  const [showBurnConfirm, setShowBurnConfirm] = useState(false);

  const handleMint = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!mintAccount.trim() || !mintAmount.trim()) return;
      mintTokens.mutate([entityId, mintAccount.trim(), mintAmount.trim()])
        .then(() => { setMintAccount(''); setMintAmount(''); })
        .catch(() => {});
    },
    [entityId, mintAccount, mintAmount, mintTokens],
  );

  const handleBurnSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!burnAmount.trim()) return;
      setShowBurnConfirm(true);
    },
    [burnAmount],
  );

  const handleBurnConfirm = useCallback(() => {
    setShowBurnConfirm(false);
    burnTokens.mutate([entityId, burnAmount.trim()])
      .then(() => setBurnAmount(''))
      .catch(() => {});
  }, [entityId, burnAmount, burnTokens]);

  if (isReadOnly || isSuspended) return null;

  return (
    <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Hammer className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{t('mintBurn')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Mint */}
            <form onSubmit={handleMint} className="space-y-3">
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
                <Coins className="h-4 w-4" />
                {t('mintTokens')}
              </h3>
              <div className="space-y-2">
                <LabelWithTip className="text-xs font-medium" tip={t('help.recipientAddress')}>
                  {t('recipientAddress')}
                </LabelWithTip>
                <Input
                  value={mintAccount}
                  onChange={(e) => setMintAccount(e.target.value)}
                  placeholder={t('recipientAddress')}
                  required
                />
              </div>
              <div className="space-y-2">
                <LabelWithTip className="text-xs font-medium" tip={t('help.amount')}>
                  {t('amountPlaceholder')}
                </LabelWithTip>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(e.target.value)}
                  placeholder={t('amountPlaceholder')}
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={isTxBusy(mintTokens)}
                >
                  {t('mint')}
                </Button>
                <TxStatusIndicator txState={mintTokens.txState} />
              </div>
            </form>

            {/* Burn */}
            <form onSubmit={handleBurnSubmit} className="space-y-3">
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-red-700 dark:text-red-400">
                <Flame className="h-4 w-4" />
                {t('burnTokens')}
              </h3>
              <div className="space-y-2">
                <LabelWithTip className="text-xs font-medium" tip={t('help.amount')}>
                  {t('amountPlaceholder')}
                </LabelWithTip>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={burnAmount}
                  onChange={(e) => setBurnAmount(e.target.value)}
                  placeholder={t('amountPlaceholder')}
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isTxBusy(burnTokens)}
                >
                  {t('burn')}
                </Button>
                <TxStatusIndicator txState={burnTokens.txState} />
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      <TxConfirmDialog
        open={showBurnConfirm}
        onClose={() => setShowBurnConfirm(false)}
        onConfirm={handleBurnConfirm}
        config={{
          title: t('confirmBurnTitle'),
          description: t('confirmBurnDesc'),
          severity: 'danger',
        }}
      />
    </PermissionGuard>
  );
}

// ─── Transfer Restriction Config ────────────────────────────

function TransferRestrictionSection() {
  const t = useTranslations('token');
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const { tokenConfig, setTransferRestriction } = useEntityToken();
  const [selectedMode, setSelectedMode] = useState<TransferRestrictionMode>(
    tokenConfig?.transferRestriction ?? TransferRestrictionMode.None,
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setTransferRestriction.mutate([entityId, selectedMode]);
    },
    [entityId, selectedMode, setTransferRestriction],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('transferRestrictionMode')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-2">
          {Object.values(TransferRestrictionMode).map((mode) => (
            <Badge
              key={mode}
              variant={tokenConfig?.transferRestriction === mode ? 'default' : 'outline'}
            >
              {t('transferRestrictions.' + mode)}
            </Badge>
          ))}
        </div>

        {!isReadOnly && !isSuspended && (
          <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
            <form onSubmit={handleSubmit} className="flex items-center gap-3 pt-2">
              <select
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value as TransferRestrictionMode)}
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {Object.values(TransferRestrictionMode).map((mode) => (
                  <option key={mode} value={mode}>
                    {t('transferRestrictions.' + mode)}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={isTxBusy(setTransferRestriction)}>
                {t('update')}
              </Button>
              <TxStatusIndicator txState={setTransferRestriction.txState} />
            </form>
          </PermissionGuard>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Whitelist / Blacklist Management ───────────────────────

function ListManagement({
  title,
  items,
  onAdd,
  onRemove,
  addMutation,
  removeMutation,
}: {
  title: string;
  items: string[];
  onAdd: (account: string) => void;
  onRemove: (account: string) => void;
  addMutation: { txState: import('@/lib/types/models').TxState };
  removeMutation: { txState: import('@/lib/types/models').TxState };
}) {
  const t = useTranslations('token');
  const { isReadOnly, isSuspended } = useEntityContext();
  const [newAccount, setNewAccount] = useState('');
  const [addressError, setAddressError] = useState('');

  const handleAdd = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = newAccount.trim();
      if (!trimmed) return;
      if (!isValidSubstrateAddress(trimmed)) {
        setAddressError(t('invalidAddress'));
        return;
      }
      setAddressError('');
      onAdd(trimmed);
      setNewAccount('');
    },
    [newAccount, onAdd, t],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {title} ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!isReadOnly && !isSuspended && (
          <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
            <form onSubmit={handleAdd} className="mb-4 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={newAccount}
                  onChange={(e) => { setNewAccount(e.target.value); setAddressError(''); }}
                  placeholder={t('enterAccountAddress')}
                  className="flex-1"
                  required
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isTxBusy(addMutation)}
                >
                  {t('add')}
                </Button>
              </div>
              {addressError && <p className="text-xs text-destructive">{addressError}</p>}
              <TxStatusIndicator txState={addMutation.txState} />
            </form>
          </PermissionGuard>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('listEmpty')}</p>
        ) : (
          <ul className="space-y-1">
            {items.map((account) => (
              <li key={account} className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                <CopyableAddress address={account} textClassName="text-xs" />
                {!isReadOnly && !isSuspended && (
                  <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemove(account)}
                      disabled={isTxBusy(removeMutation)}
                      className="h-auto px-2 py-1 text-xs text-destructive hover:text-destructive"
                    >
                      {t('remove')}
                    </Button>
                  </PermissionGuard>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Holders List ───────────────────────────────────────────

function HoldersList({
  holders,
  holderCount,
  holderListAvailable,
  decimals,
}: {
  holders: { account: string; balance: bigint }[];
  holderCount: number;
  holderListAvailable: boolean;
  decimals: number;
}) {
  const t = useTranslations('token');

  if (!holderListAvailable) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{t('holderInfo')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('holderListUnavailable')}</p>
          <p className="mt-2 text-sm font-medium">
            {t('holderCountLabel')}: {holderCount}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (holders.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">{t('noHolders')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('holderList', { count: holders.length })}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="pb-2 pr-4">{t('address')}</th>
                <th className="pb-2 text-right">{t('balance')}</th>
              </tr>
            </thead>
            <tbody>
              {holders.map((h) => (
                <tr key={h.account} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <CopyableAddress address={h.account} textClassName="text-xs" />
                  </td>
                  <td className="py-2 text-right font-medium">
                    {formatTokenAmount(h.balance, decimals)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Token Rights Overview ──────────────────────────────────

function TokenRightsOverview() {
  const t = useTranslations('token');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('tokenRightsOverview')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.values(TokenType).map((tt) => (
            <div key={tt} className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <span className="font-medium">
                {t('tokenTypes.' + tt)}
              </span>
              <span className="text-muted-foreground">— {t('tokenRightsDesc.' + tt)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function TokenPage() {
  const t = useTranslations('token');
  const { entityId } = useEntityContext();
  const {
    assetId,
    tokenConfig,
    holderCount,
    holderListAvailable,
    holders,
    whitelist,
    blacklist,
    isLoading,
    error,
    addToWhitelist,
    removeFromWhitelist,
    addToBlacklist,
    removeFromBlacklist,
  } = useEntityToken();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
        {t('loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-destructive">
        {String(error)}
      </div>
    );
  }

  if (!tokenConfig) {
    return <CreateTokenForm />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {/* Supply overview with issuance stats */}
      <SupplyOverviewCard tokenConfig={tokenConfig} assetId={assetId} holderCount={holderCount} />

      <Tabs defaultValue="manage" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="manage">
            <Settings className="mr-1.5 h-4 w-4" />
            {t('configSection')}
          </TabsTrigger>
          <TabsTrigger value="supply">
            <Coins className="mr-1.5 h-4 w-4" />
            {t('mintBurn')}
          </TabsTrigger>
          <TabsTrigger value="access">
            <Shield className="mr-1.5 h-4 w-4" />
            {t('transferRestrictionMode')}
          </TabsTrigger>
        </TabsList>

        {/* Tab: Management / Config */}
        <TabsContent value="manage" className="space-y-6">
          <TokenConfigSection />
          <MaxSupplySection />
          <ChangeTokenTypeSection />
          <UpdateMetadataSection />
        </TabsContent>

        {/* Tab: Supply (Mint/Burn + Holders) */}
        <TabsContent value="supply" className="space-y-6">
          <MintBurnSection />
          <HoldersList
            holders={holders}
            holderCount={holderCount}
            holderListAvailable={holderListAvailable}
            decimals={tokenConfig.decimals}
          />
        </TabsContent>

        {/* Tab: Access Control */}
        <TabsContent value="access" className="space-y-6">
          <TransferRestrictionSection />
          <div className="grid gap-6 lg:grid-cols-2">
            <ListManagement
              title={t('whitelist')}
              items={whitelist}
              onAdd={(account) => addToWhitelist.mutate([entityId, account])}
              onRemove={(account) => removeFromWhitelist.mutate([entityId, account])}
              addMutation={addToWhitelist}
              removeMutation={removeFromWhitelist}
            />
            <ListManagement
              title={t('blacklist')}
              items={blacklist}
              onAdd={(account) => addToBlacklist.mutate([entityId, account])}
              onRemove={(account) => removeFromBlacklist.mutate([entityId, account])}
              addMutation={addToBlacklist}
              removeMutation={removeFromBlacklist}
            />
          </div>
          <TokenRightsOverview />
        </TabsContent>
      </Tabs>
    </div>
  );
}
