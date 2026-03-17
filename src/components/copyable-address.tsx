'use client';

import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface CopyableAddressProps {
  address: string;
  className?: string;
  /** Extra CSS for the address text itself */
  textClassName?: string;
  /** Hide the copy icon (useful in very tight spaces) */
  hideCopyIcon?: boolean;
}

export function CopyableAddress({
  address,
  className,
  textClassName,
  hideCopyIcon,
}: CopyableAddressProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* ignore */
      }
    },
    [address],
  );

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted transition-colors group max-w-full',
        className,
      )}
      title={address}
    >
      <span
        className={cn(
          'font-mono text-xs break-all text-left',
          textClassName,
        )}
      >
        {address}
      </span>
      {!hideCopyIcon && (
        copied ? (
          <Check className="h-3 w-3 shrink-0 text-green-500" />
        ) : (
          <Copy className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )
      )}
    </button>
  );
}
