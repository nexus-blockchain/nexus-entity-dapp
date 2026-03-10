'use client';

import React, { useRef, useState, useEffect } from 'react';
import { ipfsUrl } from '@/lib/utils/ipfs';
import { cn } from '@/lib/utils/cn';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface IpfsImageProps {
  cid: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
}

export function IpfsImage({ cid, alt, className, width, height }: IpfsImageProps) {
  const imgRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const t = useTranslations('ipfs');

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const src = ipfsUrl(cid);

  return (
    <div
      ref={imgRef}
      className={cn('relative overflow-hidden rounded-md', className)}
      style={{ width: width ?? undefined, height: height ?? undefined }}
    >
      {!isVisible || (!loaded && !error) ? (
        <Skeleton className="absolute inset-0" />
      ) : null}
      {error ? (
        <div className="flex h-full w-full items-center justify-center bg-muted rounded-md min-h-[48px]">
          <div className="flex flex-col items-center gap-1">
            <ImageOff className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('imageFailed')}</span>
          </div>
        </div>
      ) : null}
      {isVisible && !error ? (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={cn(
            'h-full w-full object-cover',
            !loaded && 'hidden',
          )}
        />
      ) : null}
    </div>
  );
}
