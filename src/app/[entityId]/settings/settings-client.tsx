'use client';

import React, { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { PermissionGuard } from '@/components/permission-guard';
import { TxConfirmDialog } from '@/components/tx-confirm-dialog';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { IpfsImage } from '@/components/ipfs-image';
import { useEntityMutation } from '@/hooks/use-entity-mutation';
import { useIpfsUpload } from '@/hooks/use-ipfs-upload';
import { AdminPermission } from '@/lib/types/models';
import { EntityType, GovernanceMode } from '@/lib/types/enums';
import type { ConfirmDialogConfig } from '@/lib/types/models';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';

// ─── Helpers ────────────────────────────────────────────────

function formatNexBalance(balance: bigint): string {
  const divisor = BigInt('1000000000000');
  const whole = balance / divisor;
  const remainder = balance % divisor;
  const decStr = remainder.toString().padStart(12, '0').slice(0, 4);
  const trimmed = decStr.replace(/0+$/, '');
  return trimmed ? `${whole.toLocaleString()}.${trimmed}` : whole.toLocaleString();
}

/** Permission labels for admin checkboxes */
const PERMISSION_OPTIONS = [
  { label: 'Shop Manage', value: AdminPermission.SHOP_MANAGE },
  { label: 'Member Manage', value: AdminPermission.MEMBER_MANAGE },
  { label: 'Token Manage', value: AdminPermission.TOKEN_MANAGE },
  { label: 'Ads Manage', value: AdminPermission.ADS_MANAGE },
  { label: 'Review Manage', value: AdminPermission.REVIEW_MANAGE },
  { label: 'Disclosure Manage', value: AdminPermission.DISCLOSURE_MANAGE },
  { label: 'Entity Manage', value: AdminPermission.ENTITY_MANAGE },
  { label: 'KYC Manage', value: AdminPermission.KYC_MANAGE },
  { label: 'Governance Manage', value: AdminPermission.GOVERNANCE_MANAGE },
  { label: 'Order Manage', value: AdminPermission.ORDER_MANAGE },
  { label: 'Commission Manage', value: AdminPermission.COMMISSION_MANAGE },
] as const;

// ─── Section: Entity Info Edit ──────────────────────────────

function EntityInfoSection() {
  const { entityId, entity } = useEntityContext();
  const ipfsUpload = useIpfsUpload();
  const t = useTranslations('settings');

  const [name, setName] = useState(entity?.name ?? '');
  const [logoCid, setLogoCid] = useState(entity?.logoCid ?? '');
  const [descriptionCid, setDescriptionCid] = useState(entity?.descriptionCid ?? '');
  const [metadataUri, setMetadataUri] = useState(entity?.metadataUri ?? '');

  const updateEntity = useEntityMutation('entityRegistry', 'updateEntity', {
    invalidateKeys: [['entity', entityId]],
  });

  const handleLogoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const cid = await ipfsUpload.upload(file);
      if (cid) setLogoCid(cid);
    },
    [ipfsUpload],
  );

  const handleDescriptionUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const cid = await ipfsUpload.upload(file);
      if (cid) setDescriptionCid(cid);
    },
    [ipfsUpload],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      updateEntity.mutate([
        entityId,
        name,
        logoCid || null,
        descriptionCid || null,
        metadataUri || null,
      ]);
    },
    [entityId, name, logoCid, descriptionCid, metadataUri, updateEntity],
  );

  const isBusy = updateEntity.txState.status === 'signing' || updateEntity.txState.status === 'broadcasting';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('entityInfo')}</CardTitle>
        <CardDescription>{t('entityInfoDesc')}</CardDescription>
      </CardHeader>

      <CardContent>
        {entity?.logoCid && (
          <div className="mb-6">
            <IpfsImage cid={entity.logoCid} alt="Entity logo" className="h-20 w-20 rounded-lg" />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="entity-name">{t('name')}</Label>
            <Input
              id="entity-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo-upload">{t('logo')}</Label>
            <div className="flex items-center gap-3">
              <Input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="cursor-pointer"
              />
              {ipfsUpload.isUploading && (
                <Badge variant="secondary">{t('uploading')}</Badge>
              )}
            </div>
            {logoCid && (
              <p className="text-xs text-muted-foreground break-all">CID: {logoCid}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc-upload">{t('description')}</Label>
            <div className="flex items-center gap-3">
              <Input
                id="desc-upload"
                type="file"
                onChange={handleDescriptionUpload}
                className="cursor-pointer"
              />
            </div>
            {descriptionCid && (
              <p className="text-xs text-muted-foreground break-all">CID: {descriptionCid}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="metadata-uri">{t('metadataUri')}</Label>
            <Input
              id="metadata-uri"
              type="text"
              value={metadataUri}
              onChange={(e) => setMetadataUri(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isBusy}>
              {t('saveChanges')}
            </Button>
            <TxStatusIndicator txState={updateEntity.txState} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


// ─── Section: Admin Management (Owner only) ─────────────────

function AdminManagementSection() {
  const { entityId } = useEntityContext();
  const t = useTranslations('settings');

  const [adminAddress, setAdminAddress] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState(0);
  const [removeAddress, setRemoveAddress] = useState('');

  const addAdmin = useEntityMutation('entityRegistry', 'addAdmin', {
    invalidateKeys: [['entity', entityId, 'permissions']],
  });

  const removeAdmin = useEntityMutation('entityRegistry', 'removeAdmin', {
    invalidateKeys: [['entity', entityId, 'permissions']],
  });

  const updatePermissions = useEntityMutation('entityRegistry', 'updateAdminPermissions', {
    invalidateKeys: [['entity', entityId, 'permissions']],
  });

  const togglePermission = useCallback((bit: number) => {
    setSelectedPermissions((prev) => prev ^ bit);
  }, []);

  const handleAddAdmin = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!adminAddress.trim()) return;
      addAdmin.mutate([entityId, adminAddress.trim(), selectedPermissions]);
      setAdminAddress('');
      setSelectedPermissions(0);
    },
    [entityId, adminAddress, selectedPermissions, addAdmin],
  );

  const handleRemoveAdmin = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!removeAddress.trim()) return;
      removeAdmin.mutate([entityId, removeAddress.trim()]);
      setRemoveAddress('');
    },
    [entityId, removeAddress, removeAdmin],
  );

  const isAddBusy = addAdmin.txState.status === 'signing' || addAdmin.txState.status === 'broadcasting';
  const isRemoveBusy = removeAdmin.txState.status === 'signing' || removeAdmin.txState.status === 'broadcasting';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('adminManagement')}</CardTitle>
        <CardDescription>{t('adminManagementDesc')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Add Admin */}
        <form onSubmit={handleAddAdmin} className="space-y-4">
          <h3 className="text-sm font-semibold">{t('addAdmin')}</h3>

          <div className="space-y-2">
            <Label htmlFor="admin-address">{t('walletAddress')}</Label>
            <Input
              id="admin-address"
              type="text"
              value={adminAddress}
              onChange={(e) => setAdminAddress(e.target.value)}
              placeholder="5..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t('permissions')}</Label>
            <div className="flex flex-wrap gap-2">
              {PERMISSION_OPTIONS.map((opt) => {
                const checked = (selectedPermissions & opt.value) === opt.value;
                return (
                  <div
                    key={opt.value}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs cursor-pointer transition-colors',
                      checked
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input hover:bg-accent',
                    )}
                    onClick={() => togglePermission(opt.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') togglePermission(opt.value); }}
                    role="checkbox"
                    aria-checked={checked}
                    tabIndex={0}
                  >
                    <Switch
                      checked={checked}
                      onCheckedChange={() => togglePermission(opt.value)}
                      className="h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                    />
                    <span>{opt.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isAddBusy}>
              {t('addAdmin')}
            </Button>
            <TxStatusIndicator txState={addAdmin.txState} />
          </div>
        </form>

        <Separator />

        {/* Remove Admin */}
        <form onSubmit={handleRemoveAdmin} className="space-y-4">
          <h3 className="text-sm font-semibold">{t('removeAdmin')}</h3>

          <div className="space-y-2">
            <Label htmlFor="remove-admin-address">{t('walletAddress')}</Label>
            <Input
              id="remove-admin-address"
              type="text"
              value={removeAddress}
              onChange={(e) => setRemoveAddress(e.target.value)}
              placeholder="5..."
              required
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="destructive" disabled={isRemoveBusy}>
              {t('removeAdmin')}
            </Button>
            <TxStatusIndicator txState={removeAdmin.txState} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


// ─── Section: Fund Management ───────────────────────────────

function FundManagementSection() {
  const { entityId, entity } = useEntityContext();
  const t = useTranslations('settings');
  const [topUpAmount, setTopUpAmount] = useState('');

  const topUpFund = useEntityMutation('entityRegistry', 'topUpFund', {
    invalidateKeys: [['entity', entityId]],
  });

  const handleTopUp = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = topUpAmount.trim();
      if (!trimmed) return;
      // Convert NEX amount (12 decimals) to chain balance
      const parts = trimmed.split('.');
      const whole = parts[0] ?? '0';
      const frac = (parts[1] ?? '').padEnd(12, '0').slice(0, 12);
      const raw = BigInt(whole) * BigInt('1000000000000') + BigInt(frac);
      topUpFund.mutate([entityId, raw.toString()]);
      setTopUpAmount('');
    },
    [entityId, topUpAmount, topUpFund],
  );

  const isBusy = topUpFund.txState.status === 'signing' || topUpFund.txState.status === 'broadcasting';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('fundManagement')}</CardTitle>
        <CardDescription>{t('fundManagementDesc')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Balance display */}
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t('entityFundBalance')}</p>
            <p className="mt-1 text-2xl font-bold">
              {entity ? formatNexBalance(entity.fundBalance) : '—'}{' '}
              <span className="text-sm font-normal text-muted-foreground">NEX</span>
            </p>
          </CardContent>
        </Card>

        {/* Top up form */}
        <form onSubmit={handleTopUp} className="space-y-4">
          <h3 className="text-sm font-semibold">{t('topUp')}</h3>

          <div className="space-y-2">
            <Label htmlFor="topup-amount">{t('topUpAmount')}</Label>
            <Input
              id="topup-amount"
              type="text"
              inputMode="decimal"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              placeholder="0.0"
              required
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isBusy}>
              {t('topUp')}
            </Button>
            <TxStatusIndicator txState={topUpFund.txState} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


// ─── Section: Lifecycle Operations ──────────────────────────

function LifecycleSection() {
  const { entityId, entity, isOwner } = useEntityContext();
  const t = useTranslations('settings');
  const te = useTranslations('enums');

  // Transfer ownership state
  const [newOwner, setNewOwner] = useState('');
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);

  // Close entity state
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  // Bind referrer state
  const [referrerAddress, setReferrerAddress] = useState('');

  // Type upgrade state
  const [newEntityType, setNewEntityType] = useState<EntityType>(EntityType.Merchant);
  const [newGovernanceMode, setNewGovernanceMode] = useState<GovernanceMode>(GovernanceMode.None);

  // Mutations
  const requestClose = useEntityMutation('entityRegistry', 'requestCloseEntity', {
    invalidateKeys: [['entity', entityId]],
  });

  const reopenEntity = useEntityMutation('entityRegistry', 'reopenEntity', {
    invalidateKeys: [['entity', entityId]],
  });

  const transferOwnership = useEntityMutation('entityRegistry', 'transferOwnership', {
    invalidateKeys: [['entity', entityId]],
  });

  const bindReferrer = useEntityMutation('entityRegistry', 'bindEntityReferrer', {
    invalidateKeys: [['entity', entityId]],
  });

  const upgradeType = useEntityMutation('entityRegistry', 'upgradeEntityType', {
    invalidateKeys: [['entity', entityId]],
  });

  // Handlers
  const handleRequestClose = useCallback(() => {
    setCloseDialogOpen(true);
  }, []);

  const confirmClose = useCallback(() => {
    requestClose.mutate([entityId]);
    setCloseDialogOpen(false);
  }, [entityId, requestClose]);

  const handleReopen = useCallback(() => {
    reopenEntity.mutate([entityId]);
  }, [entityId, reopenEntity]);

  const handleTransferClick = useCallback(() => {
    if (!newOwner.trim()) return;
    setTransferDialogOpen(true);
  }, [newOwner]);

  const confirmTransfer = useCallback(() => {
    transferOwnership.mutate([entityId, newOwner.trim()]);
    setTransferDialogOpen(false);
    setNewOwner('');
  }, [entityId, newOwner, transferOwnership]);

  const handleBindReferrer = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!referrerAddress.trim()) return;
      bindReferrer.mutate([entityId, referrerAddress.trim()]);
      setReferrerAddress('');
    },
    [entityId, referrerAddress, bindReferrer],
  );

  const handleUpgradeType = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      upgradeType.mutate([entityId, newEntityType, newGovernanceMode]);
    },
    [entityId, newEntityType, newGovernanceMode, upgradeType],
  );

  const transferDialogConfig: ConfirmDialogConfig = {
    title: t('transferOwnershipConfirmTitle'),
    description: t('transferOwnershipConfirmDesc', { address: newOwner.trim() || '...' }),
    severity: 'danger',
    requireInput: entity?.name,
  };

  const closeDialogConfig: ConfirmDialogConfig = {
    title: t('requestCloseConfirmTitle'),
    description: t('requestCloseConfirmDesc'),
    severity: 'danger',
  };

  const isReopenBusy = reopenEntity.txState.status === 'signing' || reopenEntity.txState.status === 'broadcasting';
  const isBindBusy = bindReferrer.txState.status === 'signing' || bindReferrer.txState.status === 'broadcasting';
  const isUpgradeBusy = upgradeType.txState.status === 'signing' || upgradeType.txState.status === 'broadcasting';
  const isTransferBusy = transferOwnership.txState.status === 'signing' || transferOwnership.txState.status === 'broadcasting';
  const isCloseBusy = requestClose.txState.status === 'signing' || requestClose.txState.status === 'broadcasting';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('lifecycle')}</CardTitle>
        <CardDescription>{t('lifecycleDesc')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Reopen Entity */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t('reopen')}</h3>
          <p className="text-xs text-muted-foreground">{t('reopenDesc')}</p>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleReopen}
              disabled={isReopenBusy}
            >
              {t('reopen')}
            </Button>
            <TxStatusIndicator txState={reopenEntity.txState} />
          </div>
        </div>

        <Separator />

        {/* Bind Referrer */}
        <form onSubmit={handleBindReferrer} className="space-y-3">
          <h3 className="text-sm font-semibold">{t('bindReferrer')}</h3>
          <p className="text-xs text-muted-foreground">{t('bindReferrerDesc')}</p>

          <div className="space-y-2">
            <Label htmlFor="referrer-address">{t('referrerAddress')}</Label>
            <Input
              id="referrer-address"
              type="text"
              value={referrerAddress}
              onChange={(e) => setReferrerAddress(e.target.value)}
              placeholder="5..."
              required
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isBindBusy}>
              {t('bind')}
            </Button>
            <TxStatusIndicator txState={bindReferrer.txState} />
          </div>
        </form>

        <Separator />

        {/* Type Upgrade */}
        <form onSubmit={handleUpgradeType} className="space-y-3">
          <h3 className="text-sm font-semibold">{t('typeUpgrade')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('currentType', { type: entity?.entityType ?? '—' })}
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('newType')}</Label>
              <Select
                value={newEntityType}
                onValueChange={(val) => setNewEntityType(val as EntityType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(EntityType).map((et) => (
                    <SelectItem key={et} value={et}>
                      {te(`entityType.${et}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('newGovernanceMode')}</Label>
              <Select
                value={newGovernanceMode}
                onValueChange={(val) => setNewGovernanceMode(val as GovernanceMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(GovernanceMode).map((gm) => (
                    <SelectItem key={gm} value={gm}>
                      {te(`governanceMode.${gm}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isUpgradeBusy}>
              {t('upgradeType')}
            </Button>
            <TxStatusIndicator txState={upgradeType.txState} />
          </div>
        </form>

        <Separator />

        {/* Transfer Ownership (Owner only, dangerous) */}
        {isOwner && (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-destructive">{t('transferOwnership')}</h3>
              <p className="text-xs text-destructive/80">{t('transferOwnershipWarning')}</p>

              <div className="space-y-2">
                <Label htmlFor="new-owner-address">{t('newOwnerAddress')}</Label>
                <Input
                  id="new-owner-address"
                  type="text"
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  placeholder="5..."
                  className="border-destructive/50 focus-visible:ring-destructive"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleTransferClick}
                  disabled={!newOwner.trim() || isTransferBusy}
                >
                  {t('transferOwnership')}
                </Button>
                <TxStatusIndicator txState={transferOwnership.txState} />
              </div>

              <TxConfirmDialog
                open={transferDialogOpen}
                onClose={() => setTransferDialogOpen(false)}
                onConfirm={confirmTransfer}
                config={transferDialogConfig}
              />
            </div>

            <Separator />
          </>
        )}

        {/* Request Close Entity (dangerous) */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-destructive">{t('requestClose')}</h3>
          <p className="text-xs text-destructive/80">{t('requestCloseWarning')}</p>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="destructive"
              onClick={handleRequestClose}
              disabled={isCloseBusy}
            >
              {t('requestClose')}
            </Button>
            <TxStatusIndicator txState={requestClose.txState} />
          </div>

          <TxConfirmDialog
            open={closeDialogOpen}
            onClose={() => setCloseDialogOpen(false)}
            onConfirm={confirmClose}
            config={closeDialogConfig}
          />
        </div>
      </CardContent>
    </Card>
  );
}


// ─── Page: Settings ─────────────────────────────────────────

export function SettingsPage() {
  const { isOwner } = useEntityContext();
  const t = useTranslations('settings');

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="mb-6 w-full justify-start">
          <TabsTrigger value="info">{t('entityInfo')}</TabsTrigger>
          <TabsTrigger value="admin">{t('adminManagement')}</TabsTrigger>
          <TabsTrigger value="fund">{t('fundManagement')}</TabsTrigger>
          <TabsTrigger value="lifecycle">{t('lifecycle')}</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <PermissionGuard required={AdminPermission.ENTITY_MANAGE}>
            <EntityInfoSection />
          </PermissionGuard>
        </TabsContent>

        <TabsContent value="admin">
          {isOwner ? (
            <AdminManagementSection />
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t('ownerOnlyAdmins')}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="fund">
          <PermissionGuard required={AdminPermission.ENTITY_MANAGE}>
            <FundManagementSection />
          </PermissionGuard>
        </TabsContent>

        <TabsContent value="lifecycle">
          <PermissionGuard required={AdminPermission.ENTITY_MANAGE}>
            <LifecycleSection />
          </PermissionGuard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
