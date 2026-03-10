'use client';

import React, { useState, useCallback } from 'react';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useMembers } from '@/hooks/use-members';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { UpgradeTrigger } from '@/lib/types/enums';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils/cn';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

// ─── Level Form ─────────────────────────────────────────────

interface LevelFormData {
  name: string;
  threshold: string;
  discountRate: string;
  commissionBonus: string;
}

const EMPTY_FORM: LevelFormData = { name: '', threshold: '', discountRate: '', commissionBonus: '' };

function LevelForm({ initial, onSubmit, submitLabel, busy }: {
  initial?: LevelFormData;
  onSubmit: (data: LevelFormData) => void;
  submitLabel: string;
  busy: boolean;
}) {
  const t = useTranslations('members');
  const [form, setForm] = useState<LevelFormData>(initial ?? EMPTY_FORM);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
    if (!initial) setForm(EMPTY_FORM);
  }, [form, onSubmit, initial]);

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="space-y-1">
        <Label className="sr-only">{t('levels.levelName')}</Label>
        <Input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder={t('levels.levelName')}
          required
        />
      </div>
      <div className="space-y-1">
        <Label className="sr-only">{t('levels.threshold')}</Label>
        <Input
          type="text"
          inputMode="decimal"
          value={form.threshold}
          onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
          placeholder={t('levels.threshold')}
          required
        />
      </div>
      <div className="space-y-1">
        <Label className="sr-only">{t('levels.discountRate')}</Label>
        <Input
          type="number"
          value={form.discountRate}
          onChange={(e) => setForm((f) => ({ ...f, discountRate: e.target.value }))}
          placeholder={t('levels.discountRate')}
          required
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label className="sr-only">{t('levels.commissionBonus')}</Label>
          <Input
            type="number"
            value={form.commissionBonus}
            onChange={(e) => setForm((f) => ({ ...f, commissionBonus: e.target.value }))}
            placeholder={t('levels.commissionBonus')}
            required
          />
        </div>
        <Button type="submit" disabled={busy} className="shrink-0">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ─── Custom Levels Section ──────────────────────────────────

function CustomLevelsSection() {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const { entityId } = useEntityContext();
  const { customLevels, initializeLevels, addCustomLevel, updateCustomLevel, deleteCustomLevel } = useMembers();
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const handleAdd = useCallback((data: LevelFormData) => {
    addCustomLevel.mutate([entityId, data.name, data.threshold, Number(data.discountRate), Number(data.commissionBonus)]);
  }, [entityId, addCustomLevel]);

  const handleUpdate = useCallback((index: number, data: LevelFormData) => {
    updateCustomLevel.mutate([entityId, index, data.name, data.threshold, Number(data.discountRate), Number(data.commissionBonus)]);
    setEditIndex(null);
  }, [entityId, updateCustomLevel]);

  const handleDelete = useCallback((index: number) => {
    deleteCustomLevel.mutate([entityId, index]);
  }, [entityId, deleteCustomLevel]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{t('levels.customLevels')}</CardTitle>
          {customLevels.length === 0 && (
            <Button
              onClick={() => initializeLevels.mutate([entityId])}
              disabled={isTxBusy(initializeLevels)}
            >
              {t('levels.initializeLevels')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <TxStatusIndicator txState={initializeLevels.txState} />

        {customLevels.length > 0 && (
          <div className="space-y-3">
            {/* Header */}
            <div className="hidden grid-cols-5 gap-3 text-xs font-medium text-muted-foreground sm:grid">
              <span>{t('levels.levelName')}</span><span>{t('levels.threshold')}</span><span>{t('levels.discountRate')}</span><span>{t('levels.commissionBonus')}</span><span>{t('levels.actions')}</span>
            </div>

            {customLevels.map((level, idx) => (
              <div key={idx}>
                {editIndex === idx ? (
                  <LevelForm
                    initial={{ name: level.name, threshold: level.threshold.toString(), discountRate: String(level.discountRate), commissionBonus: String(level.commissionBonus) }}
                    onSubmit={(data) => handleUpdate(idx, data)}
                    submitLabel={tc('save')}
                    busy={isTxBusy(updateCustomLevel)}
                  />
                ) : (
                  <Card className="shadow-none">
                    <CardContent className="grid grid-cols-5 items-center gap-3 p-3 text-sm">
                      <span className="font-medium">{level.name}</span>
                      <span className="text-muted-foreground">{level.threshold.toString()}</span>
                      <span className="text-muted-foreground">{level.discountRate}</span>
                      <span className="text-muted-foreground">{level.commissionBonus}</span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditIndex(idx)}>
                          {tc('edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(idx)}
                          disabled={isTxBusy(deleteCustomLevel)}
                        >
                          {tc('delete')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ))}

            {/* Add new level */}
            <Separator />
            <div className="pt-1">
              <p className="mb-2 text-sm font-medium">{t('levels.addNewLevel')}</p>
              <LevelForm onSubmit={handleAdd} submitLabel={tc('add')} busy={isTxBusy(addCustomLevel)} />
              <div className="mt-2">
                <TxStatusIndicator txState={addCustomLevel.txState} />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Upgrade Triggers Section ───────────────────────────────

function UpgradeTriggersSection() {
  const t = useTranslations('members');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const { entityId } = useEntityContext();
  const { upgradeTriggers, setUpgradeTrigger } = useMembers();
  const [editTrigger, setEditTrigger] = useState<{ trigger: UpgradeTrigger; value: string } | null>(null);

  const triggerMap = new Map(upgradeTriggers.map((t) => [t.trigger, t.value]));

  const handleSave = useCallback(() => {
    if (editTrigger) {
      setUpgradeTrigger.mutate([entityId, editTrigger.trigger, editTrigger.value]);
      setEditTrigger(null);
    }
  }, [entityId, editTrigger, setUpgradeTrigger]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('levels.upgradeTriggers')}</CardTitle>
        <CardDescription>{t('levels.upgradeTriggerDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Object.values(UpgradeTrigger).map((trigger) => {
            const currentValue = triggerMap.get(trigger);
            const isEditing = editTrigger?.trigger === trigger;

            return (
              <Card key={trigger} className="shadow-none">
                <CardContent className="flex items-center justify-between p-3">
                  <span className="text-sm text-muted-foreground">{te(`upgradeTrigger.${trigger}`)}</span>
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={editTrigger.value}
                          onChange={(e) => setEditTrigger({ trigger, value: e.target.value })}
                          className="w-32"
                        />
                        <Button
                          size="sm"
                          onClick={handleSave}
                          disabled={isTxBusy(setUpgradeTrigger)}
                        >
                          {tc('save')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditTrigger(null)}
                        >
                          {tc('cancel')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Badge variant={currentValue !== undefined ? 'secondary' : 'outline'}>
                          {currentValue !== undefined ? currentValue.toString() : t('levels.notSet')}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditTrigger({ trigger, value: currentValue?.toString() ?? '0' })}
                        >
                          {tc('edit')}
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
      <CardFooter>
        <TxStatusIndicator txState={setUpgradeTrigger.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function LevelsPage() {
  const t = useTranslations('members');
  return (
    <PermissionGuard required={AdminPermission.MEMBER_MANAGE}>
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight">{t('levels.title')}</h1>
        <CustomLevelsSection />
        <UpgradeTriggersSection />
      </div>
    </PermissionGuard>
  );
}
