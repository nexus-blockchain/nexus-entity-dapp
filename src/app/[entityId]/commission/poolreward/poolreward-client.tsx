'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import type { LevelSnapshot, PoolRewardClaimRecord } from '@/lib/types/models';
import { usePoolRewardCommission } from '@/hooks/use-pool-reward-commission';
import { useMembers } from '@/hooks/use-members';
import { useCurrentBlock } from '@/hooks/use-current-block';
import { useWalletStore } from '@/stores/wallet-store';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTip } from '@/components/field-help-tip';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

/** Format chain balance (12 decimals) to human-readable string */
function formatNex(planck: bigint): string {
  const whole = planck / BigInt(1e12);
  const frac = planck % BigInt(1e12);
  if (frac === BigInt(0)) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(12, '0').replace(/0+$/, '');
  return `${whole.toLocaleString()}.${fracStr.slice(0, 4)}`;
}

/** Format ratio basis points to percentage */
function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

// ─── Loading Skeleton ───────────────────────────────────────

function PoolRewardSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-56" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
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

// ─── Level Ratio Row Type ────────────────────────────────────

interface LevelRatioRow {
  levelId: string;
  ratio: string;
}

// ─── Config Section (Admin) ─────────────────────────────────

function ConfigSection() {
  const t = useTranslations('poolReward');
  const { entityId } = useEntityContext();
  const {
    config,
    isPaused,
    isGlobalPaused,
    setPoolRewardConfig,
    clearPoolRewardConfig,
    startNewRound,
    pausePoolReward,
    resumePoolReward,
  } = usePoolRewardCommission();
  const { customLevels } = useMembers();

  // ── Local editing state ──────────────────────────────────
  const [localRatios, setLocalRatios] = useState<LevelRatioRow[]>([]);
  const [roundDuration, setRoundDuration] = useState('');
  const [formError, setFormError] = useState('');

  // Inline edit
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<LevelRatioRow>({ levelId: '', ratio: '' });

  // Adding new row
  const [isAdding, setIsAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<LevelRatioRow>({ levelId: '', ratio: '' });

  // ── Sync chain config → local state (only when not editing) ──
  useEffect(() => {
    if (config?.levelRatios && editingIndex === null && !isAdding) {
      setLocalRatios(
        config.levelRatios.map(([id, ratio]) => ({
          levelId: String(id),
          ratio: String(ratio),
        })),
      );
    } else if (!config?.levelRatios && localRatios.length === 0 && editingIndex === null && !isAdding) {
      // No chain config yet: start with one empty row for init form
      setLocalRatios([{ levelId: '', ratio: '' }]);
    }
  }, [config?.levelRatios, editingIndex, isAdding, localRatios.length]);

  // Build a map from level ID to level name for display
  const levelNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const level of customLevels) {
      map[level.id] = level.name;
    }
    return map;
  }, [customLevels]);

  // Dirty detection: compare local vs chain
  const isDirty = useMemo(() => {
    const chainRatios = config?.levelRatios ?? [];
    if (localRatios.length !== chainRatios.length) return true;
    for (let i = 0; i < localRatios.length; i++) {
      const [cId, cRatio] = chainRatios[i] ?? [0, 0];
      if (localRatios[i].levelId !== String(cId) || localRatios[i].ratio !== String(cRatio)) return true;
    }
    const chainDuration = config?.roundDuration ?? 0;
    if (roundDuration !== '' && Number(roundDuration) !== chainDuration) return true;
    return false;
  }, [localRatios, config, roundDuration]);

  // Selected level IDs (for filtering available levels)
  const selectedLevelIds = useMemo(() => {
    const ids = new Set(localRatios.map((r) => r.levelId).filter(Boolean));
    if (editingIndex !== null) {
      // When editing a row, exclude the original levelId of that row (so it can keep its own)
      // But we need the draft's value to be allowed
    }
    return ids;
  }, [localRatios, editingIndex]);

  // Ratio sum for display
  const ratioSum = useMemo(() => {
    return localRatios.reduce((s, r) => s + (Number(r.ratio) || 0), 0);
  }, [localRatios]);

  // ── Inline edit handlers ─────────────────────────────────
  const handleStartEdit = useCallback((index: number) => {
    setEditingIndex(index);
    setEditDraft({ ...localRatios[index] });
    setIsAdding(false);
    setFormError('');
  }, [localRatios]);

  const handleConfirmEdit = useCallback(() => {
    if (editingIndex === null) return;
    if (!editDraft.levelId || !editDraft.ratio || Number(editDraft.ratio) <= 0) return;
    setLocalRatios((prev) =>
      prev.map((row, i) => (i === editingIndex ? { ...editDraft } : row)),
    );
    setEditingIndex(null);
    setEditDraft({ levelId: '', ratio: '' });
  }, [editingIndex, editDraft]);

  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditDraft({ levelId: '', ratio: '' });
  }, []);

  // ── Delete row ───────────────────────────────────────────
  const handleDeleteRow = useCallback((index: number) => {
    if (localRatios.length <= 1) {
      setFormError(t('errorMinOneLevel'));
      return;
    }
    setLocalRatios((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditDraft({ levelId: '', ratio: '' });
    } else if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
  }, [localRatios.length, editingIndex, t]);

  // ── Add row ──────────────────────────────────────────────
  const handleStartAdd = useCallback(() => {
    setIsAdding(true);
    setAddDraft({ levelId: '', ratio: '' });
    setEditingIndex(null);
    setFormError('');
  }, []);

  const handleConfirmAdd = useCallback(() => {
    if (!addDraft.levelId || !addDraft.ratio || Number(addDraft.ratio) <= 0) return;
    setLocalRatios((prev) => [...prev, { ...addDraft }]);
    setIsAdding(false);
    setAddDraft({ levelId: '', ratio: '' });
  }, [addDraft]);

  const handleCancelAdd = useCallback(() => {
    setIsAdding(false);
    setAddDraft({ levelId: '', ratio: '' });
  }, []);

  // ── Cancel all changes ───────────────────────────────────
  const handleCancelChanges = useCallback(() => {
    const chainRatios = config?.levelRatios ?? [];
    setLocalRatios(
      chainRatios.map(([id, ratio]) => ({
        levelId: String(id),
        ratio: String(ratio),
      })),
    );
    setRoundDuration('');
    setEditingIndex(null);
    setIsAdding(false);
    setFormError('');
  }, [config]);

  // ── Save config ──────────────────────────────────────────
  const handleSaveConfig = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setFormError('');
      const ratios: [number, number][] = localRatios
        .filter((r) => r.levelId && r.ratio)
        .map((r) => [Number(r.levelId), Number(r.ratio)]);
      if (ratios.length === 0) {
        setFormError(t('errorNoLevelRatios'));
        return;
      }
      const sum = ratios.reduce((s, [, r]) => s + r, 0);
      if (sum !== 10000) {
        setFormError(t('errorRatioSumMismatch', { current: sum }));
        return;
      }
      const dur = Number(roundDuration) || config?.roundDuration || 0;
      if (dur <= 0) {
        setFormError(t('errorNoRoundDuration'));
        return;
      }
      setPoolRewardConfig.mutate([entityId, ratios, dur]);
    },
    [entityId, localRatios, roundDuration, config, setPoolRewardConfig, t],
  );

  // ── Pause/Resume toggle ──────────────────────────────────
  const handleToggle = useCallback(() => {
    if (config && !isPaused) {
      pausePoolReward.mutate([entityId]);
    } else if (config && isPaused) {
      resumePoolReward.mutate([entityId]);
    }
  }, [entityId, config, isPaused, pausePoolReward, resumePoolReward]);

  const isToggleBusy = isTxBusy(pausePoolReward) || isTxBusy(resumePoolReward) || isTxBusy(setPoolRewardConfig);
  const toggleTxState = config && !isPaused
    ? pausePoolReward.txState
    : config
      ? resumePoolReward.txState
      : setPoolRewardConfig.txState;

  const statusVariant = config && !isPaused && !isGlobalPaused
    ? 'default' as const
    : 'destructive' as const;
  const statusLabel = isGlobalPaused
    ? t('globalPaused')
    : config && !isPaused
      ? t('enabled')
      : isPaused
        ? t('paused')
        : t('notConfigured');

  // Available levels for add/edit (exclude already-used ones)
  const getAvailableLevels = useCallback(
    (currentLevelId?: string) => {
      return customLevels.filter(
        (level) => String(level.id) === currentLevelId || !selectedLevelIds.has(String(level.id)),
      );
    },
    [customLevels, selectedLevelIds],
  );

  const hasConfig = !!config?.levelRatios && config.levelRatios.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('configSection')}</CardTitle>
        <CardDescription>{t('configSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── Status summary ── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('enableToggle')}</p>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('levelRatios')}</p>
            <p className="font-mono text-sm font-medium">
              {config?.levelRatios?.map(([l, r]) => `Lv${l}${levelNameById[l] ? ` ${levelNameById[l]}` : ''}: ${bpsToPercent(r)}`).join(', ') || '-'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('roundDuration')}</p>
            <p className="text-sm font-medium">{config?.roundDuration ?? 0} {t('blocks')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('tokenPoolEnabled')}</p>
            <p className="text-sm font-medium">
              {config?.tokenPoolEnabled ? t('tokenPoolEnabledYes') : t('tokenPoolEnabledNo')}
            </p>
          </div>
        </div>

        <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
          <Separator className="my-4" />

          {/* ── Pause/Resume ── */}
          <div className="flex items-center gap-3">
            <Switch
              checked={!!config && !isPaused}
              onCheckedChange={handleToggle}
              disabled={isToggleBusy || !config}
            />
            <Label>
              {config && !isPaused ? t('pauseToggle') : config ? t('resumeToggle') : t('enableToggle')}
            </Label>
            <TxStatusIndicator txState={toggleTxState} />
          </div>
          {!config && (
            <p className="text-sm text-muted-foreground">{t('fillFormFirst')}</p>
          )}

          <Separator className="my-4" />

          <form onSubmit={handleSaveConfig} className="space-y-4">
            {/* ── Level ratios table ── */}
            <div className="space-y-3">
              <LabelWithTip tip={t('help.levelRatios')}>{t('levelRatios')}</LabelWithTip>

              {customLevels.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noLevelsConfigured')}</p>
              ) : hasConfig ? (
                /* ── Existing config: table with inline edit/delete ── */
                <>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-3 py-2 text-left font-medium">{t('levelId')}</th>
                          <th className="px-3 py-2 text-right font-medium">{t('ratio')} (bps)</th>
                          <th className="px-3 py-2 text-right font-medium">{t('actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {localRatios.map((row, index) => {
                          const isRowEditing = editingIndex === index;
                          if (isRowEditing) {
                            const available = getAvailableLevels(editDraft.levelId);
                            return (
                              <tr key={index} className="border-b last:border-0 bg-accent/50">
                                <td className="px-3 py-2">
                                  <Select
                                    value={editDraft.levelId}
                                    onValueChange={(v) => setEditDraft((d) => ({ ...d, levelId: v }))}
                                  >
                                    <SelectTrigger className="h-8 w-full">
                                      <SelectValue placeholder={t('selectLevel')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {available.map((level) => (
                                        <SelectItem key={level.id} value={String(level.id)}>
                                          Lv.{level.id} {level.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={10000}
                                    value={editDraft.ratio}
                                    onChange={(e) => setEditDraft((d) => ({ ...d, ratio: e.target.value }))}
                                    className="h-8 w-24 ml-auto text-right"
                                  />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button type="button" variant="ghost" size="sm" onClick={handleConfirmEdit}>
                                      {t('confirmEdit')}
                                    </Button>
                                    <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit}>
                                      {t('cancelEdit')}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={index} className="border-b last:border-0">
                              <td className="px-3 py-2">
                                <Badge variant="outline">
                                  Lv{row.levelId}{levelNameById[Number(row.levelId)] ? ` ${levelNameById[Number(row.levelId)]}` : ''}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {row.ratio} <span className="text-muted-foreground text-xs">({bpsToPercent(Number(row.ratio))})</span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleStartEdit(index)}
                                    disabled={isAdding}
                                  >
                                    {t('editRow')}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteRow(index)}
                                    disabled={isAdding || localRatios.length <= 1}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    {t('deleteRow')}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {/* ── Add row (inline) ── */}
                        {isAdding && (
                          <tr className="border-b last:border-0 bg-accent/50">
                            <td className="px-3 py-2">
                              <Select
                                value={addDraft.levelId}
                                onValueChange={(v) => setAddDraft((d) => ({ ...d, levelId: v }))}
                              >
                                <SelectTrigger className="h-8 w-full">
                                  <SelectValue placeholder={t('selectLevel')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {getAvailableLevels().map((level) => (
                                    <SelectItem key={level.id} value={String(level.id)}>
                                      Lv.{level.id} {level.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min={1}
                                max={10000}
                                value={addDraft.ratio}
                                onChange={(e) => setAddDraft((d) => ({ ...d, ratio: e.target.value }))}
                                placeholder="500"
                                className="h-8 w-24 ml-auto text-right"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button type="button" variant="ghost" size="sm" onClick={handleConfirmAdd}>
                                  {t('confirmEdit')}
                                </Button>
                                <Button type="button" variant="ghost" size="sm" onClick={handleCancelAdd}>
                                  {t('cancelEdit')}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Add button + ratio sum */}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleStartAdd}
                      disabled={isAdding || editingIndex !== null || localRatios.length >= customLevels.length}
                    >
                      {t('addLevelRatio')}
                    </Button>
                    {(() => {
                      const ok = ratioSum === 10000;
                      return (
                        <span className={`text-xs font-mono ${ok ? 'text-green-600' : 'text-orange-500'}`}>
                          {t('ratioSum')}: {ratioSum} / 10000 bps {ok ? '✓' : ''}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Dirty indicator */}
                  {isDirty && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{t('unsavedChanges')}</Badge>
                      <Button type="button" variant="ghost" size="sm" onClick={handleCancelChanges}>
                        {t('cancelChanges')}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                /* ── No config yet: init form with add rows ── */
                <>
                  {localRatios.map((row, index) => {
                    const availableLevels = customLevels.filter(
                      (level) => String(level.id) === row.levelId || !selectedLevelIds.has(String(level.id)),
                    );
                    return (
                      <div key={index} className="flex items-end gap-3">
                        <div className="flex-1 space-y-1">
                          {index === 0 && <p className="text-xs text-muted-foreground">{t('levelId')}</p>}
                          <Select value={row.levelId} onValueChange={(value) => {
                            setLocalRatios((prev) => prev.map((r, i) => i === index ? { ...r, levelId: value } : r));
                          }}>
                            <SelectTrigger>
                              <SelectValue placeholder={t('selectLevel')} />
                            </SelectTrigger>
                            <SelectContent>
                              {availableLevels.map((level) => (
                                <SelectItem key={level.id} value={String(level.id)}>
                                  Lv.{level.id} {level.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-32 space-y-1">
                          {index === 0 && <p className="text-xs text-muted-foreground">{t('ratio')} (bps)</p>}
                          <Input
                            type="number"
                            min={0}
                            max={10000}
                            value={row.ratio}
                            onChange={(e) => {
                              setLocalRatios((prev) => prev.map((r, i) => i === index ? { ...r, ratio: e.target.value } : r));
                            }}
                            placeholder="500"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setLocalRatios((prev) => prev.filter((_, i) => i !== index))}
                          disabled={localRatios.length <= 1}
                          className="shrink-0"
                        >
                          {t('removeRow')}
                        </Button>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLocalRatios((prev) => [...prev, { levelId: '', ratio: '' }])}
                      disabled={localRatios.length >= customLevels.length}
                    >
                      {t('addLevelRatio')}
                    </Button>
                    {(() => {
                      const sum = localRatios.reduce((s, r) => s + (Number(r.ratio) || 0), 0);
                      const ok = sum === 10000;
                      return (
                        <span className={`text-xs font-mono ${ok ? 'text-green-600' : 'text-orange-500'}`}>
                          {t('ratioSum')}: {sum} / 10000 bps {ok ? '✓' : ''}
                        </span>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>

            {/* ── Round duration ── */}
            <div className="max-w-xs space-y-2">
              <LabelWithTip htmlFor="pr-round-duration" tip={t('help.roundDuration')}>{t('roundDuration')}</LabelWithTip>
              <Input
                id="pr-round-duration"
                type="number"
                min={1}
                value={roundDuration}
                onChange={(e) => setRoundDuration(e.target.value)}
                placeholder={String(config?.roundDuration || 14400)}
              />
              <p className="text-xs text-muted-foreground">
                {t('roundDurationDesc')} ({t('recommended')}: 14400 ≈ 24h)
              </p>
            </div>

            {/* ── Action buttons ── */}
            <div className="flex flex-wrap items-center gap-3">
              {formError && (
                <p className="w-full text-sm text-destructive">{formError}</p>
              )}
              <Button type="submit" disabled={isTxBusy(setPoolRewardConfig) || editingIndex !== null || isAdding}>
                {t('saveConfig')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => startNewRound.mutate([entityId])}
                disabled={isTxBusy(startNewRound)}
              >
                {t('startNewRound')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => clearPoolRewardConfig.mutate([entityId])}
                disabled={isTxBusy(clearPoolRewardConfig)}
              >
                {t('clearConfig')}
              </Button>
              <TxStatusIndicator txState={setPoolRewardConfig.txState} />
              <TxStatusIndicator txState={startNewRound.txState} />
              <TxStatusIndicator txState={clearPoolRewardConfig.txState} />
            </div>
          </form>
        </PermissionGuard>
      </CardContent>
    </Card>
  );
}

// ─── Round Info + Level Snapshots ────────────────────────────

function RoundInfoSection() {
  const t = useTranslations('poolReward');
  const { currentRound, lastRoundId, config, poolBalance } = usePoolRewardCommission();
  const currentBlock = useCurrentBlock();

  const endBlock = currentRound && config
    ? currentRound.startBlock + config.roundDuration
    : 0;
  const remaining = endBlock > currentBlock ? endBlock - currentBlock : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('currentRoundInfo')}</CardTitle>
        <CardDescription>{t('currentRoundInfoDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Round overview metrics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <MetricCard label={t('roundId')} value={currentRound?.roundId ?? '-'} />
          <MetricCard label={t('startBlock')} value={currentRound ? `#${currentRound.startBlock}` : '-'} />
          <MetricCard label={t('endBlock')} value={endBlock ? `#${endBlock}` : '-'} />
          <MetricCard
            label={t('roundCountdown')}
            value={currentRound ? `${remaining}` : '-'}
            highlight={remaining > 0 && remaining < 100}
          />
          <MetricCard label={t('poolSnapshotLabel')} value={currentRound ? `${formatNex(currentRound.poolSnapshot)} NEX` : '-'} />
          <MetricCard label={t('lastRoundId')} value={lastRoundId} />
        </div>

        {/* Pool balance */}
        <div className="rounded-lg border bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">{t('poolBalanceLabel')}</p>
          <p className="text-xl font-bold">{formatNex(poolBalance)} NEX</p>
        </div>

        {/* Token pool snapshot */}
        {currentRound?.tokenPoolSnapshot != null && (
          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">{t('tokenPoolSnapshotLabel')}</p>
            <p className="text-xl font-bold">{formatNex(currentRound.tokenPoolSnapshot)} Token</p>
          </div>
        )}

        {/* NEX Level snapshots table */}
        {currentRound && currentRound.levelSnapshots.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t('levelSnapshotsTitle')}</h3>
              <p className="mb-3 text-xs text-muted-foreground">{t('levelSnapshotsDesc')}</p>
              <LevelSnapshotTable snapshots={currentRound.levelSnapshots} unit="NEX" />
            </div>
          </>
        )}

        {/* Token Level snapshots table */}
        {currentRound?.tokenLevelSnapshots && currentRound.tokenLevelSnapshots.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t('levelSnapshotsTitle')} (Token)</h3>
              <LevelSnapshotTable snapshots={currentRound.tokenLevelSnapshots} unit="Token" />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LevelSnapshotTable({ snapshots, unit }: { snapshots: LevelSnapshot[]; unit: string }) {
  const t = useTranslations('poolReward');
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="px-3 py-2 text-left font-medium">{t('levelId')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('memberCount')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('perMemberReward')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('claimedProgress')}</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((snap) => {
            const pct = snap.memberCount > 0
              ? Math.round((snap.claimedCount / snap.memberCount) * 100)
              : 0;
            return (
              <tr key={snap.levelId} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Badge variant="outline">Lv{snap.levelId}</Badge>
                </td>
                <td className="px-3 py-2 text-right font-mono">{snap.memberCount}</td>
                <td className="px-3 py-2 text-right font-mono font-medium">
                  {formatNex(snap.perMemberReward)} {unit}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Progress value={pct} className="h-2 w-16" />
                    <span className="font-mono text-xs">
                      {snap.claimedCount}/{snap.memberCount}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Stats Section ──────────────────────────────────────────

function StatsSection() {
  const t = useTranslations('poolReward');
  const { stats } = usePoolRewardCommission();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('statsSection')}</CardTitle>
        <CardDescription>{t('statsSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard
            label={t('totalNexDistributed')}
            value={`${formatNex(stats?.totalNexDistributed ?? BigInt(0))} NEX`}
          />
          <MetricCard
            label={t('totalTokenDistributed')}
            value={`${formatNex(stats?.totalTokenDistributed ?? BigInt(0))} Token`}
          />
          <MetricCard
            label={t('totalRoundsCompleted')}
            value={stats?.totalRoundsCompleted ?? 0}
          />
          <MetricCard
            label={t('totalClaims')}
            value={stats?.totalClaims ?? 0}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── My Participation + Claim ───────────────────────────────

function MyParticipationSection() {
  const t = useTranslations('poolReward');
  const { entityId } = useEntityContext();
  const address = useWalletStore((s) => s.address);
  const {
    config,
    currentRound,
    isPaused,
    isGlobalPaused,
    useLastClaimedRound,
    useClaimHistory,
    claimPoolReward,
  } = usePoolRewardCommission();

  const { data: lastClaimed } = useLastClaimedRound(address);
  const { data: claimHistory } = useClaimHistory(address);
  const lastClaimedRound = lastClaimed ?? 0;

  // Find user's effective level and claimable reward from snapshot
  const userReward = findUserReward(currentRound?.levelSnapshots ?? [], config?.levelRatios ?? []);
  const userTokenReward = findUserReward(currentRound?.tokenLevelSnapshots ?? [], config?.levelRatios ?? []);

  const canClaim =
    !!address &&
    !!currentRound &&
    currentRound.roundId > lastClaimedRound &&
    !isPaused &&
    !isGlobalPaused &&
    userReward.perMemberReward > BigInt(0);

  const alreadyClaimed = !!currentRound && currentRound.roundId <= lastClaimedRound;

  const handleClaim = useCallback(() => {
    claimPoolReward.mutate([entityId]);
  }, [entityId, claimPoolReward]);

  if (!address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('myParticipation')}</CardTitle>
          <CardDescription>{t('connectWalletFirst')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('myParticipation')}</CardTitle>
        <CardDescription>{t('myParticipationDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Claim status cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard
            label={t('lastClaimedRound')}
            value={lastClaimedRound || '-'}
          />
          <MetricCard
            label={t('yourReward')}
            value={currentRound
              ? `${formatNex(userReward.perMemberReward)} NEX`
              : '-'}
          />
          {currentRound?.tokenLevelSnapshots && (
            <MetricCard
              label={t('yourTokenReward')}
              value={`${formatNex(userTokenReward.perMemberReward)} Token`}
            />
          )}
        </div>

        <Separator />

        {/* Claim button */}
        <div className="flex items-center gap-3">
          <Button
            onClick={handleClaim}
            disabled={!canClaim || isTxBusy(claimPoolReward)}
            size="lg"
          >
            {isTxBusy(claimPoolReward) ? t('claimingReward') : t('claimReward')}
          </Button>
          <TxStatusIndicator txState={claimPoolReward.txState} />

          {!canClaim && address && (
            <p className="text-sm text-muted-foreground">
              {isPaused || isGlobalPaused
                ? t('paused')
                : alreadyClaimed
                  ? t('alreadyClaimedThisRound')
                  : !currentRound
                    ? t('noActiveRound')
                    : t('nothingToClaim')}
            </p>
          )}
          {canClaim && (
            <p className="text-sm font-medium text-green-600">{t('claimAvailable')}</p>
          )}
        </div>

        {/* Claim history */}
        {claimHistory && claimHistory.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t('claimHistoryTitle')}</h3>
              <p className="mb-3 text-xs text-muted-foreground">{t('claimHistoryDesc')}</p>
              <ClaimHistoryTable records={claimHistory} />
            </div>
          </>
        )}
        {claimHistory && claimHistory.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('claimHistoryEmpty')}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Find the first matching level snapshot (simplistic: use first available level) */
function findUserReward(
  snapshots: LevelSnapshot[],
  _levelRatios: [number, number][],
): { perMemberReward: bigint; levelId: number } {
  // Without runtime API call, we can't determine the user's effective level client-side.
  // We display all levels in the table; the user knows their level.
  // For the summary card, pick the first non-zero snapshot as an indicator,
  // or return zero if empty (user must check the level table).
  if (snapshots.length === 0) return { perMemberReward: BigInt(0), levelId: 0 };
  // Show the lowest level's reward as a baseline indicator
  const first = snapshots[0];
  return {
    perMemberReward: first?.perMemberReward ?? BigInt(0),
    levelId: first?.levelId ?? 0,
  };
}

function ClaimHistoryTable({ records }: { records: PoolRewardClaimRecord[] }) {
  const t = useTranslations('poolReward');
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="px-3 py-2 text-left font-medium">{t('claimRound')}</th>
            <th className="px-3 py-2 text-left font-medium">{t('claimLevel')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('claimAmount')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('claimTokenAmount')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('claimBlock')}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec, i) => (
            <tr key={`${rec.roundId}-${i}`} className="border-b last:border-0">
              <td className="px-3 py-2 font-mono">#{rec.roundId}</td>
              <td className="px-3 py-2">
                <Badge variant="outline">Lv{rec.levelId}</Badge>
              </td>
              <td className="px-3 py-2 text-right font-mono">{formatNex(rec.amount)} NEX</td>
              <td className="px-3 py-2 text-right font-mono">
                {rec.tokenAmount > BigInt(0) ? `${formatNex(rec.tokenAmount)} Token` : '-'}
              </td>
              <td className="px-3 py-2 text-right font-mono">#{rec.claimedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? 'text-orange-500' : ''}`}>
        {String(value)}
      </p>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function PoolRewardPage() {
  const t = useTranslations('poolReward');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { isLoading, error } = usePoolRewardCommission();

  if (isLoading) return <PoolRewardSkeleton />;

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
          <Button variant="outline" size="sm">{t('backToCommission')}</Button>
        </Link>
      </div>

      <MyParticipationSection />
      <RoundInfoSection />
      <StatsSection />
      <ConfigSection />
    </div>
  );
}
