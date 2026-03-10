'use client';

import React from 'react';
import type { TxState } from '@/lib/types/models';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { Loader2, CheckCircle, XCircle, Radio } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface TxStatusIndicatorProps {
  txState: TxState;
}

export function TxStatusIndicator({ txState }: TxStatusIndicatorProps) {
  const t = useTranslations('tx');
  if (txState.status === 'idle') return null;

  const config = statusConfig[txState.status];
  const label = resolveLabel(txState, t);

  return (
    <div className={cn('flex items-center gap-2 text-sm', config.className)} data-testid="tx-status">
      {config.icon}
      <span data-testid="tx-status-label">{label}</span>
    </div>
  );
}

const statusConfig: Record<Exclude<TxState['status'], 'idle'>, {
  className: string;
  icon: React.ReactNode;
}> = {
  signing: {
    className: 'text-warning',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
  },
  broadcasting: {
    className: 'text-primary',
    icon: <Radio className="h-4 w-4 animate-pulse" />,
  },
  inBlock: {
    className: 'text-primary',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
  },
  finalized: {
    className: 'text-green-600',
    icon: <CheckCircle className="h-4 w-4" />,
  },
  error: {
    className: 'text-destructive',
    icon: <XCircle className="h-4 w-4" />,
  },
};

function resolveLabel(txState: TxState, t: ReturnType<typeof useTranslations<'tx'>>): string {
  switch (txState.status) {
    case 'signing':
      return t('signing');
    case 'broadcasting':
      return t('broadcasting');
    case 'inBlock': {
      const label = t('inBlock', { blockNumber: txState.blockNumber !== null ? String(txState.blockNumber) : '' });
      return label;
    }
    case 'finalized': {
      const label = t('finalized');
      if (txState.hash) {
        return `${label} (${txState.hash.slice(0, 10)}...)`;
      }
      return label;
    }
    case 'error':
      return txState.error ?? t('error');
    default:
      return '';
  }
}
