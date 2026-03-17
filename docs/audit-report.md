# Nexus Entity dApp 前端审计报告

> 审计日期：2026-03-16
> 对比范围：`pallets/` 全部链端代码 vs `nexus-entity-dapp/src/` 前端代码

---

## 目录

1. [缺失功能总览](#1-缺失功能总览)
2. [按模块详细分析：缺失的 Extrinsic / Query](#2-按模块详细分析)
3. [完全缺失的 Pallet（无前端页面）](#3-完全缺失的-pallet)
4. [BUG 列表](#4-bug-列表)
5. [代码质量问题](#5-代码质量问题)
6. [建议优先级](#6-建议优先级)

---

## 1. 缺失功能总览

| 模块 | 链端 Extrinsic 总数 | 前端已接入 | 缺失数 | 覆盖率 |
|------|---------------------|-----------|--------|--------|
| Entity Registry | 24 | ~8 (via settings/dashboard) | ~16 | 33% |
| Entity Token | 23 | 9 | 14 | 39% |
| Entity Market | 26 | 6 | 20 | 23% |
| Governance | 14 | 4 | 10 | 29% |
| KYC | 21 | 7 | 14 | 33% |
| Tokensale | 22 | 12 | 10 | 55% |
| Shop | 21 | 5 | 16 | 24% |
| Product | 9 | 4 | 5 | 44% |
| Order | 18 | 10 | 8 | 56% |
| Member | 22 | 20 | 2 | 91% |
| Review | 5 | 2 | 3 | 40% |
| Disclosure | 24 | 14 | 10 | 58% |
| Commission Core | 19+ | 26 | ✓ | ~100% |
| Commission Plugins | ~50+ | ~30 | ~20 | ~60% |
| NEX Market (Trading) | 18 | 7 | 11 | 39% |
| Loyalty (积分) | 12 | 3 | 9 | 25% |
| **Dispute (Escrow)** | **14** | **1 (只读)** | **13** | **7%** |
| **Dispute (Evidence)** | **20+** | **0** | **20+** | **0%** |
| **Dispute (Arbitration)** | **20+** | **0** | **20+** | **0%** |

---

## 2. 按模块详细分析

### 2.1 Entity Registry (`entityRegistry`)

**已实现**: `create_entity`, `update_entity`, `request_close_entity`, `top_up_fund`, `add_admin`, `remove_admin`, `transfer_ownership`, `upgrade_entity_type`

**缺失的 Extrinsic**:
- `suspend_entity` / `resume_entity` — 管理员暂停/恢复实体
- `ban_entity` / `unban_entity` — 超级管理封禁
- `verify_entity` / `unverify_entity` — 实体认证
- `reopen_entity` — 重新开放已关闭实体
- `bind_entity_referrer` / `force_rebind_referrer` — 实体推荐人绑定
- `update_admin_permissions` — 更新管理员权限（仅有添加/移除）
- `cancel_close_request` / `reject_close_request` / `execute_close_timeout` — 关闭请求工作流
- `resign_admin` — 管理员主动辞职
- `self_pause_entity` / `self_resume_entity` — 所有者自行暂停
- `force_transfer_ownership` — 强制转让所有权
- `set_payment_config` — 支付配置
- `donate_to_entity` — 向实体捐赠

**缺失的 Query**:
- `EntityCloseRequests` — 关闭请求状态
- `GovernanceSuspended` — 治理暂停状态
- `EntityReferrer` / `ReferrerEntities` — 推荐人关系
- `OwnerPaused` — 所有者暂停状态
- `EntitySales` — 实体销售统计
- `EntityPaymentConfigs` — 支付配置
- `SuspensionReasons` — 暂停原因

### 2.2 Entity Token (`entityToken`)

**已实现**: `createShopToken`, `mintTokens`, `burnTokens`, `transferTokens`, `setTransferRestriction`, `addToWhitelist`, `removeFromWhitelist`, `addToBlacklist`, `removeFromBlacklist`

**缺失的 Extrinsic**:
- `update_token_config` — 更新代币配置
- `update_token_metadata` — 更新代币名称/符号/精度
- `lock_tokens` / `unlock_tokens` — 代币锁定/解锁
- `configure_dividend` / `distribute_dividend` / `claim_dividend` — 分红全流程
- `change_token_type` — 变更代币类型
- `set_max_supply` — 设置最大供应量
- `approve_tokens` / `transfer_from` — ERC20 标准授权转账
- `force_disable_token` / `force_enable_token` — 强制禁用/启用
- `force_freeze_transfers` / `force_unfreeze_transfers` — 冻结转账
- `force_burn` / `force_transfer` — 强制销毁/转账
- `force_cancel_pending_dividends` — 取消待发分红

**缺失的 Query**:
- `LockedTokens` — 用户锁仓详情
- `PendingDividends` / `ClaimedDividends` — 分红状态
- `TotalPendingDividends` — 总待发分红
- `ReservedTokens` — 预留代币
- `TransfersFrozen` — 冻结状态
- `GlobalTokenPaused` — 全局暂停

### 2.3 Entity Market (`entityMarket`)

**已实现**: `placeSellOrder`, `placeBuyOrder`, `marketBuy`, `marketSell`, `cancelOrder`, `takeOrder`

**缺失的 Extrinsic**:
- `configure_market` — 市场配置（手续费、最小订单等）
- `configure_price_protection` — 价格保护配置
- `lift_circuit_breaker` — 解除熔断
- `set_initial_price` — 设置初始价格
- `modify_order` — 修改挂单
- `batch_cancel_orders` — 批量取消
- `pause_market` / `resume_market` — 市场暂停/恢复
- `close_market` / `force_close_market` — 关闭市场
- `cancel_all_entity_orders` — 清空全部订单
- `set_kyc_requirement` — 市场 KYC 要求
- `cleanup_expired_orders` — 清理过期订单
- `place_ioc_order` / `place_fok_order` / `place_post_only_order` — 高级订单类型
- `governance_configure_market` / `governance_configure_price_protection` — 治理配置

**缺失的 Query**:
- `MarketConfigs` — 市场配置
- `BestAsk` / `BestBid` — 最优买卖价
- `LastTradePrice` — 最后成交价
- `TradeRecords` / `UserTradeHistory` / `EntityTradeHistory` — 交易历史
- `EntityDailyStats` — 每日统计
- `MarketKycRequirement` — KYC 要求
- `MarketStatusStorage` — 市场状态
- `UserOrderHistory` — 用户历史订单

### 2.4 Governance (`entityGovernance`)

**已实现**: `createProposal`, `vote`, `finalizeVoting`, `executeProposal`

**缺失的 Extrinsic**:
- `cancel_proposal` — 取消提案
- `configure_governance` — 治理配置（法定人数、通过阈值等）
- `lock_governance` — 锁定治理
- `delegate_vote` / `undelegate_vote` — 投票委托
- `veto_proposal` — 否决权
- `change_vote` — 修改投票
- `pause_governance` / `resume_governance` — 暂停/恢复治理
- `batch_cancel_proposals` — 批量取消
- `cleanup_proposal` — 清理过期提案

**缺失的 Query**:
- `GovernanceConfigs` — 治理配置参数
- `GovernanceLocked` — 锁定状态
- `VoterTokenLocks` / `GovernanceLockCount` / `GovernanceLockAmount` — 投票锁仓
- `VoteDelegation` / `DelegatedVoters` — 委托关系
- `GovernancePaused` — 暂停状态
- `FundProtectionConfigs` / `DailySpendTracker` — 资金保护

### 2.5 KYC (`entityKyc`)

**已实现**: `submitKyc`, `updateKycData`, `purgeKycData`, `approveKyc`, `rejectKyc`, `revokeKyc`, `setEntityRequirement`

**缺失的 Extrinsic**:
- `register_provider` / `remove_provider` / `update_provider` — KYC 提供者管理
- `suspend_provider` / `resume_provider` — 提供者暂停/恢复
- `authorize_provider` / `deauthorize_provider` — 实体授权提供者
- `expire_kyc` / `timeout_pending_kyc` — KYC 过期处理
- `cancel_kyc` — 取消 KYC 申请
- `renew_kyc` — 续期
- `force_approve_kyc` / `force_set_entity_requirement` — 强制操作
- `update_risk_score` — 更新风险评分
- `update_high_risk_countries` — 高风险国家列表
- `entity_revoke_kyc` — 实体级别撤销
- `batch_revoke_by_provider` — 批量撤销

**缺失的 Query**:
- `Providers` / `ProviderCount` — KYC 提供者列表
- `EntityAuthorizedProviders` — 授权的提供者
- `HighRiskCountries` — 高风险国家
- `KycHistory` — KYC 历史
- `PendingKycCount` / `ApprovedKycCount` — 统计计数
- `UpgradeRequests` — 升级请求

### 2.6 Tokensale (`entityTokenSale`)

**已实现**: `createSaleRound`, `startSale`, `subscribe`, `increaseSubscription`, `endSale`, `claimTokens`, `unlockTokens`, `claimRefund`, `addToWhitelist`, `removeFromWhitelist`, `configureDutchAuction`, `setVestingConfig`

**缺失的 Extrinsic**:
- `cancel_sale` — 取消发售
- `reclaim_unclaimed_tokens` — 回收未领取代币
- `withdraw_funds` — 提取募集资金
- `update_sale_round` — 更新发售轮次
- `pause_sale` / `resume_sale` — 暂停/恢复发售
- `extend_sale` — 延长发售
- `add_payment_option` / `remove_payment_option` — 支付选项管理
- `cleanup_round` — 清理轮次

**缺失的 Query**:
- `RoundPaymentOptions` — 支付选项
- `ActiveRounds` — 活跃轮次列表
- `RaisedFunds` — 已募集资金详情

### 2.7 Shop (`entityShop`)

**已实现**: `createShop`, `closeShop`, `pauseShop`, `resumeShop`, `fundOperating`

**缺失的 Extrinsic**:
- `update_shop` — 更新店铺信息
- `add_manager` / `remove_manager` / `resign_manager` — 店铺管理员
- `withdraw_operating_fund` — 提取运营资金
- `set_location` — 设置位置
- `finalize_close_shop` / `cancel_close_shop` — 关闭工作流
- `request_transfer_shop` / `accept_transfer_shop` / `cancel_transfer_shop` — 店铺转让
- `allocate_from_treasury` — 从国库分配
- `set_primary_shop` — 设置主店铺
- `set_shop_type` — 设置店铺类型
- `ban_shop` / `unban_shop` — 封禁/解禁

### 2.8 Product (`entityProduct`)

**已实现**: `createProduct`, `updateProduct`, `publishProduct`, `unpublishProduct`

**缺失的 Extrinsic**:
- `delete_product` — 删除商品
- `batch_publish_products` / `batch_unpublish_products` / `batch_delete_products` — 批量操作
- `force_unpublish_product` / `force_delete_product` — 强制操作

### 2.9 Order (`entityTransaction`)

**已实现**: `placeOrder`, `cancelOrder`, `shipOrder`, `confirmReceipt`, `requestRefund`, `approveRefund`, `startService`, `completeService`, `confirmService`

**缺失的 Extrinsic**:
- `reject_refund` — 拒绝退款
- `seller_cancel_order` — 卖家取消
- `seller_refund_order` — 卖家主动退款
- `update_shipping_address` — 更新收货地址
- `extend_confirm_timeout` — 延长确认超时
- `update_tracking` — 更新物流信息
- `withdraw_dispute` — 撤回争议
- `place_order_for` — 代下单
- `force_refund` / `force_complete` / `force_partial_refund` — 强制操作

### 2.10 Review (`entityReview`)

**已实现**: `submitReview`, `setReviewEnabled`

**缺失的 Extrinsic**:
- `remove_review` — 移除评价
- `edit_review` — 编辑评价
- `reply_to_review` — 回复评价

**缺失的 Query**:
- `ReviewReplies` — 评价回复
- `ProductReviews` / `ProductReviewCount` / `ProductRatingSum` — 商品评价统计
- `UserReviews` — 用户评价列表
- `ShopReviewCount` — 店铺评价计数

### 2.11 NEX Market (`nexMarket`)

**已实现**: `placeSellOrder`, `placeBuyOrder`, `cancelOrder`, `acceptBuyOrder`, `reserveSellOrder`, `confirmPayment`, `sellerConfirmReceived`

**缺失的 Extrinsic**:
- `process_timeout` — 超时处理
- `configure_price_protection` — 价格保护配置
- `set_initial_price` — 设置初始价格
- `lift_circuit_breaker` — 解除熔断
- `fund_seed_account` / `seed_liquidity` — 种子流动性
- `auto_confirm_payment` — 自动确认付款
- `submit_underpaid_update` / `finalize_underpaid` — 少付处理

**缺失的 Query**:
- `UsdtTrades` / `PendingUsdtTrades` / `AwaitingPaymentTrades` — USDT 交易相关
- `UserTrades` / `OrderTrades` — 交易历史
- `TradeDisputeStore` — 交易争议
- `BannedAccounts` — 封禁账户
- `TradingFeeBps` — 交易费率
- `DepositExchangeRate` — 存款兑换率

### 2.12 Disclosure (`entityDisclosure`)

**已实现**: 14 个 mutations（较完整）

**缺失的 Extrinsic**:
- `delete_draft` — 删除草稿
- `publish_disclosure` — 直接发布（非草稿流程）
- `start_blackout` / `end_blackout` — 黑窗口期管理
- `expire_announcement` — 公告到期
- `report_disclosure_violation` — 违规举报
- `cleanup_disclosure_history` / `cleanup_announcement_history` — 历史清理

**缺失的 Query**:
- `ViolationRecords` — 违规记录
- `InsiderRoleHistory` — 内幕人员角色历史
- `RemovedInsiders` — 已移除的内幕人员
- `HighRiskEntities` — 高风险实体
- `ApprovalConfigs` / `DisclosureApprovals` / `DisclosureApprovalCounts` — 审批流程
- `InsiderTransactionReports` — 内幕交易报告
- `EntityPenalties` — 实体处罚
- `DisclosureMetadataStore` — 披露元数据
- `DraftRevisions` — 草稿修订历史
- `ViolationReports` — 违规举报

---

## 3. 完全缺失的 Pallet（无前端页面）

| Pallet | 路径 | 重要性 | 说明 |
|--------|------|--------|------|
| **Dispute Escrow** | `pallets/dispute/escrow` | **高** | 仅有只读查询 (`useEscrowStatus`)，无任何操作（lock/release/refund/dispute 等 14 个 extrinsic 全部缺失） |
| **Dispute Evidence** | `pallets/dispute/evidence` | **高** | 完全没有前端页面，20+ 个 extrinsic（commit/link/store_private_content/grant_access/reveal_commitment 等）全部缺失 |
| **Dispute Arbitration** | `pallets/dispute/arbitration` | **高** | 完全没有前端页面，20+ 个 extrinsic（dispute/arbitrate/file_complaint/respond/settle/appeal 等）全部缺失 |
| **Loyalty (积分)** | `pallets/entity/loyalty` | **中** | 仅店铺详情页有基础配置（enable/update/disable），缺失 `transfer_points`, `manager_issue_points`, `manager_burn_points`, `redeem_points`, `set_points_ttl`, `set_points_max_supply` 等 9 个 extrinsic；缺失积分余额查询、交易记录等 |
| **Group Robot** | `pallets/grouprobot/registry` | **低** | 完全没有前端支持 |
| **Inscription** | `pallets/inscription/` | **低** | 完全没有前端支持 |
| **Subscription** | `pallets/subscription/` | **低** | 完全没有前端支持（如果存在） |
| **TRC20 Verifier** | `pallets/trading/trc20-verifier` | **低** | OCW 验证模块，前端无直接交互需求 |

---

## 4. BUG 列表

### BUG-01: Escrow 状态查询解析错误 [严重]

**文件**: `src/hooks/use-escrow-status.ts:39`

**问题**: 查询 `escrow.lockStateOf(escrowId)` 返回的是一个 `u8` (0=Locked, 1=Disputed, 3=Closed)，但 `parseEscrowData` 尝试将其作为结构体解析（提取 `status`, `amount`, `depositor`, `beneficiary` 字段），这些字段永远不会存在于 u8 值上。

**结果**: `amount` 始终为 `0n`，`depositor`/`beneficiary` 始终为空字符串，`status` 始终为 `'Held'`（fallback）。

**修复**: 需要同时查询 `escrow.locked(id)` 获取金额，并映射 `LockStateOf` 的 u8 值到正确的状态字符串。

---

### BUG-02: 治理投票法定人数计算逻辑错误 [严重]

**文件**: `src/hooks/use-governance.ts:58`

```typescript
const quorumMet = totalVotes > 0 && proposal.quorumPct > 0;
```

**问题**: 只检查了"有人投票"且"法定人数要求不为零"，但没有实际计算投票总量是否达到法定人数比例。应该是将投票总量与某个基数（如代币总供应量或成员总数）进行比较。

**结果**: 只要有 1 票且 quorumPct > 0，就认为达到法定人数，完全失去了法定人数门槛的意义。

---

### BUG-03: 浮点精度丢失导致转账金额不正确 [中等]

**文件**: `src/components/sidebar/entity-sidebar.tsx:265-272`

```typescript
const amt = parseFloat(transferAmount);
const plancks = BigInt(Math.floor(amt * 1e12));  // NEX
const units = BigInt(Math.floor(amt * 10 ** decimals));  // Token
```

**问题**: `parseFloat` + `Math.floor` 会导致浮点精度问题。例如 `0.1 * 1e12 = 99999999999.99998`，`Math.floor` 后变成 `99999999999` 而不是 `100000000000`（少了 1 planck）。

**修复**: 应使用字符串解析方式或 `BigInt` 安全转换，参考常见的 `parseUnits` 实现。

---

### BUG-04: Review 评论的 `entityReviewDisabled` 存储类型解析不正确 [中等]

**文件**: `src/hooks/use-review.ts:70-85`

**问题**: 链上 `EntityReviewDisabled` 使用 `OptionQuery`（`StorageMap<_, _, u64, (), OptionQuery>`），存在键 = 禁用，不存在 = 启用。但前端代码 `Boolean(val?.toJSON?.() ?? val)` 对 `()` (unit type) 的处理可能有问题 —— Polkadot.js 可能返回 `null` 或特殊对象，而非 boolean。当存储存在但值为 `()` 时，`toJSON()` 返回 `null`，导致 `Boolean(null) = false`，然后 `!false = true`，错误地认为评论已启用。

**修复**: 应该用 `isNone` / `isSome` 来判断：
```typescript
const raw = await fn(entityId);
// 如果 raw.isSome（Option 有值），说明 disabled=true
return raw.isNone !== false; // isNone=true means enabled
```

---

### BUG-05: Entity Token 余额显示未除以 decimals [中等]

**文件**: `src/components/sidebar/entity-sidebar.tsx:458`

```typescript
`${myTokenBalance.toString()} ${tokenConfig?.symbol ?? ''}`
```

**问题**: `myTokenBalance` 是原始链上值（如 `1000000000000` 代表 1 个 token，decimals=12），但直接 `toString()` 显示了原始数值，没有按 decimals 格式化。

**结果**: 用户看到的余额数字是实际值的 10^decimals 倍。

---

### BUG-06: Disclosure 查询全表扫描性能问题 [中等]

**文件**: `src/hooks/use-disclosure.ts:109-116`

```typescript
const raw = await storageFn.entries(); // 扫描所有 disclosure
const filtered = raw.filter(...);       // 客户端按 entityId 过滤
```

**问题**: `Disclosures` 是 `StorageMap<_, _, u64, Disclosure>` 单键映射（key=disclosureId），代码直接使用 `.entries()` 全表扫描后在客户端过滤。随着数据增长，这会非常慢。

**对比**: 链端有 `EntityDisclosures` (`StorageMap<_, _, u64, BoundedVec<u64>>`) 可以先查出该实体的 disclosure ID 列表，然后逐个查询，避免全表扫描。

---

### BUG-07: Review 也使用全表扫描 [中等]

**文件**: `src/hooks/use-review.ts:58-65`

与 BUG-06 相同问题。`Reviews` 是单键 StorageMap，但没有先查 `ProductReviews` 或按其他索引获取 ID 列表。

---

### BUG-08: Token 余额查询结果可能在 Subscription 查询时解析错误 [低]

**文件**: `src/hooks/use-tokensale.ts:105`

```typescript
const raw = await fn(entityId, roundId, account);
```

**问题**: 链端 `Subscriptions` 是 `StorageDoubleMap<_, _, u64, _, T::AccountId, Subscription>`，第一键是 `round_id`，不是 `entity_id`。前端传了 `(entityId, roundId, account)` 三个参数，但实际应该是 `(roundId, account)`。

**结果**: 查询始终返回 None，用户看不到自己的认购信息。

---

### BUG-09: `useEntityMutation` 的 `options` 在 `useCallback` 依赖数组中导致无限重渲染 [低]

**文件**: `src/hooks/use-entity-mutation.ts:177`

```typescript
}, [api, address, getSigner, palletName, callName, queryClient, options]);
```

**问题**: `options` 是一个对象引用，每次父组件重渲染时都是新引用，导致 `mutate` 函数不断重建。虽然功能不受影响，但会导致依赖 `mutate` 的子组件不必要的重渲染。

---

### ~~BUG-10: NEX Market `sellerConfirmReceived` 在链端不存在~~ [误报]

**文件**: `src/hooks/use-nex-market.ts:253`

**结论**: 经核实，链端 `pallets/trading/nex-market/src/lib.rs` 中确实存在 `seller_confirm_received` extrinsic（call_index = 27），Polkadot.js API 自动将 snake_case 转为 camelCase `sellerConfirmReceived`，前端调用完全正确。此条为误报。

---

## 5. 代码质量问题

### 5.1 类型安全

- `src/hooks/` 中有 **165 处** `as any` 类型断言，大多在 Polkadot.js API 调用中。建议创建类型包装层。
- 无 `@ts-ignore` 或 `@ts-expect-error`，这是好的。

### 5.2 console.log 残留

共 4 处 `console.error` / `console.debug`（位于 `desktop-wallet-dialog.tsx` 和 `use-entity-mutation.ts`），均为合理的错误日志或开发模式日志，不影响生产。

### 5.3 i18n 完整性

`messages/en.json` 和 `messages/zh.json` 的键完全同步，无缺失。✓

### 5.4 测试覆盖

测试文件仅覆盖部分组件：
- `src/app/[entityId]/dashboard.test.tsx`
- `src/components/data-unavailable.test.tsx`
- `src/components/notification-center.test.tsx`
- `src/components/sidebar/entity-sidebar.test.tsx`
- `src/components/tx-confirm-dialog.test.tsx`
- `src/hooks/use-entity-events.test.ts`
- `src/hooks/use-external-queries.test.ts`
- `src/lib/ipfs/upload.test.ts`
- `src/lib/ipfs/gateway-probe.test.ts`
- `src/lib/utils/codec.test.ts`
- `src/lib/utils/ipfs.test.ts`

**完全没有测试的关键 hooks**: `use-commission`, `use-governance`, `use-kyc`, `use-tokensale`, `use-entity-market`, `use-nex-market`, `use-entity-token`, `use-members`, `use-orders`, `use-shops`, `use-products`, `use-review`, `use-disclosure`

---

## 6. 建议优先级

### P0 - 立即修复（影响核心功能）

| # | 问题 | 类型 |
|---|------|------|
| 1 | BUG-02: 治理法定人数计算错误 | BUG |
| 2 | BUG-01: Escrow 状态解析完全错误 | BUG |
| 3 | BUG-08: Tokensale Subscription 查询参数错误 | BUG |
| 4 | BUG-03: 转账浮点精度丢失 | BUG |
| 5 | BUG-05: Token 余额未格式化 | BUG |

### P1 - 高优先级（核心业务缺失）

| # | 问题 | 类型 |
|---|------|------|
| 1 | Dispute 系统完全缺失（Escrow + Evidence + Arbitration） | 缺失功能 |
| 2 | Token 分红流程缺失（configure/distribute/claim_dividend） | 缺失功能 |
| 3 | Token 锁仓功能缺失（lock/unlock_tokens） | 缺失功能 |
| 4 | 订单退款拒绝/卖家操作缺失 | 缺失功能 |
| 5 | 店铺管理（更新、管理员、转让、运营资金提取） | 缺失功能 |
| 6 | Governance 配置和委托投票 | 缺失功能 |

### P2 - 中优先级（运营管理缺失）

| # | 问题 | 类型 |
|---|------|------|
| 1 | BUG-06/07: Disclosure/Review 全表扫描性能 | BUG |
| 2 | BUG-04: Review disabled 解析问题 | BUG |
| 3 | Entity Market 管理（配置、熔断、暂停） | 缺失功能 |
| 4 | KYC Provider 管理系统 | 缺失功能 |
| 5 | Tokensale 管理（取消、暂停、提取资金） | 缺失功能 |
| 6 | 商品删除和批量操作 | 缺失功能 |
| 7 | Review 回复和编辑 | 缺失功能 |
| 8 | Loyalty 积分转让/兑换/管理 | 缺失功能 |

### P3 - 低优先级（增强功能）

| # | 问题 | 类型 |
|---|------|------|
| 1 | BUG-09: useEntityMutation 依赖不稳定 | BUG |
| 2 | ~~BUG-10: sellerConfirmReceived 方法名可能不匹配~~ (误报，链端存在此 extrinsic) | 已关闭 |
| 3 | Entity Registry 高级管理（暂停、封禁、认证、推荐人） | 缺失功能 |
| 4 | Market 高级订单类型（IOC, FOK, PostOnly） | 缺失功能 |
| 5 | Disclosure 审批流程、违规举报 | 缺失功能 |
| 6 | Commission 定时配置变更（schedule/apply/cancel） | 缺失功能 |
| 7 | 链端事件查询和交易历史页面 | 缺失功能 |
| 8 | 核心 hooks 单元测试 | 测试覆盖 |

---

## 7. 前端 UI/UX 问题

### 7.1 表单验证缺陷

| 文件 | 问题 | 严重性 |
|------|------|--------|
| `token-client.tsx` (白名单/黑名单输入) | 未验证 SS58/Substrate 地址格式，任意字符串均可提交 | 中 |
| `entity-sidebar.tsx` (转账表单) | 金额使用 `parseFloat` 解析，`"."`, `".5"`, 负数等输入未阻止 | 中 |
| `orders-client.tsx` (下单) | 数量字段 `<input type="number">` 允许小数（如 1.5），仅后端校验 | 低 |
| `settings-client.tsx` (实体名称) | 文本输入无 `maxLength` 限制，链端存储有长度上限 | 中 |
| `token-client.tsx` (代币名称/符号) | 同上，链端 BoundedVec 有字节数限制 | 中 |

### 7.2 状态管理与竞态条件

| 文件 | 问题 | 严重性 |
|------|------|--------|
| `members-client.tsx:305-315` | 批量审批时 `selectedAccounts` 在交易提交后立即清空（非成功后），若用户再次点击可能处理错误的批次 | 中 |
| `token-client.tsx` (铸造/销毁) | `mintAccount`/`mintAmount` 在 `mutate` 调用后立即清空，而非在交易成功后 | 低 |
| 所有表单页面 | 用户填写表单后导航离开无任何提示，数据直接丢失 | 中 |

### 7.3 错误处理缺陷

| 位置 | 问题 | 严重性 |
|------|------|--------|
| 所有页面 | 无 React Error Boundary，链查询错误可能导致整页白屏 | 中 |
| `settings-client.tsx` (IPFS 上传) | `ipfsUpload.upload()` 错误未显式 catch，上传失败时用户无提示 | 中 |
| 所有交易操作 | 交易失败后无"重试"按钮，用户需重新填写整个表单 | 中 |
| `error-parser.ts` | 仅覆盖 8 个 pallet 的错误映射，实际使用 15+ 个 pallet | 低 |

### 7.4 性能问题

| 位置 | 问题 | 严重性 |
|------|------|--------|
| `use-disclosure.ts:109` | Disclosures 全表扫描 `.entries()` + 客户端过滤（应使用 EntityDisclosures 索引） | 中 |
| `use-review.ts:58` | Reviews 全表扫描 `.entries()` + 客户端过滤（应使用 ProductReviews 索引） | 中 |
| `use-referral-commission.ts` | Stats 查询遍历所有会员条目 + 逐个查询 earned（O(n) 查询，会员多时很慢） | 低 |

### 7.5 硬编码值不一致

| 位置 | 值 | 问题 |
|------|-----|------|
| `dashboard-client.tsx:21` | `FUND_WARNING_THRESHOLD = 10 NEX` | 与 shops 页面不一致 |
| `shops-client.tsx:3` | `FUND_WARNING_THRESHOLD = 1 NEX` | 与 dashboard 不一致，应统一到常量文件 |
| `lib/ipfs/constants.ts` | `gatewayPort: 8080, apiPort: 5001` | IPFS 端口硬编码，应支持环境变量 |

### 7.6 测试覆盖缺口

**已测试组件** (15 个测试文件):
- `dashboard.test.tsx`, `entity-layout.test.tsx`, `entity-sidebar.test.tsx`
- `data-unavailable.test.tsx`, `notification-center.test.tsx`, `tx-confirm-dialog.test.tsx`, `permission-guard.test.tsx`
- `wallet-store.test.ts`, `use-external-queries.test.ts`, `use-entity-events.test.ts`
- `codec.test.ts`, `ipfs.test.ts`, `upload.test.ts`, `gateway-probe.test.ts`

**完全未测试** (占代码量 80%+):
- 全部 13 个业务 hooks（`use-commission`, `use-governance`, `use-kyc`, `use-tokensale`, `use-entity-market`, `use-nex-market`, `use-entity-token`, `use-members`, `use-orders`, `use-shops`, `use-products`, `use-review`, `use-disclosure`）
- 全部 29 个页面组件（`*-client.tsx`）
- 无覆盖率阈值配置（vitest.config.ts 中未设置）

---

## 附录：链端 Pallet 完整列表

```
pallets/
├── entity/
│   ├── registry/        ← 前端有，但覆盖 33%
│   ├── token/           ← 前端有，但覆盖 39%
│   ├── market/          ← 前端有，但覆盖 23%
│   ├── governance/      ← 前端有，但覆盖 29%
│   ├── kyc/             ← 前端有，但覆盖 33%
│   ├── tokensale/       ← 前端有，但覆盖 55%
│   ├── shop/            ← 前端有，但覆盖 24%
│   ├── product/         ← 前端有，但覆盖 44%
│   ├── order/           ← 前端有，但覆盖 56%
│   ├── member/          ← 前端有，覆盖 91% ✓
│   ├── review/          ← 前端有，但覆盖 40%
│   ├── disclosure/      ← 前端有，但覆盖 58%
│   ├── loyalty/         ← 仅部分（店铺页3个mutation）
│   ├── commission/
│   │   ├── core/        ← 前端有，覆盖约 100% ✓
│   │   ├── referral/    ← 前端有，覆盖约 80% ✓
│   │   ├── multi-level/ ← 前端有，覆盖约 70%
│   │   ├── team/        ← 前端有，覆盖约 70%
│   │   ├── pool-reward/ ← 前端有，覆盖约 60%
│   │   ├── level-diff/  ← 前端有，覆盖约 75%
│   │   └── single-line/ ← 前端有，覆盖约 70%
│   └── common/          ← 类型定义，无 extrinsic
├── dispute/
│   ├── escrow/          ← ❌ 仅只读查询（且有BUG）
│   ├── evidence/        ← ❌ 完全缺失
│   └── arbitration/     ← ❌ 完全缺失
├── trading/
│   ├── nex-market/      ← 前端有，覆盖 39%
│   ├── trc20-verifier/  ← OCW，无前端需求
│   └── common/          ← 类型定义
└── grouprobot/          ← ❌ 完全缺失
```
