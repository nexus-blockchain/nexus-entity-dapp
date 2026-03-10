'use client';

import React, { useState, useCallback } from 'react';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useEntityQuery } from '@/hooks/use-entity-query';
import { useEntityMutation } from '@/hooks/use-entity-mutation';
import { PermissionGuard } from '@/components/permission-guard';
import { TxConfirmDialog } from '@/components/tx-confirm-dialog';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { useWalletStore } from '@/stores/wallet-store';
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

interface DividendConfig {
  dividendId: number;
  totalAmount: bigint;
  snapshotBlock: number;
  distributed: boolean;
}

interface ClaimStatus {
  claimed: boolean;
  amount: bigint;
}

// ─── Helpers ────────────────────────────────────────────────

function formatAmount(amount: bigint): string {
  return amount.toLocaleString();
}

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

function parseDividendConfigs(raw: unknown): DividendConfig[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw as any).toArray?.() ?? [];
  return arr.map((item: any, idx: number) => {
    const obj = item.toJSON?.() ?? item;
    return {
      dividendId: Number(obj.dividendId ?? obj.dividend_id ?? idx),
      totalAmount: BigInt(String(obj.totalAmount ?? obj.total_amount ?? 0)),
      snapshotBlock: Number(obj.snapshotBlock ?? obj.snapshot_block ?? 0),
      distributed: Boolean(obj.distributed),
    };
  });
}

function parseClaimStatus(raw: unknown): ClaimStatus | null {
  if (!raw || (raw as any).isNone) return null;
  const unwrapped = (raw as any).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = (unwrapped as any).toJSON?.() ?? unwrapped;
  return {
    claimed: Boolean(obj.claimed),
    amount: BigInt(String(obj.amount ?? 0)),
  };
}

// ─── Skeleton Loading ───────────────────────────────────────

function DividendPageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-9 w-24" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Configure Dividend ─────────────────────────────────────

function ConfigureDividendSection() {
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const [totalAmount, setTotalAmount] = useState('');
  const [snapshotBlock, setSnapshotBlock] = useState('');

  const configureDividend = useEntityMutation('entityToken', 'configureDividend', {
    invalidateKeys: [['entity', entityId, 'token', 'dividend']],
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!totalAmount.trim() || !snapshotBlock.trim()) return;
      configureDividend.mutate([entityId, totalAmount.trim(), snapshotBlock.trim()]);
      setTotalAmount('');
      setSnapshotBlock('');
    },
    [entityId, totalAmount, snapshotBlock, configureDividend],
  );

  if (isReadOnly || isSuspended) return null;

  return (
    <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">配置分红</CardTitle>
          <CardDescription>创建新的分红配置，指定总额和快照区块</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dividend-amount">分红总额</Label>
              <Input
                id="dividend-amount"
                type="text"
                inputMode="decimal"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="分红总额"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="snapshot-block">快照区块高度</Label>
              <Input
                id="snapshot-block"
                type="text"
                inputMode="numeric"
                value={snapshotBlock}
                onChange={(e) => setSnapshotBlock(e.target.value)}
                placeholder="快照区块高度"
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={isTxBusy(configureDividend)}
              >
                创建分红
              </Button>
              <TxStatusIndicator txState={configureDividend.txState} />
            </div>
          </form>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}

// ─── Dividend List with Distribute & Claim ──────────────────

function DividendList({ dividends }: { dividends: DividendConfig[] }) {
  const { entityId, isReadOnly, isSuspended } = useEntityContext();
  const address = useWalletStore((s) => s.address);

  const distributeDividend = useEntityMutation('entityToken', 'distributeDividend', {
    invalidateKeys: [['entity', entityId, 'token', 'dividend']],
  });

  const claimDividend = useEntityMutation('entityToken', 'claimDividend', {
    invalidateKeys: [['entity', entityId, 'token', 'dividend']],
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showDistributeConfirm, setShowDistributeConfirm] = useState(false);

  // Query claim status for selected dividend
  const claimStatusQuery = useEntityQuery<ClaimStatus | null>(
    ['entity', entityId, 'token', 'dividend', 'claim', selectedId, address],
    async (api) => {
      if (selectedId === null || !address) return null;
      const raw = await (api.query as any).entityToken.dividendClaims(entityId, selectedId, address);
      return parseClaimStatus(raw);
    },
    {
      staleTime: STALE_TIMES.token,
      enabled: selectedId !== null && !!address,
    },
  );

  const handleDistribute = useCallback(
    (dividendId: number) => {
      setSelectedId(dividendId);
      setShowDistributeConfirm(true);
    },
    [],
  );

  const handleDistributeConfirm = useCallback(() => {
    if (selectedId === null) return;
    distributeDividend.mutate([entityId, selectedId]);
    setShowDistributeConfirm(false);
  }, [entityId, selectedId, distributeDividend]);

  const handleClaim = useCallback(
    (dividendId: number) => {
      claimDividend.mutate([entityId, dividendId]);
    },
    [entityId, claimDividend],
  );

  if (dividends.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">暂无分红记录</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            分红列表
            <Badge variant="secondary" className="ml-2">{dividends.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>总额</TableHead>
                <TableHead>快照区块</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dividends.map((d) => (
                <TableRow key={d.dividendId}>
                  <TableCell>{d.dividendId}</TableCell>
                  <TableCell>{formatAmount(d.totalAmount)}</TableCell>
                  <TableCell className="text-muted-foreground">{d.snapshotBlock}</TableCell>
                  <TableCell>
                    <Badge variant={d.distributed ? 'success' : 'warning'}>
                      {d.distributed ? '已分发' : '待分发'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!d.distributed && !isReadOnly && !isSuspended && (
                        <PermissionGuard required={AdminPermission.TOKEN_MANAGE} fallback={null}>
                          <Button
                            size="sm"
                            onClick={() => handleDistribute(d.dividendId)}
                            disabled={isTxBusy(distributeDividend)}
                          >
                            分发
                          </Button>
                        </PermissionGuard>
                      )}
                      {d.distributed && address && (
                        <Button
                          size="sm"
                          variant={claimStatusQuery.data?.claimed ? 'secondary' : 'default'}
                          className={cn(!claimStatusQuery.data?.claimed && 'bg-green-600 hover:bg-green-700')}
                          onClick={() => {
                            setSelectedId(d.dividendId);
                            handleClaim(d.dividendId);
                          }}
                          disabled={isTxBusy(claimDividend) || claimStatusQuery.data?.claimed === true}
                        >
                          {claimStatusQuery.data?.claimed ? '已领取' : '领取'}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="gap-3">
          <TxStatusIndicator txState={distributeDividend.txState} />
          <TxStatusIndicator txState={claimDividend.txState} />
        </CardFooter>
      </Card>

      <TxConfirmDialog
        open={showDistributeConfirm}
        onClose={() => setShowDistributeConfirm(false)}
        onConfirm={handleDistributeConfirm}
        config={{
          title: '确认分发分红',
          description: '分发后将按快照区块的持仓比例向所有持有人分配分红，此操作不可撤销。',
          severity: 'warning',
        }}
      />
    </>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function DividendPage() {
  const t = useTranslations('token');
  const { entityId } = useEntityContext();

  const dividendsQuery = useEntityQuery<DividendConfig[]>(
    ['entity', entityId, 'token', 'dividend'],
    async (api) => {
      const raw = await (api.query as any).entityToken.dividendConfigs(entityId);
      return parseDividendConfigs(raw);
    },
    { staleTime: STALE_TIMES.token },
  );

  if (dividendsQuery.isLoading) {
    return <DividendPageSkeleton />;
  }

  if (dividendsQuery.error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="border-destructive/50">
          <CardContent className="p-6 text-sm text-destructive">
            加载失败: {String(dividendsQuery.error)}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('dividend.title')}</h1>
      <ConfigureDividendSection />
      <DividendList dividends={dividendsQuery.data ?? []} />
    </div>
  );
}
