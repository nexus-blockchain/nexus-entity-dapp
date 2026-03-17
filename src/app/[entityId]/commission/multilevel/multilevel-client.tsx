'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { useMultiLevelCommission } from '@/hooks/use-multi-level-commission';
import { useMembers } from '@/hooks/use-members';
import { useWalletStore } from '@/stores/wallet-store';

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

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

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
  requiredDirects: string;
  requiredTeamSize: string;
  requiredSpent: string;
  requiredLevelId: string;
}

const emptyDraft = (): DraftTier => ({ rate: '', requiredDirects: '', requiredTeamSize: '', requiredSpent: '', requiredLevelId: '0' });

function tierToParams(t: { rate: number; requiredDirects: number; requiredTeamSize: number; requiredSpent: bigint | string; requiredLevelId: number }) {
  return {
    rate: t.rate,
    requiredDirects: t.requiredDirects,
    requiredTeamSize: t.requiredTeamSize,
    requiredSpent: t.requiredSpent.toString(),
    requiredLevelId: t.requiredLevelId,
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

  const [maxTotalRate, setMaxTotalRate] = useState('');

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
      requiredDirects: String(tier.requiredDirects),
      requiredTeamSize: String(tier.requiredTeamSize),
      requiredSpent: tier.requiredSpent.toString(),
      requiredLevelId: String(tier.requiredLevelId),
    });
  };
  const handleCancelEdit = () => { setEditingIndex(null); setEditDraft(emptyDraft()); };

  // ── Update single tier via updateMultiLevelParams ──
  const handleUpdateTier = useCallback(
    () => {
      if (editingIndex === null) return;
      updateMultiLevelParams.mutate([
        entityId,
        null, // maxTotalRate: no change
        editingIndex,
        {
          rate: Number(editDraft.rate) || 0,
          requiredDirects: Number(editDraft.requiredDirects) || 0,
          requiredTeamSize: Number(editDraft.requiredTeamSize) || 0,
          requiredSpent: editDraft.requiredSpent.trim() || '0',
          requiredLevelId: Number(editDraft.requiredLevelId) || 0,
        },
      ]);
      setEditingIndex(null);
      setEditDraft(emptyDraft());
    },
    [entityId, editingIndex, editDraft, updateMultiLevelParams],
  );

  // ── Init save: setMultiLevelConfig with tiers ──
  const handleInitSave = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const levels = draftTiers
        .filter((d) => d.rate.trim())
        .map((d) => ({
          rate: Number(d.rate) || 0,
          requiredDirects: Number(d.requiredDirects) || 0,
          requiredTeamSize: Number(d.requiredTeamSize) || 0,
          requiredSpent: d.requiredSpent.trim() || '0',
          requiredLevelId: Number(d.requiredLevelId) || 0,
        }));
      if (levels.length === 0) return;
      setMultiLevelConfig.mutate([
        entityId,
        levels,
        Number(maxTotalRate) || 10000,
      ]);
    },
    [entityId, maxTotalRate, draftTiers, setMultiLevelConfig],
  );

  // ── Update maxTotalRate only (config exists) ──
  const handleUpdateConfig = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!config) return;
      setMultiLevelConfig.mutate([
        entityId,
        config.tiers.map(tierToParams),
        Number(maxTotalRate) || config.maxTotalRate,
      ]);
    },
    [entityId, maxTotalRate, config, setMultiLevelConfig],
  );

  // ── Add single tier (config exists) ──
  const handleAddTier = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTier.rate.trim()) return;
      const index = newIndex.trim() ? Number(newIndex) : tiers.length;
      addTier.mutate([
        entityId,
        index,
        {
          rate: Number(newTier.rate),
          requiredDirects: Number(newTier.requiredDirects) || 0,
          requiredTeamSize: Number(newTier.requiredTeamSize) || 0,
          requiredSpent: newTier.requiredSpent.trim() || '0',
          requiredLevelId: Number(newTier.requiredLevelId) || 0,
        },
      ]);
      setNewTier(emptyDraft());
      setNewIndex('');
    },
    [entityId, newTier, newIndex, tiers.length, addTier],
  );

  const handleClear = useCallback(() => {
    clearMultiLevelConfig.mutate([entityId]);
  }, [entityId, clearMultiLevelConfig]);

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
                <LabelWithTip htmlFor="ml-max-total-rate" tip={t('help.maxTotalRate')}>{t('maxTotalRate')}</LabelWithTip>
                <Input
                  id="ml-max-total-rate"
                  type="number"
                  value={maxTotalRate}
                  onChange={(e) => setMaxTotalRate(e.target.value)}
                  placeholder="10000"
                  className="w-48"
                />
                <p className="text-xs text-muted-foreground">{t('maxTotalRateDesc')}</p>
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
                      {i === 0 && <p className="text-xs text-muted-foreground">{t('requiredDirects')}</p>}
                      <Input
                        type="number"
                        value={draft.requiredDirects}
                        onChange={(e) => handleDraftChange(i, 'requiredDirects', e.target.value)}
                        placeholder="0"
                        className="w-24"
                      />
                    </div>
                    <div className="space-y-1">
                      {i === 0 && <p className="text-xs text-muted-foreground">{t('requiredTeamSize')}</p>}
                      <Input
                        type="number"
                        value={draft.requiredTeamSize}
                        onChange={(e) => handleDraftChange(i, 'requiredTeamSize', e.target.value)}
                        placeholder="0"
                        className="w-24"
                      />
                    </div>
                    <div className="space-y-1">
                      {i === 0 && <p className="text-xs text-muted-foreground">{t('requiredSpent')}</p>}
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={draft.requiredSpent}
                        onChange={(e) => handleDraftChange(i, 'requiredSpent', e.target.value)}
                        placeholder="0"
                        className="w-28"
                      />
                    </div>
                    <div className="space-y-1">
                      {i === 0 && <p className="text-xs text-muted-foreground">{t('requiredLevelId')}</p>}
                      <Select value={draft.requiredLevelId} onValueChange={(v) => handleDraftChange(i, 'requiredLevelId', v)}>
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
                <Button type="submit" disabled={isTxBusy(setMultiLevelConfig)}>
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
              <p className="text-xs text-muted-foreground">{t('maxTotalRate')}</p>
              <p className="text-sm font-medium">{config.maxTotalRate} {t('bps')}</p>
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
                <LabelWithTip htmlFor="ml-max-total-rate" tip={t('help.maxTotalRate')}>{t('maxTotalRate')}</LabelWithTip>
                <Input
                  id="ml-max-total-rate"
                  type="number"
                  value={maxTotalRate}
                  onChange={(e) => setMaxTotalRate(e.target.value)}
                  placeholder={String(config.maxTotalRate)}
                  className="w-48"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isTxBusy(setMultiLevelConfig)}>
                  {t('saveConfig')}
                </Button>
                <Button type="button" variant="destructive" onClick={handleClear} disabled={isTxBusy(clearMultiLevelConfig)}>
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
                  <TableHead>{t('requiredDirects')}</TableHead>
                  <TableHead>{t('requiredTeamSize')}</TableHead>
                  <TableHead>{t('requiredSpent')}</TableHead>
                  <TableHead>{t('requiredLevelId')}</TableHead>
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
                          <Input type="number" value={editDraft.requiredDirects} onChange={(e) => setEditDraft((p) => ({ ...p, requiredDirects: e.target.value }))} placeholder="0" className="w-20" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={editDraft.requiredTeamSize} onChange={(e) => setEditDraft((p) => ({ ...p, requiredTeamSize: e.target.value }))} placeholder="0" className="w-20" />
                        </TableCell>
                        <TableCell>
                          <Input type="text" inputMode="decimal" value={editDraft.requiredSpent} onChange={(e) => setEditDraft((p) => ({ ...p, requiredSpent: e.target.value }))} placeholder="0" className="w-28" />
                        </TableCell>
                        <TableCell>
                          <Select value={editDraft.requiredLevelId} onValueChange={(v) => setEditDraft((p) => ({ ...p, requiredLevelId: v }))}>
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
                              <Button size="sm" onClick={handleUpdateTier} disabled={isTxBusy(updateMultiLevelParams)}>
                                {t('updateTier')}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                                {t('cancelEdit')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => { handleCancelEdit(); removeTier.mutate([entityId, i]); }}
                                disabled={isTxBusy(removeTier)}
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
                        <TableCell>{tier.requiredDirects}</TableCell>
                        <TableCell>{tier.requiredTeamSize}</TableCell>
                        <TableCell>{formatNex(tier.requiredSpent)} USDT</TableCell>
                        <TableCell>
                          {tier.requiredLevelId === 0
                            ? t('anyLevel')
                            : (customLevels.find((lv) => lv.id === tier.requiredLevelId)?.name || `#${tier.requiredLevelId}`)}
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
                                onClick={() => removeTier.mutate([entityId, i])}
                                disabled={isTxBusy(removeTier)}
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
                  <LabelWithTip tip={t('help.requiredDirects')}>{t('requiredDirects')}</LabelWithTip>
                  <Input
                    type="number"
                    value={newTier.requiredDirects}
                    onChange={(e) => setNewTier((p) => ({ ...p, requiredDirects: e.target.value }))}
                    placeholder="0"
                    className="w-28"
                  />
                </div>
              </div>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.requiredTeamSize')}>{t('requiredTeamSize')}</LabelWithTip>
                  <Input
                    type="number"
                    value={newTier.requiredTeamSize}
                    onChange={(e) => setNewTier((p) => ({ ...p, requiredTeamSize: e.target.value }))}
                    placeholder="0"
                    className="w-28"
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.requiredSpent')}>{t('requiredSpent')}</LabelWithTip>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={newTier.requiredSpent}
                    onChange={(e) => setNewTier((p) => ({ ...p, requiredSpent: e.target.value }))}
                    placeholder="0"
                    className="w-36"
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.requiredLevelId')}>{t('requiredLevelId')}</LabelWithTip>
                  <Select value={newTier.requiredLevelId} onValueChange={(v) => setNewTier((p) => ({ ...p, requiredLevelId: v }))}>
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
                <Button type="submit" disabled={isTxBusy(addTier)}>
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
