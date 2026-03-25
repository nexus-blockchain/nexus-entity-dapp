'use client';

import React, { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useEntityMutation } from '@/hooks/use-entity-mutation';
import { isTxBusy, useTxLock } from '@/hooks/use-tx-lock';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LabelWithTip } from '@/components/field-help-tip';
import { AdminPermission } from '@/lib/types/models';

function LockTokensSection() {
  const t = useTranslations('token');
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const [amount, setAmount] = useState('');
  const [lockDuration, setLockDuration] = useState('');

  const lockTokens = useEntityMutation('entityToken', 'lockTokens', {
    invalidateKeys: [['entity', entityId, 'token', 'vesting']],
  });

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!amount.trim() || !lockDuration.trim()) return;
    lockTokens.mutate([entityId, amount.trim(), lockDuration.trim()]);
  }, [amount, entityId, lockDuration, lockTokens]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">锁定代币</CardTitle>
        <CardDescription>链端签名：lockTokens(entityId, amount, lockDuration)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          当前运行时仅支持对实体代币做统一锁定，不支持旧页面里的“按账户 + cliff + vesting schedule”模型。
        </p>

        {!isReadOnly && !isSuspended && (
          <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <LabelWithTip htmlFor="vesting-amount" tip={t('help.lockAmount')}>{t('vesting.lockAmount')}</LabelWithTip>
                <Input
                  id="vesting-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <LabelWithTip htmlFor="vesting-duration" tip={t('help.vestingPeriod')}>{t('vesting.vestingPeriod')}</LabelWithTip>
                <Input
                  id="vesting-duration"
                  type="text"
                  inputMode="numeric"
                  value={lockDuration}
                  onChange={(e) => setLockDuration(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isTxBusy(lockTokens) || !amount.trim() || !lockDuration.trim()}>
                  锁定
                </Button>
                <TxStatusIndicator txState={lockTokens.txState} />
              </div>
            </form>
          </PermissionGuard>
        )}
      </CardContent>
    </Card>
  );
}

function UnlockTokensSection() {
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const unlockTokens = useEntityMutation('entityToken', 'unlockTokens', {
    invalidateKeys: [['entity', entityId, 'token', 'vesting']],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">解锁代币</CardTitle>
        <CardDescription>链端签名：unlockTokens(entityId)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          旧版 vestingSchedules / releaseVestedTokens 展示已移除，避免继续依赖链上不存在的 storage。
        </p>

        {!isReadOnly && !isSuspended && (
          <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
            <div className="flex items-center gap-3">
              <Button onClick={() => unlockTokens.mutate([entityId])} disabled={isTxBusy(unlockTokens)}>
                一键解锁
              </Button>
              <TxStatusIndicator txState={unlockTokens.txState} />
            </div>
          </PermissionGuard>
        )}
      </CardContent>
    </Card>
  );
}

export function VestingPage() {
  const t = useTranslations('token');

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('vesting.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">运行时说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>该页面已按当前 runtime 降级重做：</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>删除按账户锁仓和 cliff / vesting period 的旧模型</li>
            <li>删除对不存在 vestingSchedules / releaseVestedTokens storage 的依赖</li>
            <li>保留真实存在的 lockTokens / unlockTokens 操作</li>
          </ul>
        </CardContent>
      </Card>

      <LockTokensSection />
      <UnlockTokensSection />
    </div>
  );
}
