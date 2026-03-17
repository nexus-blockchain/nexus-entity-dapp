'use client';

import * as React from 'react';
import { HelpCircle } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';

interface FieldHelpTipProps {
  content: string;
}

export function FieldHelpTip({ content }: FieldHelpTipProps) {
  if (!content) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Help"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-sm" side="top" sideOffset={5}>
        {content}
      </PopoverContent>
    </Popover>
  );
}

interface LabelWithTipProps
  extends React.ComponentPropsWithoutRef<typeof Label> {
  tip?: string;
}

export const LabelWithTip = React.forwardRef<
  React.ElementRef<typeof Label>,
  LabelWithTipProps
>(({ tip, children, ...props }, ref) => {
  if (!tip) {
    return (
      <Label ref={ref} {...props}>
        {children}
      </Label>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Label ref={ref} {...props}>
        {children}
      </Label>
      <FieldHelpTip content={tip} />
    </div>
  );
});
LabelWithTip.displayName = 'LabelWithTip';
