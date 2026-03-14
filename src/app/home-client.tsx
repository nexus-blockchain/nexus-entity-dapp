'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { NodeHealthIndicator } from '@/components/node-health-indicator';
import { useWallet } from '@/hooks/use-wallet';
import { useNexBalance } from '@/hooks/use-external-queries';
import { isTauri } from '@/lib/utils/platform';
import { decodeChainString, entityTreasuryAddress } from '@/lib/utils/codec';
import { DesktopWalletDialog } from '@/components/wallet/desktop-wallet-dialog';
import { useEntityMutation } from '@/hooks/use-entity-mutation';
import { useEntityQuery } from '@/hooks/use-entity-query';
import { useApi } from '@/lib/chain/api-provider';
import { EntityType, EntityStatus } from '@/lib/types/enums';
import type { EntityData } from '@/lib/types/models';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Wallet,
  LogOut,
  Search,
  Plus,
  ArrowRight,
  Hexagon,
  Link2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  Send,
  Store,
  Coins,
  ShieldCheck,
  TrendingDown,
  ChevronDown,
  Globe,
} from 'lucide-react';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  Active: 'success',
  Suspended: 'warning',
  Banned: 'destructive',
  PendingClose: 'warning',
  Closed: 'secondary',
  PendingApproval: 'outline',
};

function parseEntityBrief(raw: unknown): EntityData | null {
  if (!raw || (raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  const obj = unwrapped as Record<string, unknown>;
  return {
    id: Number(obj.id ?? 0),
    owner: String(obj.owner ?? ''),
    name: decodeChainString(obj.name),
    logoCid: obj.logoCid ? decodeChainString(obj.logoCid) : null,
    descriptionCid: obj.descriptionCid ? decodeChainString(obj.descriptionCid) : null,
    metadataUri: obj.metadataUri ? decodeChainString(obj.metadataUri) : null,
    contactCid: obj.contactCid ? decodeChainString(obj.contactCid) : null,
    status: String(obj.status ?? 'Active') as EntityStatus,
    entityType: String(obj.entityType ?? 'Merchant') as EntityType,
    governanceMode: String(obj.governanceMode ?? 'None') as any,
    verified: Boolean(obj.verified),
    governanceLocked: Boolean(obj.governanceLocked),
    fundBalance: BigInt(String(obj.fundBalance ?? 0)),
    createdAt: Number(obj.createdAt ?? 0),
  };
}

interface EntitySummary extends EntityData {
  shopCount: number;
  tokenSymbol: string | null;
}

// Format NEX balance
function formatBalance(bal: bigint): string {
  const whole = bal / BigInt(1e12);
  const frac = bal % BigInt(1e12);
  const fracStr = frac.toString().padStart(12, '0').slice(0, 4);
  return `${whole.toString()}.${fracStr}`;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

// ===== Entity Card (reused for both all entities and my entities) =====
function EntityCard({ ent, router, showOwner, t, te }: { ent: EntitySummary; router: ReturnType<typeof useRouter>; showOwner?: boolean; t: (key: string, values?: Record<string, string | number | Date>) => string; te: (key: string) => string }) {
  const statusVariant = STATUS_VARIANT[ent.status] ?? 'secondary';
  const statusLabel = te(`entityStatus.${ent.status}`);
  const LOW_BALANCE_THRESHOLD = BigInt(10) * BigInt(1e12);
  const isLowBalance = ent.fundBalance < LOW_BALANCE_THRESHOLD;

  return (
    <Card
      className="group cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => router.push(`/${ent.id}`)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
              {ent.id}
            </div>
            <CardTitle className="text-base truncate">{ent.name}</CardTitle>
          </div>
          <Badge variant={statusVariant} className="shrink-0 text-[10px]">
            {statusLabel}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <Badge variant="outline" className="text-[10px] h-5 px-1.5">
            {te(`entityType.${ent.entityType}`)}
          </Badge>
          {ent.governanceMode === 'FullDAO' && (
            <Badge variant="default" className="text-[10px] h-5 px-1.5">
              DAO
            </Badge>
          )}
          {ent.verified && (
            <Badge variant="success" className="text-[10px] h-5 px-1.5">
              <ShieldCheck className="mr-0.5 h-3 w-3" />
              {t('verified')}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md bg-muted/50 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Coins className="h-3.5 w-3.5" />
              {t('fundBalance')}
            </div>
            <p className={`text-sm font-semibold ${isLowBalance ? 'text-yellow-600 dark:text-yellow-400' : ''}`}>
              {isLowBalance && <TrendingDown className="inline mr-1 h-3.5 w-3.5" />}
              {formatBalance(ent.fundBalance)} NEX
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Store className="h-3.5 w-3.5" />
              {t('shops')}
            </div>
            <p className="text-sm font-semibold">
              {t('shopCount', { count: ent.shopCount })}
            </p>
          </div>
          {showOwner && (
            <div className="rounded-md bg-muted/50 p-2.5 col-span-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Building2 className="h-3.5 w-3.5" />
                {t('owner')}
              </div>
              <p className="text-xs font-mono text-muted-foreground truncate">
                {shortenAddress(ent.owner)}
              </p>
            </div>
          )}
          {!showOwner && (
            <div className="rounded-md bg-muted/50 p-2.5 col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Hexagon className="h-3.5 w-3.5" />
                    {t('token')}
                  </div>
                  <p className="text-sm font-semibold">
                    {ent.tokenSymbol ?? <span className="text-muted-foreground font-normal">{t('notConfigured')}</span>}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/${ent.id}`);
                  }}
                >
                  {t('enterManagement')}
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function HomePage() {
  const router = useRouter();
  const t = useTranslations('home');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const { isReady } = useApi();

  // Wallet
  const {
    address,
    name: walletName,
    source,
    isConnected,
    getAccounts,
    connect,
    disconnect,
  } = useWallet();

  const { data: nexBalance } = useNexBalance(address);
  const balance = nexBalance?.free ?? BigInt(0);

  // Entity ID navigation
  const [entityId, setEntityId] = useState('');

  // Wallet connection state
  const [accounts, setAccounts] = useState<InjectedAccountWithMeta[]>([]);
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);

  // Create entity form
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [entityName, setEntityName] = useState('');
  const [entityType, setEntityType] = useState<EntityType>(EntityType.Merchant);
  const [initialFund, setInitialFund] = useState('');
  const [referrerAddress, setReferrerAddress] = useState('');

  // Entity type filter for all entities list
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Entity mutation
  const { mutate, txState, reset } = useEntityMutation('entityRegistry', 'createEntity', {
    invalidateKeys: [['allEntities'], ['userEntities', address]],
    onSuccess: () => {
      setEntityName('');
      setEntityType(EntityType.Merchant);
      setInitialFund('');
      setReferrerAddress('');
      setTimeout(() => setShowCreateDialog(false), 1200);
    },
  });

  // NEX transfer
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const nexTransfer = useEntityMutation('balances', 'transferKeepAlive', {
    invalidateKeys: [['external', 'balances', address]],
  });

  // ===== Query ALL entities from chain (no wallet needed) =====
  const { data: allEntities, isLoading: allEntitiesLoading } = useEntityQuery<EntitySummary[]>(
    ['allEntities'],
    async (api) => {
      const entries = await (api.query as any).entityRegistry.entities.entries();
      const results: EntitySummary[] = [];

      const hasShopPallet = !!(api.query as any).entityShop?.shopEntity;
      const hasTokenPallet = !!(api.query as any).entityToken?.entityTokenConfigs || !!(api.query as any).entityToken?.tokenConfigs;

      // Pre-build shopCount map: entityId -> count
      const shopCountMap = new Map<number, number>();
      if (hasShopPallet) {
        try {
          const shopEntries = await (api.query as any).entityShop.shopEntity.entries();
          for (const [, val] of shopEntries) {
            const eid = Number(val.toString());
            shopCountMap.set(eid, (shopCountMap.get(eid) ?? 0) + 1);
          }
        } catch {
          // ignore
        }
      }

      for (const [key, rawValue] of entries) {
        const parsed = parseEntityBrief(rawValue);
        if (!parsed) continue;

        const eid = Number(key.args[0]);
        if (isNaN(eid)) continue;

        let shopCount = shopCountMap.get(eid) ?? 0;
        let tokenSymbol: string | null = null;
        try {
          if (hasTokenPallet) {
            // Config tells us if token exists; metadata has name/symbol/decimals
            const configFn = (api.query as any).entityToken.entityTokenConfigs ?? (api.query as any).entityToken.tokenConfigs;
            const tokenConfigRaw = await configFn(eid);
            if (tokenConfigRaw && !(tokenConfigRaw as { isNone?: boolean }).isNone) {
              // Token exists, read metadata for symbol
              const metaFn = (api.query as any).entityToken.entityTokenMetadata ?? (api.query as any).entityToken.tokenMetadata;
              if (metaFn) {
                const metaRaw = await metaFn(eid);
                const meta = (metaRaw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? metaRaw;
                if (meta) {
                  const raw = Array.isArray(meta) ? meta[1] : ((meta as Record<string, unknown>).symbol ?? (meta as Record<string, unknown>)[1]);
                  if (raw) {
                    tokenSymbol = decodeChainString(raw);
                  }
                }
              }
            }
          }
        } catch {
          // Non-critical, use defaults
        }

        // Query treasury balance for fund display
        try {
          const treasuryAddr = entityTreasuryAddress(eid);
          const acctInfo = await api.query.system.account(treasuryAddr);
          const data = (acctInfo as any)?.data;
          parsed.fundBalance = BigInt(String(data?.free ?? 0));
        } catch {
          // Non-critical
        }

        results.push({ ...parsed, id: eid, shopCount, tokenSymbol });
      }

      results.sort((a, b) => a.id - b.id);
      return results;
    },
    { staleTime: 30_000 },
  );

  // ===== Query user's owned entities (wallet required) =====
  const { data: myEntityIds, isLoading: myEntitiesLoading } = useEntityQuery<number[]>(
    ['userEntities', address],
    async (api) => {
      const raw = await (api.query as any).entityRegistry.userEntity(address);
      if (!raw || (raw as { isNone?: boolean }).isNone) return [];
      const vec = raw.toJSON?.() ?? raw;
      if (Array.isArray(vec)) return vec.map(Number);
      return [];
    },
    { staleTime: 30_000, enabled: !!address && isConnected },
  );

  // Derive "my entities" from the allEntities list
  const myEntities = allEntities?.filter((e) => myEntityIds?.includes(e.id)) ?? [];

  // Filtered entities for display
  const filteredEntities = (allEntities ?? []).filter((ent) => {
    if (filterType !== 'all' && ent.entityType !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchName = ent.name.toLowerCase().includes(q);
      const matchId = String(ent.id) === q;
      if (!matchName && !matchId) return false;
    }
    return true;
  });

  // Navigation handler
  const handleGo = () => {
    const id = entityId.trim();
    if (id) router.push(`/${id}`);
  };

  // Connect wallet
  const handleConnectWallet = useCallback(async () => {
    setWalletError(null);
    setWalletLoading(true);
    try {
      const accs = await getAccounts();
      if (accs.length === 0) {
        setWalletError(t('noAccountsFound'));
        return;
      }
      if (accs.length === 1) {
        await connect(accs[0]);
      } else {
        setAccounts(accs);
        setShowAccountSelector(true);
      }
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : t('connectFailed'));
    } finally {
      setWalletLoading(false);
    }
  }, [getAccounts, connect, t]);

  const handleSelectAccount = useCallback(
    async (account: InjectedAccountWithMeta) => {
      setWalletLoading(true);
      try {
        await connect(account);
        setShowAccountSelector(false);
        setAccounts([]);
      } catch (err) {
        setWalletError(err instanceof Error ? err.message : t('connectFailed'));
      } finally {
        setWalletLoading(false);
      }
    },
    [connect, t],
  );

  const handleCreateEntity = useCallback(async () => {
    if (!entityName.trim()) return;
    const fundAmount = initialFund ? BigInt(Math.floor(parseFloat(initialFund) * 1e12)) : BigInt(0);
    const referrer = referrerAddress.trim() || null;
    await mutate([entityName.trim(), entityType, fundAmount, referrer]);
  }, [entityName, entityType, initialFund, referrerAddress, mutate]);

  const handleNexTransfer = useCallback(async () => {
    const to = transferTo.trim();
    const amt = parseFloat(transferAmount);
    if (!to || isNaN(amt) || amt <= 0) return;
    const plancks = BigInt(Math.floor(amt * 1e12));
    await nexTransfer.mutate([to, plancks]);
    setTransferTo('');
    setTransferAmount('');
  }, [transferTo, transferAmount, nexTransfer]);

  const isTxPending =
    txState.status === 'signing' ||
    txState.status === 'broadcasting' ||
    txState.status === 'inBlock';

  const isNexTransferPending =
    nexTransfer.txState.status === 'signing' ||
    nexTransfer.txState.status === 'broadcasting' ||
    nexTransfer.txState.status === 'inBlock';

  return (
    <main className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Hexagon className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">NEXUS</span>
        </div>
        <div className="flex items-center gap-3">
          <NodeHealthIndicator />
          {/* Quick entity ID entry */}
          <div className="hidden sm:flex items-center gap-1.5">
            <Input
              type="number"
              min="0"
              placeholder={t('placeholder')}
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGo()}
              className="h-8 w-28 text-xs"
            />
            <Button size="sm" variant="outline" className="h-8" onClick={handleGo} disabled={!entityId.trim()}>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* Wallet quick toggle */}
          {isConnected ? (
            <Badge variant="success" className="text-xs cursor-pointer" onClick={() => setWalletOpen(!walletOpen)}>
              <Wallet className="mr-1 h-3 w-3" />
              {walletName ?? shortenAddress(address!)}
            </Badge>
          ) : (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setWalletOpen(!walletOpen)}>
              <Wallet className="mr-1.5 h-3.5 w-3.5" />
              {t('walletConnection')}
            </Button>
          )}
          <LocaleSwitcher />
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-16">
        {/* ===== Hero: Compact header ===== */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>

        {/* ===== All Entities (visible without wallet) ===== */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">{t('allEntities')}</h2>
              {allEntities && (
                <Badge variant="secondary" className="text-xs">
                  {allEntities.length}
                </Badge>
              )}
            </div>
          </div>

          {/* Search and filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allTypes')}</SelectItem>
                {Object.values(EntityType).map((type) => (
                  <SelectItem key={type} value={type}>
                    {te(`entityType.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Entity list */}
          {!isReady ? (
            <Card>
              <CardContent className="flex items-center gap-3 py-8 justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{t('connecting')}</p>
              </CardContent>
            </Card>
          ) : allEntitiesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-8 w-8 rounded-md" />
                      <Skeleton className="h-5 w-32" />
                    </div>
                    <div className="flex gap-1.5 mt-1">
                      <Skeleton className="h-5 w-12 rounded-full" />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-3">
                      <Skeleton className="h-16 rounded-md" />
                      <Skeleton className="h-16 rounded-md" />
                      <Skeleton className="h-14 rounded-md col-span-2" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredEntities.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredEntities.map((ent) => (
                <EntityCard key={ent.id} ent={ent} router={router} showOwner t={t} te={te} />
              ))}
            </div>
          ) : allEntities && allEntities.length > 0 ? (
            <Card>
              <CardContent className="flex items-center gap-3 py-8 justify-center">
                <Search className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t('noMatches')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center gap-3 py-8 justify-center">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t('noEntities')}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ===== Wallet Panel (collapsible) ===== */}
        <Collapsible open={walletOpen} onOpenChange={setWalletOpen}>
          <CollapsibleTrigger asChild>
            <Button id="account" variant="outline" className="w-full mb-3 justify-between scroll-mt-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                <span>{isConnected ? `${t('walletConnected')} · ${walletName ?? shortenAddress(address!)}` : t('walletManagement')}</span>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${walletOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Wallet Connection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Wallet className="h-5 w-5" />
                    {t('walletConnection')}
                  </CardTitle>
                  <CardDescription>
                    {t('walletDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!isConnected ? (
                    <>
                      {/* Built-in wallet (always available) */}
                      <DesktopWalletDialog />
                      {/* Extension connect (browser only) */}
                      {!isTauri() && (
                        <>
                          <div className="relative my-1">
                            <div className="absolute inset-0 flex items-center"><Separator /></div>
                            <div className="relative flex justify-center">
                              <span className="bg-card px-2 text-xs text-muted-foreground">{t('orExtension')}</span>
                            </div>
                          </div>
                          <Button variant="outline" onClick={handleConnectWallet} disabled={walletLoading} className="w-full">
                            {walletLoading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Wallet className="mr-2 h-4 w-4" />
                            )}
                            {walletLoading ? t('connectingWallet') : t('extensionConnect')}
                          </Button>
                        </>
                      )}
                      {showAccountSelector && accounts.length > 0 && (
                        <div className="space-y-2 rounded-md border border-input p-3">
                          <p className="text-sm font-medium">{t('selectAccount')}</p>
                          {accounts.map((acc) => (
                            <button
                              key={acc.address}
                              onClick={() => handleSelectAccount(acc)}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-medium">{acc.meta.name || t('unnamed')}</p>
                                <p className="truncate text-xs text-muted-foreground">{shortenAddress(acc.address)}</p>
                              </div>
                              <Badge variant="outline" className="shrink-0 text-xs">{acc.meta.source}</Badge>
                            </button>
                          ))}
                        </div>
                      )}
                      {walletError && (
                        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{walletError}</span>
                        </div>
                      )}
                    </>
                  ) : source === 'desktop-keyring' ? (
                    <>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <Badge variant="success">{t('connected')}</Badge>
                        <Badge variant="outline" className="text-xs">{t('desktopWallet')}</Badge>
                      </div>
                      <div className="space-y-2 rounded-md bg-muted/50 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{t('account')}</span>
                          <span className="text-sm font-medium">{walletName}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{t('address')}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {address ? shortenAddress(address) : '--'}
                          </span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{t('balance')}</span>
                          <span className="text-sm font-semibold">{formatBalance(balance)} NEX</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <DesktopWalletDialog />
                        <Button variant="outline" size="sm" onClick={disconnect} className="flex-1">
                          <LogOut className="mr-2 h-4 w-4" />
                          {t('disconnect')}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <Badge variant="success">{t('connected')}</Badge>
                        {source && <Badge variant="outline" className="text-xs">{source}</Badge>}
                      </div>
                      <div className="space-y-2 rounded-md bg-muted/50 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{t('account')}</span>
                          <span className="text-sm font-medium">{walletName}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{t('address')}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {address ? shortenAddress(address) : '--'}
                          </span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{t('balance')}</span>
                          <span className="text-sm font-semibold">{formatBalance(balance)} NEX</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          disconnect();
                          setShowAccountSelector(false);
                          setAccounts([]);
                          setWalletError(null);
                        }}
                        className="w-full"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        {t('disconnectWallet')}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Entity ID Entry (mobile visible) */}
              <Card className="sm:hidden md:block">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Search className="h-5 w-5" />
                    {t('enter')} Entity
                  </CardTitle>
                  <CardDescription>{t('hint')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="entity-id">{t('placeholder')}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="entity-id"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={entityId}
                        onChange={(e) => setEntityId(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleGo()}
                      />
                      <Button onClick={handleGo} disabled={!entityId.trim()}>
                        {t('enter')}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ===== My Entities (wallet connected) ===== */}
            {isConnected && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">{t('myEntities')}</h2>
                  {myEntities.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{myEntities.length}</Badge>
                  )}
                  <div className="flex-1" />
                  <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-1.5">
                        <Plus className="h-4 w-4" />
                        {t('createEntity')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>{t('createNewEntity')}</DialogTitle>
                      </DialogHeader>
                      <p className="text-sm text-muted-foreground">{t('createEntityDesc')}</p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="entity-name">{t('entityName')}</Label>
                          <Input
                            id="entity-name"
                            placeholder={t('entityNamePlaceholder')}
                            value={entityName}
                            onChange={(e) => setEntityName(e.target.value)}
                            disabled={isTxPending}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t('entityType')}</Label>
                          <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityType)} disabled={isTxPending}>
                            <SelectTrigger><SelectValue placeholder={t('selectType')} /></SelectTrigger>
                            <SelectContent>
                              {Object.values(EntityType).map((type) => (
                                <SelectItem key={type} value={type}>
                                  {te(`entityType.${type}`)} ({type})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="initial-fund">{t('initialFund')}</Label>
                          <Input id="initial-fund" type="number" min="0" step="0.01" placeholder="0.00" value={initialFund} onChange={(e) => setInitialFund(e.target.value)} disabled={isTxPending} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="referrer-address">
                            {t('referrerAddress')}<span className="ml-1 text-xs text-muted-foreground">{t('optional')}</span>
                          </Label>
                          <div className="flex items-center gap-2">
                            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <Input id="referrer-address" placeholder="5Xxxx..." value={referrerAddress} onChange={(e) => setReferrerAddress(e.target.value)} disabled={isTxPending} className="font-mono text-sm" />
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <Button onClick={handleCreateEntity} disabled={!entityName.trim() || isTxPending} className="sm:w-auto">
                          {isTxPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                          {txState.status === 'signing' ? t('signing') : txState.status === 'broadcasting' ? t('broadcasting') : txState.status === 'inBlock' ? t('inBlock') : t('createEntity')}
                        </Button>
                        {txState.status === 'finalized' && (
                          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{t('createSuccess')}</span>
                            {txState.hash && <span className="font-mono text-xs text-muted-foreground">{shortenAddress(txState.hash)}</span>}
                          </div>
                        )}
                        {txState.status === 'error' && (
                          <div className="flex items-center gap-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            <span className="line-clamp-1">{txState.error || t('transactionFailed')}</span>
                            <Button variant="link" size="sm" onClick={reset} className="h-auto p-0 text-xs text-destructive">{tc('reset')}</Button>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {myEntitiesLoading ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {[1, 2].map((i) => (
                      <Card key={i}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-8 w-8 rounded-md" />
                            <Skeleton className="h-5 w-32" />
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <Skeleton className="h-16 rounded-md" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : myEntities.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {myEntities.map((ent) => (
                      <EntityCard key={ent.id} ent={ent} router={router} t={t} te={te} />
                    ))}
                  </div>
                ) : myEntityIds && myEntityIds.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center gap-3 py-8">
                      <Building2 className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{t('noMyEntities')}</p>
                      <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        {t('createEntity')}
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            )}

            {/* ===== NEX Transfer (connected) ===== */}
            {isConnected && (
              <Card id="transfer" className="scroll-mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Send className="h-4 w-4" />
                    {t('nexTransfer')}
                  </CardTitle>
                  <CardDescription>{t('nexTransferDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="transfer-to">{t('recipientAddress')}</Label>
                      <Input id="transfer-to" type="text" placeholder="5Xxxx..." value={transferTo} onChange={(e) => setTransferTo(e.target.value)} disabled={isNexTransferPending} className="font-mono text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="transfer-amount">{t('transferAmount')}</Label>
                      <Input id="transfer-amount" type="number" min="0" step="0.0001" placeholder="0.00" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} disabled={isNexTransferPending} />
                      <p className="text-xs text-muted-foreground">{t('availableBalance')}: {formatBalance(balance)} NEX</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Button onClick={handleNexTransfer} disabled={!transferTo.trim() || !transferAmount || isNexTransferPending}>
                      {isNexTransferPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      {t('sendTransfer')}
                    </Button>
                    <TxStatusIndicator txState={nexTransfer.txState} />
                  </div>
                </CardContent>
              </Card>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </main>
  );
}
