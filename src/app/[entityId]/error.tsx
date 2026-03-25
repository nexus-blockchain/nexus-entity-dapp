'use client';

import { useEffect } from 'react';
import { ErrorCard } from '@/components/error-boundary';

export default function EntityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[EntityError]', error);
  }, [error]);

  return <ErrorCard error={error} onRetry={reset} />;
}
