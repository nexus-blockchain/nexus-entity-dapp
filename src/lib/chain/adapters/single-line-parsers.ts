import type {
  LevelBasedLevels,
  SingleLineConfig,
  SingleLineMemberViewData,
  SingleLinePosition,
  SingleLinePreviewData,
  SingleLineStats,
} from '@/lib/types/models';

function toPlain(raw: unknown): any {
  if (!raw) return null;
  if ((raw as { isNone?: boolean }).isNone) return null;
  const unwrapped = (raw as { unwrapOr?: (d: null) => unknown }).unwrapOr?.(null) ?? raw;
  if (!unwrapped) return null;
  return (unwrapped as any).toJSON?.() ?? unwrapped;
}

export function parseSingleLineConfig(raw: unknown): SingleLineConfig | null {
  const obj = toPlain(raw);
  if (!obj) return null;
  return {
    enabled: true,
    uplineRate: Number(obj.uplineRate ?? obj.upline_rate ?? 0),
    downlineRate: Number(obj.downlineRate ?? obj.downline_rate ?? 0),
    baseUplineLevels: Number(obj.baseUplineLevels ?? obj.base_upline_levels ?? 0),
    baseDownlineLevels: Number(obj.baseDownlineLevels ?? obj.base_downline_levels ?? 0),
    levelIncrementThreshold: BigInt(String(obj.levelIncrementThreshold ?? obj.level_increment_threshold ?? 0)),
    maxUplineLevels: Number(obj.maxUplineLevels ?? obj.max_upline_levels ?? 0),
    maxDownlineLevels: Number(obj.maxDownlineLevels ?? obj.max_downline_levels ?? 0),
  };
}

export function parseLevelBasedLevels(levelId: number, raw: unknown): LevelBasedLevels | null {
  const obj = toPlain(raw);
  if (!obj) return null;
  return {
    levelId,
    uplineLevels: Number(obj.uplineLevels ?? obj.upline_levels ?? 0),
    downlineLevels: Number(obj.downlineLevels ?? obj.downline_levels ?? 0),
  };
}

export function parseSingleLinePosition(raw: unknown): SingleLinePosition | null {
  const obj = toPlain(raw);
  if (!obj) return null;
  return {
    position: Number(obj.position ?? 0),
    previousAccount: (obj.previousAccount ?? obj.previous_account ?? null) as string | null,
    nextAccount: (obj.nextAccount ?? obj.next_account ?? null) as string | null,
    queueLength: Number(obj.queueLength ?? obj.queue_length ?? 0),
    uplineLevels: Number(obj.uplineLevels ?? obj.upline_levels ?? 0),
    downlineLevels: Number(obj.downlineLevels ?? obj.downline_levels ?? 0),
  };
}

export function parseSingleLineMemberView(raw: unknown): SingleLineMemberViewData | null {
  const obj = toPlain(raw);
  if (!obj) return null;
  const positionInfo = obj.positionInfo ?? obj.position_info ?? null;
  const summary = obj.summary ?? {};
  const recentPayouts = Array.isArray(obj.recentPayouts ?? obj.recent_payouts)
    ? (obj.recentPayouts ?? obj.recent_payouts)
    : [];

  return {
    positionInfo: positionInfo
      ? {
          position: Number(positionInfo.position ?? 0),
          queueLength: Number(positionInfo.queueLength ?? positionInfo.queue_length ?? 0),
          uplineLevels: Number(positionInfo.uplineLevels ?? positionInfo.upline_levels ?? 0),
          downlineLevels: Number(positionInfo.downlineLevels ?? positionInfo.downline_levels ?? 0),
          previousAccount: (positionInfo.previousAccount ?? positionInfo.previous_account ?? null) as string | null,
          nextAccount: (positionInfo.nextAccount ?? positionInfo.next_account ?? null) as string | null,
        }
      : null,
    isEnabled: Boolean(obj.isEnabled ?? obj.is_enabled ?? false),
    summary: {
      totalEarnedAsUpline: BigInt(String(summary.totalEarnedAsUpline ?? summary.total_earned_as_upline ?? 0)),
      totalEarnedAsDownline: BigInt(String(summary.totalEarnedAsDownline ?? summary.total_earned_as_downline ?? 0)),
      totalPayoutCount: Number(summary.totalPayoutCount ?? summary.total_payout_count ?? 0),
      lastPayoutBlock: Number(summary.lastPayoutBlock ?? summary.last_payout_block ?? 0),
    },
    recentPayouts: recentPayouts.map((item: any) => ({
      orderId: Number(item.orderId ?? item.order_id ?? 0),
      buyer: String(item.buyer ?? ''),
      amount: BigInt(String(item.amount ?? 0)),
      direction: Number(item.direction ?? 0),
      levelDistance: Number(item.levelDistance ?? item.level_distance ?? 0),
      blockNumber: Number(item.blockNumber ?? item.block_number ?? 0),
    })),
  };
}

export function parseSingleLinePreview(raw: unknown): SingleLinePreviewData[] {
  const obj = toPlain(raw);
  const items = Array.isArray(obj) ? obj : [];
  return items.map((item: any) => ({
    beneficiary: String(item.beneficiary ?? ''),
    amount: BigInt(String(item.amount ?? 0)),
    commissionType: String(item.commissionType ?? item.commission_type ?? ''),
    level: Number(item.level ?? 0),
  }));
}

export function parseSingleLineStats(raw: unknown): SingleLineStats | null {
  const obj = toPlain(raw);
  if (!obj) return null;
  const stats = obj.stats ?? {};
  return {
    isEnabled: Boolean(obj.isEnabled ?? obj.is_enabled ?? false),
    queueLength: Number(obj.queueLength ?? obj.queue_length ?? 0),
    remainingCapacityInTailSegment: Number(
      obj.remainingCapacityInTailSegment ?? obj.remaining_capacity_in_tail_segment ?? 0,
    ),
    segmentCount: Number(obj.segmentCount ?? obj.segment_count ?? 0),
    stats: {
      totalOrders: Number(stats.totalOrders ?? stats.total_orders ?? 0),
      totalUplinePayouts: Number(stats.totalUplinePayouts ?? stats.total_upline_payouts ?? 0),
      totalDownlinePayouts: Number(stats.totalDownlinePayouts ?? stats.total_downline_payouts ?? 0),
    },
  };
}
