'use client';

import React, { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useEntityDAppStore } from '@/stores/entity-dapp-store';
import { computeVisibleModules, type ModuleKey } from '@/lib/utils/module-visibility';
import { AdminPermission } from '@/lib/types/models';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { NodeHealthIndicator } from '@/components/node-health-indicator';
import { useWallet } from '@/hooks/use-wallet';
import { useNexBalance } from '@/hooks/use-external-queries';
import { useEntityMutation } from '@/hooks/use-entity-mutation';
import { useEntityToken } from '@/hooks/use-entity-token';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { isTauri } from '@/lib/utils/platform';
import { DesktopWalletDialog } from '@/components/wallet/desktop-wallet-dialog';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  LayoutDashboard,
  Settings,
  Store,
  Package,
  Coins,
  TrendingUp,
  Users,
  CircleDollarSign,
  Vote,
  FileText,
  ShieldCheck,
  Rocket,
  Star,
  ChevronLeft,
  ChevronRight,
  Bell,
  Wallet,
  LogOut,
  Copy,
  Check,
  Home,
  Send,
  Loader2,
  Globe,
  type LucideIcon,
} from 'lucide-react';

export interface ModuleConfig {
  key: ModuleKey;
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: number;
}

export const MODULE_CONFIGS: ModuleConfig[] = [
  { key: 'dashboard', label: '', href: '', icon: LayoutDashboard },
  { key: 'settings', label: '', href: '/settings', icon: Settings, permission: AdminPermission.ENTITY_MANAGE },
  { key: 'shop', label: '', href: '/shops', icon: Store },
  { key: 'order', label: '', href: '/orders', icon: Package },
  { key: 'token', label: '', href: '/token', icon: Coins },
  { key: 'market', label: '', href: '/market', icon: TrendingUp },
  { key: 'member', label: '', href: '/members', icon: Users },
  { key: 'commission', label: '', href: '/commission', icon: CircleDollarSign, permission: AdminPermission.COMMISSION_MANAGE },
  { key: 'governance', label: '', href: '/governance', icon: Vote },
  { key: 'disclosure', label: '', href: '/disclosure', icon: FileText },
  { key: 'kyc', label: '', href: '/kyc', icon: ShieldCheck },
  { key: 'tokensale', label: '', href: '/tokensale', icon: Rocket },
  { key: 'review', label: '', href: '/reviews', icon: Star },
];

const MOBILE_TAB_KEYS: ModuleKey[] = ['dashboard', 'shop', 'order', 'member', 'token'];

export function getVisibleMenuItems(visibleModules: ModuleKey[]): ModuleConfig[] {
  const visibleSet = new Set(visibleModules);
  return MODULE_CONFIGS.filter(
    (config) => config.key !== 'product' && visibleSet.has(config.key),
  );
}

const MODULE_NAV_KEY: Record<string, string> = {
  dashboard: 'dashboard', settings: 'settings', shop: 'shops', order: 'orders',
  token: 'token', market: 'market', member: 'members', commission: 'commission',
  governance: 'governance', disclosure: 'disclosure', kyc: 'kyc',
  tokensale: 'tokensale', review: 'reviews',
};

function formatNexBalance(balance: bigint): string {
  const divisor = BigInt('1000000000000');
  const whole = balance / divisor;
  const remainder = balance % divisor;
  const decStr = remainder.toString().padStart(12, '0').slice(0, 2);
  const trimmed = decStr.replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface SidebarItemProps {
  item: ModuleConfig;
  entityId: number;
  isActive: boolean;
  collapsed: boolean;
  label: string;
}

function SidebarItem({ item, entityId, isActive, collapsed, label }: SidebarItemProps) {
  const basePath = `/${entityId}`;
  const fullHref = item.href ? `${basePath}${item.href}` : basePath;
  const Icon = item.icon;

  const linkContent = (
    <Link
      href={fullHref}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        isActive
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        collapsed && 'justify-center px-2',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}

interface MobileTabItemProps {
  item: ModuleConfig;
  entityId: number;
  isActive: boolean;
  label: string;
}

function MobileTabItem({ item, entityId, isActive, label }: MobileTabItemProps) {
  const basePath = `/${entityId}`;
  const fullHref = item.href ? `${basePath}${item.href}` : basePath;
  const Icon = item.icon;

  return (
    <Link
      href={fullHref}
      className={cn(
        'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors',
        isActive ? 'text-primary font-medium' : 'text-muted-foreground',
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="truncate max-w-[60px]">{label}</span>
    </Link>
  );
}

// ─── Sidebar Wallet Panel ────────────────────────────────────

function SidebarWalletPanel({ collapsed }: { collapsed: boolean }) {
  const tw = useTranslations('home');
  const tc = useTranslations('common');
  const tn = useTranslations('nav');

  const {
    address,
    name: walletName,
    isConnected,
    getAccounts,
    connect,
    disconnect,
  } = useWallet();

  const { data: nexBalance } = useNexBalance(address);
  const balance = nexBalance?.free ?? BigInt(0);

  // Wallet connect state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<{ address: string; meta: { name?: string; source: string } }[]>([]);
  const [showSelector, setShowSelector] = useState(false);

  // Transfer state
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTab, setTransferTab] = useState<'nex' | 'token'>('nex');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');

  const nexTransfer = useEntityMutation('balances', 'transferKeepAlive', {
    invalidateKeys: [['external', 'balances', address]],
  });
  const { tokenConfig, myTokenBalance, transferTokens } = useEntityToken();
  const { entityId } = useEntityContext();

  const activeTx = transferTab === 'nex' ? nexTransfer : transferTokens;
  const isTxBusy =
    activeTx.txState.status === 'signing' ||
    activeTx.txState.status === 'broadcasting' ||
    activeTx.txState.status === 'inBlock';

  // Copy address
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }, [address]);

  // Connect wallet (browser extension)
  const handleConnect = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const accs = await getAccounts();
      if (accs.length === 0) {
        setError(tw('noAccountsFound'));
        return;
      }
      if (accs.length === 1) {
        await connect(accs[0]);
      } else {
        setAccounts(accs);
        setShowSelector(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tw('connectFailed'));
    } finally {
      setLoading(false);
    }
  }, [getAccounts, connect, tw]);

  const handleSelectAccount = useCallback(async (acc: { address: string; meta: { name?: string; source: string } }) => {
    setLoading(true);
    try {
      await connect(acc as any);
      setShowSelector(false);
      setAccounts([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : tw('connectFailed'));
    } finally {
      setLoading(false);
    }
  }, [connect, tw]);

  // Transfer
  const handleTransfer = useCallback(async () => {
    const to = transferTo.trim();
    const amt = parseFloat(transferAmount);
    if (!to || isNaN(amt) || amt <= 0) return;
    if (transferTab === 'nex') {
      const plancks = BigInt(Math.floor(amt * 1e12));
      await nexTransfer.mutate([to, plancks]);
    } else {
      const decimals = tokenConfig?.decimals ?? 0;
      const units = BigInt(Math.floor(amt * 10 ** decimals));
      await transferTokens.mutate([entityId, to, units]);
    }
    setTransferTo('');
    setTransferAmount('');
  }, [transferTo, transferAmount, transferTab, nexTransfer, transferTokens, entityId, tokenConfig]);

  // ─── Collapsed mode ───────────────────────────────────
  if (collapsed) {
    if (!isConnected) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex justify-center"><DesktopWalletDialog /></div>
          </TooltipTrigger>
          <TooltipContent side="right">{tc('connectWallet')}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <div className="space-y-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCopy}
              className="flex w-full justify-center rounded-md py-1.5 relative text-primary hover:bg-accent transition-colors"
            >
              <Wallet className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[220px]">
            <p className="text-xs font-medium">{walletName ?? shortenAddress(address!)}</p>
            <p className="text-[10px] text-muted-foreground font-mono break-all">{address}</p>
            <p className="text-[10px] mt-0.5">{formatNexBalance(balance)} NEX</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{copied ? tc('copied') : tc('clickToCopy')}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowTransfer(!showTransfer)}
              className="flex w-full justify-center rounded-md py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{tn('transfer')}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  // ─── Expanded mode: not connected ─────────────────────
  if (!isConnected) {
    return (
      <div className="space-y-2 px-1">
        <DesktopWalletDialog />
        {!isTauri() && (
          <>
            <Button variant="outline" onClick={handleConnect} disabled={loading} size="sm" className="w-full">
              {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wallet className="mr-1.5 h-3.5 w-3.5" />}
              {tc('connectWallet')}
            </Button>
            {showSelector && accounts.length > 0 && (
              <div className="space-y-1 rounded-md border p-2">
                <p className="text-[10px] font-medium text-muted-foreground">{tw('selectAccount')}</p>
                {accounts.map((acc) => (
                  <button
                    key={acc.address}
                    onClick={() => handleSelectAccount(acc)}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-accent transition-colors"
                  >
                    <span className="truncate font-medium">{acc.meta.name || tw('unnamed')}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{shortenAddress(acc.address)}</span>
                  </button>
                ))}
              </div>
            )}
            {error && (
              <p className="text-[10px] text-destructive px-1">{error}</p>
            )}
          </>
        )}
      </div>
    );
  }

  // ─── Expanded mode: connected ─────────────────────────
  return (
    <div className="space-y-1.5 px-1">
      {/* Account info */}
      <div className="rounded-md bg-muted/50 px-2 py-1.5">
        <div className="flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{walletName ?? shortenAddress(address!)}</p>
            <p className="text-[10px] text-muted-foreground">{formatNexBalance(balance)} NEX</p>
          </div>
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={disconnect}>
            <LogOut className="h-3 w-3" />
          </Button>
        </div>
        {/* Copy address row */}
        <button
          onClick={handleCopy}
          className="mt-1 flex w-full items-center gap-1 rounded px-1 py-0.5 hover:bg-muted transition-colors group"
        >
          <span className="font-mono text-[10px] text-muted-foreground truncate flex-1 text-left">
            {address}
          </span>
          {copied ? (
            <Check className="h-2.5 w-2.5 shrink-0 text-green-500" />
          ) : (
            <Copy className="h-2.5 w-2.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
      </div>

      {/* Wallet management */}
      <DesktopWalletDialog />

      {/* Transfer toggle */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-1.5 h-7 text-xs text-muted-foreground"
        onClick={() => setShowTransfer(!showTransfer)}
      >
        <Send className="h-3 w-3" />
        {tn('transfer')}
      </Button>

      {/* Inline transfer form */}
      {showTransfer && (
        <div className="space-y-1.5 rounded-md border p-2">
          {/* NEX / Token tab buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => { setTransferTab('nex'); setTransferAmount(''); }}
              className={cn(
                'flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
                transferTab === 'nex'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              NEX
            </button>
            {tokenConfig && (
              <button
                onClick={() => { setTransferTab('token'); setTransferAmount(''); }}
                className={cn(
                  'flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors truncate',
                  transferTab === 'token'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {tokenConfig.symbol || 'Token'}
              </button>
            )}
          </div>

          <Input
            placeholder={tw('recipientAddress')}
            value={transferTo}
            onChange={(e) => setTransferTo(e.target.value)}
            disabled={isTxBusy}
            className="h-7 text-xs font-mono"
          />
          <Input
            type="number"
            min="0"
            step="0.0001"
            placeholder={transferTab === 'nex' ? '0.00 NEX' : `0.00 ${tokenConfig?.symbol ?? 'Token'}`}
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
            disabled={isTxBusy}
            className="h-7 text-xs"
          />

          {/* Balance hint */}
          <p className="text-[10px] text-muted-foreground px-0.5">
            {transferTab === 'nex'
              ? `${formatNexBalance(balance)} NEX`
              : `${myTokenBalance.toString()} ${tokenConfig?.symbol ?? ''}`}
          </p>

          <Button
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleTransfer}
            disabled={!transferTo.trim() || !transferAmount || isTxBusy}
          >
            {isTxBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
            {tw('sendTransfer')}
          </Button>
          <TxStatusIndicator txState={activeTx.txState} />
        </div>
      )}
    </div>
  );
}

export function EntitySidebar() {
  const { entityId, entityType, governanceMode } = useEntityContext();
  const sidebarCollapsed = useEntityDAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useEntityDAppStore((s) => s.toggleSidebar);
  const unreadCount = useEntityDAppStore((s) => s.unreadCount);
  const pathname = usePathname();
  const t = useTranslations('nav');
  const tn = useTranslations('nav');

  const visibleModules = useMemo(
    () => computeVisibleModules(entityType, governanceMode),
    [entityType, governanceMode],
  );

  const menuItems = useMemo(
    () => getVisibleMenuItems(visibleModules),
    [visibleModules],
  );

  const mobileItems = useMemo(
    () => menuItems.filter((item) => MOBILE_TAB_KEYS.includes(item.key)),
    [menuItems],
  );

  const isActive = (item: ModuleConfig): boolean => {
    const basePath = `/${entityId}`;
    const fullHref = item.href ? `${basePath}${item.href}` : basePath;
    if (item.key === 'dashboard') {
      return pathname === basePath || pathname === `${basePath}/`;
    }
    return pathname.startsWith(fullHref);
  };

  return (
    <TooltipProvider delayDuration={0}>
      {/* Desktop sidebar */}
      <aside
        data-testid="desktop-sidebar"
        className={cn(
          'hidden md:flex flex-col border-r bg-card transition-all duration-200',
          sidebarCollapsed ? 'w-[60px]' : 'w-60',
        )}
      >
        {/* Header */}
        <div className={cn(
          'flex items-center border-b px-3 py-3',
          sidebarCollapsed ? 'justify-center' : 'justify-between',
        )}>
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold hover:opacity-80 transition-opacity"
                  >
                    {entityId}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('allEntities')}</TooltipContent>
              </Tooltip>
              <span className="text-sm font-semibold truncate">Entity #{entityId}</span>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-accent transition-colors"
                >
                  <Home className="h-4 w-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{t('allEntities')}</TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-7 w-7 shrink-0"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <nav className="p-2 space-y-0.5">
            {menuItems.map((item) => (
              <SidebarItem
                key={item.key}
                item={item}
                entityId={entityId}
                isActive={isActive(item)}
                collapsed={sidebarCollapsed}
                label={t(MODULE_NAV_KEY[item.key] ?? item.key)}
              />
            ))}
          </nav>
        </ScrollArea>

        <Separator />

        {/* Notification indicator */}
        {unreadCount > 0 && !sidebarCollapsed && (
          <div className="flex items-center gap-2 px-3 py-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {tn('newNotifications', { count: unreadCount })}
            </span>
            <Badge variant="destructive" className="ml-auto text-[10px] h-5 px-1.5">
              {unreadCount}
            </Badge>
          </div>
        )}
        {unreadCount > 0 && sidebarCollapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex justify-center py-2 relative">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="absolute -top-0.5 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] text-destructive-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">{tn('newNotifications', { count: unreadCount })}</TooltipContent>
          </Tooltip>
        )}

        {/* Wallet & Locale */}
        <div className="border-t p-2 space-y-1">
          {/* Node health indicator */}
          <NodeHealthIndicator collapsed={sidebarCollapsed} />

          {/* Wallet panel: connect / info / transfer */}
          <SidebarWalletPanel collapsed={sidebarCollapsed} />

          {/* All Entities link */}
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/"
                  className="flex w-full justify-center rounded-md py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Globe className="h-4 w-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{t('allEntities')}</TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href="/"
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              {t('allEntities')}
            </Link>
          )}

          {!sidebarCollapsed && (
            <div className="px-2">
              <LocaleSwitcher />
            </div>
          )}
        </div>
      </aside>

      {/* Mobile bottom tab */}
      <nav
        data-testid="mobile-bottom-tab"
        className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-card md:hidden"
      >
        {mobileItems.map((item) => (
          <MobileTabItem
            key={item.key}
            item={item}
            entityId={entityId}
            isActive={isActive(item)}
            label={t(MODULE_NAV_KEY[item.key] ?? item.key)}
          />
        ))}
      </nav>
    </TooltipProvider>
  );
}
