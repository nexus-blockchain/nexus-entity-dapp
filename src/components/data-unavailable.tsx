'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface DataUnavailableProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function DataUnavailable({ message, onRetry, className }: DataUnavailableProps) {
  const t = useTranslations('dataUnavailable');
  const displayMessage = message || t('default');

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-3 text-sm text-muted-foreground',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{displayMessage}</span>
        </div>
        {onRetry && (
          <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3 w-3" />
            {t('retry')}
          </Button>
        )}
      </div>
    </div>
  );
}
