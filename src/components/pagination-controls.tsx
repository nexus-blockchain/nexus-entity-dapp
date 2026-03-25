'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginatedResult } from '@/lib/chain/paginated-entries';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  onSetPage: (page: number) => void;
}

export function PaginationControls({
  page,
  totalPages,
  totalCount,
  hasNextPage,
  hasPrevPage,
  onPrevPage,
  onNextPage,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-xs text-muted-foreground">
        {totalCount} items
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevPage}
          disabled={!hasPrevPage}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onNextPage}
          disabled={!hasNextPage}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Convenience wrapper: accepts a PaginatedResult + callbacks directly */
export function PaginationFromResult<T>({
  result,
  onPrevPage,
  onNextPage,
  onSetPage,
}: {
  result: PaginatedResult<T>;
  onPrevPage: () => void;
  onNextPage: () => void;
  onSetPage: (page: number) => void;
}) {
  return (
    <PaginationControls
      page={result.page}
      totalPages={result.totalPages}
      totalCount={result.totalCount}
      hasNextPage={result.hasNextPage}
      hasPrevPage={result.hasPrevPage}
      onPrevPage={onPrevPage}
      onNextPage={onNextPage}
      onSetPage={onSetPage}
    />
  );
}
