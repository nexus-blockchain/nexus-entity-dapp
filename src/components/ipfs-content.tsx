'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ipfsUrl } from '@/lib/utils/ipfs';
import { cn } from '@/lib/utils/cn';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useIpfsGatewayStore } from '@/stores/ipfs-gateway-store';

interface IpfsContentProps {
  cid: string;
  className?: string;
}

export function IpfsContent({ cid, className }: IpfsContentProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations('ipfs');
  const getOrderedGateways = useIpfsGatewayStore((s) => s.getOrderedGateways);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    setContent(null);

    const gateways = getOrderedGateways();
    let lastErr: string | null = null;

    for (const gw of gateways) {
      try {
        const response = await fetch(ipfsUrl(cid, gw));
        if (!response.ok) {
          throw new Error(`Failed to fetch (${response.status})`);
        }
        const text = await response.text();
        setContent(text);
        setLoading(false);
        return;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : 'Failed to load content';
      }
    }

    setError(lastErr ?? 'Failed to load content');
    setLoading(false);
  }, [cid, getOrderedGateways]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  if (loading) {
    return (
      <div className={className} role="status" aria-label="Loading content">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-3/4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-destructive', className)} role="alert">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{t('loadFailed')}</span>
        <Button variant="ghost" size="sm" className="h-auto px-2 py-0.5 text-xs" onClick={fetchContent}>
          <RefreshCw className="mr-1 h-3 w-3" />
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="whitespace-pre-wrap text-sm">{content}</p>
    </div>
  );
}
