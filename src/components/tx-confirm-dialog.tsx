'use client';

import React, { useState, useCallback } from 'react';
import type { ConfirmDialogConfig } from '@/lib/types/models';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface TxConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  config: ConfirmDialogConfig;
}

const severityIcon: Record<ConfirmDialogConfig['severity'], React.ReactNode> = {
  info: <Info className="h-5 w-5 text-primary" />,
  warning: <AlertTriangle className="h-5 w-5 text-warning" />,
  danger: <ShieldAlert className="h-5 w-5 text-destructive" />,
};

const severityBg: Record<ConfirmDialogConfig['severity'], string> = {
  info: 'bg-primary/5 border-primary/20 text-primary',
  warning: 'bg-warning/5 border-warning/20 text-warning',
  danger: 'bg-destructive/5 border-destructive/20 text-destructive',
};

export function TxConfirmDialog({ open, onClose, onConfirm, config }: TxConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const t = useTranslations('tx');
  const tc = useTranslations('common');

  const needsInput = typeof config.requireInput === 'string' && config.requireInput.length > 0;
  const confirmEnabled = needsInput ? inputValue === config.requireInput : true;

  const handleConfirm = useCallback(() => {
    if (confirmEnabled) {
      setInputValue('');
      onConfirm();
    }
  }, [confirmEnabled, onConfirm]);

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setInputValue('');
      onClose();
    }
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {severityIcon[config.severity]}
            <DialogTitle>{config.title}</DialogTitle>
          </div>
        </DialogHeader>

        <div className={cn('rounded-md border p-3 text-sm', severityBg[config.severity])}>
          {config.description}
        </div>

        {needsInput && (
          <div className="space-y-2">
            <Label htmlFor="confirm-input">
              {t('inputConfirm', { input: config.requireInput! })}
            </Label>
            <Input
              id="confirm-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={config.requireInput}
              autoComplete="off"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button
            variant={config.severity === 'danger' ? 'destructive' : 'default'}
            disabled={!confirmEnabled}
            onClick={handleConfirm}
          >
            {tc('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
