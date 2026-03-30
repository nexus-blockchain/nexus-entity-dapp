'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useEntityFunds } from '@/hooks/use-entity-funds';
import { formatNex } from '@/lib/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ShieldCheck, ShieldAlert, ShieldX, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';

// ─── Colors ──────────────────────────────────────────────

const COLORS = {
  available:        '#22c55e', // green-500
  pendingCommission:'#3b82f6', // blue-500
  shoppingBalance:  '#a855f7', // purple-500
  unallocatedPool:  '#f59e0b', // amber-500
  pendingRefund:    '#ef4444', // red-500
};

const HEALTH_CONFIG: Record<number, {
  icon: typeof ShieldCheck;
  labelKey: string;
  color: string;
  badge: 'success' | 'warning' | 'destructive';
}> = {
  2: { icon: ShieldCheck, labelKey: 'healthy',  color: 'text-green-600',  badge: 'success' },
  1: { icon: ShieldAlert, labelKey: 'warning',  color: 'text-yellow-600', badge: 'warning' },
  0: { icon: ShieldX,     labelKey: 'critical', color: 'text-red-600',    badge: 'destructive' },
};

// ─── Custom Tooltip ──────────────────────────────────────

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const { name, value, payload: item } = payload[0];
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-md">
      <p className="text-sm font-medium">{name}</p>
      <p className="text-sm text-muted-foreground">{formatNex(BigInt(value))} NEX</p>
      {item.percent != null && (
        <p className="text-xs text-muted-foreground">{item.percent.toFixed(1)}%</p>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────

export function EntityFundsChart() {
  const { funds, isLoading } = useEntityFunds();
  const t = useTranslations('funds');

  const chartData = useMemo(() => {
    if (!funds) return [];

    const items = [
      { name: t('available'),          value: funds.available,                      color: COLORS.available },
      { name: t('pendingCommission'),   value: funds.protected.pendingCommission,    color: COLORS.pendingCommission },
      { name: t('shoppingBalance'),     value: funds.protected.shoppingBalance,      color: COLORS.shoppingBalance },
      { name: t('unallocatedPool'),     value: funds.protected.unallocatedPool,      color: COLORS.unallocatedPool },
      { name: t('pendingRefund'),       value: funds.protected.pendingRefund,        color: COLORS.pendingRefund },
    ];

    // Filter out zero-value slices, convert bigint to number for recharts
    const total = items.reduce((s, i) => s + i.value, BigInt(0));
    return items
      .filter((i) => i.value > BigInt(0))
      .map((i) => ({
        name: i.name,
        // recharts needs number; divide by 10^6 to keep precision in reasonable range
        value: Number(i.value / BigInt(1_000_000)),
        rawValue: i.value,
        color: i.color,
        percent: total > BigInt(0) ? Number((i.value * BigInt(1000)) / total) / 10 : 0,
      }));
  }, [funds, t]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="mx-auto h-48 w-48 rounded-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!funds) return null;

  const healthCfg = HEALTH_CONFIG[funds.health.level] ?? HEALTH_CONFIG[2];
  const HealthIcon = healthCfg.icon;
  const pc = funds.protectionConfig;

  // Daily spend progress
  const dailyPercent = pc && pc.maxDailySpend > BigInt(0)
    ? Number((pc.dailySpent * BigInt(100)) / pc.maxDailySpend)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t('title')}</CardTitle>
          </div>
          <Badge variant={healthCfg.badge} className="gap-1">
            <HealthIcon className="h-3 w-3" />
            {t(healthCfg.labelKey as any)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pie Chart */}
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground">{value}</span>
                )}
                iconSize={8}
                wrapperStyle={{ fontSize: '12px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            {t('noFundData')}
          </div>
        )}

        {/* Balance summary */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t('treasuryBalance')}</p>
            <p className="font-semibold">{formatNex(funds.treasuryBalance)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('available')}</p>
            <p className="font-semibold text-green-600">{formatNex(funds.available)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('protectedTotal')}</p>
            <p className="font-semibold text-blue-600">{formatNex(funds.protectedTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {t('percentLocked', {
                pct: funds.protectedTotal > BigInt(0)
                  ? Number((funds.protectedTotal * BigInt(100)) / funds.treasuryBalance)
                  : 0,
              })}
            </p>
          </div>
        </div>

        {/* Protected breakdown detail */}
        {funds.protectedTotal > BigInt(0) && (
          <div className="space-y-1.5 rounded-md bg-secondary/30 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">{t('protectedBreakdown')}</p>
            {[
              { label: t('pendingCommission'), value: funds.protected.pendingCommission, color: COLORS.pendingCommission },
              { label: t('shoppingBalance'),   value: funds.protected.shoppingBalance,   color: COLORS.shoppingBalance },
              { label: t('unallocatedPool'),    value: funds.protected.unallocatedPool,   color: COLORS.unallocatedPool },
              { label: t('pendingRefund'),      value: funds.protected.pendingRefund,     color: COLORS.pendingRefund },
            ]
              .filter((r) => r.value > BigInt(0))
              .map((r) => (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                    <span>{r.label}</span>
                  </div>
                  <span className="font-medium">{formatNex(r.value)}</span>
                </div>
              ))}
          </div>
        )}

        {/* Fund Protection Rules */}
        {pc && (pc.minTreasuryThreshold > BigInt(0) || pc.maxSingleSpend > BigInt(0) || pc.maxDailySpend > BigInt(0)) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t('protectionRules')}</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {pc.minTreasuryThreshold > BigInt(0) && (
                <div className="rounded bg-secondary/50 px-2 py-1.5 text-center">
                  <p className="text-muted-foreground">{t('minThreshold')}</p>
                  <p className="font-medium mt-0.5">{formatNex(pc.minTreasuryThreshold)}</p>
                </div>
              )}
              {pc.maxSingleSpend > BigInt(0) && (
                <div className="rounded bg-secondary/50 px-2 py-1.5 text-center">
                  <p className="text-muted-foreground">{t('maxSingle')}</p>
                  <p className="font-medium mt-0.5">{formatNex(pc.maxSingleSpend)}</p>
                </div>
              )}
              {pc.maxDailySpend > BigInt(0) && (
                <div className="rounded bg-secondary/50 px-2 py-1.5 text-center">
                  <p className="text-muted-foreground">{t('maxDaily')}</p>
                  <p className="font-medium mt-0.5">{formatNex(pc.maxDailySpend)}</p>
                </div>
              )}
            </div>

            {/* Daily spend progress */}
            {pc.maxDailySpend > BigInt(0) && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t('dailySpent')}</span>
                  <span className="font-medium">
                    {formatNex(pc.dailySpent)} / {formatNex(pc.maxDailySpend)}
                  </span>
                </div>
                <Progress
                  value={Math.min(dailyPercent, 100)}
                  className="h-1.5"
                />
              </div>
            )}
          </div>
        )}

        {/* Alerts */}
        {(funds.health.belowThreshold || funds.health.belowMinOperating) && (
          <div className="space-y-1">
            {funds.health.belowMinOperating && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <ShieldX className="h-3 w-3" />
                <span>{t('alertBelowMinOperating')}</span>
              </div>
            )}
            {funds.health.belowThreshold && (
              <div className="flex items-center gap-1.5 text-xs text-yellow-600">
                <ShieldAlert className="h-3 w-3" />
                <span>{t('alertBelowThreshold')}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
