'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useEntityContext } from './entity-provider';
import { useMembers } from '@/hooks/use-members';
import { useEntityToken } from '@/hooks/use-entity-token';
import { useShops } from '@/hooks/use-shops';
import { useEntityMarket } from '@/hooks/use-entity-market';
import { useGovernance } from '@/hooks/use-governance';
import { useCommission } from '@/hooks/use-commission';
import { useEntityDAppStore } from '@/stores/entity-dapp-store';
import { isFundWarning, FUND_WARNING_THRESHOLD } from '@/lib/utils/fund-warning';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle, Wallet, Users, Coins, BarChart3,
  Store, Settings, CheckCircle, Shield,
  ArrowRight, Package, Activity, Scale, FileText, Star,
  Zap, Eye, CircleDollarSign, Gavel,
} from 'lucide-react';
import { CopyableAddress } from '@/components/copyable-address';
import { formatNex } from '@/lib/utils/format';

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  Active: 'success',
  Suspended: 'warning',
  Banned: 'destructive',
  PendingClose: 'warning',
  Closed: 'secondary',
  PendingApproval: 'outline',
};

// ─── Stat Card ───────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  subtext?: string;
  warning?: boolean;
  href?: string;
  loading?: boolean;
  warningText?: string;
}

function StatCard({ label, value, icon, subtext, warning, href, loading, warningText }: StatCardProps) {
  const content = (
    <Card className={cn(
      'transition-shadow hover:shadow-md',
      warning && 'border-warning/50 bg-warning/5',
    )}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <div className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md',
            warning ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary',
          )}>
            {icon}
          </div>
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-24" />
        ) : (
          <p className={cn(
            'mt-2 text-2xl font-bold',
            warning && 'text-warning',
          )}>
            {value}
          </p>
        )}
        {subtext && !loading && (
          <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
        )}
        {warning && !loading && warningText && (
          <div className="mt-2 flex items-center gap-1 text-xs text-warning">
            <AlertTriangle className="h-3 w-3" />
            <span>{warningText}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

// ─── Market Summary Card ─────────────────────────────────────

function MarketSummaryCard({ entityId }: { entityId: number }) {
  const { stats, orders, isLoading } = useEntityMarket();
  const t = useTranslations('dashboard');

  const buyOrders = useMemo(() => orders.filter((o) => o.side === 'Buy'), [orders]);
  const sellOrders = useMemo(() => orders.filter((o) => o.side === 'Sell'), [orders]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{t('marketOverview')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">{t('twapPrice')}</p>
                <p className="text-sm font-semibold">{formatNex(stats.twapPrice)}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">{t('lastPrice')}</p>
                <p className="text-sm font-semibold">{formatNex(stats.lastPrice)}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">{t('volume24h')}</p>
                <p className="text-sm font-semibold">{formatNex(stats.volume24h)}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">{t('circuitBreakerStatus')}</p>
                <Badge variant={stats.circuitBreakerActive ? 'destructive' : 'success'} className="text-xs">
                  {stats.circuitBreakerActive ? t('triggered') : t('normal')}
                </Badge>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('buyOrdersSellOrders', { buyCount: buyOrders.length, sellCount: sellOrders.length })}</span>
              <Link href={`/${entityId}/market`} className="text-primary hover:underline">
                {t('viewOrderBook')}
              </Link>
            </div>
          </>
        ) : (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {t('noMarketData')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Governance Summary Card ─────────────────────────────────

function GovernanceSummaryCard({ entityId }: { entityId: number }) {
  const { proposals, proposalCount, isLoading } = useGovernance();
  const t = useTranslations('dashboard');

  const activeProposals = useMemo(
    () => proposals.filter((p) => p.status === 'Voting' || p.status === 'Pending'),
    [proposals],
  );

  const passedProposals = useMemo(
    () => proposals.filter((p) => p.status === 'Passed' || p.executed),
    [proposals],
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{t('governanceOverview')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{t('totalProposals')}</p>
            <p className="text-lg font-semibold">{proposalCount}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{t('ongoing')}</p>
            <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{activeProposals.length}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{t('passed')}</p>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">{passedProposals.length}</p>
          </div>
        </div>

        {activeProposals.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t('activeProposals')}</p>
              {activeProposals.slice(0, 3).map((p) => {
                const total = p.votesApprove + p.votesReject + p.votesAbstain;
                const approvalPct = total > BigInt(0) ? Number((p.votesApprove * BigInt(100)) / total) : 0;
                return (
                  <Link key={p.id} href={`/${entityId}/governance/${p.id}`}>
                    <div className="rounded-md border p-2 transition-colors hover:bg-muted/50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate max-w-[180px]">#{p.id} {p.title}</span>
                        <Badge variant="outline" className="text-[10px]">{t('approvalPct', { pct: approvalPct })}</Badge>
                      </div>
                      <Progress value={approvalPct} className="mt-1.5 h-1" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        <div className="flex justify-end">
          <Link href={`/${entityId}/governance`} className="text-xs text-primary hover:underline">
            {t('viewAllProposals')}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Commission Summary Card ─────────────────────────────────

function CommissionSummaryCard({ entityId }: { entityId: number }) {
  const { config, isLoading } = useCommission();
  const t = useTranslations('dashboard');

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t('commissionSystem')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('commissionNotConfigured')}</p>
        </CardContent>
      </Card>
    );
  }

  const enabledPluginCount = [0x001, 0x002, 0x008, 0x080, 0x004, 0x200].filter(
    (bit) => (config.enabledModes & bit) !== 0,
  ).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{t('commissionSystem')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{t('withdrawalStatus')}</p>
            <Badge variant={config.enabled ? 'success' : 'secondary'} className="text-xs">
              {config.enabled ? t('enabled') : t('disabled')}
            </Badge>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{t('baseRate')}</p>
            <p className="text-sm font-semibold">{config.baseRate} bps</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{t('enabledPlugins')}</p>
            <p className="text-sm font-semibold">{enabledPluginCount}/6</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{t('withdrawalStatus')}</p>
            <Badge variant={config.withdrawalPaused ? 'destructive' : 'success'} className="text-xs">
              {config.withdrawalPaused ? t('paused') : t('normal')}
            </Badge>
          </div>
        </div>
        <div className="flex justify-end">
          <Link href={`/${entityId}/commission`} className="text-xs text-primary hover:underline">
            {t('manageCommission')}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Shop Overview Card ──────────────────────────────────────

function ShopOverviewCard({ entityId }: { entityId: number }) {
  const { shops, isLoading } = useShops();
  const t = useTranslations('dashboard');

  const stats = useMemo(() => {
    if (!shops || shops.length === 0) return null;
    const active = shops.filter((s) => s.effectiveStatus === 'Active').length;
    const lowFund = shops.filter((s) => s.effectiveStatus === 'FundDepleted').length;
    const totalFund = shops.reduce((sum, s) => sum + s.fundBalance, BigInt(0));
    return { total: shops.length, active, lowFund, totalFund };
  }, [shops]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{t('shopOverview')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">{t('totalShops')}</p>
                <p className="text-lg font-semibold">{stats.total}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">{t('operating')}</p>
                <p className="text-lg font-semibold text-green-600 dark:text-green-400">{stats.active}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">{t('totalOperatingFund')}</p>
                <p className="text-sm font-semibold">{formatNex(stats.totalFund)} NEX</p>
              </div>
              {stats.lowFund > 0 && (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">{t('fundDepleted')}</p>
                  <p className="text-lg font-semibold text-destructive">{stats.lowFund}</p>
                </div>
              )}
            </div>
            {stats.lowFund > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-warning/50 bg-warning/5 px-3 py-2 text-xs text-warning">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>{t('shopsOutOfFund', { count: stats.lowFund })}</span>
              </div>
            )}
          </>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('noShops')}</p>
        )}
        <div className="flex justify-end">
          <Link href={`/${entityId}/shops`} className="text-xs text-primary hover:underline">
            {t('manageShops')}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Token Summary Card ──────────────────────────────────────

function TokenSummaryCard({ entityId }: { entityId: number }) {
  const { tokenConfig, holderCount, isLoading } = useEntityToken();
  const t = useTranslations('dashboard');

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!tokenConfig) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t('tokenInfo')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('noToken')}</p>
        </CardContent>
      </Card>
    );
  }

  const supplyPct = tokenConfig.maxSupply > BigInt(0)
    ? Number((tokenConfig.totalSupply * BigInt(100)) / tokenConfig.maxSupply)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{t('tokenLabel', { symbol: tokenConfig.symbol })}</CardTitle>
          <Badge variant="outline" className="text-xs">{tokenConfig.tokenType}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{t('totalSupply')}</p>
            <p className="text-sm font-semibold">{formatNex(tokenConfig.totalSupply)}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{t('holderCount')}</p>
            <p className="text-sm font-semibold">{holderCount}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{t('transferRestriction')}</p>
            <Badge variant="secondary" className="text-xs">{tokenConfig.transferRestriction}</Badge>
          </div>
          {tokenConfig.maxSupply > BigInt(0) && (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">{t('supplyProgress')}</p>
              <div className="flex items-center gap-2">
                <Progress value={supplyPct} className="h-1.5 flex-1" />
                <span className="text-xs text-muted-foreground">{supplyPct}%</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Link href={`/${entityId}/token`} className="text-xs text-primary hover:underline">
            {t('manageToken')}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Module Status Overview ──────────────────────────────────

function ModuleStatusGrid({ entityId }: { entityId: number }) {
  const visibleModules = useEntityDAppStore((s) => s.visibleModules);
  const t = useTranslations('dashboard');
  const tn = useTranslations('nav');

  const MODULE_ICONS: Record<string, { icon: React.ReactNode; navKey: string; href: string }> = {
    shops: { icon: <Store className="h-4 w-4" />, navKey: 'shops', href: `/${entityId}/shops` },
    orders: { icon: <Package className="h-4 w-4" />, navKey: 'orders', href: `/${entityId}/orders` },
    token: { icon: <Coins className="h-4 w-4" />, navKey: 'token', href: `/${entityId}/token` },
    market: { icon: <Activity className="h-4 w-4" />, navKey: 'market', href: `/${entityId}/market` },
    members: { icon: <Users className="h-4 w-4" />, navKey: 'members', href: `/${entityId}/members` },
    commission: { icon: <CircleDollarSign className="h-4 w-4" />, navKey: 'commission', href: `/${entityId}/commission` },
    governance: { icon: <Scale className="h-4 w-4" />, navKey: 'governance', href: `/${entityId}/governance` },
    disclosure: { icon: <FileText className="h-4 w-4" />, navKey: 'disclosure', href: `/${entityId}/disclosure` },
    kyc: { icon: <Eye className="h-4 w-4" />, navKey: 'kyc', href: `/${entityId}/kyc` },
    tokensale: { icon: <Zap className="h-4 w-4" />, navKey: 'tokensale', href: `/${entityId}/tokensale` },
    reviews: { icon: <Star className="h-4 w-4" />, navKey: 'reviews', href: `/${entityId}/reviews` },
  };

  const activeModules = visibleModules.filter(
    (m) => m !== 'dashboard' && m !== 'settings' && MODULE_ICONS[m],
  );

  if (activeModules.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">{t('availableModules')}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {activeModules.map((m) => {
          const mod = MODULE_ICONS[m];
          if (!mod) return null;
          return (
            <Link key={m} href={mod.href}>
              <Card className="transition-all hover:shadow-md hover:border-primary/30 cursor-pointer">
                <CardContent className="flex items-center gap-2.5 p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {mod.icon}
                  </div>
                  <span className="text-sm font-medium">{tn(mod.navKey as any)}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Quick Actions ───────────────────────────────────────────

interface QuickActionProps {
  label: string;
  icon: React.ReactNode;
  href: string;
  description: string;
}

function QuickAction({ label, icon, href, description }: QuickActionProps) {
  return (
    <Link href={href}>
      <Card className="transition-all hover:shadow-md hover:border-primary/30 cursor-pointer">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground truncate">{description}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Recent Notifications ────────────────────────────────────

function RecentNotifications() {
  const notifications = useEntityDAppStore((s) => s.notifications);
  const t = useTranslations('dashboard');
  const recent = notifications.slice(0, 5);

  if (recent.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('recentActivity')}</CardTitle>
        <CardDescription>{t('recentActivityDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {recent.map((n) => (
            <div
              key={n.id}
              className={cn(
                'flex items-center gap-3 rounded-md border px-3 py-2',
                !n.read && 'bg-primary/5 border-primary/20',
              )}
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                <Activity className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs">{n.summary}</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">{n.pallet}</Badge>
                  <span className="text-[10px] text-muted-foreground">{formatTimeAgo(n.timestamp, t)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function formatTimeAgo(timestamp: number, t: (key: string, params?: Record<string, string | number | Date>) => string): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return t('timeJustNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('timeMinutesAgo', { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('timeHoursAgo', { hours });
  const days = Math.floor(hours / 24);
  return t('timeDaysAgo', { days });
}

// ─── Dashboard Page ──────────────────────────────────────────

export function DashboardPage() {
  const { entity, entityId, isLoading, governanceMode } = useEntityContext();
  const t = useTranslations('dashboard');
  const te = useTranslations('enums');
  const visibleModules = useEntityDAppStore((s) => s.visibleModules);

  const { memberCount, isLoading: membersLoading } = useMembers();
  const { tokenConfig, isLoading: tokenLoading } = useEntityToken();
  const { shops, isLoading: shopsLoading } = useShops();

  const hasGovernance = governanceMode === 'FullDAO';
  const hasMarket = visibleModules.includes('market');
  const hasCommission = visibleModules.includes('commission');

  if (isLoading || !entity) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-52 w-full" />)}
        </div>
      </div>
    );
  }

  const fundWarning = isFundWarning(entity.fundBalance, FUND_WARNING_THRESHOLD);
  const statusVariant = STATUS_VARIANTS[entity.status] ?? 'secondary';

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* Fund warning banner */}
      {fundWarning && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/50 bg-warning/5 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <p className="text-sm text-warning flex-1">{t('fundWarning')}</p>
          <Link href={`/${entityId}/settings`}>
            <Button variant="outline" size="sm">
              <Wallet className="mr-1 h-3 w-3" />
              {t('topUp')}
            </Button>
          </Link>
        </div>
      )}

      {/* Entity info header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
                  {entity.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-xl font-bold">{entity.name}</h1>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-xs">
                      {te(`entityType.${entity.entityType}` as any)}
                    </Badge>
                    <Badge variant={statusVariant} className="text-xs">
                      {te(`entityStatus.${entity.status}` as any)}
                    </Badge>
                    {entity.governanceMode === 'FullDAO' && (
                      <Badge variant="secondary" className="text-xs">
                        <Shield className="mr-1 h-3 w-3" />
                        DAO
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {entity.verified && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {t('verified')}
                </Badge>
              )}
              <Link href={`/${entityId}/settings`}>
                <Button variant="outline" size="sm">
                  <Settings className="mr-1 h-3 w-3" />
                  {t('settings')}
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('fundBalance')}
          value={`${formatNex(entity.fundBalance)} NEX`}
          icon={<Wallet className="h-4 w-4" />}
          warning={fundWarning}
          warningText={t('lowBalance')}
          href={`/${entityId}/settings`}
        />
        <StatCard
          label={t('totalMembers')}
          value={memberCount?.toString() ?? '0'}
          icon={<Users className="h-4 w-4" />}
          loading={membersLoading}
          href={`/${entityId}/members`}
        />
        <StatCard
          label={t('shops')}
          value={shopsLoading ? '--' : `${shops?.length ?? 0}`}
          icon={<Store className="h-4 w-4" />}
          loading={shopsLoading}
          subtext={shops && shops.length > 0
            ? t('operatingCount', { count: shops.filter((s) => s.effectiveStatus === 'Active').length })
            : undefined}
          href={`/${entityId}/shops`}
        />
        <StatCard
          label={t('tokenSymbol')}
          value={tokenConfig ? tokenConfig.symbol : t('noToken')}
          icon={<Coins className="h-4 w-4" />}
          loading={tokenLoading}
          subtext={tokenConfig ? t('holdersCount', { type: tokenConfig.tokenType }) : undefined}
          href={`/${entityId}/token`}
        />
      </div>

      {/* Module detail cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ShopOverviewCard entityId={entityId} />
        <TokenSummaryCard entityId={entityId} />
        {hasMarket && <MarketSummaryCard entityId={entityId} />}
        {hasGovernance && <GovernanceSummaryCard entityId={entityId} />}
        {hasCommission && <CommissionSummaryCard entityId={entityId} />}
        <RecentNotifications />
      </div>

      {/* Module status grid */}
      <ModuleStatusGrid entityId={entityId} />

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">{t('quickActions')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickAction
            label={t('actionManageShops')}
            icon={<Store className="h-5 w-5" />}
            href={`/${entityId}/shops`}
            description={t('actionManageShopsDesc')}
          />
          <QuickAction
            label={t('actionViewOrders')}
            icon={<Package className="h-5 w-5" />}
            href={`/${entityId}/orders`}
            description={t('actionViewOrdersDesc')}
          />
          <QuickAction
            label={t('actionManageMembers')}
            icon={<Users className="h-5 w-5" />}
            href={`/${entityId}/members`}
            description={t('actionManageMembersDesc')}
          />
          <QuickAction
            label={t('actionManageToken')}
            icon={<Coins className="h-5 w-5" />}
            href={`/${entityId}/token`}
            description={t('actionManageTokenDesc')}
          />
          {hasMarket && (
            <QuickAction
              label={t('actionMarketTrade')}
              icon={<Activity className="h-5 w-5" />}
              href={`/${entityId}/market`}
              description={t('actionMarketTradeDesc')}
            />
          )}
          {hasGovernance && (
            <QuickAction
              label={t('actionDaoGovernance')}
              icon={<Shield className="h-5 w-5" />}
              href={`/${entityId}/governance`}
              description={t('actionDaoGovernanceDesc')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
