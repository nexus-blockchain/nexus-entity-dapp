/**
 * Client-side pagination for Substrate `.entries()` results.
 *
 * Substrate storage queries don't support offset/limit pagination.
 * This utility caches the full result set (via React Query) and returns
 * paginated slices with metadata.
 */

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function paginateArray<T>(
  items: T[],
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: items.slice(start, end),
    page: safePage,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
  };
}
