'use client';

import React, { useState } from 'react';
import type { Notification } from '@/lib/types/models';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Bell, Check, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface NotificationCenterProps {
  notifications: Notification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onClearAll: () => void;
}

export function NotificationCenter({
  notifications,
  unreadCount,
  onMarkAsRead,
  onClearAll,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('notifications');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? t('titleWithCount', { count: unreadCount }) : t('title')}
          data-testid="notification-bell"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold">{t('title')}</h3>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={onClearAll}
              data-testid="notification-clear-all"
            >
              <Trash2 className="mr-1 h-3 w-3" />
              {t('clearAll')}
            </Button>
          )}
        </div>
        <Separator />
        <ScrollArea className="max-h-96">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground" data-testid="notification-empty">
              {t('noNotifications')}
            </div>
          ) : (
            <div>
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={onMarkAsRead}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}

function NotificationItem({ notification, onMarkAsRead }: NotificationItemProps) {
  const t = useTranslations('notifications');
  const timeAgo = formatTimeAgo(notification.timestamp, t);

  return (
    <div
      className={cn(
        'border-b px-4 py-3 last:border-b-0 transition-colors',
        notification.read ? 'bg-background' : 'bg-primary/5',
      )}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm">{notification.summary}</p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {notification.pallet}
            </Badge>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>
        </div>
        {!notification.read && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => onMarkAsRead(notification.id)}
            aria-label={t('markAsRead')}
          >
            <Check className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number, t: ReturnType<typeof useTranslations<'notifications'>>): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return t('timeJustNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('timeMinutesAgo', { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('timeHoursAgo', { hours });
  const days = Math.floor(hours / 24);
  return t('timeDaysAgo', { days });
}
