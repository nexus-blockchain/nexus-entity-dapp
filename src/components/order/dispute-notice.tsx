'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function DisputeNotice() {
  const t = useTranslations('order');
  return (
    <div className="mt-2 flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">{t('disputeTitle')}</p>
        <p className="mt-1 opacity-80">
          {t('disputeDesc')}
        </p>
      </div>
    </div>
  );
}
