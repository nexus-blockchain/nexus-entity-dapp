'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApi } from '@/lib/chain/api-provider';
import { useNodeHealthStore, type NodeStatus, type NodeSource } from '@/stores/node-health-store';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, X } from 'lucide-react';

const STATUS_COLOR: Record<NodeStatus | 'connecting', string> = {
  healthy: 'bg-green-500',
  slow: 'bg-yellow-500',
  unhealthy: 'bg-red-500',
  unknown: 'bg-gray-400',
  connecting: 'bg-gray-400',
};

const STATUS_PULSE: Record<NodeStatus | 'connecting', boolean> = {
  healthy: true,
  slow: false,
  unhealthy: false,
  unknown: false,
  connecting: true,
};

function getOverallStatus(connectionStatus: string, activeNode: { status: NodeStatus } | undefined): NodeStatus | 'connecting' {
  if (connectionStatus === 'connecting') return 'connecting';
  if (connectionStatus === 'error' || connectionStatus === 'disconnected') return 'unhealthy';
  if (!activeNode) return 'unknown';
  return activeNode.status;
}

function formatLatency(ms: number | null): string {
  if (ms === null) return '--';
  return `${ms}ms`;
}

function formatBlockHeight(height: number | null): string {
  if (height === null) return '--';
  return `#${height.toLocaleString()}`;
}

function shortenEndpoint(ep: string): string {
  try {
    const url = new URL(ep);
    return url.host;
  } catch {
    return ep.length > 30 ? `${ep.slice(0, 27)}...` : ep;
  }
}

export interface NodeHealthIndicatorProps {
  collapsed?: boolean;
}

export function NodeHealthIndicator({ collapsed = false }: NodeHealthIndicatorProps) {
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState(false);
  const t = useTranslations('node');
  const { connectionStatus, activeEndpoint, switchNode, isDiscovering, addManualNode } = useApi();
  const nodes = useNodeHealthStore((s) => s.nodes);
  const preferredEndpoint = useNodeHealthStore((s) => s.preferredEndpoint);
  const setPreferredEndpoint = useNodeHealthStore((s) => s.setPreferredEndpoint);
  const removeNode = useNodeHealthStore((s) => s.removeNode);

  const activeNode = nodes.find((n) => n.endpoint === activeEndpoint);
  const overallStatus = getOverallStatus(connectionStatus, activeNode);
  const dotColor = STATUS_COLOR[overallStatus];
  const shouldPulse = STATUS_PULSE[overallStatus];

  const seedCount = nodes.filter((n) => n.source === 'seed').length;
  const discoveredCount = nodes.filter((n) => n.source === 'discovered').length;

  const handleSwitch = (ep: string) => {
    setSwitchingTo(ep);
    switchNode(ep);
    setTimeout(() => setSwitchingTo(null), 5000);
  };

  const handleClearPreference = () => {
    setPreferredEndpoint(null);
  };

  const handleRemoveNode = (ep: string) => {
    removeNode(ep);
  };

  const handleAddNode = async () => {
    const ep = manualInput.trim();
    if (!ep) return;
    setIsAdding(true);
    setAddError(false);
    try {
      const ok = await addManualNode(ep);
      if (ok) {
        setManualInput('');
      } else {
        setAddError(true);
      }
    } catch {
      setAddError(true);
    } finally {
      setIsAdding(false);
    }
  };

  const statusLabel = (status: NodeStatus): string => {
    const map: Record<NodeStatus, string> = {
      healthy: t('healthy'),
      slow: t('slow'),
      unhealthy: t('unhealthy'),
      unknown: t('unknown'),
    };
    return map[status];
  };

  const statusBadgeVariant = (status: NodeStatus): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' => {
    const map: Record<NodeStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
      healthy: 'success',
      slow: 'warning',
      unhealthy: 'destructive',
      unknown: 'secondary',
    };
    return map[status];
  };

  const sourceLabel = (source: NodeSource): string => {
    const map: Record<NodeSource, string> = {
      seed: t('seed'),
      discovered: t('discovered'),
      manual: t('manual'),
    };
    return map[source];
  };

  const dotIndicator = (
    <span className="relative flex h-2.5 w-2.5">
      {shouldPulse && (
        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', dotColor)} />
      )}
      <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', dotColor)} />
    </span>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex justify-center py-2 w-full"
            onClick={() => setOpen(!open)}
            aria-label={t('title')}
          >
            {dotIndicator}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <span className="text-xs">
            {activeEndpoint ? shortenEndpoint(activeEndpoint) : t('unknown')}
            {activeNode?.latencyMs != null && ` · ${formatLatency(activeNode.latencyMs)}`}
          </span>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (nodes.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
        {dotIndicator}
        <span className="truncate">
          {activeEndpoint ? shortenEndpoint(activeEndpoint) : connectionStatus === 'connecting' ? t('switching') : '--'}
        </span>
        {activeNode?.latencyMs != null && (
          <span className="shrink-0">{formatLatency(activeNode.latencyMs)}</span>
        )}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors w-full"
          aria-label={t('title')}
        >
          {dotIndicator}
          <span className="truncate">
            {activeEndpoint ? shortenEndpoint(activeEndpoint) : connectionStatus === 'connecting' ? t('switching') : '--'}
          </span>
          {activeNode?.latencyMs != null && (
            <span className="shrink-0 ml-auto">{formatLatency(activeNode.latencyMs)}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="top">
        <div className="px-4 py-3">
          <h3 className="text-sm font-semibold">{t('title')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('nodeCountDetailed', {
              total: nodes.length,
              seedCount,
              discoveredCount,
            })}
          </p>
          {isDiscovering && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('discovering')}
            </p>
          )}
        </div>
        <Separator />
        <ScrollArea className="max-h-64">
          {nodes.map((node) => {
            const isActive = node.endpoint === activeEndpoint;
            const isSwitching = node.endpoint === switchingTo;
            const isPreferred = node.endpoint === preferredEndpoint;
            const canRemove = node.source === 'discovered' || node.source === 'manual';

            return (
              <div
                key={node.endpoint}
                className={cn(
                  'border-b last:border-b-0 px-4 py-2.5',
                  isActive && 'bg-primary/5',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className={cn(
                      'inline-flex h-2 w-2 rounded-full',
                      STATUS_COLOR[node.status],
                    )} />
                  </span>
                  <span className="text-xs font-medium truncate flex-1">
                    {shortenEndpoint(node.endpoint)}
                  </span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1">
                    {sourceLabel(node.source)}
                  </Badge>
                  {isActive && (
                    <Badge variant="default" className="text-[9px] h-4 px-1">
                      {t('active')}
                    </Badge>
                  )}
                  {isPreferred && !isActive && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                      {t('preferred')}
                    </Badge>
                  )}
                  {!isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px]"
                      disabled={isSwitching}
                      onClick={() => handleSwitch(node.endpoint)}
                    >
                      {isSwitching ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        t('switch')
                      )}
                    </Button>
                  )}
                  {canRemove && !isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveNode(node.endpoint)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {/* Show latency + block for all nodes */}
                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground pl-4">
                  {node.status !== 'unknown' && (
                    <Badge variant={statusBadgeVariant(node.status)} className="text-[9px] h-4 px-1">
                      {statusLabel(node.status)}
                    </Badge>
                  )}
                  <span>{t('latency')}: {formatLatency(node.latencyMs)}</span>
                  <span>{t('blockHeight')}: {formatBlockHeight(node.blockHeight)}</span>
                </div>
              </div>
            );
          })}
        </ScrollArea>
        <Separator />
        {/* Add node input */}
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Input
              className="h-7 text-xs flex-1"
              placeholder={t('addNodePlaceholder')}
              value={manualInput}
              onChange={(e) => {
                setManualInput(e.target.value);
                setAddError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddNode();
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={isAdding || !manualInput.trim()}
              onClick={handleAddNode}
            >
              {isAdding ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                t('addNode')
              )}
            </Button>
          </div>
          {addError && (
            <p className="text-[10px] text-destructive mt-1">{t('addNodeFailed')}</p>
          )}
        </div>
        <Separator />
        <div className="px-4 py-2.5 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {preferredEndpoint ? t('autoFailover') : t('autoSelect')}
          </span>
          {preferredEndpoint && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px]"
              onClick={handleClearPreference}
            >
              {t('clearPreference')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
