'use client';

import { useTranslations } from 'next-intl';
import { EntityProvider, useEntityContext } from './entity-provider';
import { useApi } from '@/lib/chain/api-provider';
import { computeRenderMode } from '@/lib/utils/entity-status';
import { EntityNotFound } from './not-found';
import { EntityRestricted } from './restricted';
import { EntitySidebar } from '@/components/sidebar/entity-sidebar';
import { AlertTriangle, Loader2, Wifi, WifiOff } from 'lucide-react';

function EntityLayoutInner({ children }: { children: React.ReactNode }) {
  const { entityId, entity, isLoading, error, isReadOnly } = useEntityContext();
  const { connectionStatus, activeEndpoint } = useApi();
  const t = useTranslations('layout');

  if (connectionStatus !== 'connected' && !entity) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              {connectionStatus === 'error' ? (
                <WifiOff className="h-7 w-7 text-destructive" />
              ) : (
                <Wifi className="h-7 w-7 text-primary animate-pulse" />
              )}
            </div>
            {connectionStatus !== 'error' && (
              <Loader2 className="absolute -top-1 -right-1 h-5 w-5 animate-spin text-primary" />
            )}
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">
              {connectionStatus === 'connecting'
                ? t('connecting')
                : connectionStatus === 'error'
                  ? t('connectFailed')
                  : t('waiting')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('endpoint')}: {activeEndpoint || 'ws://127.0.0.1:9944'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('loadingEntity')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center max-w-md">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <p className="text-sm font-medium text-destructive">{t('loadFailed')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const renderMode = computeRenderMode(entity?.status ?? null);

  if (renderMode === 'not_found') {
    return <EntityNotFound entityId={entityId} />;
  }

  if (renderMode === 'restricted') {
    return <EntityRestricted entityId={entityId} status={entity!.status} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {isReadOnly && (
        <div className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/5 px-4 py-2 text-sm text-warning">
          <AlertTriangle className="h-4 w-4" />
          {t('readOnlyNotice')}
        </div>
      )}
      <div className="flex min-h-screen">
        <EntitySidebar />
        <main className="flex-1 overflow-auto pb-16 md:pb-0">{children}</main>
      </div>
    </div>
  );
}

export function EntityLayoutClient({
  params,
  children,
}: {
  params: { entityId: string };
  children: React.ReactNode;
}) {
  const entityId = Number(params.entityId);

  if (Number.isNaN(entityId) || entityId <= 0 || !Number.isInteger(entityId)) {
    return <EntityNotFound entityId={entityId} />;
  }

  return (
    <EntityProvider entityId={entityId}>
      <EntityLayoutInner>{children}</EntityLayoutInner>
    </EntityProvider>
  );
}
