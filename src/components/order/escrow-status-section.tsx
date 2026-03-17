'use client';

import React from 'react';
import { useEscrowStatus, type EscrowStatus } from '@/hooks/use-escrow-status';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

const ESCROW_STATUS_CONFIG: Record<EscrowStatus, { labelKey: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline' }> = {
  Held: { labelKey: 'escrowStatus.Escrowed', variant: 'default' },
  Released: { labelKey: 'escrowStatus.Released', variant: 'success' },
  Refunded: { labelKey: 'escrowStatus.Refunded', variant: 'warning' },
  Disputed: { labelKey: 'escrowStatus.DisputeFrozen', variant: 'destructive' },
  Closed: { labelKey: 'escrowStatus.Closed', variant: 'secondary' },
};

export function EscrowStatusSection({ escrowId }: { escrowId: number }) {
  const { escrow, isLoading, isError } = useEscrowStatus(escrowId);
  const t = useTranslations('order');
  const te = useTranslations('enums');

  if (isLoading) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <Shield className="h-3 w-3 text-muted-foreground" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  if (isError || !escrow) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <AlertCircle className="h-3 w-3" />
        <span>{t('escrowUnavailable')}</span>
      </div>
    );
  }

  const cfg = ESCROW_STATUS_CONFIG[escrow.status];

  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <Shield className="h-3 w-3 text-muted-foreground" />
      <span className="text-muted-foreground">{t('escrowLabel')}</span>
      <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0">
        {te(cfg.labelKey)}
      </Badge>
      <span className="text-muted-foreground opacity-70">{t('escrowIdLabel', { id: escrow.id })}</span>
    </div>
  );
}
