'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import type { LevelSnapshot, PoolRewardClaimRecord, CapBehavior, AdminLevelRuleInfo, CompletedRoundSummary, PoolFundingRecord, PoolRewardMemberView } from '@/lib/types/models';
import { usePoolRewardCommission } from '@/hooks/use-pool-reward-commission';
import { useMembers } from '@/hooks/use-members';
import { useCurrentBlock } from '@/hooks/use-current-block';
import { useWalletStore } from '@/stores/wallet-store';
import { useTxLock, isTxBusy } from '@/hooks/use-tx-lock';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
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

/** Format chain balance (12 decimals) to human-readable string */
function formatNex(planck: bigint): string {
  const whole = planck / BigInt(1e12);
  const frac = planck % BigInt(1e12);
  if (frac === BigInt(0)) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(12, '0').replace(/0+$/, '');
  return `${whole.toLocaleString()}.${fracStr.slice(0, 4)}`;
}

/** Format baseCapPercent basis points to percentage */
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

// ─── Level Rule Row Type ─────────────────────────────────────

interface LevelRuleRow {
  levelId: string;
  baseCapPercent: string;
  behaviorType: CapBehavior['type'];
  directPerUnlock: string;
  teamPerUnlock: string;
  unlockPercent: string;
  baselineDirect: string;
  baselineTeam: string;
}

const emptyRuleRow = (): LevelRuleRow => ({
  levelId: '',
  baseCapPercent: '',
  behaviorType: 'Fixed',
  directPerUnlock: '',
  teamPerUnlock: '',
  unlockPercent: '',
  baselineDirect: '',
  baselineTeam: '',
});

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
    pausePoolReward,
    resumePoolReward,
  } = usePoolRewardCommission();
  const { customLevels } = useMembers();
  const { isLocked, setLocked } = useTxLock();

  // ── Local editing state ──────────────────────────────────
  const [localRules, setLocalRules] = useState<LevelRuleRow[]>([]);
  const [roundDuration, setRoundDuration] = useState('');
  const [formError, setFormError] = useState('');

  // Track local mutations to drive the tx lock
  const localBusy = isTxBusy(setPoolRewardConfig) || isTxBusy(clearPoolRewardConfig) || isTxBusy(pausePoolReward) || isTxBusy(resumePoolReward);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  // ── Track whether user has manually edited (to prevent sync overwrite) ──
  const [userEdited, setUserEdited] = useState(false);

  // ── Sync chain config → local state ──
  // Only sync from chain when user hasn't made manual edits.
  // The initial load (localRules empty + chain has data) must always sync.
  useEffect(() => {
    if (config?.levelRules) {
      if (!userEdited) {
        setLocalRules(
          config.levelRules.map(([id, rule]) => ({
            levelId: String(id),
            baseCapPercent: String(rule.baseCapPercent),
            behaviorType: rule.capBehavior.type,
            directPerUnlock: rule.capBehavior.type === 'UnlockByTeam' ? String(rule.capBehavior.directPerUnlock) : '',
            teamPerUnlock: rule.capBehavior.type === 'UnlockByTeam' ? String(rule.capBehavior.teamPerUnlock) : '',
            unlockPercent: rule.capBehavior.type === 'UnlockByTeam' ? String(rule.capBehavior.unlockPercent) : '',
            baselineDirect: rule.capBehavior.type === 'UnlockByTeam' ? String(rule.capBehavior.baselineDirect) : '',
            baselineTeam: rule.capBehavior.type === 'UnlockByTeam' ? String(rule.capBehavior.baselineTeam) : '',
          })),
        );
      }
    } else if (localRules.length === 0) {
      setLocalRules([emptyRuleRow()]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.levelRules]);

  // Compute isDirty for UI display (unsaved badge, cancel button)
  const isDirty = useMemo(() => {
    if (!userEdited) return false;
    const chainRules = config?.levelRules ?? [];
    if (localRules.length !== chainRules.length) return true;
    for (let i = 0; i < localRules.length; i++) {
      const local = localRules[i];
      const [cId, cRule] = chainRules[i] ?? [0, { baseCapPercent: 0, capBehavior: { type: 'Fixed' as const } }];
      if (local.levelId !== String(cId)) return true;
      if (local.baseCapPercent !== String(cRule.baseCapPercent ?? 0)) return true;
      if (local.behaviorType !== cRule.capBehavior.type) return true;
      if (local.behaviorType === 'UnlockByTeam' && cRule.capBehavior.type === 'UnlockByTeam') {
        if (local.directPerUnlock !== String(cRule.capBehavior.directPerUnlock ?? 0)) return true;
        if (local.teamPerUnlock !== String(cRule.capBehavior.teamPerUnlock ?? 0)) return true;
        if (local.unlockPercent !== String(cRule.capBehavior.unlockPercent ?? 0)) return true;
        if (local.baselineDirect !== String(cRule.capBehavior.baselineDirect ?? 0)) return true;
        if (local.baselineTeam !== String(cRule.capBehavior.baselineTeam ?? 0)) return true;
      }
    }
    const chainDuration = config?.roundDuration ?? 0;
    if (roundDuration !== '' && Number(roundDuration) !== chainDuration) return true;
    return false;
  }, [userEdited, localRules, config, roundDuration]);

  // Build a map from level ID to level name for display
  const levelNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const level of customLevels) {
      map[level.id] = level.name;
    }
    return map;
  }, [customLevels]);

  // Selected level IDs (for filtering available levels in each row's dropdown)
  const getAvailableLevels = useCallback(
    (currentLevelId: string) => {
      const usedIds = new Set(localRules.map((r) => r.levelId).filter(Boolean));
      return customLevels.filter(
        (level) => String(level.id) === currentLevelId || !usedIds.has(String(level.id)),
      );
    },
    [customLevels, localRules],
  );


  // ── Row handlers ───────────────────────────────────────────
  const handleRowChange = useCallback((index: number, field: keyof LevelRuleRow, value: string) => {
    setUserEdited(true);
    setLocalRules((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }, []);

  const handleDeleteRow = useCallback((index: number) => {
    if (localRules.length <= 1) {
      setFormError(t('errorMinOneLevel'));
      return;
    }
    setUserEdited(true);
    setLocalRules((prev) => prev.filter((_, i) => i !== index));
  }, [localRules.length, t]);

  const handleAddRow = useCallback(() => {
    setUserEdited(true);
    setLocalRules((prev) => [...prev, emptyRuleRow()]);
  }, []);

  // ── Cancel all changes ───────────────────────────────────
  const handleCancelChanges = useCallback(() => {
    const chainRules = config?.levelRules ?? [];
    setLocalRules(
      chainRules.length > 0
        ? chainRules.map(([id, rule]) => ({
            levelId: String(id),
            baseCapPercent: String(rule.baseCapPercent),
            behaviorType: rule.capBehavior.type,
            directPerUnlock: rule.capBehavior.type === 'UnlockByTeam' ? String(rule.capBehavior.directPerUnlock) : '',
            teamPerUnlock: rule.capBehavior.type === 'UnlockByTeam' ? String(rule.capBehavior.teamPerUnlock) : '',
            unlockPercent: rule.capBehavior.type === 'UnlockByTeam' ? String(rule.capBehavior.unlockPercent) : '',
            baselineDirect: rule.capBehavior.type === 'UnlockByTeam' ? String(rule.capBehavior.baselineDirect) : '',
            baselineTeam: rule.capBehavior.type === 'UnlockByTeam' ? String(rule.capBehavior.baselineTeam) : '',
          }))
        : [emptyRuleRow()],
    );
    setRoundDuration('');
    setFormError('');
    setUserEdited(false);
  }, [config]);

  // ── Save config (unified submit) ──────────────────────────
  const handleSaveConfig = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked) return;
      setFormError('');
      const levelRules = localRules
        .filter((r) => r.levelId && r.baseCapPercent)
        .map((r) => [
          Number(r.levelId),
          {
            base_cap_percent: Number(r.baseCapPercent),
            cap_behavior: r.behaviorType === 'UnlockByTeam'
              ? {
                  UnlockByTeam: {
                    direct_per_unlock: Number(r.directPerUnlock) || 0,
                    team_per_unlock: Number(r.teamPerUnlock) || 0,
                    unlock_percent: Number(r.unlockPercent) || 0,
                  },
                }
              : 'Fixed',
            baseline_direct: r.behaviorType === 'UnlockByTeam' ? (Number(r.baselineDirect) || 0) : 0,
            baseline_team: r.behaviorType === 'UnlockByTeam' ? (Number(r.baselineTeam) || 0) : 0,
          },
        ] as const);
      if (levelRules.length === 0) {
        setFormError(t('errorNoLevelRules'));
        return;
      }
      // Validate each rule individually: 1–10000 bps
      for (const [levelId, rule] of levelRules) {
        if (rule.base_cap_percent < 1 || rule.base_cap_percent > 10000) {
          setFormError(t('errorInvalidCapPercent', { level: levelId }));
          return;
        }
        if (typeof rule.cap_behavior === 'object' && 'UnlockByTeam' in rule.cap_behavior) {
          const u = rule.cap_behavior.UnlockByTeam;
          if (!u.direct_per_unlock || !u.team_per_unlock || !u.unlock_percent) {
            setFormError(t('errorUnlockFieldsRequired', { level: levelId }));
            return;
          }
          if (u.unlock_percent > 10000) {
            setFormError(t('errorInvalidCapPercent', { level: levelId }));
            return;
          }
        }
      }
      const dur = Number(roundDuration) || config?.roundDuration || 0;
      if (dur <= 0) {
        setFormError(t('errorNoRoundDuration'));
        return;
      }
      setPoolRewardConfig.mutate([entityId, levelRules, dur]);
      setUserEdited(false);
    },
    [entityId, localRules, roundDuration, config, setPoolRewardConfig, t, isLocked],
  );

  // ── Pause/Resume toggle ──────────────────────────────────
  const handleToggle = useCallback(() => {
    if (isLocked) return;
    if (config && !isPaused) {
      pausePoolReward.mutate([entityId]);
    } else if (config && isPaused) {
      resumePoolReward.mutate([entityId]);
    }
  }, [entityId, config, isPaused, pausePoolReward, resumePoolReward, isLocked]);

  const isToggleBusy = isLocked;
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
            <p className="text-xs text-muted-foreground">{t('levelRules')}</p>
            <p className="font-mono text-sm font-medium">
              {config?.levelRules?.map(([l, rule]) => {
                const behavior = rule.capBehavior.type === 'UnlockByTeam'
                  ? `UnlockByTeam +${bpsToPercent(rule.capBehavior.unlockPercent)}`
                  : 'Fixed';
                return `Lv${l}${levelNameById[l] ? ` ${levelNameById[l]}` : ''}: ${bpsToPercent(rule.baseCapPercent)} (${behavior})`;
              }).join(', ') || '-'}
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
            {/* ── Level rules (Fixed cap only for now) ── */}
            <div className="space-y-3">
              <LabelWithTip tip={t('help.levelRules')}>{t('levelRules')}</LabelWithTip>

              {customLevels.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noLevelsConfigured')}</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-3 py-2 text-left font-medium">{t('levelId')}</th>
                          <th className="px-3 py-2 text-right font-medium">{t('baseCapPercent')} (bps)</th>
                          <th className="px-3 py-2 text-left font-medium">{t('capBehavior')}</th>
                          <th className="px-3 py-2 text-right font-medium">{t('actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {localRules.map((row, index) => {
                          const available = getAvailableLevels(row.levelId);
                          return (
                            <tr key={index} className="border-b last:border-0">
                              <td className="px-3 py-2">
                                <Select
                                  value={row.levelId}
                                  onValueChange={(v) => handleRowChange(index, 'levelId', v)}
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
                                  value={row.baseCapPercent}
                                  onChange={(e) => handleRowChange(index, 'baseCapPercent', e.target.value)}
                                  placeholder="500"
                                  className="h-8 w-24 ml-auto text-right"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="space-y-2">
                                  <Select value={row.behaviorType} onValueChange={(v) => handleRowChange(index, 'behaviorType', v)}>
                                    <SelectTrigger className="h-8 w-[180px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Fixed">{t('capBehaviorFixed')}</SelectItem>
                                      <SelectItem value="UnlockByTeam">{t('capBehaviorUnlockByTeam')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {row.behaviorType === 'UnlockByTeam' && (
                                    <div className="space-y-2">
                                      <div className="grid grid-cols-3 gap-2">
                                        <div className="space-y-1">
                                          <Label className="text-xs text-muted-foreground">{t('directPerUnlock')}</Label>
                                          <Input type="number" min={1} placeholder="1" value={row.directPerUnlock} onChange={(e) => handleRowChange(index, 'directPerUnlock', e.target.value)} />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs text-muted-foreground">{t('teamPerUnlock')}</Label>
                                          <Input type="number" min={1} placeholder="1" value={row.teamPerUnlock} onChange={(e) => handleRowChange(index, 'teamPerUnlock', e.target.value)} />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs text-muted-foreground">{t('unlockPercent')}</Label>
                                          <Input type="number" min={1} max={10000} placeholder="500" value={row.unlockPercent} onChange={(e) => handleRowChange(index, 'unlockPercent', e.target.value)} />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                          <Label className="text-xs text-muted-foreground">{t('baselineDirect')}</Label>
                                          <Input type="number" min={0} placeholder="0" value={row.baselineDirect} onChange={(e) => handleRowChange(index, 'baselineDirect', e.target.value)} />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs text-muted-foreground">{t('baselineTeam')}</Label>
                                          <Input type="number" min={0} placeholder="0" value={row.baselineTeam} onChange={(e) => handleRowChange(index, 'baselineTeam', e.target.value)} />
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteRow(index)}
                                  disabled={localRules.length <= 1}
                                  className="text-destructive hover:text-destructive"
                                >
                                  {t('deleteRow')}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Add button + baseCapPercent sum */}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddRow}
                      disabled={localRules.length >= customLevels.length}
                    >
                      {t('addLevelRule')}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {t('capPercentHint')}
                    </span>
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
                onChange={(e) => { setUserEdited(true); setRoundDuration(e.target.value); }}
                placeholder={String(config?.roundDuration || 14400)}
              />
              <p className="text-xs text-muted-foreground">
                {t('roundDurationDesc')} ({t('recommended')}: 14400 ≈ 24h)
              </p>
            </div>

            {/* ── Dirty indicator + action buttons ── */}
            {isDirty && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{t('unsavedChanges')}</Badge>
                <Button type="button" variant="ghost" size="sm" onClick={handleCancelChanges}>
                  {t('cancelChanges')}
                </Button>
              </div>
            )}

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isLocked}>
                {t('saveConfig')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => { if (!isLocked) clearPoolRewardConfig.mutate([entityId]); }}
                disabled={isLocked}
              >
                {t('clearConfig')}
              </Button>
              <TxStatusIndicator txState={setPoolRewardConfig.txState} />
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

  const endBlock = currentRound?.endBlock
    ?? (currentRound && config ? currentRound.startBlock + config.roundDuration : 0);
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
            subValue={remaining > 0 ? blocksToTime(remaining) : undefined}
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
              <LevelSnapshotTable snapshots={currentRound.levelSnapshots} unit="NEX" perMemberReward={currentRound.perMemberReward} />
            </div>
          </>
        )}

        {/* Token Level snapshots table */}
        {currentRound?.tokenLevelSnapshots && currentRound.tokenLevelSnapshots.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t('levelSnapshotsTitle')} (Token)</h3>
              <LevelSnapshotTable snapshots={currentRound.tokenLevelSnapshots} unit="Token" perMemberReward={currentRound.tokenPerMemberReward} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LevelSnapshotTable({ snapshots, unit, perMemberReward }: { snapshots: LevelSnapshot[]; unit: string; perMemberReward?: bigint | null }) {
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
                  {formatNex(perMemberReward ?? BigInt(0))} {unit}
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
  const { isLocked, setLocked } = useTxLock();

  const localBusy = isTxBusy(claimPoolReward);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  const { data: lastClaimed } = useLastClaimedRound(address);
  const { data: claimHistory } = useClaimHistory(address);
  const lastClaimedRound = lastClaimed ?? 0;

  // Find user's effective level and claimable reward from snapshot
  const userReward = findUserReward(currentRound?.levelSnapshots ?? []);
  const userTokenReward = findUserReward(currentRound?.tokenLevelSnapshots ?? []);

  const canClaim =
    !!address &&
    !!currentRound &&
    currentRound.roundId > lastClaimedRound &&
    !isPaused &&
    !isGlobalPaused &&
    userReward.perMemberReward > BigInt(0);

  const alreadyClaimed = !!currentRound && currentRound.roundId <= lastClaimedRound;

  const handleClaim = useCallback(() => {
    if (isLocked) return;
    claimPoolReward.mutate([entityId]);
  }, [entityId, claimPoolReward, isLocked]);

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
            disabled={!canClaim || isLocked}
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
): { perMemberReward: bigint; levelId: number } {
  if (snapshots.length === 0) return { perMemberReward: BigInt(0), levelId: 0 };
  const first = snapshots[0];
  return {
    perMemberReward: BigInt(0),
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
  subValue,
  highlight,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? 'text-orange-500' : ''}`}>
        {String(value)}
      </p>
      {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
    </div>
  );
}

/** Convert remaining blocks to approximate time string (6s per block) */
function blocksToTime(blocks: number): string {
  const totalSeconds = blocks * 6;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `~${hours}h ${minutes}m`;
  return `~${Math.max(1, minutes)}m`;
}

// ─── My Cap & Unlock Progress ───────────────────────────────

/** Format USDT value (stored as integer cents or raw u128, assume 1:1 integer = 1 USDT for display) */
function formatUsdt(value: bigint): string {
  return value.toLocaleString();
}

function MyCapProgressSection() {
  const t = useTranslations('poolReward');
  const address = useWalletStore((s) => s.address);
  const { memberView } = usePoolRewardCommission();
  const { customLevels } = useMembers();

  const levelNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const level of customLevels) map[level.id] = level.name;
    return map;
  }, [customLevels]);

  if (!address || !memberView) {
    return null;
  }

  const { memberStats, capInfo } = memberView;
  const isUnlockByTeam = capInfo.unlockPercent != null;
  const capUsedPct = capInfo.currentCapUsdt > BigInt(0)
    ? Number((capInfo.cumulativeClaimedUsdt * BigInt(10000)) / capInfo.currentCapUsdt) / 100
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('myCapProgress')}</CardTitle>
        <CardDescription>{t('myCapProgressDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Member Stats ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard
            label={t('effectiveLevelLabel')}
            value={`Lv${memberView.effectiveLevel}${levelNameById[memberView.effectiveLevel] ? ` ${levelNameById[memberView.effectiveLevel]}` : ''}`}
          />
          <MetricCard label={t('memberStatsDirect')} value={memberStats.directCount} />
          <MetricCard label={t('memberStatsTeam')} value={memberStats.teamCount} />
          <MetricCard label={t('memberStatsTotalSpent')} value={formatUsdt(memberStats.totalSpent)} />
        </div>

        <Separator />

        {/* ── Cap Overview ── */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            {capInfo.isCapped && (
              <Badge variant="destructive">{t('capReached')}</Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {t('capProgressLabel', { pct: capUsedPct.toFixed(1) })}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mb-4">
            <Progress value={Math.min(capUsedPct, 100)} className="h-3" />
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{formatUsdt(capInfo.cumulativeClaimedUsdt)} USDT</span>
              <span>{formatUsdt(capInfo.currentCapUsdt)} USDT</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricCard label={t('cumulativeClaimed')} value={formatUsdt(capInfo.cumulativeClaimedUsdt)} />
            <MetricCard label={t('currentCap')} value={formatUsdt(capInfo.currentCapUsdt)} />
            <MetricCard
              label={t('remainingCap')}
              value={formatUsdt(capInfo.remainingCapUsdt)}
              highlight={capInfo.isCapped}
            />
          </div>
        </div>

        <Separator />

        {/* ── Cap Breakdown ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t('baseCap')}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{t('baseCap')}</p>
              <p className="text-lg font-semibold">{formatUsdt(capInfo.baseCapUsdt)}</p>
              <p className="text-xs text-muted-foreground">
                {t('baseCapFormula', { percent: bpsToPercent(capInfo.baseCapPercent) })}
              </p>
            </div>

            {isUnlockByTeam && capInfo.unlockAmountPerStepUsdt != null && (
              <>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{t('unlockProgress')}</p>
                  <p className="text-lg font-semibold">{t('unlockCountLabel', { count: capInfo.unlockCount })}</p>
                  <p className="text-xs text-muted-foreground">
                    +{bpsToPercent(capInfo.unlockPercent!)} / {t('unlockAmountPerStep')}: {formatUsdt(capInfo.unlockAmountPerStepUsdt)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{t('totalUnlocked')}</p>
                  <p className="text-lg font-semibold">
                    {formatUsdt(capInfo.unlockAmountPerStepUsdt * BigInt(capInfo.unlockCount))}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Baseline info */}
          {isUnlockByTeam && memberView.levelRuleDetails.length > 0 && (() => {
            const rule = memberView.levelRuleDetails.find((r) => r.levelId === memberView.effectiveLevel);
            if (!rule || rule.capBehavior.type !== 'UnlockByTeam') return null;
            const cb = rule.capBehavior;
            if (!cb.baselineDirect && !cb.baselineTeam) return null;
            return (
              <p className="text-xs text-muted-foreground">
                {t('baselineInfo', { direct: cb.baselineDirect, team: cb.baselineTeam })}
              </p>
            );
          })()}

          {!isUnlockByTeam && (
            <p className="text-sm text-muted-foreground">
              {t('capBehaviorFixedDesc', { percent: bpsToPercent(capInfo.baseCapPercent) })}
            </p>
          )}
        </div>

        {/* ── Next Unlock Requirements ── */}
        {isUnlockByTeam && capInfo.nextDirectGap != null && capInfo.nextTeamGap != null && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t('nextUnlockRequirement')}</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                  <p className="text-xs text-muted-foreground">{t('memberStatsDirect')}</p>
                  <p className="text-sm font-medium">
                    {capInfo.nextDirectGap > 0
                      ? t('nextUnlockDirect', { gap: capInfo.nextDirectGap })
                      : <Badge variant="secondary" className="text-xs">OK</Badge>}
                  </p>
                </div>
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                  <p className="text-xs text-muted-foreground">{t('memberStatsTeam')}</p>
                  <p className="text-sm font-medium">
                    {capInfo.nextTeamGap > 0
                      ? t('nextUnlockTeam', { gap: capInfo.nextTeamGap })
                      : <Badge variant="secondary" className="text-xs">OK</Badge>}
                  </p>
                </div>
                {capInfo.nextUnlockIncreaseUsdt != null && (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                    <p className="text-xs text-muted-foreground">{t('nextUnlockReward', { amount: formatUsdt(capInfo.nextUnlockIncreaseUsdt) })}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── How to Increase ── */}
        <Separator />
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t('howToIncrease')}</h3>
          <p className="text-sm text-muted-foreground">
            {capInfo.isCapped ? t('capReachedDesc') : t('capNotReachedDesc')}
          </p>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>{t('increaseBySpending')}</li>
            {isUnlockByTeam && (() => {
              const rule = memberView.levelRuleDetails.find((r) => r.levelId === memberView.effectiveLevel);
              if (!rule || rule.capBehavior.type !== 'UnlockByTeam') return null;
              return (
                <li>{t('increaseByTeam', { direct: rule.capBehavior.directPerUnlock, team: rule.capBehavior.teamPerUnlock })}</li>
              );
            })()}
            <li>{t('increaseByLevel')}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Admin Overview (Level Rules + Capped Counts + Pool Balances) ────

function AdminOverviewSection() {
  const t = useTranslations('poolReward');
  const { adminView } = usePoolRewardCommission();
  const currentBlock = useCurrentBlock();
  const { customLevels } = useMembers();

  const levelNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const level of customLevels) map[level.id] = level.name;
    return map;
  }, [customLevels]);

  if (!adminView) return null;

  const deficit = adminView.tokenPoolDeficit;
  const hasDeficit = deficit > BigInt(0);
  const pending = adminView.pendingConfig;
  const pendingRemaining = pending && currentBlock ? Math.max(0, pending.applyAfter - currentBlock) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('adminOverview')}</CardTitle>
        <CardDescription>{t('adminOverviewDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pool balances */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label={t('currentNexPool')} value={`${formatNex(adminView.currentPoolBalance)} NEX`} />
          <MetricCard label={t('currentTokenPool')} value={`${formatNex(adminView.currentTokenPoolBalance)} Token`} />
          <MetricCard label={t('totalNexDistributed')} value={`${formatNex(adminView.totalNexDistributed)} NEX`} />
          <MetricCard label={t('totalTokenDistributed')} value={`${formatNex(adminView.totalTokenDistributed)} Token`} />
          <MetricCard label={t('totalRoundsCompleted')} value={adminView.totalRoundsCompleted} />
          <MetricCard label={t('totalClaims')} value={adminView.totalClaims} />
        </div>

        {/* Token deficit warning */}
        {hasDeficit && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
            <p className="text-sm font-medium text-destructive">{t('tokenDeficitWarning')}</p>
            <p className="text-lg font-bold text-destructive">{formatNex(deficit)} Token</p>
            <p className="text-xs text-muted-foreground">{t('tokenDeficitHint')}</p>
          </div>
        )}

        {/* Level rules table with member counts + capped counts */}
        {adminView.levelRuleDetails.length > 0 && (
          <>
            <Separator />
            <h3 className="text-sm font-semibold">{t('levelRulesWithCounts')}</h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-2 text-left font-medium">{t('levelId')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('baseCapPercent')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('capBehavior')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('memberCount')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('cappedCount')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('cappedRatio')}</th>
                  </tr>
                </thead>
                <tbody>
                  {adminView.levelRuleDetails.map((rule) => {
                    const capPct = rule.memberCount > 0
                      ? Math.round((rule.cappedMemberCount / rule.memberCount) * 100)
                      : 0;
                    return (
                      <tr key={rule.levelId} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <Badge variant="outline">
                            Lv{rule.levelId}
                            {levelNameById[rule.levelId] ? ` ${levelNameById[rule.levelId]}` : ''}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{bpsToPercent(rule.baseCapPercent)}</td>
                        <td className="px-3 py-2 text-xs">
                          {rule.capBehavior.type === 'Fixed'
                            ? t('capBehaviorFixed')
                            : `${t('capBehaviorUnlockByTeam')} +${bpsToPercent(rule.capBehavior.unlockPercent)}${rule.capBehavior.baselineDirect || rule.capBehavior.baselineTeam ? ` (${t('baseline')}: ${rule.capBehavior.baselineDirect}/${rule.capBehavior.baselineTeam})` : ''}`}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{rule.memberCount}</td>
                        <td className="px-3 py-2 text-right font-mono">{rule.cappedMemberCount}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress value={capPct} className="h-2 w-12" />
                            <span className="font-mono text-xs">{capPct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pending config */}
        {pending && (
          <>
            <Separator />
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{t('pendingConfig')}</Badge>
                {pendingRemaining > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {t('pendingApplyIn', { blocks: pendingRemaining })} ({blocksToTime(pendingRemaining)})
                  </span>
                )}
              </div>
              <p className="text-sm">
                {t('pendingRoundDuration')}: {pending.roundDuration} {t('blocks')}
              </p>
              <p className="text-sm">
                {t('pendingLevels')}: {pending.levelRules.map(([l, cap]) => `Lv${l}: ${bpsToPercent(cap)}`).join(', ')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('pendingApplyAfterBlock', { block: pending.applyAfter })}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Round History Section ───────────────────────────────

function RoundHistorySection() {
  const t = useTranslations('poolReward');
  const { adminView } = usePoolRewardCommission();
  const { customLevels } = useMembers();

  const levelNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const level of customLevels) map[level.id] = level.name;
    return map;
  }, [customLevels]);

  const sortedHistory = useMemo(() => {
    if (!adminView?.roundHistory?.length) return [];
    return [...adminView.roundHistory].reverse();
  }, [adminView]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{t('roundHistoryTitle')}</CardTitle>
            <CardDescription>{t('roundHistoryDesc')}</CardDescription>
          </div>
          {sortedHistory.length > 0 && (
            <Badge variant="secondary">{sortedHistory.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {sortedHistory.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('noRoundHistory')}</p>
        ) : (
          <div className="space-y-2">
            {sortedHistory.map((round) => (
              <RoundHistoryItem key={round.roundId} round={round} levelNameById={levelNameById} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoundHistoryItem({ round, levelNameById }: { round: CompletedRoundSummary; levelNameById: Record<number, string> }) {
  const t = useTranslations('poolReward');
  const [expanded, setExpanded] = useState(false);
  const totalMembers = round.eligibleCount || round.levelSnapshots.reduce((s, snap) => s + snap.memberCount, 0);
  const claimPct = totalMembers > 0 ? Math.round((round.claimedCount / totalMembers) * 100) : 0;

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between p-3 text-left text-sm"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{t('roundLabel', { id: round.roundId })}</span>
            <span className="text-xs text-muted-foreground">#{round.startBlock} — #{round.endBlock}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{formatNex(round.poolSnapshot)} NEX</span>
            <span>{t('claimRateValue', { pct: claimPct, claimed: round.claimedCount, total: totalMembers })}</span>
            <span>{formatNex(round.perMemberReward)} NEX/{t('perMember')}</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2 space-y-3">
          {/* Level progress */}
          {round.levelSnapshots.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-1.5 text-left font-medium">{t('levelId')}</th>
                    <th className="px-3 py-1.5 text-right font-medium">{t('memberCount')}</th>
                    <th className="px-3 py-1.5 text-right font-medium">{t('perMemberReward')}</th>
                    <th className="px-3 py-1.5 text-right font-medium">{t('claimedProgress')}</th>
                  </tr>
                </thead>
                <tbody>
                  {round.levelSnapshots.map((snap) => {
                    const pct = snap.memberCount > 0 ? Math.round((snap.claimedCount / snap.memberCount) * 100) : 0;
                    return (
                      <tr key={snap.levelId} className="border-b last:border-0">
                        <td className="px-3 py-1.5">
                          <Badge variant="outline">Lv{snap.levelId}{levelNameById[snap.levelId] ? ` ${levelNameById[snap.levelId]}` : ''}</Badge>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">{snap.memberCount}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatNex(snap.perMemberReward)} NEX</td>
                        <td className="px-3 py-1.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress value={pct} className="h-2 w-12" />
                            <span className="font-mono text-xs">{snap.claimedCount}/{snap.memberCount}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Funding summary */}
          {round.fundingSummary && round.fundingSummary.totalFundingCount > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {t('fundingSources')} · {round.fundingSummary.totalFundingCount} {t('entries')}
              </p>
              <FundingSummaryGrid summary={round.fundingSummary} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FundingSummaryGrid({ summary }: { summary: CompletedRoundSummary['fundingSummary'] }) {
  const t = useTranslations('poolReward');
  const items = [
    { label: t('sourceOrderCommission'), value: summary.nexCommissionRemainder, unit: 'NEX' },
    { label: t('sourceTokenPlatformFee'), value: summary.tokenPlatformFeeRetention, unit: 'Token' },
    { label: t('sourceTokenCommission'), value: summary.tokenCommissionRemainder, unit: 'Token' },
    { label: t('sourceCancelReturn'), value: summary.nexCancelReturn, unit: 'NEX' },
  ].filter((item) => item.value > BigInt(0));

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded bg-muted/50 px-2 py-1.5 text-xs">
          <p className="text-muted-foreground">{item.label}</p>
          <p className="font-mono font-medium">{formatNex(item.value)} {item.unit}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Funding Records Section ─────────────────────────────

function FundingRecordsSection() {
  const t = useTranslations('poolReward');
  const { fundingRecords } = usePoolRewardCommission();

  const sortedRecords = useMemo(() => {
    if (!fundingRecords?.length) return [];
    return [...fundingRecords].reverse();
  }, [fundingRecords]);

  const sourceLabels: Record<string, string> = {
    OrderCommissionRemainder: t('sourceOrderCommission'),
    TokenPlatformFeeRetention: t('sourceTokenPlatformFee'),
    TokenCommissionRemainder: t('sourceTokenCommission'),
    CancelReturn: t('sourceCancelReturn'),
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{t('fundingRecordsTitle')}</CardTitle>
            <CardDescription>{t('fundingRecordsDesc')}</CardDescription>
          </div>
          {sortedRecords.length > 0 && (
            <Badge variant="secondary">{sortedRecords.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {sortedRecords.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('noFundingRecords')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-3 py-2 text-left font-medium">{t('fundingSource')}</th>
                  <th className="px-3 py-2 text-right font-medium">NEX</th>
                  <th className="px-3 py-2 text-right font-medium">Token</th>
                  <th className="px-3 py-2 text-right font-medium">{t('orderId')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('blockNumber')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map((rec, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs">
                        {sourceLabels[rec.source] ?? rec.source}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {rec.nexAmount > BigInt(0) ? `${formatNex(rec.nexAmount)}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {rec.tokenAmount > BigInt(0) ? `${formatNex(rec.tokenAmount)}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {rec.orderId > 0 ? `#${rec.orderId}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">#{rec.blockNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
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

        <AdminOverviewSection />
        <RoundInfoSection />
        <RoundHistorySection />
        <FundingRecordsSection />
        <MyParticipationSection />
        <MyCapProgressSection />
        <ConfigSection />
      </div>
  );
}
