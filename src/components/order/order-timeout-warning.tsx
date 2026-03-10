'use client';

import React from 'react';
import { OrderStatus } from '@/lib/types/enums';
import { Clock, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

const ORDER_TIMEOUT_BLOCKS = 100_800;
const WARNING_THRESHOLD = 0.2;

interface OrderTimeoutWarningProps {
  updatedAt: number;
  currentBlock: number;
  status: OrderStatus;
}

const TIMEOUT_RELEVANT_STATUSES = new Set<OrderStatus>([
  OrderStatus.Created,
  OrderStatus.Paid,
  OrderStatus.Shipped,
  OrderStatus.ServiceStarted,
  OrderStatus.ServiceCompleted,
  OrderStatus.RefundRequested,
]);

export function OrderTimeoutWarning({ updatedAt, currentBlock, status }: OrderTimeoutWarningProps) {
  const t = useTranslations('order');
  if (!TIMEOUT_RELEVANT_STATUSES.has(status)) return null;
  if (currentBlock <= 0 || updatedAt <= 0) return null;

  const expiryBlock = updatedAt + ORDER_TIMEOUT_BLOCKS;
  const remaining = expiryBlock - currentBlock;

  if (remaining <= 0) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>{t('timeoutExpired')}</span>
      </div>
    );
  }

  const progress = remaining / ORDER_TIMEOUT_BLOCKS;
  if (progress > WARNING_THRESHOLD) return null;

  const hoursRemaining = Math.round((remaining * 6) / 3600);
  const timeText = hoursRemaining > 0 ? t('timeoutHours', { hours: hoursRemaining }) : t('timeoutLessThanHour');

  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span>{t('timeoutWarning', { time: timeText })}</span>
    </div>
  );
}
