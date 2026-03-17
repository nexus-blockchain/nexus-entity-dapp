'use client';

import React, { useState, useCallback } from 'react';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useReview, validateRating } from '@/hooks/use-review';
import { PermissionGuard } from '@/components/permission-guard';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';

import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { CopyableAddress } from '@/components/copyable-address';
import { LabelWithTip } from '@/components/field-help-tip';

// ─── Helpers ────────────────────────────────────────────────

function isTxBusy(m: { txState: { status: string } }): boolean {
  return m.txState.status === 'signing' || m.txState.status === 'broadcasting';
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="text-yellow-500">
      {Array.from({ length: 5 }, (_, i) => (i < rating ? '\u2605' : '\u2606')).join('')}
    </span>
  );
}

// ─── Star Rating Selector ───────────────────────────────────

function StarSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" onClick={() => onChange(star)}
          className={cn(
            'text-2xl transition-colors',
            star <= value ? 'text-yellow-500' : 'text-muted-foreground/40',
          )}>
          {star <= value ? '\u2605' : '\u2606'}
        </button>
      ))}
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────

function ReviewsSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-24" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Review Toggle (Admin) ──────────────────────────────────

function ReviewToggleSection() {
  const t = useTranslations('reviews');
  const { entityId } = useEntityContext();
  const { reviewEnabled, setReviewEnabled } = useReview();

  const handleToggle = useCallback(() => {
    setReviewEnabled.mutate([entityId, !reviewEnabled]);
  }, [entityId, reviewEnabled, setReviewEnabled]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{t('reviewToggle')}</CardTitle>
            <CardDescription>
              {t('currentStatus')}
              <Badge variant={reviewEnabled ? 'success' : 'destructive'} className="ml-2">
                {reviewEnabled ? t('reviewEnabled') : t('reviewDisabled')}
              </Badge>
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={reviewEnabled}
              onCheckedChange={handleToggle}
              disabled={isTxBusy(setReviewEnabled)}
            />
            <TxStatusIndicator txState={setReviewEnabled.txState} />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}


// ─── Submit Review Form ─────────────────────────────────────

function SubmitReviewForm() {
  const t = useTranslations('reviews');
  const { entityId } = useEntityContext();
  const { submitReview } = useReview();
  const [orderId, setOrderId] = useState('');
  const [rating, setRating] = useState(0);
  const [contentCid, setContentCid] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(() => {
    setError('');
    if (!orderId.trim()) { setError(t('enterOrderId')); return; }
    if (!validateRating(rating)) { setError(t('selectRating')); return; }
    if (!contentCid.trim()) { setError(t('enterContentCid')); return; }
    submitReview.mutate([entityId, Number(orderId), rating, contentCid.trim()]);
    setOrderId('');
    setRating(0);
    setContentCid('');
  }, [entityId, orderId, rating, contentCid, submitReview]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('submitReview')}</CardTitle>
        <CardDescription>{t('onlyCompletedOrders')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <LabelWithTip htmlFor="review-order" tip={t('help.orderId')}>{t('orderId')}</LabelWithTip>
          <Input id="review-order" type="number" value={orderId} onChange={(e) => setOrderId(e.target.value)}
            placeholder={t('orderIdPlaceholder')} />
        </div>
        <div className="space-y-1.5">
          <LabelWithTip tip={t('help.rating')}>{t('rating')}</LabelWithTip>
          <StarSelector value={rating} onChange={setRating} />
        </div>
        <div className="space-y-1.5">
          <LabelWithTip htmlFor="review-cid" tip={t('help.contentCid')}>{t('contentCid')}</LabelWithTip>
          <Input id="review-cid" value={contentCid} onChange={(e) => setContentCid(e.target.value)}
            placeholder={t('contentCidPlaceholder')} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="gap-3">
        <Button onClick={handleSubmit} disabled={isTxBusy(submitReview)}>{t('submitReviewBtn')}</Button>
        <TxStatusIndicator txState={submitReview.txState} />
      </CardFooter>
    </Card>
  );
}

// ─── Review List ────────────────────────────────────────────

function ReviewListSection() {
  const t = useTranslations('reviews');
  const { reviews } = useReview();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('reviewList')}</CardTitle>
      </CardHeader>
      <CardContent>
        {reviews.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noReviews')}</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <Card key={r.id} className="shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{t('reviewOrderNumber', { orderId: r.orderId })}</span>
                      <StarDisplay rating={r.rating} />
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">
                      <CopyableAddress address={r.reviewer} textClassName="text-xs" hideCopyIcon />
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">CID: {r.contentCid}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function ReviewsPage() {
  const t = useTranslations('reviews');
  const tc = useTranslations('common');
  const { isLoading, error } = useReview();

  if (isLoading) {
    return <ReviewsSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center text-sm text-destructive">
            {tc('loadFailed', { error: String(error) })}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>

      <PermissionGuard required={AdminPermission.REVIEW_MANAGE} fallback={null}>
        <ReviewToggleSection />
      </PermissionGuard>

      <SubmitReviewForm />
      <ReviewListSection />
    </div>
  );
}
