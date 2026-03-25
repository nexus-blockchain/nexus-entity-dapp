'use client';

import { useMemo, useState, useCallback } from 'react';
import { paginateArray, type PaginatedResult } from '@/lib/chain/paginated-entries';

const DEFAULT_PAGE_SIZE = 20;

export interface UsePaginatedOptions {
  pageSize?: number;
  initialPage?: number;
}

export interface UsePaginatedReturn<T> extends PaginatedResult<T> {
  /** Go to a specific page (1-indexed) */
  setPage: (page: number) => void;
  /** Go to the next page */
  nextPage: () => void;
  /** Go to the previous page */
  prevPage: () => void;
}

/**
 * Client-side pagination for arrays already fetched by React Query.
 *
 * Usage:
 * ```ts
 * const { members, isLoading } = useMembers();
 * const paginated = usePaginatedQuery(members, { pageSize: 20 });
 * // paginated.items, paginated.page, paginated.totalPages, etc.
 * ```
 */
export function usePaginatedQuery<T>(
  allItems: T[],
  options?: UsePaginatedOptions,
): UsePaginatedReturn<T> {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const [page, setPage] = useState(options?.initialPage ?? 1);

  const result = useMemo(
    () => paginateArray(allItems, page, pageSize),
    [allItems, page, pageSize],
  );

  const nextPage = useCallback(() => {
    setPage((p) => Math.min(p + 1, result.totalPages));
  }, [result.totalPages]);

  const prevPage = useCallback(() => {
    setPage((p) => Math.max(p - 1, 1));
  }, []);

  return {
    ...result,
    setPage,
    nextPage,
    prevPage,
  };
}
