'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { useSingleLineCommission } from '@/hooks/use-single-line-commission';
import { useMembers } from '@/hooks/use-members';
import { useTxLock, isTxBusy } from '@/hooks/use-tx-lock';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTip } from '@/components/field-help-tip';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { AlertCircle, ArrowUp } from 'lucide-react';

// ─── Loading Skeleton ───────────────────────────────────────

function SingleLineSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-56" />
      {Array.from({ length: 3 }).map((_, i) => (
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

// ─── Config Section ─────────────────────────────────────────

function ConfigSection() {
  const t = useTranslations('singleLine');
  const { entityId } = useEntityContext();
  const { config, configureSingleLine, clearConfig, pauseSingleLine, resumeSingleLine } = useSingleLineCommission();
  const { isLocked, setLocked } = useTxLock();

  const [uplineRate, setUplineRate] = useState('');
  const [downlineRate, setDownlineRate] = useState('');
  const [baseUplineLevels, setBaseUplineLevels] = useState('');
  const [baseDownlineLevels, setBaseDownlineLevels] = useState('');
  const [levelIncrementThreshold, setLevelIncrementThreshold] = useState('');
  const [maxUplineLevels, setMaxUplineLevels] = useState('');
  const [maxDownlineLevels, setMaxDownlineLevels] = useState('');

  const [levelMode, setLevelMode] = useState<'memberLevel' | 'threshold'>('memberLevel');
  const [modeInitialized, setModeInitialized] = useState(false);

  // Sync levelMode from config on initial load
  useEffect(() => {
    if (config && !modeInitialized) {
      setLevelMode(config.levelIncrementThreshold > 0n ? 'threshold' : 'memberLevel');
      setModeInitialized(true);
    }
  }, [config, modeInitialized]);

  // Track local mutations to drive the tx lock
  const localBusy = isTxBusy(configureSingleLine) || isTxBusy(clearConfig) || isTxBusy(pauseSingleLine) || isTxBusy(resumeSingleLine);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  const buildParams = () => [
    entityId,
    Number(uplineRate) || config?.uplineRate || 100,
    Number(downlineRate) || config?.downlineRate || 100,
    Number(baseUplineLevels) || config?.baseUplineLevels || 3,
    Number(baseDownlineLevels) || config?.baseDownlineLevels || 3,
    levelMode === 'memberLevel'
      ? 0n
      : BigInt(levelIncrementThreshold || String(config?.levelIncrementThreshold ?? 0)),
    Number(maxUplineLevels) || config?.maxUplineLevels || 10,
    Number(maxDownlineLevels) || config?.maxDownlineLevels || 10,
  ];

  const handleSaveConfig = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked) return;
      configureSingleLine.mutate(buildParams());
    },
    [entityId, uplineRate, downlineRate, baseUplineLevels, baseDownlineLevels, levelIncrementThreshold, maxUplineLevels, maxDownlineLevels, levelMode, config, configureSingleLine, isLocked],
  );

  const handleToggle = useCallback(() => {
    if (isLocked) return;
    if (config?.enabled) {
      pauseSingleLine.mutate([entityId]);
    } else if (config && !config.enabled) {
      resumeSingleLine.mutate([entityId]);
    } else {
      configureSingleLine.mutate(buildParams());
    }
  }, [entityId, config, uplineRate, downlineRate, baseUplineLevels, baseDownlineLevels, levelIncrementThreshold, maxUplineLevels, maxDownlineLevels, levelMode, pauseSingleLine, resumeSingleLine, configureSingleLine, isLocked]);

  const isToggleBusy = isLocked;
  const toggleTxState = config?.enabled
    ? pauseSingleLine.txState
    : config
      ? resumeSingleLine.txState
      : configureSingleLine.txState;

  const statusVariant = config?.enabled ? 'success' : config ? 'destructive' : 'secondary';
  const statusLabel = config?.enabled ? t('enabled') : config ? t('paused') : t('notEnabled');

  return (
    <Card id="sl-config-section">
      <CardHeader>
        <CardTitle className="text-lg">{t('configSection')}</CardTitle>
        <CardDescription>{t('configSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('enableToggle')}</p>
            <Badge variant={statusVariant}>
              {statusLabel}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('uplineRate')}</p>
            <p className="text-sm font-medium">{config?.uplineRate ?? 0} {t('bps')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('downlineRate')}</p>
            <p className="text-sm font-medium">{config?.downlineRate ?? 0} {t('bps')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('maxUplineLevels')}</p>
            <p className="text-sm font-medium">{config?.maxUplineLevels ?? 0}</p>
          </div>
        </div>

        <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
          <Separator className="my-4" />

          <div className="flex items-center gap-3">
            <Switch
              checked={config?.enabled ?? false}
              onCheckedChange={handleToggle}
              disabled={isToggleBusy}
            />
            <Label>
              {config?.enabled
                ? t('pauseToggle')
                : config
                  ? t('resumeToggle')
                  : t('enableToggle')}
            </Label>
            <TxStatusIndicator txState={toggleTxState} />
          </div>

          <Separator className="my-4" />

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <LabelWithTip htmlFor="sl-upline-rate" tip={t('help.uplineRate')}>{t('uplineRate')}</LabelWithTip>
                <Input id="sl-upline-rate" type="number" value={uplineRate} onChange={(e) => setUplineRate(e.target.value)} placeholder={String(config?.uplineRate ?? 100)} />
                <p className="text-xs text-muted-foreground">{t('bps')}</p>
              </div>
              <div className="space-y-2">
                <LabelWithTip htmlFor="sl-downline-rate" tip={t('help.downlineRate')}>{t('downlineRate')}</LabelWithTip>
                <Input id="sl-downline-rate" type="number" value={downlineRate} onChange={(e) => setDownlineRate(e.target.value)} placeholder={String(config?.downlineRate ?? 100)} />
                <p className="text-xs text-muted-foreground">{t('bps')}</p>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Level determination mode tabs */}
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('levelModeSection')}</p>
                <p className="text-xs text-muted-foreground">{t('levelModeDesc')}</p>
              </div>
              <Tabs value={levelMode} onValueChange={(v) => setLevelMode(v as 'memberLevel' | 'threshold')}>
                <TabsList>
                  <TabsTrigger value="memberLevel">{t('modeMemberLevel')}</TabsTrigger>
                  <TabsTrigger value="threshold">{t('modeThreshold')}</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-xs text-muted-foreground">
                {levelMode === 'memberLevel' ? t('modeMemberLevelDesc') : t('modeThresholdDesc')}
              </p>

              {levelMode === 'threshold' && (
                <div className="space-y-2 max-w-xs">
                  <LabelWithTip htmlFor="sl-threshold" tip={t('help.levelIncrementThreshold')}>{t('levelIncrementThreshold')}</LabelWithTip>
                  <Input id="sl-threshold" type="number" value={levelIncrementThreshold} onChange={(e) => setLevelIncrementThreshold(e.target.value)} placeholder={String(config?.levelIncrementThreshold ?? 0)} />
                </div>
              )}
            </div>

            <Separator className="my-4" />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <LabelWithTip htmlFor="sl-base-up" tip={t('help.baseUplineLevels')}>{t('baseUplineLevels')}</LabelWithTip>
                <Input id="sl-base-up" type="number" value={baseUplineLevels} onChange={(e) => setBaseUplineLevels(e.target.value)} placeholder={String(config?.baseUplineLevels ?? 3)} />
              </div>
              <div className="space-y-2">
                <LabelWithTip htmlFor="sl-base-down" tip={t('help.baseDownlineLevels')}>{t('baseDownlineLevels')}</LabelWithTip>
                <Input id="sl-base-down" type="number" value={baseDownlineLevels} onChange={(e) => setBaseDownlineLevels(e.target.value)} placeholder={String(config?.baseDownlineLevels ?? 3)} />
              </div>
              <div className="space-y-2">
                <LabelWithTip htmlFor="sl-max-up" tip={t('help.maxUplineLevels')}>{t('maxUplineLevels')}</LabelWithTip>
                <Input id="sl-max-up" type="number" value={maxUplineLevels} onChange={(e) => setMaxUplineLevels(e.target.value)} placeholder={String(config?.maxUplineLevels ?? 10)} />
              </div>
              <div className="space-y-2">
                <LabelWithTip htmlFor="sl-max-down" tip={t('help.maxDownlineLevels')}>{t('maxDownlineLevels')}</LabelWithTip>
                <Input id="sl-max-down" type="number" value={maxDownlineLevels} onChange={(e) => setMaxDownlineLevels(e.target.value)} placeholder={String(config?.maxDownlineLevels ?? 10)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isLocked}>
                {t('saveConfig')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => { if (!isLocked) clearConfig.mutate([entityId]); }}
                disabled={isLocked}
              >
                {t('clearConfig')}
              </Button>
              <TxStatusIndicator txState={configureSingleLine.txState} />
              <TxStatusIndicator txState={clearConfig.txState} />
            </div>
          </form>
        </PermissionGuard>
      </CardContent>
    </Card>
  );
}

// ─── Level Overrides Section ─────────────────────────────────

function LevelOverridesSection() {
  const t = useTranslations('singleLine');
  const { entityId } = useEntityContext();
  const { config, useLevelOverrides, setLevelBasedLevels, removeLevelBasedLevels } = useSingleLineCommission();
  const { customLevels } = useMembers();
  const { isLocked, setLocked } = useTxLock();

  const maxLevelId = config?.maxUplineLevels ? 10 : 10; // query up to 10 levels
  const { data: overrides } = useLevelOverrides(maxLevelId);

  const [newLevelId, setNewLevelId] = useState('');
  const [newUplineLevels, setNewUplineLevels] = useState('');
  const [newDownlineLevels, setNewDownlineLevels] = useState('');
  const [validationError, setValidationError] = useState('');

  // Track local mutations to drive the tx lock
  const localBusy = isTxBusy(setLevelBasedLevels) || isTxBusy(removeLevelBasedLevels);
  useEffect(() => { setLocked(localBusy); }, [localBusy, setLocked]);

  // Detect LevelOverrideExceedsMax from chain tx error
  const isChainExceedsMaxError = setLevelBasedLevels.txState.status === 'error'
    && setLevelBasedLevels.txState.error?.includes('LevelOverrideExceedsMax');

  // Build a map from level ID to level name for display
  const levelNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const level of customLevels) {
      map[level.id] = level.name;
    }
    return map;
  }, [customLevels]);

  // Filter out levels that already have an override configured
  const availableLevels = useMemo(() => {
    const configuredIds = new Set(overrides?.map((o) => o.levelId) ?? []);
    return customLevels.filter((level) => !configuredIds.has(level.id));
  }, [customLevels, overrides]);

  const handleSetOverride = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isLocked) return;
      setValidationError('');
      const levelId = Number(newLevelId);
      const upLevels = Number(newUplineLevels);
      const downLevels = Number(newDownlineLevels);
      if (levelId <= 0 || (upLevels <= 0 && downLevels <= 0)) return;
      if (config) {
        if (upLevels > config.maxUplineLevels) {
          setValidationError(t('exceedsMaxGuide.validationUp', { value: upLevels, max: config.maxUplineLevels }));
          return;
        }
        if (downLevels > config.maxDownlineLevels) {
          setValidationError(t('exceedsMaxGuide.validationDown', { value: downLevels, max: config.maxDownlineLevels }));
          return;
        }
      }
      setLevelBasedLevels.mutate([entityId, levelId, upLevels, downLevels]);
      setNewLevelId('');
      setNewUplineLevels('');
      setNewDownlineLevels('');
    },
    [entityId, newLevelId, newUplineLevels, newDownlineLevels, config, setLevelBasedLevels, t, isLocked],
  );

  const handleRemove = useCallback(
    (levelId: number) => {
      if (isLocked) return;
      removeLevelBasedLevels.mutate([entityId, levelId]);
    },
    [entityId, removeLevelBasedLevels, isLocked],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('levelOverridesSection')}</CardTitle>
        <CardDescription>{t('levelOverridesSectionDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* LevelOverrideExceedsMax guidance alert */}
        {(validationError || isChainExceedsMaxError) && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">
                  {t('exceedsMaxGuide.title')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {validationError || t('exceedsMaxGuide.desc')}
                </p>
              </div>
            </div>
            <div className="rounded-md bg-muted/50 p-3 space-y-2 text-sm">
              <p className="font-medium">{t('exceedsMaxGuide.currentLimits')}</p>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <span>{t('maxUplineLevels')}: <strong className="text-foreground">{config?.maxUplineLevels ?? 0}</strong></span>
                <span>{t('maxDownlineLevels')}: <strong className="text-foreground">{config?.maxDownlineLevels ?? 0}</strong></span>
              </div>
            </div>
            <div className="text-sm space-y-1.5">
              <p className="font-medium">{t('exceedsMaxGuide.stepsTitle')}</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>{t('exceedsMaxGuide.step1')}</li>
                <li>{t('exceedsMaxGuide.step2')}</li>
                <li>{t('exceedsMaxGuide.step3')}</li>
              </ol>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => document.getElementById('sl-config-section')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <ArrowUp className="h-3.5 w-3.5" />
              {t('exceedsMaxGuide.goToConfig')}
            </Button>
          </div>
        )}

        {/* Current overrides list */}
        {(!overrides || overrides.length === 0) ? (
          <p className="text-sm text-muted-foreground">{t('noOverrides')}</p>
        ) : (
          <div className="space-y-2">
            {overrides.map((o) => (
              <div key={o.levelId} className="flex items-center gap-4 rounded-md border p-3">
                <div className="flex-1 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('levelId')}</p>
                    <p className="text-sm font-medium">
                      Lv.{o.levelId} {levelNameById[o.levelId] ?? ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('overrideUplineLevels')}</p>
                    <p className="text-sm font-medium">{o.uplineLevels}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('overrideDownlineLevels')}</p>
                    <p className="text-sm font-medium">{o.downlineLevels}</p>
                  </div>
                </div>
                <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleRemove(o.levelId)}
                    disabled={isLocked}
                  >
                    {t('removeOverride')}
                  </Button>
                </PermissionGuard>
              </div>
            ))}
          </div>
        )}

        {/* Add new override form */}
        <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
          <Separator className="my-4" />
          <form onSubmit={handleSetOverride} className="space-y-3">
            <p className="text-sm font-medium">{t('addLevelOverride')}</p>
            {customLevels.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noLevelsConfigured')}</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <LabelWithTip htmlFor="lo-level-id" tip={t('help.levelId')}>{t('levelId')}</LabelWithTip>
                    <Select value={newLevelId} onValueChange={setNewLevelId}>
                      <SelectTrigger id="lo-level-id">
                        <SelectValue placeholder={t('selectLevel')} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLevels.map((level) => (
                          <SelectItem key={level.id} value={String(level.id)}>
                            Lv.{level.id} {level.name}
                          </SelectItem>
                        ))}
                        {availableLevels.length === 0 && (
                          <SelectItem value="_none" disabled>
                            {t('allLevelsConfigured')}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <LabelWithTip htmlFor="lo-up-levels" tip={t('help.overrideUplineLevels')}>{t('overrideUplineLevels')}</LabelWithTip>
                    <Input
                      id="lo-up-levels"
                      type="number"
                      min={1}
                      max={config?.maxUplineLevels ?? 10}
                      value={newUplineLevels}
                      onChange={(e) => { setNewUplineLevels(e.target.value); setValidationError(''); }}
                      placeholder={String(config?.maxUplineLevels ?? 5)}
                    />
                    <p className="text-xs text-muted-foreground">{t('maxValue')}: {config?.maxUplineLevels ?? 10}</p>
                  </div>
                  <div className="space-y-2">
                    <LabelWithTip htmlFor="lo-down-levels" tip={t('help.overrideDownlineLevels')}>{t('overrideDownlineLevels')}</LabelWithTip>
                    <Input
                      id="lo-down-levels"
                      type="number"
                      min={1}
                      max={config?.maxDownlineLevels ?? 10}
                      value={newDownlineLevels}
                      onChange={(e) => { setNewDownlineLevels(e.target.value); setValidationError(''); }}
                      placeholder={String(config?.maxDownlineLevels ?? 3)}
                    />
                    <p className="text-xs text-muted-foreground">{t('maxValue')}: {config?.maxDownlineLevels ?? 10}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={isLocked || !newLevelId || availableLevels.length === 0}>
                    {t('setOverride')}
                  </Button>
                  <TxStatusIndicator txState={setLevelBasedLevels.txState} />
                  <TxStatusIndicator txState={removeLevelBasedLevels.txState} />
                </div>
              </>
            )}
          </form>
        </PermissionGuard>
      </CardContent>
    </Card>
  );
}

function RuntimeNoticeSection() {
  const t = useTranslations('singleLine');

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-lg">{t('statsSection')}</CardTitle>
        <CardDescription>{t('runtimeDerivedOnly')}</CardDescription>
      </CardHeader>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function SingleLinePage() {
  const t = useTranslations('singleLine');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { isLoading, error, config } = useSingleLineCommission();

  const levelMode = config && config.levelIncrementThreshold > 0n ? 'threshold' : 'memberLevel';

  if (isLoading) return <SingleLineSkeleton />;

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

        <ConfigSection />
        {levelMode === 'memberLevel' && <LevelOverridesSection />}
        <RuntimeNoticeSection />
      </div>
  );
}
