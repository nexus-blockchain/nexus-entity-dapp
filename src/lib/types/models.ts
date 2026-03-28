import {
  EntityType,
  EntityStatus,
  GovernanceMode,
  TokenType,
  TransferRestrictionMode,
  ShopType,
  EffectiveShopStatus,
  ProductCategory,
  ProductStatus,
  ProductVisibility,
  OrderStatus,
  PaymentAsset,
  MemberStatus,
  KycLevel,
  KycStatus,
  CommissionPlugin,
  SalesThresholdMode,
  TxStatus,
  RenderMode,
} from './enums';

// AdminPermission 常量对象（11 个权限位）
export const AdminPermission = {
  SHOP_MANAGE:       0x001,
  MEMBER_MANAGE:     0x002,
  TOKEN_MANAGE:      0x004,
  ADS_MANAGE:        0x008,
  REVIEW_MANAGE:     0x010,
  DISCLOSURE_MANAGE: 0x020,
  ENTITY_MANAGE:     0x040,
  KYC_MANAGE:        0x080,
  GOVERNANCE_MANAGE: 0x100,
  ORDER_MANAGE:      0x200,
  COMMISSION_MANAGE: 0x400,
  ALL:               0xFFFFFFFF,
} as const;

export type AdminPermissionValue = (typeof AdminPermission)[keyof typeof AdminPermission];

// Entity 基本信息
export interface EntityData {
  id: number;
  owner: string;
  name: string;
  logoCid: string | null;
  descriptionCid: string | null;
  metadataUri: string | null;
  contactCid: string | null;
  status: EntityStatus;
  entityType: EntityType;
  governanceMode: GovernanceMode;
  verified: boolean;
  governanceLocked: boolean;
  fundBalance: bigint;
  createdAt: number;
}

// Entity Context (used by EntityProvider)
export interface EntityContext {
  entityId: number;
  entity: EntityData | null;
  isLoading: boolean;
  error: string | null;
  permissions: number;
  isOwner: boolean;
  isReadOnly: boolean;
  isSuspended: boolean;
  entityType: EntityType;
  governanceMode: GovernanceMode;
}

// Shop 数据
export interface PointsConfig {
  rewardRateBps: number;
  exchangeRateBps: number;
  transferable: boolean;
}

export interface ShopData {
  id: number;
  entityId: number;
  name: string;
  shopType: ShopType;
  status: string;
  effectiveStatus: EffectiveShopStatus;
  fundBalance: bigint;
}

// Shop points config (queried separately from entityLoyalty pallet)
export interface ShopPointsConfig {
  name: string;
  symbol: string;
  rewardRateBps: number;
  exchangeRateBps: number;
  transferable: boolean;
}

// 商品数据
export interface ProductData {
  id: number;
  shopId: number;
  nameCid: string;
  imagesCid: string;
  detailCid: string;
  price: bigint;
  usdtPrice: number;
  stock: number;
  category: ProductCategory;
  visibility: ProductVisibility;
  levelGate: number | null;
  status: ProductStatus;
  sortWeight: number;
  tagsCid: string | null;
  skuCid: string | null;
  minOrderQuantity: number;
  maxOrderQuantity: number;
}

// 订单数据
export interface OrderData {
  id: number;
  entityId: number;
  shopId: number;
  productId: number;
  buyer: string;
  seller: string;
  payer: string | null;
  quantity: number;
  unitPrice: bigint;
  paymentAsset: PaymentAsset;
  totalAmount: bigint;
  platformFee: bigint;
  usdtTotal: bigint;
  nexUsdtRate: bigint;
  tokenNexRate: bigint;
  tokenPaymentAmount: bigint;
  shoppingBalanceUsed: bigint;
  tokenDiscountTokensBurned: bigint;
  productCategory: ProductCategory;
  status: OrderStatus;
  escrowId: number | null;
  shippingCid: string | null;
  trackingCid: string | null;
  noteCid: string | null;
  refundReasonCid: string | null;
  disputeDeadline: number | null;
  createdAt: number;
  shippedAt: number | null;
  completedAt: number | null;
  serviceStartedAt: number | null;
  serviceCompletedAt: number | null;
  confirmExtended: boolean;
  disputeRejected: boolean;
  updatedAt: number;
}

// 代币配置
export interface TokenDividendConfig {
  enabled: boolean;
  minPeriod: number;
}

export interface TokenConfig {
  entityId: number;
  name: string;
  symbol: string;
  decimals: number;
  tokenType: TokenType;
  totalSupply: bigint;
  maxSupply: bigint;
  transferRestriction: TransferRestrictionMode;
  enabled: boolean;
  rewardRate: number;
  exchangeRate: number;
  minRedeem: bigint;
  maxRedeemPerOrder: bigint;
  transferable: boolean;
  createdAt: number;
  dividendConfig: TokenDividendConfig | null;
  minReceiverKyc: KycLevel;
}

// 价格保护配置
export interface PriceProtectionConfig {
  maxDeviationBps: number;
  circuitBreakerThreshold: number;
  circuitBreakerDuration: number;
}

// 市场订单
export interface MarketOrder {
  id: number;
  entityId: number;
  trader: string;
  side: 'Buy' | 'Sell';
  price: bigint;
  amount: bigint;
  filled: bigint;
  createdAt: number;
  depositWaived: boolean;
}

// 市场统计
export interface MarketStats {
  twapPrice: bigint;
  lastPrice: bigint;
  volume24h: bigint;
  circuitBreakerActive: boolean;
  priceProtection: PriceProtectionConfig;
}

// 会员数据
export interface MemberData {
  entityId: number;
  account: string;
  status: MemberStatus;
  level: number;
  effectiveLevel: number;
  referrer: string | null;
  directReferrals: number;
  indirectReferrals: number;
  teamSize: number;
  joinedAt: number;
  lastActiveAt: number;
  totalSpent: bigint;
  upgradeEligibleSpent: bigint;
  orderCount: number;
  banReason: string | null;
}

// 待审批会员数据
export interface PendingMemberData {
  account: string;
  referrer: string | null;
  appliedAt: number;
}

// 自定义等级
export interface CustomLevel {
  id: number;
  name: string;
  threshold: bigint;
  discountRate: number;
  commissionBonus: number;
  // Referral / team upgrade thresholds (0 = no requirement)
  minDirectReferrals: number;
  minTeamSize: number;
  minIndirectReferrals: number;
}

// 等级系统完整数据（含系统级配置）
export interface LevelSystemData {
  levels: CustomLevel[];
  useCustom: boolean;
  upgradeMode: string;
}

// 升级规则
export interface UpgradeRule {
  id: number;
  name: string;
  trigger: { type: string; data: Record<string, number> };
  targetLevelId: number;
  duration: number | null;
  enabled: boolean;
  priority: number;
  stackable: boolean;
  maxTriggers: number | null;
  triggerCount: number;
}

// 升级规则系统
export interface UpgradeRuleSystem {
  rules: UpgradeRule[];
  nextRuleId: number;
  enabled: boolean;
  conflictStrategy: string;
}

// 提案数据
export interface ProposalData {
  id: number;
  entityId: number;
  proposer: string;
  proposalType: string;
  proposalPayload?: Record<string, unknown>;
  title: string;
  description: string;
  descriptionCid: string;
  votesApprove: bigint;
  votesReject: bigint;
  votesAbstain: bigint;
  quorumPct: number;
  passThreshold: number;
  endBlock: number;
  status: string;
  executed: boolean;
}

// ─── Core Commission Types ──────────────────────────────────

/** @deprecated Use CoreCommissionConfig instead */
export interface CommissionConfig {
  entityId: number;
  enabled: boolean;
  baseRate: number;
  enabledModes: number;
  withdrawalConfig: WithdrawalConfig;
  withdrawalPaused: boolean;
}

/** @deprecated Use EntityWithdrawalConfig instead */
export interface WithdrawalConfig {
  minAmount: bigint;
  feeRate: number;
  cooldown: number;
}

export interface PluginBudgetCaps {
  referralCap: number;
  multiLevelCap: number;
  levelDiffCap: number;
  singleLineCap: number;
  teamCap: number;
}

export interface CoreCommissionConfig {
  enabledModes: number;
  maxCommissionRate: number;
  enabled: boolean;
  withdrawalCooldown: number;
  creatorRewardRate: number;
  tokenWithdrawalCooldown: number;
  pluginBudgetCaps: PluginBudgetCaps | null;
}

export type WithdrawalMode =
  | { type: 'FullWithdrawal' }
  | { type: 'FixedRate'; repurchaseRate: number }
  | { type: 'LevelBased' }
  | { type: 'MemberChoice'; minRepurchaseRate: number };

export interface WithdrawalTierConfig {
  withdrawalRate: number;
  repurchaseRate: number;
}

export interface EntityWithdrawalConfig {
  mode: WithdrawalMode;
  defaultTier: WithdrawalTierConfig;
  levelOverrides: [number, WithdrawalTierConfig][];
  voluntaryBonusRate: number;
  enabled: boolean;
}

export interface MemberCommissionStats {
  totalEarned: bigint;
  pending: bigint;
  withdrawn: bigint;
  repurchased: bigint;
  orderCount: number;
}

export interface MemberTokenCommissionStats {
  totalEarned: bigint;
  pending: bigint;
  withdrawn: bigint;
  repurchased: bigint;
  orderCount: number;
}

export interface WithdrawalRecord {
  amount: bigint;
  repurchaseAmount: bigint;
  block: number;
}

export interface TokenWithdrawalRecord {
  amount: bigint;
  repurchaseAmount: bigint;
  block: number;
}

export interface ShopCommissionTotals {
  totalDistributed: bigint;
  totalOrders: number;
}

// ─── Referral Extended Types ────────────────────────────────

export interface ReferrerGuardConfig {
  minReferrerSpent: bigint;
  minReferrerOrders: number;
}

export interface CommissionCapConfig {
  maxPerOrder: bigint;
  maxTotalEarned: bigint;
}

// 多级佣金层级（与链端 MultiLevelTier 一致）
export interface MultiLevelTier {
  rate: number;
  requiredDirects: number;
  requiredTeamSize: number;
  requiredSpent: bigint;
  requiredLevelId: number;
}

// 多级佣金配置（与链端 MultiLevelConfig 一致）
export interface MultiLevelConfig {
  levels: MultiLevelTier[];
}

// 多级佣金统计
export interface MultiLevelStats {
  totalDistributed: bigint;
  orderCount: number;
  totalDistributionEntries: number;
}

// 会员关系
export interface MemberRelation {
  parent: string | null;
  depth: number;
  directReferrals: number;
}

// 推荐佣金配置
export interface ReferralConfig {
  enabled: boolean;
  rewardRate: number;
}

// 推荐佣金统计
export interface ReferralStats {
  totalReferrals: number;
  totalRewardDistributed: bigint;
  activeReferrers: number;
}

// 推荐人记录
export interface ReferrerRecord {
  referrer: string | null;
  totalReferred: number;
  totalEarned: bigint;
}

// 级差佣金配置
export interface LevelDiffConfig {
  levelRates: number[];
  maxDepth: number;
}

// 级差佣金统计
export interface LevelDiffStats {
  totalDistributed: bigint;
  activeLevels: number;
  maxLevelReached: number;
}

// 单线佣金配置
export interface SingleLineConfig {
  enabled: boolean;
  uplineRate: number;
  downlineRate: number;
  baseUplineLevels: number;
  baseDownlineLevels: number;
  levelIncrementThreshold: bigint;
  maxUplineLevels: number;
  maxDownlineLevels: number;
}

// 单线佣金统计
export interface SingleLineStats {
  isEnabled: boolean;
  queueLength: number;
  remainingCapacityInTailSegment: number;
  segmentCount: number;
  stats: {
    totalOrders: number;
    totalUplinePayouts: number;
    totalDownlinePayouts: number;
  };
}

// 单线位置
export interface SingleLinePosition {
  position: number;
  previousAccount: string | null;
  nextAccount: string | null;
  queueLength: number;
  uplineLevels: number;
  downlineLevels: number;
}

// 单线会员详情
export interface SingleLineMemberViewData {
  positionInfo: {
    position: number;
    queueLength: number;
    uplineLevels: number;
    downlineLevels: number;
    previousAccount: string | null;
    nextAccount: string | null;
  } | null;
  isEnabled: boolean;
  summary: {
    totalEarnedAsUpline: bigint;
    totalEarnedAsDownline: bigint;
    totalPayoutCount: number;
    lastPayoutBlock: number;
  };
  recentPayouts: Array<{
    orderId: number;
    buyer: string;
    amount: bigint;
    direction: number;
    levelDistance: number;
    blockNumber: number;
  }>;
}

// 单线预览输出
export interface SingleLinePreviewData {
  beneficiary: string;
  amount: bigint;
  commissionType: string;
  level: number;
}

// 单线等级层数覆盖
export interface LevelBasedLevels {
  levelId: number;
  uplineLevels: number;
  downlineLevels: number;
}

// 团队佣金配置（与链端 TeamPerformanceConfig 一致）
export interface TeamConfig {
  enabled: boolean;
  tiers: TeamTier[];
  maxDepth: number;
  allowStacking: boolean;
  thresholdMode: SalesThresholdMode;
}

// 团队层级（与链端 TeamPerformanceTier 一致）
export interface TeamTier {
  salesThreshold: bigint;
  minTeamSize: number;
  rate: number;
}

// 团队佣金统计
export interface TeamStats {
  totalDistributed: bigint;
  totalTeams: number;
  activeTeamLeaders: number;
}

// 团队信息
export interface TeamInfo {
  leader: string;
  teamSize: number;
  teamPerformance: bigint;
  currentTier: number;
  directCount: number;
}

export interface CapBehaviorFixed {
  type: 'Fixed';
}

export interface CapBehaviorUnlockByTeam {
  type: 'UnlockByTeam';
  directPerUnlock: number;
  teamPerUnlock: number;
  unlockPercent: number;
}

export type CapBehavior = CapBehaviorFixed | CapBehaviorUnlockByTeam;

export interface LevelClaimRule {
  baseCapPercent: number;
  capBehavior: CapBehavior;
}

export interface FundingSummary {
  nexCommissionRemainder: bigint;
  tokenPlatformFeeRetention: bigint;
  tokenCommissionRemainder: bigint;
  nexCancelReturn: bigint;
  totalFundingCount: number;
}

// 奖池佣金配置
export interface PoolRewardConfig {
  levelRules: Array<[number, LevelClaimRule]>;
  roundDuration: number;
  tokenPoolEnabled: boolean;
}

// 奖池佣金统计 (DistributionStatistics)
export interface PoolRewardStats {
  totalNexDistributed: bigint;
  totalTokenDistributed: bigint;
  totalRoundsCompleted: number;
  totalClaims: number;
}

// 等级快照
export interface LevelSnapshot {
  levelId: number;
  memberCount: number;
  claimedCount: number;
}

// 当前轮次信息
export interface PoolRewardRoundInfo {
  roundId: number;
  startBlock: number;
  endBlock: number | null;
  poolSnapshot: bigint;
  eligibleCount: number;
  perMemberReward: bigint;
  claimedCount: number;
  levelSnapshots: LevelSnapshot[];
  tokenPoolSnapshot: bigint | null;
  tokenPerMemberReward: bigint | null;
  tokenClaimedCount: number;
  tokenLevelSnapshots: LevelSnapshot[] | null;
  fundingSummary: FundingSummary | null;
}

// 领取记录
export interface PoolRewardClaimRecord {
  roundId: number;
  amount: bigint;
  tokenAmount: bigint;
  levelId: number;
  claimedAt: number;
}

// KYC 记录
export interface KycRecord {
  entityId: number;
  account: string;
  level: KycLevel;
  status: KycStatus;
  dataCid: string;
  countryCode: string | null;
  riskScore: number;
  submittedAt: number;
  expiresAt: number | null;
}

export interface EntityKycRequirement {
  minLevel: KycLevel;
  mandatory: boolean;
  gracePeriod: number;
  allowHighRiskCountries: boolean;
  maxRiskScore: number;
}

// Vesting 配置（与链端 VestingConfig 一致）
export interface VestingConfig {
  vestingType: string;
  initialUnlockBps: number;
  cliffDuration: number;
  totalDuration: number;
  unlockInterval: number;
}

// 发售轮次（与链端 SaleRound 一致）
export interface SaleRound {
  id: number;
  entityId: number;
  mode: string;
  status: string;
  totalSupply: bigint;
  soldAmount: bigint;
  remainingAmount: bigint;
  participantsCount: number;
  paymentOptionsCount: number;
  vestingConfig: VestingConfig | null;
  kycRequired: boolean;
  minKycLevel: number;
  startBlock: number;
  endBlock: number;
  dutchStartPrice: bigint | null;
  dutchEndPrice: bigint | null;
  creator: string;
  createdAt: number;
  fundsWithdrawn: boolean;
  cancelledAt: number | null;
  totalRefundedTokens: bigint;
  totalRefundedNex: bigint;
  softCap: bigint;
}

// 链上错误
export interface ChainError {
  module: string;
  name: string;
  message: string;
}

// 交易确认对话框配置
export interface ConfirmDialogConfig {
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'danger';
  requireInput?: string;
}

// 通知
export interface Notification {
  id: string;
  pallet: string;
  event: string;
  summary: string;
  timestamp: number;
  read: boolean;
}

// 交易状态
export interface TxState {
  status: TxStatus;
  hash: string | null;
  error: string | null;
  blockNumber: number | null;
}
