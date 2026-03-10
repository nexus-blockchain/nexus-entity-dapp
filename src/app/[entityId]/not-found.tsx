'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SearchX, Home } from 'lucide-react';

export function EntityNotFound({ entityId }: { entityId: number }) {
  const t = useTranslations('entity');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <SearchX className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-4xl font-bold">404</h1>
            <p className="mt-2 text-muted-foreground">
              {t('notFoundWithId', { entityId })}
            </p>
          </div>
          <Link href="/">
            <Button>
              <Home className="mr-2 h-4 w-4" />
              {t('backToHome')}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NotFound() {
  const t = useTranslations('entity');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <SearchX className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-4xl font-bold">404</h1>
            <p className="mt-2 text-muted-foreground">{t('notFound')}</p>
          </div>
          <Link href="/">
            <Button>
              <Home className="mr-2 h-4 w-4" />
              {t('backToHome')}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
