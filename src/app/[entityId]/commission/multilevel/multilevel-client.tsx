'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { useMultiLevelCommission } from '@/hooks/use-multi-level-commission';
import { useMembers } from '@/hooks/use-members';
import { useWalletStore } from '@/stores/wallet-store';
import { isTxBusy } from '@/hooks/use-tx-lock';

import { useTranslations } from 'next-intl';
import { formatNex } from '@/lib/utils/format';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LabelWithTip } from '@/components/field-help-tip';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Loading Skeleton ───────────────────────────────────────

function MultiLevelSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-56" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Config + Tiers Section (combined) ──────────────────────

interface DraftTier {
  rate: string;
  directMin: string;
  teamMin: string;
  spentMin: string;
  levelMin: string;
}

const emptyDraft = (): DraftTier => ({ rate: '', directMin: '', teamMin: '', spentMin: '', levelMin: '0' });

function tierToParams(t: { rate: number; directMin: number; teamMin: number; spentMin: bigint | string; levelMin: number }) {
  return {
    rate: t.rate,
    direct_min: t.directMin,
    team_min: t.teamMin,
    spent_min: t.spentMin.toString(),
    level_min: t.levelMin,
  };
}

function ConfigAndTiersSection() {
  const t = useTranslations('multiLevel');
  const { entityId } = useEntityContext();
  const {
    config, setMultiLevelConfig, clearMultiLevelConfig,
    addTier, removeTier, updateMultiLevelParams,
  } = useMultiLevelCommission();
  const { customLevels } = useMembers();

  // Unified busy state: block all buttons when ANY mutation is in flight
  const isAnyBusy = isTxBusy(setMultiLevelConfig) || isTxBusy(clearMultiLevelConfig) || isTxBusy(addTier) || isTxBusy(removeTier) || isTxBusy(updateMultiLevelParams);

  const [maxLevelsDeep, setMaxLevelsDeep] = useState('');

  // For init mode: accumulate tiers locally before first save
  const [draftTiers, setDraftTiers] = useState<DraftTier[]>([emptyDraft()]);

  // For existing config: inline edit tier
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<DraftTier>(emptyDraft());

  // For existing config: single add-tier form
  const [newTier, setNewTier] = useState<DraftTier>(emptyDraft());
  const [newIndex, setNewIndex] = useState('');

  const tiers = config?.tiers ?? [];
  const isInit = !config;

  // ── Init mode: add/remove draft rows ──
  const handleDraftChange = (index: number, field: keyof DraftTier, value: string) => {
    setDraftTiers((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };
  const handleAddDraftRow = () => setDraftTiers((prev) => [...prev, emptyDraft()]);
  const handleRemoveDraftRow = (index: number) => setDraftTiers((prev) => prev.filter((_, i) => i !== index));

  // ── Start inline edit for an existing tier ──
  const handleStartEdit = (index: number) => {
    const tier = tiers[index];
    if (!tier) return;
    setEditingIndex(index);
    setEditDraft({
      rate: String(tier.rate),
      directMin: String(tier.directMin),
      teamMin: String(tier.teamMin),
      spentMin: tier.spentMin.toString(),
      levelMin: String(tier.levelMin),
    });
  };
  const handleCancelEdit = () => { setEditingIndex(null); setEditDraft(emptyDraft()); };

  // ── Update single tier via updateMultiLevelParams ──
  const handleUpdateTier = useCallback(
    () => {
      if (editingIndex === null || isAnyBusy) return;
      updateMultiLevelParams.mutate([
        entityId,
        null, // maxLevelsDeep: no change
        editingIndex,
        {
          rate: Number(editDraft.rate) || 0,
          directMin: Number(editDraft.directMin) || 0,
          teamMin: Number(editDraft.teamMin) || 0,
          spentMin: editDraft.spentMin.trim() || '0',
          levelMin: Number(editDraft.levelMin) || 0,
        },
      ]);
      setEditingIndex(null);
      setEditDraft(emptyDraft());
    },
    [entityId, editingIndex, editDraft, updateMultiLevelParams, isAnyBusy],
  );

  // ── Init save: setMultiLevelConfig with tiers ──
  const handleInitSave = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isAnyBusy) return;
      const levels = draftTiers
        .filter((d) => d.rate.trim())
        .map((d) => ({
          rate: Number(d.rate) || 0,
          directMin: Number(d.directMin) || 0,
          teamMin: Number(d.teamMin) || 0,
          spentMin: d.spentMin.trim() || '0',
          levelMin: Number(d.levelMin) || 0,
        }));
      if (levels.length === 0) return;
      setMultiLevelConfig.mutate([
        entityId,
        levels,
        Number(maxLevelsDeep) || 10000,
      ]);
    },
    [entityId, maxLevelsDeep, draftTiers, setMultiLevelConfig],
  );

  // ── Update maxLevelsDeep only (config exists) ──
  const handleUpdateConfig = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!config || isAnyBusy) return;
      setMultiLevelConfig.mutate([
        entityId,
        config.tiers.map(tierToParams),
        Number(maxLevelsDeep) || config.maxLevelsDeep,
      ]);
    },
    [entityId, maxLevelsDeep, config, setMultiLevelConfig],
  );

  // ── Add single tier (config exists) ──
  const handleAddTier = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isAnyBusy) return;
      if (!newTier.rate.trim()) return;
      const index = newIndex.trim() ? Number(newIndex) : tiers.length;
      addTier.mutate([
        entityId,
        index,
        {
          rate: Number(newTier.rate),
          directMin: Number(newTier.directMin) || 0,
          teamMin: Number(newTier.teamMin) || 0,
          spentMin: newTier.spentMin.trim() || '0',
          levelMin: Number(newTier.levelMin) || 0,
        },
      ]);
      setNewTier(emptyDraft());
      setNewIndex('');
    },
    [entityId, newTier, newIndex, tiers.length, addTier],
  );

  const handleClear = useCallback(() => {
    if (isAnyBusy) return;
    clearMultiLevelConfig.mutate([entityId]);
  }, [entityId, clearMultiLevelConfig, isAnyBusy]);

  // ── Render: init mode ──
  if (isInit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('configSection')}</CardTitle>
          <CardDescription>{t('initConfigDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={
            <p className="text-sm text-muted-foreground">{t('noConfig')}</p>
          }>
            <form onSubmit={handleInitSave} className="space-y-4">
              {/* Max total rate */}
              <div className="space-y-2">
                <LabelWithTip htmlFor="ml-max-total-rate" tip={t('help.maxLevelsDeep')}>{t('maxLevelsDeep')}</LabelWithTip>
                <Input
                  id="ml-max-total-rate"
                  type="number"
                  value={maxLevelsDeep}
                  onChange={(e) => setMaxLevelsDeep(e.target.value)}
                  placeholder="10000"
                  className="w-48"
                />
                <p className="text-xs text-muted-foreground">{t('maxLevelsDeepDesc')}</p>
              </div>

              <Separator />

              {/* Draft tiers */}
              <div className="space-y-3">
                <p className="text-sm font-medium">{t('tiersSection')}</p>
                <p className="text-xs text-muted-foreground">{t('initTiersHint')}</p>

                {draftTiers.map((draft, i) => (
                  <div key={i} className="flex items-end gap-3 flex-wrap rounded-md border p-3">
                    <div className="shrink-0 flex items-center pt-5">
                      <Badge variant="secondary">L{i}</Badge>
                    </div>
                    <div className="space-y-1">
                      {i === 0 && <p className="text-xs text-muted-foreground">{t('newTierRate')}</p>}
                      <Input
                        type="number"
                        value={draft.rate}
                        onChange={(e) => handleDraftChange(i, 'rate', e.target.value)}
                        placeholder="500"
                        className="w-24"
                      />
                    </div>
                    <div className="space-y-1">
                      {i === 0 && <p className="text-xs text-muted-foreground">{t('directMin')}</p>}
                      <Input
                        type="number"
                        value={draft.directMin}
                        onChange={(e) => handleDraftChange(i, 'directMin', e.target.value)}
                        placeholder="0"
                        className="w-24"
                      />
                    </div>
                    <div className="space-y-1">
                      {i === 0 && <p className="text-xs text-muted-foreground">{t('teamMin')}</p>}
                      <Input
                        type="number"
                        value={draft.teamMin}
                        onChange={(e) => handleDraftChange(i, 'teamMin', e.target.value)}
                        placeholder="0"
                        className="w-24"
                      />
                    </div>
                    <div className="space-y-1">
                      {i === 0 && <p className="text-xs text-muted-foreground">{t('spentMin')}</p>}
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={draft.spentMin}
                        onChange={(e) => handleDraftChange(i, 'spentMin', e.target.value)}
                        placeholder="0"
                        className="w-28"
                      />
                    </div>
                    <div className="space-y-1">
                      {i === 0 && <p className="text-xs text-muted-foreground">{t('levelMin')}</p>}
                      <Select value={draft.levelMin} onValueChange={(v) => handleDraftChange(i, 'levelMin', v)}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">{t('anyLevel')}</SelectItem>
                          {customLevels.map((lv) => (
                            <SelectItem key={lv.id} value={String(lv.id)}>{lv.name || `#${lv.id}`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {draftTiers.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => handleRemoveDraftRow(i)}>
                        {t('removeTier')}
                      </Button>
                    )}
                  </div>
                ))}

                <Button type="button" variant="outline" size="sm" onClick={handleAddDraftRow}>
                  + {t('addTier')}
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isAnyBusy}>
                  {t('saveConfig')}
                </Button>
                <TxStatusIndicator txState={setMultiLevelConfig.txState} />
              </div>
            </form>
          </PermissionGuard>
        </CardContent>
      </Card>
    );
  }

  // ── Render: config exists ──
  return (
    <>
      {/* Config card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('configSection')}</CardTitle>
          <CardDescription>{t('configSectionDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('maxLevelsDeep')}</p>
              <p className="text-sm font-medium">{config.maxLevelsDeep} {t('bps')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('tierCount')}</p>
              <p className="text-sm font-medium">{config.tiers.length}</p>
            </div>
          </div>

          <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
            <Separator className="my-4" />
            <form onSubmit={handleUpdateConfig} className="space-y-4">
              <div className="space-y-2">
                <LabelWithTip htmlFor="ml-max-total-rate" tip={t('help.maxLevelsDeep')}>{t('maxLevelsDeep')}</LabelWithTip>
                <Input
                  id="ml-max-total-rate"
                  type="number"
                  value={maxLevelsDeep}
                  onChange={(e) => setMaxLevelsDeep(e.target.value)}
                  placeholder={String(config.maxLevelsDeep)}
                  className="w-48"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isAnyBusy}>
                  {t('saveConfig')}
                </Button>
                <Button type="button" variant="destructive" onClick={handleClear} disabled={isAnyBusy}>
                  {t('clearConfig')}
                </Button>
                <TxStatusIndicator txState={setMultiLevelConfig.txState} />
                <TxStatusIndicator txState={clearMultiLevelConfig.txState} />
              </div>
            </form>
          </PermissionGuard>
        </CardContent>
      </Card>

      {/* Tiers card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('tiersSection')}</CardTitle>
          <CardDescription>{t('tiersSectionDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {tiers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('noTiers')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('tierIndex')}</TableHead>
                  <TableHead>{t('rate')}</TableHead>
                  <TableHead>{t('directMin')}</TableHead>
                  <TableHead>{t('teamMin')}</TableHead>
                  <TableHead>{t('spentMin')}</TableHead>
                  <TableHead>{t('levelMin')}</TableHead>
                  <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
                    <TableHead className="w-[120px]" />
                  </PermissionGuard>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.map((tier, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">L{i}</TableCell>
                    {editingIndex === i ? (
                      <>
                        <TableCell>
                          <Input type="number" value={editDraft.rate} onChange={(e) => setEditDraft((p) => ({ ...p, rate: e.target.value }))} className="w-24" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={editDraft.directMin} onChange={(e) => setEditDraft((p) => ({ ...p, directMin: e.target.value }))} placeholder="0" className="w-20" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={editDraft.teamMin} onChange={(e) => setEditDraft((p) => ({ ...p, teamMin: e.target.value }))} placeholder="0" className="w-20" />
                        </TableCell>
                        <TableCell>
                          <Input type="text" inputMode="decimal" value={editDraft.spentMin} onChange={(e) => setEditDraft((p) => ({ ...p, spentMin: e.target.value }))} placeholder="0" className="w-28" />
                        </TableCell>
                        <TableCell>
                          <Select value={editDraft.levelMin} onValueChange={(v) => setEditDraft((p) => ({ ...p, levelMin: v }))}>
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">{t('anyLevel')}</SelectItem>
                              {customLevels.map((lv) => (
                                <SelectItem key={lv.id} value={String(lv.id)}>{lv.name || `#${lv.id}`}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button size="sm" onClick={handleUpdateTier} disabled={isAnyBusy}>
                                {t('updateTier')}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                                {t('cancelEdit')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => { if (!isAnyBusy) { handleCancelEdit(); removeTier.mutate([entityId, i]); } }}
                                disabled={isAnyBusy}
                              >
                                {t('removeTier')}
                              </Button>
                            </div>
                          </TableCell>
                        </PermissionGuard>
                      </>
                    ) : (
                      <>
                        <TableCell>{tier.rate} {t('bps')}</TableCell>
                        <TableCell>{tier.directMin}</TableCell>
                        <TableCell>{tier.teamMin}</TableCell>
                        <TableCell>{formatNex(tier.spentMin)} USDT</TableCell>
                        <TableCell>
                          {tier.levelMin === 0
                            ? t('anyLevel')
                            : (customLevels.find((lv) => lv.id === tier.levelMin)?.name || `#${tier.levelMin}`)}
                        </TableCell>
                        <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStartEdit(i)}
                                disabled={editingIndex !== null}
                              >
                                {t('editTier')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => { if (!isAnyBusy) removeTier.mutate([entityId, i]); }}
                                disabled={isAnyBusy}
                              >
                                {t('removeTier')}
                              </Button>
                            </div>
                          </TableCell>
                        </PermissionGuard>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
            <Separator className="my-4" />
            <form onSubmit={handleAddTier} className="space-y-3">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.tierIndex')}>{t('tierIndex')}</LabelWithTip>
                  <Input
                    type="number"
                    value={newIndex}
                    onChange={(e) => setNewIndex(e.target.value)}
                    placeholder={String(tiers.length)}
                    className="w-20"
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.newTierRate')}>{t('newTierRate')}</LabelWithTip>
                  <Input
                    type="number"
                    value={newTier.rate}
                    onChange={(e) => setNewTier((p) => ({ ...p, rate: e.target.value }))}
                    className="w-28"
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.directMin')}>{t('directMin')}</LabelWithTip>
                  <Input
                    type="number"
                    value={newTier.directMin}
                    onChange={(e) => setNewTier((p) => ({ ...p, directMin: e.target.value }))}
                    placeholder="0"
                    className="w-28"
                  />
                </div>
              </div>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.teamMin')}>{t('teamMin')}</LabelWithTip>
                  <Input
                    type="number"
                    value={newTier.teamMin}
                    onChange={(e) => setNewTier((p) => ({ ...p, teamMin: e.target.value }))}
                    placeholder="0"
                    className="w-28"
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.spentMin')}>{t('spentMin')}</LabelWithTip>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={newTier.spentMin}
                    onChange={(e) => setNewTier((p) => ({ ...p, spentMin: e.target.value }))}
                    placeholder="0"
                    className="w-36"
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.levelMin')}>{t('levelMin')}</LabelWithTip>
                  <Select value={newTier.levelMin} onValueChange={(v) => setNewTier((p) => ({ ...p, levelMin: v }))}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t('anyLevel')}</SelectItem>
                      {customLevels.map((lv) => (
                        <SelectItem key={lv.id} value={String(lv.id)}>{lv.name || `#${lv.id}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={isAnyBusy}>
                  {t('addTier')}
                </Button>
              </div>
            </form>
          </PermissionGuard>
        </CardContent>
        <CardFooter className="gap-3">
          <TxStatusIndicator txState={addTier.txState} />
          <TxStatusIndicator txState={removeTier.txState} />
          <TxStatusIndicator txState={updateMultiLevelParams.txState} />
        </CardFooter>
      </Card>
    </>
  );
}

// ─── Stats Section ──────────────────────────────────────────

function StatsSection() {
  const t = useTranslations('multiLevel');
  const { stats } = useMultiLevelCommission();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('statsSection')}</CardTitle>
        <CardDescription>{t('statsSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('totalOrders')}</p>
              <p className="text-lg font-semibold">{stats?.totalOrders ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('totalDistributed')}</p>
              <p className="text-lg font-semibold">{formatNex(stats?.totalDistributed ?? BigInt(0))} NEX</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('totalDistributionEntries')}</p>
              <p className="text-lg font-semibold">{stats?.totalDistributionEntries ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Member Tree Preview ────────────────────────────────────

function MemberTreePreview() {
  const t = useTranslations('multiLevel');
  const address = useWalletStore((s) => s.address);
  const { useMemberRelation } = useMultiLevelCommission();
  const { data: relation } = useMemberRelation(address);

  if (!address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('memberPreview')}</CardTitle>
          <CardDescription>{t('connectWalletFirst')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('memberPreview')}</CardTitle>
        <CardDescription>{t('memberPreviewDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('myDepth')}</p>
              <p className="text-lg font-semibold">{relation?.depth ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('myParent')}</p>
              <p className="truncate font-mono text-sm font-medium">
                {relation?.parent ?? t('noParent')}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('myDirectReferrals')}</p>
              <p className="text-lg font-semibold">{relation?.directReferrals ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function MultiLevelPage() {
  const t = useTranslations('multiLevel');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { isLoading, error } = useMultiLevelCommission();

  if (isLoading) {
    return <MultiLevelSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="max-w-md border-destructive">
          <CardHeader className="text-center">
            <CardTitle className="text-lg text-destructive">{tc('loadFailed', { error: '' })}</CardTitle>
            <CardDescription>{String(error)}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link href={`/${entityId}/commission`}>
          <Button variant="outline" size="sm">
            {t('backToCommission')}
          </Button>
        </Link>
      </div>

      <ConfigAndTiersSection />
      <StatsSection />
      <MemberTreePreview />
    </div>
  );
}
