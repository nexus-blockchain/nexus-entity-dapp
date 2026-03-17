'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useMembers } from '@/hooks/use-members';
import { useShops } from '@/hooks/use-shops';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { ConflictStrategy, LevelUpgradeMode, UpgradeTriggerType } from '@/lib/types/enums';
import type { UpgradeRule } from '@/lib/types/models';

import { useTranslations } from 'next-intl';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { LabelWithTip } from '@/components/field-help-tip';

// ─── Helpers ────────────────────────────────────────────────

const USDT_PRECISION = 1_000_000;

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

/** Format raw USDT amount (10^6 precision) to display string */
function formatUsdt(raw: bigint | number): string {
  const n = typeof raw === 'bigint' ? raw : BigInt(raw);
  const whole = n / BigInt(USDT_PRECISION);
  const frac = n % BigInt(USDT_PRECISION);
  if (frac === BigInt(0)) return whole.toString();
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

/** Convert basis points (0-10000) to percentage string */
function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 2);
}

/** Parse USDT input (user types "1.5") to raw chain value string */
function parseUsdtInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '0';
  const parts = trimmed.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(6, '0').slice(0, 6);
  return (BigInt(whole) * BigInt(USDT_PRECISION) + BigInt(frac)).toString();
}

interface LevelFormData {
  name: string;
  threshold: string; // USDT display value (e.g. "100.5")
  discountRate: string; // basis points
  commissionBonus: string; // basis points
}

const EMPTY_LEVEL_FORM: LevelFormData = {
  name: '',
  threshold: '',
  discountRate: '',
  commissionBonus: '',
};

function describeRule(rule: UpgradeRule, te: ReturnType<typeof useTranslations<'enums'>>): string {
  const value = Object.values(rule.trigger.data)[0];
  const label = te(`upgradeTrigger.${rule.trigger.type}`);
  switch (rule.trigger.type) {
    case UpgradeTriggerType.PurchaseProduct:
      return `${label} #${value ?? 0}`;
    case UpgradeTriggerType.TotalSpent:
    case UpgradeTriggerType.SingleOrder:
      return `${label} >= ${formatUsdt(value ?? 0)} USDT`;
    case UpgradeTriggerType.ReferralCount:
    case UpgradeTriggerType.TeamSize:
    case UpgradeTriggerType.OrderCount:
      return `${label} >= ${value ?? 0}`;
    default:
      return rule.trigger.type;
  }
}

function buildTriggerPayload(type: UpgradeTriggerType, value: string) {
  switch (type) {
    case UpgradeTriggerType.PurchaseProduct:
      return { PurchaseProduct: { product_id: Number(value || 0) } };
    case UpgradeTriggerType.TotalSpent:
      return { TotalSpent: { threshold: Number(parseUsdtInput(value)) } };
    case UpgradeTriggerType.SingleOrder:
      return { SingleOrder: { threshold: Number(parseUsdtInput(value)) } };
    case UpgradeTriggerType.ReferralCount:
      return { ReferralCount: { count: Number(value || 0) } };
    case UpgradeTriggerType.TeamSize:
      return { TeamSize: { size: Number(value || 0) } };
    case UpgradeTriggerType.OrderCount:
      return { OrderCount: { count: Number(value || 0) } };
    default:
      return { TotalSpent: { threshold: Number(parseUsdtInput(value)) } };
  }
}

function triggerValueLabel(t: ReturnType<typeof useTranslations<'members'>>, type: UpgradeTriggerType) {
  switch (type) {
    case UpgradeTriggerType.PurchaseProduct:
      return t('levels.productId');
    case UpgradeTriggerType.ReferralCount:
      return t('levels.countValue');
    case UpgradeTriggerType.TeamSize:
      return t('levels.sizeValue');
    case UpgradeTriggerType.OrderCount:
      return t('levels.countValue');
    default:
      return t('levels.thresholdValue') + ' (USDT)';
  }
}

// ─── Level Form ─────────────────────────────────────────────

function LevelForm({ initial, onSubmit, submitLabel, busy }: {
  initial?: LevelFormData;
  onSubmit: (data: LevelFormData) => void;
  submitLabel: string;
  busy: boolean;
}) {
  const t = useTranslations('members');
  const [form, setForm] = useState<LevelFormData>(initial ?? EMPTY_LEVEL_FORM);

  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(form);
    if (!initial) setForm(EMPTY_LEVEL_FORM);
  }, [form, initial, onSubmit]);

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div className="space-y-1">
        <LabelWithTip className="text-xs text-muted-foreground" tip={t('help.levelName')}>{t('levels.levelName')}</LabelWithTip>
        <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder={t('levels.levelName')} required />
      </div>
      <div className="space-y-1">
        <LabelWithTip className="text-xs text-muted-foreground" tip={t('help.threshold')}>{t('levels.threshold')} (USDT)</LabelWithTip>
        <Input value={form.threshold} onChange={(e) => setForm((prev) => ({ ...prev, threshold: e.target.value }))} placeholder="100" required />
      </div>
      <div className="space-y-1">
        <LabelWithTip className="text-xs text-muted-foreground" tip={t('help.discountRate')}>{t('levels.discountRate')} (BPS)</LabelWithTip>
        <Input type="number" min="0" max="10000" value={form.discountRate} onChange={(e) => setForm((prev) => ({ ...prev, discountRate: e.target.value }))} placeholder="500" required />
      </div>
      <div className="space-y-1">
        <LabelWithTip className="text-xs text-muted-foreground" tip={t('help.commissionBonus')}>{t('levels.commissionBonus')} (BPS)</LabelWithTip>
        <Input type="number" min="0" max="10000" value={form.commissionBonus} onChange={(e) => setForm((prev) => ({ ...prev, commissionBonus: e.target.value }))} placeholder="100" required />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={busy} className="w-full">{submitLabel}</Button>
      </div>
    </form>
  );
}

// ─── Custom Levels Section ──────────────────────────────────

function CustomLevelsSection({ shopId }: { shopId: number | null }) {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const {
    levelSystem,
    customLevels,
    levelMemberCounts,
    initializeLevels,
    addCustomLevel,
    updateCustomLevel,
    deleteCustomLevel,
    setUpgradeMode,
    resetLevelSystem,
  } = useMembers();
  const [editId, setEditId] = useState<number | null>(null);
  const [upgradeMode, setUpgradeModeValue] = useState<LevelUpgradeMode>(LevelUpgradeMode.AutoUpgrade);

  // Sync upgrade mode from chain data
  useEffect(() => {
    if (levelSystem?.upgradeMode) {
      setUpgradeModeValue(levelSystem.upgradeMode as LevelUpgradeMode);
    }
  }, [levelSystem?.upgradeMode]);

  const handleAdd = useCallback((data: LevelFormData) => {
    if (!shopId) return;
    addCustomLevel.mutate([shopId, data.name, parseUsdtInput(data.threshold), Number(data.discountRate), Number(data.commissionBonus)]);
  }, [addCustomLevel, shopId]);

  const handleUpdate = useCallback((levelId: number, data: LevelFormData) => {
    if (!shopId) return;
    updateCustomLevel.mutate([shopId, levelId, data.name, parseUsdtInput(data.threshold), Number(data.discountRate), Number(data.commissionBonus)]);
    setEditId(null);
  }, [shopId, updateCustomLevel]);

  const handleDelete = useCallback((levelId: number) => {
    if (!shopId) return;
    deleteCustomLevel.mutate([shopId, levelId]);
  }, [deleteCustomLevel, shopId]);

  const isInitialized = levelSystem !== null;
  const baseLevelCount = levelMemberCounts[0] ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">{t('levels.customLevels')}</CardTitle>
            <CardDescription>{t('levels.upgradeModeDesc')}</CardDescription>
            {isInitialized && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('levels.currentMode', { mode: te(`levelUpgradeMode.${levelSystem.upgradeMode}`) })}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex items-center gap-2">
              <LabelWithTip tip={t('help.upgradeMode')}>{t('levels.upgradeMode')}</LabelWithTip>
              <Select value={upgradeMode} onValueChange={(value) => setUpgradeModeValue(value as LevelUpgradeMode)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(LevelUpgradeMode).map((mode) => (
                    <SelectItem key={mode} value={mode}>{te(`levelUpgradeMode.${mode}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              {isInitialized && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shopId && setUpgradeMode.mutate([shopId, upgradeMode])}
                  disabled={isTxBusy(setUpgradeMode) || !shopId}
                >
                  {t('levels.saveUpgradeMode')}
                </Button>
              )}
              {!isInitialized && (
                <Button
                  onClick={() => shopId && initializeLevels.mutate([shopId, true, upgradeMode])}
                  disabled={isTxBusy(initializeLevels) || !shopId}
                >
                  {t('levels.initializeLevels')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <TxStatusIndicator txState={initializeLevels.txState} />
        <TxStatusIndicator txState={setUpgradeMode.txState} />
        <TxStatusIndicator txState={resetLevelSystem.txState} />

        {/* Base level (Level 0) + Custom levels table */}
        {isInitialized && (
          <>
            {/* Column headers */}
            <div className="hidden text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-6 sm:gap-3 sm:px-3">
              <span>{t('levels.levelHeader')}</span>
              <span>{t('levels.thresholdHeader')}</span>
              <span>{t('levels.discountHeader')}</span>
              <span>{t('levels.bonusHeader')}</span>
              <span>{t('levels.membersHeader')}</span>
              <span className="text-right">{t('levels.actions')}</span>
            </div>

            {/* Base level row */}
            <Card className="border-dashed shadow-none">
              <CardContent className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-6 sm:items-center">
                <span className="font-medium text-muted-foreground">Lv.0 {t('levels.baseLevel')}</span>
                <span className="text-sm text-muted-foreground">-</span>
                <span className="text-sm text-muted-foreground">-</span>
                <span className="text-sm text-muted-foreground">-</span>
                <span className="text-sm">{t('levels.memberCount', { count: baseLevelCount })}</span>
                <span />
              </CardContent>
            </Card>

            {/* Custom levels */}
            {customLevels.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('levels.noCustomLevels')}</p>
            ) : (
              <div className="space-y-2">
                {customLevels.map((level) => (
                  <div key={level.id}>
                    {editId === level.id ? (
                      <LevelForm
                        initial={{
                          name: level.name,
                          threshold: formatUsdt(level.threshold),
                          discountRate: String(level.discountRate),
                          commissionBonus: String(level.commissionBonus),
                        }}
                        onSubmit={(data) => handleUpdate(level.id, data)}
                        submitLabel={tc('save')}
                        busy={isTxBusy(updateCustomLevel)}
                      />
                    ) : (
                      <Card className="shadow-none">
                        <CardContent className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-6 sm:items-center">
                          <span className="font-medium">
                            {t('levels.levelId', { id: level.id })} {level.name}
                          </span>
                          <span className="text-sm">{formatUsdt(level.threshold)} USDT</span>
                          <span className="text-sm">{bpsToPercent(level.discountRate)}%</span>
                          <span className="text-sm">{bpsToPercent(level.commissionBonus)}%</span>
                          <span className="text-sm">{t('levels.memberCount', { count: levelMemberCounts[level.id] ?? 0 })}</span>
                          <div className="flex gap-1 sm:justify-end">
                            <Button size="sm" variant="outline" onClick={() => setEditId(level.id)}>{tc('edit')}</Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(level.id)} disabled={isTxBusy(deleteCustomLevel)}>{tc('delete')}</Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Separator />

            {/* Add new level form */}
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('levels.addNewLevel')}</p>
              <LevelForm onSubmit={handleAdd} submitLabel={tc('add')} busy={isTxBusy(addCustomLevel)} />
              <TxStatusIndicator txState={addCustomLevel.txState} />
              <TxStatusIndicator txState={updateCustomLevel.txState} />
              <TxStatusIndicator txState={deleteCustomLevel.txState} />
            </div>

            <Separator />

            {/* Reset level system */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{t('levels.resetLevelSystemDesc')}</p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => shopId && resetLevelSystem.mutate([shopId])}
                disabled={isTxBusy(resetLevelSystem) || !shopId}
              >
                {t('levels.resetLevelSystem')}
              </Button>
            </div>
          </>
        )}

        {!isInitialized && (
          <p className="text-sm text-muted-foreground">{t('levels.noCustomLevels')}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Upgrade Rule System Section ────────────────────────────

function UpgradeRuleSystemSection({ shopId }: { shopId: number | null }) {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const {
    levelSystem,
    customLevels,
    upgradeRuleSystem,
    initUpgradeRuleSystem,
    addUpgradeRule,
    updateUpgradeRule,
    removeUpgradeRule,
    setUpgradeRuleSystemEnabled,
    setConflictStrategy,
    resetUpgradeRuleSystem,
  } = useMembers();

  const [initStrategy, setInitStrategy] = useState<ConflictStrategy>(ConflictStrategy.HighestLevel);
  const [ruleName, setRuleName] = useState('');
  const [triggerType, setTriggerType] = useState<UpgradeTriggerType>(UpgradeTriggerType.TotalSpent);
  const [triggerValue, setTriggerValue] = useState('');
  const [targetLevelId, setTargetLevelId] = useState('1');
  const [duration, setDuration] = useState('');
  const [priority, setPriority] = useState('0');
  const [stackable, setStackable] = useState(false);
  const [maxTriggers, setMaxTriggers] = useState('');
  const [priorityEdits, setPriorityEdits] = useState<Record<number, string>>({});

  const handleAddRule = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    if (!shopId || !ruleName.trim()) return;
    addUpgradeRule.mutate([
      shopId,
      ruleName.trim(),
      buildTriggerPayload(triggerType, triggerValue),
      Number(targetLevelId) || 0,
      duration.trim() ? Number(duration) : null,
      Number(priority) || 0,
      stackable,
      maxTriggers.trim() ? Number(maxTriggers) : null,
    ]);
    setRuleName('');
    setTriggerValue('');
    setDuration('');
    setPriority('0');
    setStackable(false);
    setMaxTriggers('');
  }, [addUpgradeRule, duration, maxTriggers, priority, ruleName, shopId, stackable, targetLevelId, triggerType, triggerValue]);

  // Resolve level name from ID
  const levelNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const level of customLevels) {
      map[level.id] = level.name;
    }
    return map;
  }, [customLevels]);

  if (!levelSystem) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-sm text-muted-foreground">{t('levels.initLevelsFirst')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('levels.upgradeRuleSystem')}</CardTitle>
        <CardDescription>{t('levels.upgradeRuleSystemDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {upgradeRuleSystem ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{t('levels.ruleSystemEnabled')}</p>
                  <p className="text-xs text-muted-foreground">{t('levels.ruleSystemEnabledDesc')}</p>
                </div>
                <Switch
                  checked={upgradeRuleSystem.enabled}
                  onCheckedChange={(checked) => shopId && setUpgradeRuleSystemEnabled.mutate([shopId, checked])}
                  disabled={isTxBusy(setUpgradeRuleSystemEnabled) || !shopId}
                />
              </div>
              <div className="space-y-2 rounded-md border p-3">
                <LabelWithTip tip={t('help.conflictStrategy')}>{t('levels.conflictStrategy')}</LabelWithTip>
                <Select
                  value={upgradeRuleSystem.conflictStrategy}
                  onValueChange={(value) => shopId && setConflictStrategy.mutate([shopId, value])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ConflictStrategy).map((strategy) => (
                      <SelectItem key={strategy} value={strategy}>{te(`conflictStrategy.${strategy}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Existing rules */}
            {upgradeRuleSystem.rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('levels.noRules')}</p>
            ) : (
              <div className="space-y-3">
                {upgradeRuleSystem.rules.map((rule) => (
                  <Card key={rule.id} className="shadow-none">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">#{rule.id} {rule.name}</p>
                          <p className="text-sm text-muted-foreground">{describeRule(rule, te)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={rule.enabled ? 'success' : 'secondary'}>{rule.enabled ? tc('enabled') : tc('disabled')}</Badge>
                          <Badge variant="outline">
                            {t('levels.targetLevelLabel', { level: rule.targetLevelId })}
                            {levelNameById[rule.targetLevelId] ? ` ${levelNameById[rule.targetLevelId]}` : ''}
                          </Badge>
                          <Badge variant={rule.stackable ? 'default' : 'secondary'}>
                            {rule.stackable ? t('levels.stackableYes') : t('levels.stackableNo')}
                          </Badge>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('levels.priority')}</p>
                          <p className="text-sm font-medium">{rule.priority}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('levels.duration')}</p>
                          <p className="text-sm font-medium">{rule.duration ?? t('levels.durationPermanent')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('levels.maxTriggers')}</p>
                          <p className="text-sm font-medium">{rule.maxTriggers ?? t('levels.maxTriggersUnlimited')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('levels.triggerCount')}</p>
                          <p className="text-sm font-medium">{rule.triggerCount}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <Input
                          className="w-28"
                          type="number"
                          value={priorityEdits[rule.id] ?? String(rule.priority)}
                          onChange={(e) => setPriorityEdits((prev) => ({ ...prev, [rule.id]: e.target.value }))}
                          placeholder={t('levels.priority')}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => shopId && updateUpgradeRule.mutate([shopId, rule.id, null, Number(priorityEdits[rule.id] ?? rule.priority)])}
                          disabled={isTxBusy(updateUpgradeRule) || !shopId}
                        >
                          {t('levels.savePriority')}
                        </Button>
                        <Button
                          size="sm"
                          variant={rule.enabled ? 'secondary' : 'default'}
                          onClick={() => shopId && updateUpgradeRule.mutate([shopId, rule.id, !rule.enabled, null])}
                          disabled={isTxBusy(updateUpgradeRule) || !shopId}
                        >
                          {rule.enabled ? tc('disable') : tc('enable')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => shopId && removeUpgradeRule.mutate([shopId, rule.id])}
                          disabled={isTxBusy(removeUpgradeRule) || !shopId}
                        >
                          {tc('delete')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <Separator />

            {/* Add rule form */}
            <form onSubmit={handleAddRule} className="space-y-4">
              <p className="text-sm font-medium">{t('levels.addRule')}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>{t('levels.ruleName')}</Label>
                  <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder={t('levels.ruleName')} />
                </div>
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.triggerType')}>{t('levels.triggerType')}</LabelWithTip>
                  <Select value={triggerType} onValueChange={(value) => setTriggerType(value as UpgradeTriggerType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(UpgradeTriggerType).map((type) => (
                        <SelectItem key={type} value={type}>{te(`upgradeTrigger.${type}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.triggerValue')}>{triggerValueLabel(t, triggerType)}</LabelWithTip>
                  <Input value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.targetLevel')}>{t('levels.targetLevel')}</LabelWithTip>
                  <Select value={targetLevelId} onValueChange={setTargetLevelId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {customLevels.map((level) => (
                        <SelectItem key={level.id} value={String(level.id)}>
                          Lv.{level.id} {level.name}
                        </SelectItem>
                      ))}
                      {customLevels.length === 0 && <SelectItem value="1">Lv.1</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.duration')}>{t('levels.duration')}</LabelWithTip>
                  <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder={t('levels.durationPermanent')} />
                </div>
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.priority')}>{t('levels.priority')}</LabelWithTip>
                  <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <LabelWithTip tip={t('help.maxTriggers')}>{t('levels.maxTriggers')}</LabelWithTip>
                  <Input value={maxTriggers} onChange={(e) => setMaxTriggers(e.target.value)} placeholder={t('levels.maxTriggersUnlimited')} />
                </div>
                <div className="flex items-center gap-2 rounded-md border px-3">
                  <Switch checked={stackable} onCheckedChange={setStackable} />
                  <LabelWithTip tip={t('help.stackable')}>{t('levels.stackable')}</LabelWithTip>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={isTxBusy(addUpgradeRule) || !shopId || !ruleName.trim()}>
                  {t('levels.addRule')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => shopId && resetUpgradeRuleSystem.mutate([shopId])}
                  disabled={isTxBusy(resetUpgradeRuleSystem) || !shopId}
                >
                  {t('levels.resetRuleSystem')}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="space-y-4 rounded-md border border-dashed p-4">
            <p className="text-sm text-muted-foreground">{t('levels.noRuleSystem')}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <LabelWithTip tip={t('help.conflictStrategy')}>{t('levels.conflictStrategy')}</LabelWithTip>
                <Select value={initStrategy} onValueChange={(value) => setInitStrategy(value as ConflictStrategy)}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ConflictStrategy).map((strategy) => (
                      <SelectItem key={strategy} value={strategy}>{te(`conflictStrategy.${strategy}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => shopId && initUpgradeRuleSystem.mutate([shopId, initStrategy])} disabled={isTxBusy(initUpgradeRuleSystem) || !shopId}>
                {t('levels.initRuleSystem')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-3">
        <TxStatusIndicator txState={initUpgradeRuleSystem.txState} />
        <TxStatusIndicator txState={setUpgradeRuleSystemEnabled.txState} />
        <TxStatusIndicator txState={setConflictStrategy.txState} />
        <TxStatusIndicator txState={addUpgradeRule.txState} />
        <TxStatusIndicator txState={updateUpgradeRule.txState} />
        <TxStatusIndicator txState={removeUpgradeRule.txState} />
        <TxStatusIndicator txState={resetUpgradeRuleSystem.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Page Entry ─────────────────────────────────────────────

export function LevelsPage() {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const { shops } = useShops();
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);

  const shopId = useMemo(() => {
    if (selectedShopId !== null) return selectedShopId;
    if (shops.length > 0) return shops[0].id;
    return null;
  }, [selectedShopId, shops]);

  return (
    <PermissionGuard required={AdminPermission.MEMBER_MANAGE}>
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">{t('levels.title')}</h1>
          {shops.length > 1 && (
            <Select value={shopId?.toString() ?? ''} onValueChange={(value) => setSelectedShopId(Number(value))}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder={tc('selectShop')} />
              </SelectTrigger>
              <SelectContent>
                {shops.map((shop) => (
                  <SelectItem key={shop.id} value={String(shop.id)}>{shop.name} (#{shop.id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!shopId && (
          <Card className="border-dashed">
            <CardContent className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">{t('selectShopFirst')}</p>
            </CardContent>
          </Card>
        )}

        {shopId && (
          <>
            <CustomLevelsSection shopId={shopId} />
            <UpgradeRuleSystemSection shopId={shopId} />
          </>
        )}
      </div>
    </PermissionGuard>
  );
}
