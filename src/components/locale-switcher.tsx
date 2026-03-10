'use client';

import { useLocale } from '@/app/providers';
import { locales, type Locale } from '@/i18n/config';
import { cn } from '@/lib/utils/cn';
import { Globe } from 'lucide-react';

const LOCALE_LABELS: Record<Locale, string> = {
  zh: '中文',
  en: 'EN',
};

export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex items-center gap-1.5">
      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="flex items-center gap-0.5 rounded-md border bg-muted/50 p-0.5 text-xs">
        {locales.map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={cn(
              'rounded px-2 py-1 transition-colors',
              locale === l
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background',
            )}
            aria-label={`Switch to ${LOCALE_LABELS[l]}`}
            aria-pressed={locale === l}
          >
            {LOCALE_LABELS[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
