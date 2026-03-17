'use client';

import React, { useState, useCallback } from 'react';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useDisclosure } from '@/hooks/use-disclosure';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { DisclosureLevel, DisclosureStatus, InsiderRole, DisclosureType, AnnouncementCategory } from '@/lib/types/enums';
import { useCurrentBlock } from '@/hooks/use-current-block';

import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils/cn';
import { CopyableAddress } from '@/components/copyable-address';
import { LabelWithTip } from '@/components/field-help-tip';

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

const DISCLOSURE_LEVELS: { key: DisclosureLevel }[] = [
  { key: DisclosureLevel.Basic },
  { key: DisclosureLevel.Standard },
  { key: DisclosureLevel.Enhanced },
  { key: DisclosureLevel.Full },
];

const STATUS_VARIANT: Record<DisclosureStatus, 'secondary' | 'success' | 'destructive' | 'warning'> = {
  [DisclosureStatus.Draft]: 'secondary',
  [DisclosureStatus.Published]: 'success',
  [DisclosureStatus.Withdrawn]: 'destructive',
  [DisclosureStatus.Corrected]: 'warning',
};

const ANNOUNCEMENT_CATEGORIES = Object.values(AnnouncementCategory);

// ─── Loading Skeleton ───────────────────────────────────────

function DisclosureSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-1/3" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Disclosure Level Config ────────────────────────────────

function LevelConfigSection() {
  const t = useTranslations('disclosure');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const { disclosureLevel, configureDisclosure } = useDisclosure();

  const handleSetLevel = useCallback(
    (level: DisclosureLevel) => {
      // Pallet: configure_disclosure(entity_id, level, insider_trading_control, blackout_after)
      configureDisclosure.mutate([entityId, level, false, 0]);
    },
    [entityId, configureDisclosure],
  );

  const LEVEL_KEY_MAP: Record<DisclosureLevel, { label: string; desc: string }> = {
    [DisclosureLevel.Basic]: { label: t('basic'), desc: t('basicDesc') },
    [DisclosureLevel.Standard]: { label: t('standard'), desc: t('standardDesc') },
    [DisclosureLevel.Enhanced]: { label: t('enhanced'), desc: t('enhancedDesc') },
    [DisclosureLevel.Full]: { label: t('full'), desc: t('fullDesc') },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('levelConfig')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DISCLOSURE_LEVELS.map(({ key }) => (
            <Button
              key={key}
              variant={disclosureLevel === key ? 'default' : 'outline'}
              className={cn(
                'h-auto flex-col items-start px-4 py-3',
                disclosureLevel === key && 'ring-2 ring-primary ring-offset-2',
              )}
              onClick={() => handleSetLevel(key)}
              disabled={isTxBusy(configureDisclosure)}
            >
              <span className="text-sm font-medium">{LEVEL_KEY_MAP[key].label}</span>
              <span className={cn(
                'mt-1 text-xs font-normal',
                disclosureLevel === key ? 'text-primary-foreground/80' : 'text-muted-foreground',
              )}>{LEVEL_KEY_MAP[key].desc}</span>
            </Button>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <TxStatusIndicator txState={configureDisclosure.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Blackout Period Indicator ───────────────────────────────

function BlackoutSection() {
  const t = useTranslations('disclosure');
  const te = useTranslations('enums');
  const { blackout, insiders } = useDisclosure();
  const currentBlock = useCurrentBlock();

  if (!blackout) return null;

  const isActive = currentBlock >= blackout.start && currentBlock <= blackout.end;

  return (
    <Card className={cn(
      isActive
        ? 'border-destructive/50 bg-destructive/5'
        : 'border-yellow-500/50 bg-yellow-500/5',
    )}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className={cn(
            'text-lg',
            isActive ? 'text-destructive' : 'text-yellow-700 dark:text-yellow-400',
          )}>
            {isActive ? t('blackoutActive') : t('blackoutConfigured')}
          </CardTitle>
          <Badge variant={isActive ? 'destructive' : 'warning'}>
            {isActive ? t('blackoutActiveLabel') : t('blackoutConfiguredLabel')}
          </Badge>
        </div>
        <CardDescription className={cn(
          isActive ? 'text-destructive/80' : 'text-yellow-700/80 dark:text-yellow-400/80',
        )}>
          {isActive
            ? t('blackoutActiveDesc', { start: blackout.start, end: blackout.end, current: currentBlock })
            : t('blackoutConfiguredDesc', { start: blackout.start, end: blackout.end, current: currentBlock })}
        </CardDescription>
      </CardHeader>
      {isActive && insiders.length > 0 && (
        <CardContent>
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-xs font-medium text-destructive">{t('restrictedInsiders')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {insiders.map((i) => (
                <Badge key={i.account} variant="destructive" className="text-xs">
                  <CopyableAddress address={i.account} textClassName="text-xs" hideCopyIcon /> ({te(`insiderRole.${i.role}`)})
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Disclosure Lifecycle ───────────────────────────────────

function DisclosureListSection() {
  const t = useTranslations('disclosure');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const {
    disclosures, createDraftDisclosure, updateDraft, publishDraft,
    withdrawDisclosure, correctDisclosure,
  } = useDisclosure();

  const [disclosureType, setDisclosureType] = useState<string>(DisclosureType.AnnualReport);
  const [contentCid, setContentCid] = useState('');
  const [summaryCid, setSummaryCid] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editCid, setEditCid] = useState('');
  const [editSummaryCid, setEditSummaryCid] = useState('');
  const [correctId, setCorrectId] = useState<number | null>(null);
  const [correctCid, setCorrectCid] = useState('');
  const [correctSummaryCid, setCorrectSummaryCid] = useState('');

  const handleCreate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!contentCid.trim()) return;
      createDraftDisclosure.mutate([entityId, disclosureType, contentCid.trim(), summaryCid.trim() || null]);
      setContentCid('');
      setSummaryCid('');
    },
    [entityId, disclosureType, contentCid, summaryCid, createDraftDisclosure],
  );

  const handleUpdate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (editId === null || !editCid.trim()) return;
      updateDraft.mutate([editId, editCid.trim(), editSummaryCid.trim() || null]);
      setEditId(null);
    },
    [editId, editCid, editSummaryCid, updateDraft],
  );

  const handleCorrect = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (correctId === null || !correctCid.trim()) return;
      correctDisclosure.mutate([correctId, correctCid.trim(), correctSummaryCid.trim() || null]);
      setCorrectId(null);
      setCorrectSummaryCid('');
    },
    [correctCid, correctId, correctSummaryCid, correctDisclosure],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('disclosureManagement')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create draft form */}
        <form onSubmit={handleCreate} className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">{t('createDraft')}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="disc-type" tip={t('help.disclosureType')}>{t('disclosureType')}</LabelWithTip>
              <Select value={disclosureType} onValueChange={setDisclosureType}>
                <SelectTrigger id="disc-type">
                  <SelectValue placeholder={t('disclosureType')} />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(DisclosureType).map((dtype) => (
                    <SelectItem key={dtype} value={dtype}>{dtype}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="disc-cid" tip={t('help.contentCid')}>{t('contentCid')}</LabelWithTip>
              <Input id="disc-cid" value={contentCid} onChange={(e) => setContentCid(e.target.value)} placeholder={t('contentCid')} />
            </div>
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="disc-summary" tip={t('help.summaryCid')}>{t('summaryCid')}</LabelWithTip>
              <Input id="disc-summary" value={summaryCid} onChange={(e) => setSummaryCid(e.target.value)} placeholder={t('summaryCidOptional')} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isTxBusy(createDraftDisclosure)}>
              {t('createDraft')}
            </Button>
            <TxStatusIndicator txState={createDraftDisclosure.txState} />
          </div>
        </form>

        <Separator />

        {/* Disclosure list */}
        {disclosures.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noDisclosures')}</p>
        ) : (
          <div className="space-y-3">
            {disclosures.map((d) => (
              <Card key={d.id} className="shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">#{d.id} [{d.disclosureType}]</span>
                      <Badge variant={STATUS_VARIANT[d.status]}>
                        {te(`disclosureStatus.${d.status}`)}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      {d.status === DisclosureStatus.Draft && (
                        <>
                          <Button variant="secondary" size="sm"
                            onClick={() => { setEditId(d.id); setEditCid(d.contentCid); setEditSummaryCid(''); }}>
                            {tc('edit')}
                          </Button>
                          <Button variant="default" size="sm"
                            onClick={() => publishDraft.mutate([d.id])}
                            disabled={isTxBusy(publishDraft)}>
                            {t('publish')}
                          </Button>
                        </>
                      )}
                      {d.status === DisclosureStatus.Published && (
                        <>
                          <Button variant="destructive" size="sm"
                            onClick={() => withdrawDisclosure.mutate([d.id])}
                            disabled={isTxBusy(withdrawDisclosure)}>
                            {t('withdraw')}
                          </Button>
                          <Button variant="outline" size="sm"
                            className="border-yellow-500 text-yellow-700 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-950"
                            onClick={() => { setCorrectId(d.id); setCorrectCid(''); setCorrectSummaryCid(''); }}>
                            {t('correct')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">CID: {d.contentCid}{d.summaryCid && <> · Summary: {d.summaryCid}</>}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit draft form */}
        {editId !== null && (
          <>
            <Separator />
            <form onSubmit={handleUpdate} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t('editDraft', { id: editId })}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="edit-cid" tip={t('help.contentCid')}>{t('contentCid')}</LabelWithTip>
                  <Input id="edit-cid" value={editCid} onChange={(e) => setEditCid(e.target.value)} placeholder={t('contentCid')} />
                </div>
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="edit-summary" tip={t('help.summaryCid')}>{t('summaryCid')}</LabelWithTip>
                  <Input id="edit-summary" value={editSummaryCid} onChange={(e) => setEditSummaryCid(e.target.value)} placeholder={t('summaryCidOptional')} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isTxBusy(updateDraft)}>{t('updateDraft')}</Button>
                <Button type="button" variant="ghost" onClick={() => setEditId(null)}>{tc('cancel')}</Button>
                <TxStatusIndicator txState={updateDraft.txState} />
              </div>
            </form>
          </>
        )}

        {/* Correct disclosure form */}
        {correctId !== null && (
          <>
            <Separator />
            <form onSubmit={handleCorrect} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t('correctDisclosure', { id: correctId })}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="correct-cid">{t('correctContentCid')}</Label>
                  <Input id="correct-cid" value={correctCid} onChange={(e) => setCorrectCid(e.target.value)} placeholder={t('correctContentCid')} />
                </div>
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="correct-summary" tip={t('help.summaryCid')}>{t('summaryCid')}</LabelWithTip>
                  <Input id="correct-summary" value={correctSummaryCid} onChange={(e) => setCorrectSummaryCid(e.target.value)} placeholder={t('summaryCidOptional')} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" variant="outline"
                  className="border-yellow-500 text-yellow-700 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-950"
                  disabled={isTxBusy(correctDisclosure)}>
                  {t('submitCorrection')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setCorrectId(null)}>{tc('cancel')}</Button>
                <TxStatusIndicator txState={correctDisclosure.txState} />
              </div>
            </form>
          </>
        )}
      </CardContent>
      <CardFooter className="gap-3">
        <TxStatusIndicator txState={publishDraft.txState} />
        <TxStatusIndicator txState={withdrawDisclosure.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Insider Management ─────────────────────────────────────

function InsiderSection() {
  const t = useTranslations('disclosure');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const { insiders, addInsider, updateInsiderRole, removeInsider } = useDisclosure();

  const [account, setAccount] = useState('');
  const [role, setRole] = useState<InsiderRole>(InsiderRole.Admin);

  const handleAdd = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!account.trim()) return;
      addInsider.mutate([entityId, account.trim(), role]);
      setAccount('');
    },
    [entityId, account, role, addInsider],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('insiderManagement')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <LabelWithTip htmlFor="insider-account" tip={t('help.accountAddress')}>{t('accountAddress')}</LabelWithTip>
            <Input id="insider-account" value={account} onChange={(e) => setAccount(e.target.value)}
              placeholder={t('accountAddress')} className="w-64" />
          </div>
          <div className="space-y-1.5">
            <Label>{tc('role')}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as InsiderRole)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(InsiderRole).map((r) => (
                  <SelectItem key={r} value={r}>{te(`insiderRole.${r}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={isTxBusy(addInsider)}>{tc('add')}</Button>
          <TxStatusIndicator txState={addInsider.txState} />
        </form>

        {insiders.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('noInsiders')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tc('account')}</TableHead>
                <TableHead>{tc('role')}</TableHead>
                <TableHead className="text-right">{tc('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {insiders.map((ins) => (
                <TableRow key={ins.account}>
                  <TableCell><CopyableAddress address={ins.account} textClassName="text-xs" /></TableCell>
                  <TableCell>
                    <Badge variant="secondary">{te(`insiderRole.${ins.role}`)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {Object.values(InsiderRole).filter((r) => r !== ins.role).map((r) => (
                        <Button key={r} variant="ghost" size="sm"
                          onClick={() => updateInsiderRole.mutate([entityId, ins.account, r])}
                          disabled={isTxBusy(updateInsiderRole)}>
                          {t('changeRole', { role: te(`insiderRole.${r}`) })}
                        </Button>
                      ))}
                      <Button variant="destructive" size="sm"
                        onClick={() => removeInsider.mutate([entityId, ins.account])}
                        disabled={isTxBusy(removeInsider)}>
                        {tc('remove')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CardFooter className="gap-3">
        <TxStatusIndicator txState={updateInsiderRole.txState} />
        <TxStatusIndicator txState={removeInsider.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Announcement Management ────────────────────────────────

function AnnouncementSection() {
  const t = useTranslations('disclosure');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const {
    announcements,
    publishAnnouncement,
    updateAnnouncement,
    withdrawAnnouncement,
    pinAnnouncement,
    unpinAnnouncement,
  } = useDisclosure();

  const [title, setTitle] = useState('');
  const [contentCid, setContentCid] = useState('');
  const [category, setCategory] = useState<(typeof ANNOUNCEMENT_CATEGORIES)[number]>(ANNOUNCEMENT_CATEGORIES[0] as (typeof ANNOUNCEMENT_CATEGORIES)[number]);
  const [expiresAt, setExpiresAt] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCid, setEditCid] = useState('');
  const [editCategory, setEditCategory] = useState<(typeof ANNOUNCEMENT_CATEGORIES)[number] | ''>('');
  const [editExpiresAt, setEditExpiresAt] = useState('');

  const handlePublish = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim() || !contentCid.trim()) return;
      publishAnnouncement.mutate([
        entityId,
        category,
        title.trim(),
        contentCid.trim(),
        expiresAt.trim() ? Number(expiresAt) : null,
      ]);
      setTitle('');
      setContentCid('');
      setCategory(ANNOUNCEMENT_CATEGORIES[0]);
      setExpiresAt('');
    },
    [category, contentCid, entityId, expiresAt, publishAnnouncement, title],
  );

  const handleUpdate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (editId === null) return;
      updateAnnouncement.mutate([
        editId,
        editTitle.trim() || null,
        editCid.trim() || null,
        editCategory || null,
        editExpiresAt.trim() ? Number(editExpiresAt) : null,
      ]);
      setEditId(null);
      setEditTitle('');
      setEditCid('');
      setEditCategory('');
      setEditExpiresAt('');
    },
    [editCategory, editCid, editExpiresAt, editId, editTitle, updateAnnouncement],
  );

  const sorted = [...announcements].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('announcementManagement')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Publish form */}
        <form onSubmit={handlePublish} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="ann-title" tip={t('help.announcementTitle')}>{t('announcementTitle')}</LabelWithTip>
              <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('announcementTitle')} />
            </div>
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="ann-cid" tip={t('help.contentCid')}>{t('contentCid')}</LabelWithTip>
              <Input id="ann-cid" value={contentCid} onChange={(e) => setContentCid(e.target.value)} placeholder={t('contentCid')} />
            </div>
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="ann-cat" tip={t('help.categoryLabel')}>{t('categoryLabel')}</LabelWithTip>
              <Select value={category} onValueChange={(value) => setCategory(value as (typeof ANNOUNCEMENT_CATEGORIES)[number])}>
                <SelectTrigger id="ann-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANNOUNCEMENT_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <LabelWithTip htmlFor="ann-exp" tip={t('help.expiresAtBlock')}>{t('expiresAtBlock')}</LabelWithTip>
              <Input id="ann-exp" type="number" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} placeholder={t('expiresAtBlock')} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isTxBusy(publishAnnouncement)}>{t('publishAnnouncement')}</Button>
            <TxStatusIndicator txState={publishAnnouncement.txState} />
          </div>
        </form>

        <Separator />

        {/* Announcement list */}
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noAnnouncements')}</p>
        ) : (
          <div className="space-y-3">
            {sorted.map((a) => (
              <Card key={a.id} className="shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {a.isPinned && <Badge variant="warning" className="text-xs">{t('pinned')}</Badge>}
                      <span className="text-sm font-medium">{a.title}</span>
                      <Badge variant="outline" className="text-xs">{a.category}</Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm"
                        className="border-orange-500 text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950"
                        onClick={() => (a.isPinned ? unpinAnnouncement : pinAnnouncement).mutate([entityId, a.id])}
                        disabled={isTxBusy(a.isPinned ? unpinAnnouncement : pinAnnouncement)}>
                        {a.isPinned ? t('unpin') : t('pin')}
                      </Button>
                      <Button variant="secondary" size="sm"
                        onClick={() => {
                          setEditId(a.id);
                          setEditTitle(a.title);
                          setEditCid(a.contentCid);
                          setEditCategory(ANNOUNCEMENT_CATEGORIES.includes(a.category as AnnouncementCategory) ? (a.category as (typeof ANNOUNCEMENT_CATEGORIES)[number]) : '');
                          setEditExpiresAt(a.expiresAt ? String(a.expiresAt) : '');
                        }}>
                        {tc('edit')}
                      </Button>
                      <Button variant="destructive" size="sm"
                        onClick={() => withdrawAnnouncement.mutate([a.id])}
                        disabled={isTxBusy(withdrawAnnouncement)}>
                        {t('withdrawAnnouncement')}
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    CID: {a.contentCid}
                    {a.expiresAt && <> · {t('expiresAtBlockLabel', { block: a.expiresAt })}</>}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit announcement form */}
        {editId !== null && (
          <>
            <Separator />
            <form onSubmit={handleUpdate} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{t('editAnnouncement', { id: editId })}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="edit-ann-title" tip={t('help.titleLabel')}>{t('titleLabel')}</LabelWithTip>
                  <Input id="edit-ann-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder={t('titleLabel')} />
                </div>
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="edit-ann-cid" tip={t('help.contentCid')}>{t('contentCid')}</LabelWithTip>
                  <Input id="edit-ann-cid" value={editCid} onChange={(e) => setEditCid(e.target.value)} placeholder={t('contentCid')} />
                </div>
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="edit-ann-category" tip={t('help.categoryLabel')}>{t('categoryLabel')}</LabelWithTip>
                  <Select value={editCategory || '__none__'} onValueChange={(value) => setEditCategory(value === '__none__' ? '' : value as (typeof ANNOUNCEMENT_CATEGORIES)[number])}>
                    <SelectTrigger id="edit-ann-category">
                      <SelectValue placeholder={t('categoryLabel')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-</SelectItem>
                      {ANNOUNCEMENT_CATEGORIES.map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <LabelWithTip htmlFor="edit-ann-exp" tip={t('help.expiresAtBlock')}>{t('expiresAtBlock')}</LabelWithTip>
                  <Input
                    id="edit-ann-exp"
                    type="number"
                    value={editExpiresAt}
                    onChange={(e) => setEditExpiresAt(e.target.value)}
                    placeholder={t('expiresAtBlock')}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isTxBusy(updateAnnouncement)}>{t('updateAnnouncement')}</Button>
                <Button type="button" variant="ghost" onClick={() => setEditId(null)}>{tc('cancel')}</Button>
                <TxStatusIndicator txState={updateAnnouncement.txState} />
              </div>
            </form>
          </>
        )}
      </CardContent>
      <CardFooter className="gap-3">
        <TxStatusIndicator txState={pinAnnouncement.txState} />
        <TxStatusIndicator txState={unpinAnnouncement.txState} />
        <TxStatusIndicator txState={withdrawAnnouncement.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function DisclosurePage() {
  const t = useTranslations('disclosure');
  const tc = useTranslations('common');
  const { isLoading, error } = useDisclosure();

  if (isLoading) {
    return <DisclosureSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center text-sm text-destructive">
            {tc('loadFailed', { error: String(error) })}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>

      <BlackoutSection />

      <PermissionGuard required={AdminPermission.DISCLOSURE_MANAGE} fallback={null}>
        <LevelConfigSection />

        <Tabs defaultValue="disclosures">
          <TabsList>
            <TabsTrigger value="disclosures">{t('tabDisclosures')}</TabsTrigger>
            <TabsTrigger value="insiders">{t('tabInsiders')}</TabsTrigger>
            <TabsTrigger value="announcements">{t('tabAnnouncements')}</TabsTrigger>
          </TabsList>

          <TabsContent value="disclosures">
            <DisclosureListSection />
          </TabsContent>

          <TabsContent value="insiders">
            <InsiderSection />
          </TabsContent>

          <TabsContent value="announcements">
            <AnnouncementSection />
          </TabsContent>
        </Tabs>
      </PermissionGuard>
    </div>
  );
}
