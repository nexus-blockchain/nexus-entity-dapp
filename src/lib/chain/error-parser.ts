import type { ApiPromise } from '@polkadot/api';
import type { DispatchError } from '@polkadot/types/interfaces';
import type { ChainError } from '@/lib/types';

/** Common error message translations (fallback when i18n not available) */
const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  entityRegistry: {
    EntityNotFound: '实体不存在',
    NotEntityOwner: '非实体所有者',
    EntitySuspended: '实体已被暂停',
    EntityClosed: '实体已关闭',
    InsufficientFund: '资金不足',
    PermissionDenied: '权限不足',
    AlreadyAdmin: '已是管理员',
    NotAdmin: '非管理员',
    GovernanceLocked: '治理已锁定',
  },
  entityShop: {
    ShopNotFound: '店铺不存在',
    ShopClosed: '店铺已关闭',
    FundDepleted: '运营资金已耗尽',
    NotShopOwner: '非店铺所有者',
  },
  entityProduct: {
    ProductNotFound: '商品不存在',
    InvalidPrice: '价格无效',
    OutOfStock: '库存不足',
  },
  entityTransaction: {
    OrderNotFound: '订单不存在',
    InvalidOrderStatus: '订单状态无效',
    PaymentFailed: '支付失败',
    OrderExpired: '订单已过期',
    Overflow: '订单索引已满，请先清理历史订单',
    NothingToClean: '没有可清理的历史订单',
  },
  entityToken: {
    TokenNotConfigured: '代币未配置',
    ExceedsMaxSupply: '超出最大供应量',
    TransferRestricted: '转账受限',
    InsufficientBalance: '余额不足',
  },
  entityMarket: {
    MarketNotActive: '市场未激活',
    CircuitBreakerActive: '熔断器已触发',
    InsufficientLiquidity: '流动性不足',
    PriceDeviationExceeded: '价格偏差超限',
  },
  entityMember: {
    NotMember: '非会员',
    MemberBanned: '会员已被封禁',
    MemberFrozen: '会员已被冻结',
    RegistrationClosed: '注册已关闭',
    InvalidPolicyBits: '无效的策略位标记',
    BatchLimitExceeded: '批量操作超出上限（最多50）',
    PendingMemberNotFound: '待审批记录不存在',
    AlreadyMember: '已经是会员',
    AlreadyPending: '已有待审批的注册申请',
    NotEntityAdmin: '非实体管理员',
    EntityLocked: '实体已锁定',
    ShopNotFound: '店铺不存在',
    ReferrerRequired: '需要推荐人',
    KycNotVerified: 'KYC 未通过验证',
  },
  entityGovernance: {
    ProposalNotFound: '提案不存在',
    VotingEnded: '投票已结束',
    AlreadyVoted: '已投票',
    QuorumNotReached: '未达法定人数',
  },
  entityKyc: {
    KycNotFound: 'KYC 记录不存在',
    KycAlreadySubmitted: 'KYC 已提交',
    KycAlreadyApproved: 'KYC 已审批',
    KycExpired: 'KYC 已过期',
    InvalidKycLevel: '无效的 KYC 等级',
    ProviderNotAuthorized: '提供者未授权',
    KycPending: 'KYC 正在审批中',
  },
  entityTokenSale: {
    SaleRoundNotFound: '发售轮次不存在',
    SaleNotActive: '发售未激活',
    SaleEnded: '发售已结束',
    ExceedsHardCap: '超出硬顶',
    BelowMinPurchase: '低于最小购买量',
    ExceedsMaxPurchase: '超出最大购买量',
    NotWhitelisted: '不在白名单中',
    AlreadyClaimed: '已领取',
    TokensNotVested: '代币未解锁',
    SoftCapNotReached: '未达软顶',
  },
  entityDisclosure: {
    DisclosureNotFound: '披露记录不存在',
    NotInsider: '非内幕人员',
    BlackoutPeriodActive: '黑窗口期内禁止操作',
    DisclosureAlreadyPublished: '披露已发布',
    InvalidDisclosureLevel: '无效的披露等级',
  },
  entityReview: {
    ReviewNotFound: '评价不存在',
    ReviewDisabled: '评价功能已关闭',
    AlreadyReviewed: '已提交评价',
    InvalidRating: '评分无效（1-5）',
  },
  commissionCore: {
    PluginNotEnabled: '佣金插件未启用',
    WithdrawalPaused: '提现已暂停',
    InsufficientCommission: '佣金余额不足',
    CooldownNotExpired: '冷却期未结束',
  },
  commissionSingleLine: {
    InvalidRate: '佣金比例无效',
    InvalidLevels: '层数无效',
    BaseLevelsExceedMax: '基础层数超出最大值',
    ConfigNotFound: '单线佣金未配置',
    LevelOverrideExceedsMax: '等级覆盖的层数超出配置的最大上/下线层数限制',
    LevelIdNotFound: '等级 ID 不存在',
    SingleLineIsPaused: '单线佣金已暂停',
    SingleLineNotPaused: '单线佣金未暂停',
    RatesTooHigh: '佣金比例过高',
  },
  commissionPoolReward: {
    InvalidRoundDuration: '轮次时长无效（必须大于零且不低于最小值）',
    RoundDurationTooShort: '轮次时长太短',
  },
  nexMarket: {
    ZeroPrice: '价格不能为零',
    AmountTooSmall: '数量太小',
    OrderAmountBelowMinimum: '订单金额低于最低限额',
    OrderAmountTooLarge: '订单金额超过最大限额',
    InsufficientBalance: '余额不足',
    InvalidTronAddress: '无效的 Tron 地址',
    MarketPaused: '市场已暂停',
    OrderNotFound: '订单不存在',
    TradeNotFound: '交易不存在',
    NotSeller: '非卖家',
    NotBuyer: '非买家',
    UserBanned: '用户已被封禁',
    FirstOrderLimitReached: '已达首单免保证金限额',
    FirstOrderAmountTooLarge: '首单金额超过最大限额',
    BuyerAlreadyCompleted: '您已完成过首单免保证金交易',
  },
  escrow: {
    EscrowNotFound: '托管记录不存在',
    EscrowAlreadyReleased: '托管已释放',
    NotDepositor: '非存款人',
    NotBeneficiary: '非受益人',
  },
};

/**
 * Parse a DispatchError into a user-friendly ChainError.
 * Falls back to raw error info if no translation is available.
 */
export function parseDispatchError(api: ApiPromise, error: DispatchError): ChainError {
  if (error.isModule) {
    const decoded = api.registry.findMetaError(error.asModule);
    const moduleName = decoded.section;
    const errorName = decoded.name;

    const translatedMessage = ERROR_MESSAGES[moduleName]?.[errorName];
    const message = translatedMessage || decoded.docs.join(' ') || `${moduleName}.${errorName}`;

    return { module: moduleName, name: errorName, message };
  }

  if (error.isBadOrigin) {
    return { module: 'system', name: 'BadOrigin', message: '调用来源无效' };
  }
  if (error.isCannotLookup) {
    return { module: 'system', name: 'CannotLookup', message: '无法查找账户' };
  }
  if (error.isOther) {
    return { module: 'system', name: 'Other', message: '未知错误' };
  }

  return { module: 'unknown', name: 'Unknown', message: '交易执行失败' };
}
