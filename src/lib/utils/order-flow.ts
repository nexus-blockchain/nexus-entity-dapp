import { ProductCategory, OrderStatus } from '@/lib/types/enums';
import type { OrderData } from '@/lib/types/models';

/**
 * 订单流程按商品类别分化
 *
 * Digital:  Created → Paid → Completed（即时完成）
 * Physical: Created → Paid → Shipped → Completed（含发货确认）
 * Service:  Created → Paid → Shipped → Completed
 *           （服务开始/完成通过 serviceStartedAt / serviceCompletedAt 细分）
 * Subscription/Bundle/Other: 使用 Physical 流程作为默认
 */

const DIGITAL_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.Created]: [OrderStatus.Paid],
  [OrderStatus.Paid]: [OrderStatus.Completed],
};

const PHYSICAL_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.Created]: [OrderStatus.Paid],
  [OrderStatus.Paid]: [OrderStatus.Shipped],
  [OrderStatus.Shipped]: [OrderStatus.Completed],
};

const SERVICE_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.Created]: [OrderStatus.Paid],
  [OrderStatus.Paid]: [OrderStatus.Shipped],
  [OrderStatus.Shipped]: [OrderStatus.Completed],
};

function getTransitionMap(category: ProductCategory): Partial<Record<OrderStatus, OrderStatus[]>> {
  switch (category) {
    case ProductCategory.Digital:
      return DIGITAL_TRANSITIONS;
    case ProductCategory.Service:
      return SERVICE_TRANSITIONS;
    case ProductCategory.Physical:
    case ProductCategory.Subscription:
    case ProductCategory.Bundle:
    case ProductCategory.Other:
    default:
      return PHYSICAL_TRANSITIONS;
  }
}

/**
 * 获取指定商品类别和当前订单状态下的合法下一步状态列表
 */
export function getValidOrderTransitions(
  category: ProductCategory,
  currentStatus: OrderStatus,
): OrderStatus[] {
  const map = getTransitionMap(category);
  return map[currentStatus] ?? [];
}

/**
 * 是否为服务类流程（当前链端 Service/Subscription 共用 start_service 流程）
 */
export function isServiceLikeCategory(category: ProductCategory): boolean {
  return category === ProductCategory.Service || category === ProductCategory.Subscription;
}

/**
 * 服务类订单的派生阶段（链上仍可能保持 status = Shipped）
 */
export type DerivedOrderStage =
  | 'servicePendingStart'
  | 'serviceInProgress'
  | 'serviceAwaitingConfirmation';

export function getDerivedOrderStage(
  order: Pick<OrderData, 'productCategory' | 'status' | 'serviceCompletedAt'>,
): DerivedOrderStage | null {
  if (!isServiceLikeCategory(order.productCategory)) return null;

  if (order.status === OrderStatus.Paid) {
    return 'servicePendingStart';
  }

  if (order.status === OrderStatus.AwaitingConfirmation) {
    return 'serviceAwaitingConfirmation';
  }

  if (order.status === OrderStatus.Shipped) {
    return order.serviceCompletedAt != null
      ? 'serviceAwaitingConfirmation'
      : 'serviceInProgress';
  }

  return null;
}

export type SellerOrderAction =
  | 'shipOrder'
  | 'startService'
  | 'completeService'
  | 'approveRefund'
  | 'sellerCancelOrder';

export type BuyerOrderAction =
  | 'confirmReceipt'
  | 'confirmService'
  | 'requestRefund'
  | 'cancelOrder';

export function getSellerOrderActions(
  order: Pick<OrderData, 'productCategory' | 'status' | 'serviceCompletedAt'>,
): SellerOrderAction[] {
  if (order.status === OrderStatus.Disputed) {
    return ['approveRefund'];
  }

  if (order.status === OrderStatus.Paid) {
    return isServiceLikeCategory(order.productCategory)
      ? ['startService', 'sellerCancelOrder']
      : ['shipOrder', 'sellerCancelOrder'];
  }

  if (
    isServiceLikeCategory(order.productCategory) &&
    order.status === OrderStatus.Shipped &&
    order.serviceCompletedAt == null
  ) {
    return ['completeService'];
  }

  return [];
}

export function getBuyerOrderActions(
  order: Pick<OrderData, 'productCategory' | 'status' | 'serviceCompletedAt'>,
): BuyerOrderAction[] {
  if (order.status === OrderStatus.Paid) {
    return ['requestRefund', 'cancelOrder'];
  }

  if (order.status === OrderStatus.Shipped || order.status === OrderStatus.AwaitingConfirmation) {
    if (isServiceLikeCategory(order.productCategory)) {
      return order.serviceCompletedAt != null
        ? ['confirmService', 'requestRefund']
        : ['requestRefund'];
    }

    return ['confirmReceipt', 'requestRefund'];
  }

  return [];
}

/**
 * 兼容旧导出，当前未使用。
 */
export const SELLER_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.Shipped]: '确认发货',
  [OrderStatus.Disputed]: '批准退款',
};

/**
 * 兼容旧导出，当前未使用。
 */
export const BUYER_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.Completed]: '确认完成',
  [OrderStatus.AwaitingConfirmation]: '确认收货',
};
