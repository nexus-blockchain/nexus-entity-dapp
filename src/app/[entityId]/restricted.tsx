'use client';

import { useTranslations } from 'next-intl';
import { EntityStatus } from '@/lib/types/enums';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert, Ban } from 'lucide-react';

interface RestrictedProps {
  entityId: number;
  status: EntityStatus;
}

export function EntityRestricted({ entityId, status }: RestrictedProps) {
  const t = useTranslations('entity');
  const isBanned = status === EntityStatus.Banned;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
      <Card className="max-w-md w-full border-destructive/50">
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            {isBanned ? (
              <Ban className="h-8 w-8 text-destructive" />
            ) : (
              <ShieldAlert className="h-8 w-8 text-warning" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-destructive">
              {isBanned ? t('banned') : t('suspended')}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {isBanned
                ? t('bannedDescription', { entityId })
                : t('suspendedDescription', { entityId })}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('contactAdmin')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
