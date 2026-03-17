'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useMembers } from '@/hooks/use-members';
import { useCommission } from '@/hooks/use-commission';
import { useHasPermission } from '@/components/permission-guard';
import { useWalletStore } from '@/stores';
import { AdminPermission } from '@/lib/types/models';
import type { MemberData } from '@/lib/types/models';
import { MemberStatus } from '@/lib/types/enums';
import { formatNex, formatToken } from '@/lib/utils/format';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { CopyableAddress } from '@/components/copyable-address';

// ─── Helpers ────────────────────────────────────────────────

const STATUS_BADGE_VARIANT: Record<MemberStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'; className?: string }> = {
  [MemberStatus.Active]: { variant: 'success' },
  [MemberStatus.Pending]: { variant: 'warning' },
  [MemberStatus.Frozen]: { variant: 'secondary', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  [MemberStatus.Banned]: { variant: 'destructive' },
  [MemberStatus.Expired]: { variant: 'outline' },
};

// ─── Member Detail Dialog ──────────────────────────────────

function MemberDetailContent({
  account,
  member,
  onViewReferrals,
}: {
  account: string;
  member: MemberData | undefined;
  onViewReferrals: (account: string) => void;
}) {
  const t = useTranslations('members.referrals');
  const te = useTranslations('enums');
  const { useReferralTree } = useMembers();
  const { useMemberCommission } = useCommission();
  const { data: refData } = useReferralTree(account);
  const { data: commData } = useMemberCommission(account);

  return (
    <div className="space-y-4">
      {/* Address */}
      <div className="rounded-md bg-muted p-3">
        <p className="break-all font-mono text-sm">{account}</p>
      </div>

      {member ? (
        <>
          {/* Status & Level */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">{t('status')}</p>
              <Badge
                variant={STATUS_BADGE_VARIANT[member.status].variant}
                className={STATUS_BADGE_VARIANT[member.status].className}
              >
                {te(`memberStatus.${member.status}`)}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('level')}</p>
              <p className="text-lg font-semibold">Lv.{member.level}</p>
            </div>
          </div>

          <Separator />

          {/* Spending & Orders */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">{t('totalSpent')}</p>
              <p className="font-medium">{formatNex(member.totalSpent)} NEX</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('joinedAt')}</p>
              <p className="font-medium">#{member.joinedAt}</p>
            </div>
          </div>

          {/* Referrer */}
          <div>
            <p className="text-xs text-muted-foreground">{t('referrerLabel')}</p>
            <p className="font-mono text-sm">
              {member.referrer ? <CopyableAddress address={member.referrer} textClassName="text-xs" /> : t('noReferrer')}
            </p>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t('noReferrals')}</p>
      )}

      <Separator />

      {/* Referral stats */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">{t('directCount')}</p>
          <p className="font-medium">{refData?.directReferrals.length ?? '-'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('teamSizeLabel')}</p>
          <p className="font-medium">{refData?.teamSize ?? '-'}</p>
        </div>
      </div>

      {/* Commission */}
      {commData && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{t('nexCommission')}</p>
            <p className="font-medium">{formatNex(commData.nexEarned)} NEX</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('tokenCommission')}</p>
            <p className="font-medium">{formatToken(commData.tokenEarned)}</p>
          </div>
        </div>
      )}

      {/* Action: View this member's referral network */}
      <Button
        variant="outline"
        className="w-full"
        onClick={() => onViewReferrals(account)}
      >
        {t('viewReferrals')}
      </Button>
    </div>
  );
}

function MemberDetailDialog({
  account,
  member,
  open,
  onOpenChange,
  onViewReferrals,
}: {
  account: string | null;
  member: MemberData | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewReferrals: (account: string) => void;
}) {
  const t = useTranslations('members.referrals');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('memberDetail')}</DialogTitle>
        </DialogHeader>
        {account && (
          <MemberDetailContent
            account={account}
            member={member}
            onViewReferrals={(a) => {
              onOpenChange(false);
              onViewReferrals(a);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Clickable Address ─────────────────────────────────────

function ClickableAddress({
  account,
  onClick,
  className,
}: {
  account: string;
  onClick: (account: string) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(account)}
      className={`cursor-pointer font-mono text-sm underline decoration-dotted underline-offset-4 hover:text-primary ${className ?? ''}`}
      title={account}
    >
      {account}
    </button>
  );
}

// ─── Search Input (admin-only) ──────────────────────────────

function SearchMemberInput({
  onSearch,
}: {
  onSearch: (account: string) => void;
}) {
  const t = useTranslations('members.referrals');
  const [input, setInput] = useState('');

  return (
    <div className="flex gap-2">
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={t('searchPlaceholder')}
        className="font-mono"
      />
      <Button
        onClick={() => {
          if (input.trim()) onSearch(input.trim());
        }}
        disabled={!input.trim()}
      >
        {t('search')}
      </Button>
    </div>
  );
}

// ─── Referral Stats Cards ───────────────────────────────────

function ReferralStats({
  directCount,
  indirectCount,
  teamSize,
}: {
  directCount: number;
  indirectCount: number;
  teamSize: number;
}) {
  const t = useTranslations('members.referrals');

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t('directCount')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{directCount}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t('indirectCount')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{indirectCount}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t('teamSize')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{teamSize}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Referral Sub-Tree (Collapsible, lazy-loads children) ────

function ReferralSubTree({
  account,
  memberMap,
  depth,
  onClickAccount,
}: {
  account: string;
  memberMap: Map<string, MemberData>;
  depth: number;
  onClickAccount: (account: string) => void;
}) {
  const t = useTranslations('members.referrals');
  const [expanded, setExpanded] = useState(false);
  const { useReferralTree } = useMembers();
  const { data, isLoading } = useReferralTree(expanded ? account : null);
  const member = memberMap.get(account);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            {expanded ? '▾' : '▸'}
          </Button>
        </CollapsibleTrigger>
        <ClickableAddress account={account} onClick={onClickAccount} />
        {member && (
          <Badge variant="outline" className="text-xs">
            Lv.{member.level}
          </Badge>
        )}
        {data && data.teamSize > 0 && (
          <span className="text-xs text-muted-foreground">
            ({t('memberTeamSize')}: {data.teamSize})
          </span>
        )}
      </div>
      <CollapsibleContent>
        <div className="ml-6 border-l pl-3">
          {isLoading && (
            <div className="space-y-1 py-1">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-36" />
            </div>
          )}
          {data && data.directReferrals.length === 0 && !isLoading && (
            <p className="py-1 text-xs text-muted-foreground">{t('noReferrals')}</p>
          )}
          {data &&
            data.directReferrals.map((ref) =>
              depth < 2 ? (
                <ReferralSubTree
                  key={ref}
                  account={ref}
                  memberMap={memberMap}
                  depth={depth + 1}
                  onClickAccount={onClickAccount}
                />
              ) : (
                <div key={ref} className="flex items-center gap-2 px-2 py-1.5">
                  <ClickableAddress account={ref} onClick={onClickAccount} />
                  {memberMap.get(ref) && (
                    <Badge variant="outline" className="text-xs">
                      Lv.{memberMap.get(ref)!.level}
                    </Badge>
                  )}
                </div>
              ),
            )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Referral Tree Section (Tabs: Lv1 / Lv2 / Lv3) ─────────

function ReferralTreeSection({
  directReferrals,
  memberMap,
  onClickAccount,
}: {
  directReferrals: string[];
  memberMap: Map<string, MemberData>;
  onClickAccount: (account: string) => void;
}) {
  const t = useTranslations('members.referrals');

  if (directReferrals.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t('noReferrals')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('viewReferralNetwork')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="lv1">
          <TabsList className="mb-4">
            <TabsTrigger value="lv1">{t('lv1')}</TabsTrigger>
            <TabsTrigger value="lv2">{t('lv2')}</TabsTrigger>
            <TabsTrigger value="lv3">{t('lv3')}</TabsTrigger>
          </TabsList>

          <TabsContent value="lv1">
            <div className="space-y-1">
              {directReferrals.map((ref) => {
                const member = memberMap.get(ref);
                return (
                  <div key={ref} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                    <ClickableAddress account={ref} onClick={onClickAccount} />
                    {member && (
                      <Badge variant="outline" className="text-xs">
                        Lv.{member.level}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="lv2">
            <div className="space-y-1">
              {directReferrals.map((ref) => (
                <ReferralSubTree
                  key={ref}
                  account={ref}
                  memberMap={memberMap}
                  depth={1}
                  onClickAccount={onClickAccount}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="lv3">
            <div className="space-y-1">
              {directReferrals.map((ref) => (
                <ReferralSubTree
                  key={ref}
                  account={ref}
                  memberMap={memberMap}
                  depth={0}
                  onClickAccount={onClickAccount}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Direct Referral Row (independent hooks per row) ─────────

function DirectReferralRow({
  account,
  memberMap,
  onClickAccount,
}: {
  account: string;
  memberMap: Map<string, MemberData>;
  onClickAccount: (account: string) => void;
}) {
  const { useReferralTree } = useMembers();
  const { useMemberCommission } = useCommission();
  const { data: refData } = useReferralTree(account);
  const { data: commData } = useMemberCommission(account);
  const member = memberMap.get(account);

  return (
    <TableRow>
      <TableCell>
        <ClickableAddress account={account} onClick={onClickAccount} />
      </TableCell>
      <TableCell>{member ? `Lv.${member.level}` : '-'}</TableCell>
      <TableCell className="text-right">{refData?.teamSize ?? '-'}</TableCell>
      <TableCell className="text-right">{member ? `${formatNex(member.totalSpent)}` : '-'}</TableCell>
      <TableCell className="text-right">{commData ? `${formatNex(commData.nexEarned)}` : '-'}</TableCell>
    </TableRow>
  );
}

// ─── Direct Referral Table ──────────────────────────────────

function DirectReferralTable({
  directReferrals,
  memberMap,
  onClickAccount,
}: {
  directReferrals: string[];
  memberMap: Map<string, MemberData>;
  onClickAccount: (account: string) => void;
}) {
  const t = useTranslations('members.referrals');

  if (directReferrals.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('directCount')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('address')}</TableHead>
              <TableHead>{t('level')}</TableHead>
              <TableHead className="text-right">{t('memberTeamSize')}</TableHead>
              <TableHead className="text-right">{t('totalSpent')}</TableHead>
              <TableHead className="text-right">{t('commissionEarned')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {directReferrals.map((ref) => (
              <DirectReferralRow key={ref} account={ref} memberMap={memberMap} onClickAccount={onClickAccount} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────

function ReferralsSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function ReferralsPage() {
  const t = useTranslations('members.referrals');
  const { entityId } = useEntityContext();
  const walletAddress = useWalletStore((s) => s.address);
  const isAdmin = useHasPermission(AdminPermission.MEMBER_MANAGE);

  const [targetAccount, setTargetAccount] = useState<string | null>(null);
  const [detailAccount, setDetailAccount] = useState<string | null>(null);
  const activeAccount = targetAccount ?? walletAddress;

  const { members, isLoading: membersLoading, useReferralTree } = useMembers();
  const { data: referralData, isLoading: referralLoading } = useReferralTree(activeAccount);

  const memberMap = useMemo(() => {
    const map = new Map<string, MemberData>();
    for (const m of members) {
      map.set(m.account, m);
    }
    return map;
  }, [members]);

  const directReferrals = referralData?.directReferrals ?? [];
  const teamSize = referralData?.teamSize ?? 0;
  const directCount = directReferrals.length;
  const indirectCount = teamSize > directCount ? teamSize - directCount : 0;

  const handleClickAccount = useCallback((account: string) => {
    setDetailAccount(account);
  }, []);

  const handleViewReferrals = useCallback((account: string) => {
    setTargetAccount(account);
  }, []);

  if (membersLoading || (activeAccount && referralLoading)) {
    return <ReferralsSkeleton />;
  }

  if (!walletAddress && !targetAccount) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">{t('title')}</h1>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">{t('connectWalletFirst')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        {activeAccount && (
          <Badge variant="secondary" className="font-mono text-xs">
            <CopyableAddress address={activeAccount} textClassName="text-xs" hideCopyIcon />
          </Badge>
        )}
      </div>

      {isAdmin && (
        <SearchMemberInput onSearch={(account) => setTargetAccount(account)} />
      )}

      <ReferralStats
        directCount={directCount}
        indirectCount={indirectCount}
        teamSize={teamSize}
      />

      <ReferralTreeSection
        directReferrals={directReferrals}
        memberMap={memberMap}
        onClickAccount={handleClickAccount}
      />

      <DirectReferralTable
        directReferrals={directReferrals}
        memberMap={memberMap}
        onClickAccount={handleClickAccount}
      />

      <MemberDetailDialog
        account={detailAccount}
        member={detailAccount ? memberMap.get(detailAccount) : undefined}
        open={detailAccount !== null}
        onOpenChange={(open) => { if (!open) setDetailAccount(null); }}
        onViewReferrals={handleViewReferrals}
      />
    </div>
  );
}
