'use client';

import React, { useState, useCallback } from 'react';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useEntityQuery } from '@/hooks/use-entity-query';
import { useEntityMutation } from '@/hooks/use-entity-mutation';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { STALE_TIMES } from '@/lib/chain/constants';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils/cn';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Types ──────────────────────────────────────────────────

interface VestingEntry {
  account: string;
  amount: bigint;
  cliffBlocks: number;
  vestingBlocks: number;
  startBlock: number;
}

// ─── Helpers ────────────────────────────────────────────────

function formatAmount(amount: bigint): string {
  return amount.toLocaleString();
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

function parseVestingEntries(rawEntries: [any, any][]): VestingEntry[] {
  const results: VestingEntry[] = [];
  for (const [storageKey, value] of rawEntries) {
    const keys = storageKey.args ?? storageKey.toHuman?.()?.args ?? [];
    const account = String(keys[keys.length - 1] ?? '');
    const arr = value.toJSON?.() ?? value;
    const schedules = Array.isArray(arr) ? arr : [arr];
    for (const s of schedules) {
      if (!s) continue;
      results.push({
        account,
        amount: BigInt(String(s.amount ?? s.locked ?? 0)),
        cliffBlocks: Number(s.cliffBlocks ?? s.cliff_blocks ?? 0),
        vestingBlocks: Number(s.vestingBlocks ?? s.vesting_blocks ?? 0),
        startBlock: Number(s.startBlock ?? s.start_block ?? 0),
      });
    }
  }
  return results;
}

// ─── Skeleton Loading ───────────────────────────────────────

function VestingPageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-9 w-20" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Lock Tokens Form ───────────────────────────────────────

function LockTokensSection() {
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const [account, setAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [cliffBlocks, setCliffBlocks] = useState('');
  const [vestingBlocks, setVestingBlocks] = useState('');

  const lockTokens = useEntityMutation('entityToken', 'lockTokens', {
    invalidateKeys: [['entity', entityId, 'token', 'vesting']],
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!account.trim() || !amount.trim() || !cliffBlocks.trim() || !vestingBlocks.trim()) return;
      lockTokens.mutate([entityId, account.trim(), amount.trim(), cliffBlocks.trim(), vestingBlocks.trim()]);
      setAccount('');
      setAmount('');
      setCliffBlocks('');
      setVestingBlocks('');
    },
    [entityId, account, amount, cliffBlocks, vestingBlocks, lockTokens],
  );

  if (isReadOnly || isSuspended) return null;

  return (
    <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">锁定代币</CardTitle>
          <CardDescription>每个账户最多 10 条锁仓记录</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vesting-account">目标账户地址</Label>
              <Input
                id="vesting-account"
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="目标账户地址"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vesting-amount">锁定数量</Label>
              <Input
                id="vesting-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="锁定数量"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cliff-blocks">悬崖期 (区块数)</Label>
                <Input
                  id="cliff-blocks"
                  type="text"
                  inputMode="numeric"
                  value={cliffBlocks}
                  onChange={(e) => setCliffBlocks(e.target.value)}
                  placeholder="悬崖期 (区块数)"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vesting-blocks">释放期 (区块数)</Label>
                <Input
                  id="vesting-blocks"
                  type="text"
                  inputMode="numeric"
                  value={vestingBlocks}
                  onChange={(e) => setVestingBlocks(e.target.value)}
                  placeholder="释放期 (区块数)"
                  required
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={isTxBusy(lockTokens)}
              >
                锁定
              </Button>
              <TxStatusIndicator txState={lockTokens.txState} />
            </div>
          </form>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}

// ─── Vesting Entries Table ──────────────────────────────────

function VestingEntriesTable({ entries }: { entries: VestingEntry[] }) {
  const { entityId, isReadOnly, isSuspended } = useEntityContext();

  const releaseVestedTokens = useEntityMutation('entityToken', 'releaseVestedTokens', {
    invalidateKeys: [['entity', entityId, 'token', 'vesting']],
  });

  const handleRelease = useCallback(
    (account: string) => {
      releaseVestedTokens.mutate([entityId, account]);
    },
    [entityId, releaseVestedTokens],
  );

  // Group entries by account
  const grouped = entries.reduce<Record<string, VestingEntry[]>>((acc, entry) => {
    (acc[entry.account] ??= []).push(entry);
    return acc;
  }, {});

  if (entries.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">暂无锁仓记录</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          锁仓记录
          <Badge variant="secondary" className="ml-2">{entries.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Object.entries(grouped).map(([account, accountEntries]) => (
            <Card key={account} className="shadow-none">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">
                    {shortenAddress(account)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{accountEntries.length}/10 条</Badge>
                    {!isReadOnly && !isSuspended && (
                      <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
                        <Button
                          size="sm"
                          onClick={() => handleRelease(account)}
                          disabled={isTxBusy(releaseVestedTokens)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          释放
                        </Button>
                      </PermissionGuard>
                    )}
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>数量</TableHead>
                      <TableHead>悬崖期</TableHead>
                      <TableHead>释放期</TableHead>
                      <TableHead>起始区块</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountEntries.map((entry, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{formatAmount(entry.amount)}</TableCell>
                        <TableCell className="text-muted-foreground">{entry.cliffBlocks} 块</TableCell>
                        <TableCell className="text-muted-foreground">{entry.vestingBlocks} 块</TableCell>
                        <TableCell className="text-muted-foreground">{entry.startBlock}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <TxStatusIndicator txState={releaseVestedTokens.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function VestingPage() {
  const t = useTranslations('token');
  const { entityId } = useEntityContext();

  const vestingQuery = useEntityQuery<VestingEntry[]>(
    ['entity', entityId, 'token', 'vesting'],
    async (api) => {
      const rawEntries = await (api.query as any).entityToken.vestingSchedules.entries(entityId);
      return parseVestingEntries(rawEntries);
    },
    { staleTime: STALE_TIMES.token },
  );

  if (vestingQuery.isLoading) {
    return <VestingPageSkeleton />;
  }

  if (vestingQuery.error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="border-destructive/50">
          <CardContent className="p-6 text-sm text-destructive">
            加载失败: {String(vestingQuery.error)}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('vesting.title')}</h1>
      <LockTokensSection />
      <VestingEntriesTable entries={vestingQuery.data ?? []} />
    </div>
  );
}
