import '@testing-library/jest-dom/vitest';

import React from 'react';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '../messages/en.json';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function TestProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(createTestQueryClient);

  return React.createElement(
    NextIntlClientProvider as any,
    { locale: 'en', messages: enMessages },
    React.createElement(QueryClientProvider, { client: queryClient }, children),
  );
}

function render(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, {
    wrapper: TestProviders,
    ...options,
  });
}

export * from '@testing-library/react';
export { createTestQueryClient, render };
