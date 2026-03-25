'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { hasPallet, useEntityQuery } from '@/hooks/use-entity-query';
import { useEntityMutation } from '@/hooks/use-entity-mutation';
import { useEntityToken } from '@/hooks/use-entity-token';
import { isTxBusy, useTxLock } from '@/hooks/use-tx-lock';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTip } from '@/components/field-help-tip';
import { Textarea } from '@/components/ui/textarea';
import { AdminPermission } from '@/lib/types/models';
import { STALE_TIMES } from '@/lib/chain/constants';
import { formatNex } from '@/lib/utils/format';

function parsePendingDividendAmount(raw: unknown): bigint {
  if (!raw || (raw as { isNone?: boolean }).isNone) return BigInt(0);
  const value = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (value == null) return BigInt(0);
  const plain = (value as { toJSON?: () => unknown }).toJSON?.() ?? value;

  if (typeof plain === 'object' && plain !== null) {
    const obj = plain as Record<string, unknown>;
    return BigInt(String(obj.pendingAmount ?? obj.pending_amount ?? obj.totalAmount ?? obj.total_amount ?? 0));
  }

  return BigInt(String(plain ?? 0));
}

function parseRecipients(input: string): Array<[string, string]> {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [account, amount] = line.split(',').map((item) => item.trim());
      return [account, amount] as [string, string];
    })
    .filter(([account, amount]) => !!account && !!amount);
}

function DividendConfigSection() {
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const { tokenConfig } = useEntityToken();
  const t = useTranslations('token');
  const [enabled, setEnabled] = useState(true);
  const [minPeriod, setMinPeriod] = useState('0');

  useEffect(() => {
    setEnabled(tokenConfig?.dividendConfig?.enabled ?? true);
    setMinPeriod(String(tokenConfig?.dividendConfig?.minPeriod ?? 0));
  }, [tokenConfig?.dividendConfig?.enabled, tokenConfig?.dividendConfig?.minPeriod]);

  const configureDividend = useEntityMutation('entityToken', 'configureDividend', {
    invalidateKeys: [['entity', entityId, 'token']],
  });

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    configureDividend.mutate([entityId, enabled, minPeriod.trim() || '0']);
  }, [configureDividend, enabled, entityId, minPeriod]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('dividend.configureDividend')}</CardTitle>
        <CardDescription>链端签名：configureDividend(entityId, enabled, minPeriod)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">当前状态</p>
            <p className="mt-1 text-sm font-medium">
              {tokenConfig?.dividendConfig?.enabled ? '已启用' : '已停用'}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">最小周期</p>
            <p className="mt-1 text-sm font-medium">
              {tokenConfig?.dividendConfig?.minPeriod ?? 0}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">说明</p>
            <p className="mt-1 text-sm font-medium">分红配置已改为直接读取 token config</p>
          </div>
        </div>

        {!isReadOnly && !isSuspended && (
          <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border p-3">
                <input
                  id="dividend-enabled"
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <Label htmlFor="dividend-enabled">启用分红</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dividend-min-period">最小周期（区块）</Label>
                <Input
                  id="dividend-min-period"
                  type="text"
                  inputMode="numeric"
                  value={minPeriod}
                  onChange={(e) => setMinPeriod(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isTxBusy(configureDividend)}>保存配置</Button>
                <TxStatusIndicator txState={configureDividend.txState} />
              </div>
            </form>
          </PermissionGuard>
        )}
      </CardContent>
    </Card>
  );
}

function PendingDividendSection({ pendingAmount }: { pendingAmount: bigint }) {
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const t = useTranslations('token');
  const [totalAmount, setTotalAmount] = useState('');
  const [recipients, setRecipients] = useState('');

  const distributeDividend = useEntityMutation('entityToken', 'distributeDividend', {
    invalidateKeys: [['entity', entityId, 'token', 'dividend']],
  });

  const parsedRecipients = useMemo(() => parseRecipients(recipients), [recipients]);

  const handleDistribute = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!totalAmount.trim()) return;
    distributeDividend.mutate([entityId, totalAmount.trim(), parsedRecipients]);
  }, [distributeDividend, entityId, parsedRecipients, totalAmount]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">待分配分红</CardTitle>
        <CardDescription>链端签名：distributeDividend(entityId, totalAmount, recipients)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">当前待分配金额</p>
          <p className="mt-1 text-lg font-semibold">{formatNex(pendingAmount)} NEX</p>
        </div>

        <p className="text-sm text-muted-foreground">
          当前页面不再依赖旧的 dividendConfigs / dividendClaims storage；只保留真实配置、待分配金额和分发动作。
        </p>

        {!isReadOnly && !isSuspended && (
          <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
            <form onSubmit={handleDistribute} className="space-y-4">
              <div className="space-y-2">
                <LabelWithTip htmlFor="dividend-total-amount" tip={t('help.totalAmount')}>{t('dividend.totalAmount')}</LabelWithTip>
                <Input
                  id="dividend-total-amount"
                  type="text"
                  inputMode="decimal"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dividend-recipients">接收人列表</Label>
                <Textarea
                  id="dividend-recipients"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder={'地址1,金额1\n地址2,金额2'}
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  每行一个接收人，格式为：账户地址,金额
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isTxBusy(distributeDividend) || !totalAmount.trim()}>
                  {t('dividend.distribute')}
                </Button>
                <TxStatusIndicator txState={distributeDividend.txState} />
              </div>
            </form>
          </PermissionGuard>
        )}
      </CardContent>
    </Card>
  );
}

function ClaimSection() {
  const { entityId } = useEntityContext();
  const claimDividend = useEntityMutation('entityToken', 'claimDividend', {
    invalidateKeys: [['entity', entityId, 'token', 'dividend']],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">成员领取</CardTitle>
        <CardDescription>链端签名：claimDividend(entityId)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          当前页面不再依赖旧的 claim 状态 storage；成员直接发起 claim，由链端判断是否存在可领取分红。
        </p>
        <div className="flex items-center gap-3">
          <Button onClick={() => claimDividend.mutate([entityId])} disabled={isTxBusy(claimDividend)}>
            领取分红
          </Button>
          <TxStatusIndicator txState={claimDividend.txState} />
        </div>
      </CardContent>
    </Card>
  );
}

export function DividendPage() {
  const t = useTranslations('token');
  const { entityId } = useEntityContext();
  const { tokenConfig } = useEntityToken();

  const pendingAmountQuery = useEntityQuery<bigint>(
    ['entity', entityId, 'token', 'dividend', 'pendingAmount'],
    async (api) => {
      if (!hasPallet(api, 'entityToken')) return BigInt(0);
      const fn = (api.query as any).entityToken.totalPendingDividends;
      if (!fn) return BigInt(0);
      return parsePendingDividendAmount(await fn(entityId));
    },
    { staleTime: STALE_TIMES.token },
  );

  if (!tokenConfig) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight">{t('dividend.title')}</h1>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            请先创建实体代币后再配置分红。
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('dividend.title')}</h1>
      <DividendConfigSection />
      <PendingDividendSection pendingAmount={pendingAmountQuery.data ?? BigInt(0)} />
      <ClaimSection />
    </div>
  );
}
