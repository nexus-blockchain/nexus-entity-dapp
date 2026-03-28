'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import type { LevelSnapshot, PoolRewardClaimRecord, CapBehavior } from '@/lib/types/models';
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
}

const emptyRuleRow = (): LevelRuleRow => ({
  levelId: '',
  baseCapPercent: '',
  behaviorType: 'Fixed',
  directPerUnlock: '',
  teamPerUnlock: '',
  unlockPercent: '',
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

  // ── Sync chain config → local state (only when not dirty) ──
  const isDirty = useMemo(() => {
    const chainRules = config?.levelRules ?? [];
    if (localRules.length !== chainRules.length) return true;
    for (let i = 0; i < localRules.length; i++) {
      const [cId, cRule] = chainRules[i] ?? [0, { baseCapPercent: 0 }];
      if (localRules[i].levelId !== String(cId) || localRules[i].baseCapPercent !== String(cRule.baseCapPercent ?? 0)) return true;
    }
    const chainDuration = config?.roundDuration ?? 0;
    if (roundDuration !== '' && Number(roundDuration) !== chainDuration) return true;
    return false;
  }, [localRules, config, roundDuration]);

  useEffect(() => {
    if (config?.levelRules && !isDirty) {
      setLocalRules(
        config.levelRules.map(([id, rule]) => ({
          levelId: String(id),
          baseCapPercent: String(rule.baseCapPercent),
          behaviorType: rule.capBehavior.type,
          directPerUnlock: rule.capBehavior.type === 'UnlockByTeam' ? String(rule.capBehavior.directPerUnlock) : '',
          teamPerUnlock: rule.capBehavior.type === 'UnlockByTeam' ? String(rule.capBehavior.teamPerUnlock) : '',
          unlockPercent: rule.capBehavior.type === 'UnlockByTeam' ? String(rule.capBehavior.unlockPercent) : '',
        })),
      );
    } else if (!config?.levelRules && localRules.length === 0) {
      setLocalRules([emptyRuleRow()]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.levelRules]);

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

  // Rule sum for display
  const ruleSum = useMemo(() => {
    return localRules.reduce((s, r) => s + (Number(r.baseCapPercent) || 0), 0);
  }, [localRules]);

  // ── Row handlers ───────────────────────────────────────────
  const handleRowChange = useCallback((index: number, field: keyof LevelRuleRow, value: string) => {
    setLocalRules((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }, []);

  const handleDeleteRow = useCallback((index: number) => {
    if (localRules.length <= 1) {
      setFormError(t('errorMinOneLevel'));
      return;
    }
    setLocalRules((prev) => prev.filter((_, i) => i !== index));
  }, [localRules.length, t]);

  const handleAddRow = useCallback(() => {
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
          }))
        : [emptyRuleRow()],
    );
    setRoundDuration('');
    setFormError('');
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
          },
        ] as const);
      if (levelRules.length === 0) {
        setFormError(t('errorNoLevelRules'));
        return;
      }
      const sum = levelRules.reduce((s, [, rule]) => s + rule.base_cap_percent, 0);
      if (sum !== 10000) {
        setFormError(t('errorRuleSumMismatch', { current: sum }));
        return;
      }
      const dur = Number(roundDuration) || config?.roundDuration || 0;
      if (dur <= 0) {
        setFormError(t('errorNoRoundDuration'));
        return;
      }
      setPoolRewardConfig.mutate([entityId, levelRules, dur]);
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
                                    <div className="grid grid-cols-3 gap-2">
                                      <Input type="number" min={0} placeholder={t('directPerUnlock')} value={row.directPerUnlock} onChange={(e) => handleRowChange(index, 'directPerUnlock', e.target.value)} />
                                      <Input type="number" min={0} placeholder={t('teamPerUnlock')} value={row.teamPerUnlock} onChange={(e) => handleRowChange(index, 'teamPerUnlock', e.target.value)} />
                                      <Input type="number" min={0} max={10000} placeholder={t('unlockPercent')} value={row.unlockPercent} onChange={(e) => handleRowChange(index, 'unlockPercent', e.target.value)} />
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
                    {(() => {
                      const ok = ruleSum === 10000;
                      return (
                        <span className={`text-xs font-mono ${ok ? 'text-green-600' : 'text-orange-500'}`}>
                          {t('ruleSum')}: {ruleSum} / 10000 bps {ok ? '✓' : ''}
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
