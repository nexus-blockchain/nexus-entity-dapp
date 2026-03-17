# nexus-entity-dapp 前端缺失功能 / BUG 深度审计报告（2026-03-16）

## 1. 审计范围与方法

- 审计对象：`nexus-entity-dapp` 当前前端源码 + 本地链端源码（同级 monorepo）
- 前端根目录：`/home/xiaodong/桌面/nexus/nexus-entity-dapp`
- 主要对照链端：
  - `../pallets/entity/registry`
  - `../pallets/entity/shop`
  - `../pallets/entity/loyalty`
  - `../pallets/entity/product`
  - `../pallets/entity/order`
  - `../pallets/entity/review`
  - `../pallets/entity/governance`
  - `../pallets/entity/member`
  - `../pallets/entity/tokensale`
  - `../pallets/entity/kyc`
  - `../pallets/entity/disclosure`
  - `../pallets/entity/market`
  - `../pallets/entity/token`
  - `../pallets/entity/commission/*`
  - `../pallets/trading/nex-market`
- 结论以**当前本地源码**为准，不以旧文档/旧假设为准。

### 已执行验证

- `npm test` ✅ 通过（15 files / 151 tests）
- `npm run lint` ❌ 失败：进入 Next.js 交互式 ESLint 初始化
- `npm run build` ❌ 失败：Next.js 在 “Linting and checking validity of types ...” 阶段退出
- `./node_modules/.bin/tsc --noEmit` ❌ 失败：当前会先报 `.next/types/**/*.ts` 缺失，且 `desktop-keyring.ts:154` 的类型风险代码仍在

### 2026-03-16 复核更新（仅回写已解决项）

- ✅ **TokenSale 认购查询参数错误已修正**
  - 当前 `src/hooks/use-tokensale.ts` 中 `useSubscription()` 已按链端真实签名调用：`subscriptions(roundId, account)`。
  - 文档原先“`subscriptions(entityId, roundId, account)` 参数错误”的判断已失效。
- ⚠️ **但 TokenSale 仍未整体修好**
  - `EntityRounds -> SaleRounds(round_id)` 查询路径仍未改；
  - `SaleRound` 解析字段仍沿用旧模型；
  - `addPaymentOption` UI / mutation 仍缺失。
- ⚠️ **构建阻断结论仍成立**
  - 当前 `tsc --noEmit` 首个报错已可表现为 `.next/types/**/*.ts` 缺失；
  - 但 `desktop-keyring.ts:154` 的 `Uint8Array` spread 风险代码仍在，因此“构建链路未恢复”这一结论不变。
- ℹ️ **本轮未确认其它文档条目已彻底解决**
  - 订单、Governance、Disclosure、KYC、Loyalty、Commission、事件系统等高优先级问题复核后仍成立。

---

## 2. 总结论

当前前端**不是“少量尾差”**，而是处于“部分模块已对齐、部分模块仍保留旧模型 / 幻想模型 / 错误参数模型”的混合状态。

### 已明显对齐/改善的部分

- `entityRegistry.createEntity` 的参数已经比旧报告更接近链端真实签名。
- `NEX Market` 旧的幻想型接口基本已经清掉，主流程已改成 TRON 地址 + 买卖单/预留/确认支付/确认收款。
- `Token Vesting` 页面已降级为真实存在的 `lockTokens/unlockTokens`，不再强依赖旧的 vesting storage。
- `TokenSale` 的 `subscriptions` 查询参数已经对齐到链端真实签名 `subscriptions(roundId, account)`。
- 大部分单元测试能通过，说明组件层基础稳定性尚可。

### 仍然存在的核心问题

1. **构建链路仍然阻断**：`tsc` / `next build` 不能通过，`lint` 也不能自动化运行。  
2. **治理 / TokenSale / 信息披露 / 订单** 这四个模块仍存在明显的链端类型错配或运行时错误，属于高优先级问题。  
3. **KYC / Loyalty / Commission / 事件系统** 存在权限模型错误、参数错误或数据展示错误。  
4. **大量页面仍未覆盖链端现有能力**，尤其是实体治理、店铺管理、代币高级管理、销售轮支付配置、公告/披露治理、佣金高级调度。  
5. **多个查询仍采用全表扫描或错误 storage key 形状**，实体规模一大就会变慢，且有些查询会直接读错数据。

---

## 3. 优先级分级

### P0（阻断发布 / 核心流程实际不可用）

| 问题 | 结论 |
|---|---|
| 构建失败 | `tsc --noEmit` 和 `npm run build` 无法通过 |
| Lint 不可自动化 | `npm run lint` 进入交互式初始化 |
| 卖家取消订单用错 extrinsic | 前端调用 `cancelOrder`，链端应调用 `seller_cancel_order(order_id, reason_cid)` |
| 卖家发货传空 tracking CID | 链端要求 `tracking_cid` 非空 |
| 买家申请退款传空 reason CID | 链端要求 `reason_cid` 非空 |
| Governance 提案模型严重错配 | 前端传字符串，链端要求复杂 `ProposalType<Balance>` 枚举 |
| Governance 提案展示解析错误 | `proposalType` 被 `String(object)`，复杂提案极可能显示为 `[object Object]` |
| TokenSale 轮次解析沿用旧字段 | 前端读 `name/price/minPurchase/hardCap...`，链端 `SaleRound` 根本不是这套结构 |
| TokenSale 缺支付选项 UI | 前端可 `startSale/subscribe`，但缺 `addPaymentOption`，链端会拒绝无支付选项的轮次 |
| Disclosure 配置 / 数据模型严重错配 | 读取配置、披露记录、公告分类均存在旧模型残留 |

### P1（高风险运行时错误 / 权限错误 / 数据展示严重失真）

| 问题 | 结论 |
|---|---|
| Loyalty 启用积分表单缺字段 | `pointsName/pointsSymbol` 被校验必填，但 UI 根本没渲染输入框 |
| KYC 撤销权限模型错误 | 前端调用 `revokeKyc`（全局管理员权限），但实体侧真实应该更多使用 `entityRevokeKyc` |
| KYC 驳回/撤销原因输入模型错误 | 前端自由文本，链端要求 `RejectionReason` 枚举 |
| Disclosure 修改披露级别会覆盖其它配置 | 每次都强制传 `false, 0`，重置内幕交易控制和 blackout 配置 |
| Disclosure 草稿类型默认值非法 | 默认 `General`，但链端 `DisclosureType` 没有这个变体 |
| Disclosure 公告分类常量不匹配 | 前端 `Governance/Risk/Compliance`，链端是 `General/Promotion/SystemUpdate/Event/Policy/Partnership/Product/Other` |
| Commission 提现暂停按钮参数错误 | 链端 `pause_withdrawals(entity_id, paused)`，前端只传 `[entityId]` |
| 会员推荐页 token 佣金恒为 0 | `useMemberCommission()` 硬编码 `tokenEarned: 0`，但页面仍展示 token commission |
| 事件系统 entityId 提取方式过于武断 | 默认把 `event.data[0]` 当 entityId，会误匹配很多事件 |
| Disclosure 公告查询 storage 用错 | 对 `Announcements`（key=announcement_id）调用 `entries(entityId)`，没有用 `EntityAnnouncements` 索引 |

### P2（功能覆盖不足）

- 实体治理设置页只覆盖了部分 extrinsic。
- 店铺模块只覆盖创建/关闭/暂停/恢复/充值，缺大量管理能力。
- 商品模块缺编辑 UI / 删除 / 批量操作。
- 评论模块缺删除 / 回复 / 编辑。
- 会员模块缺绑定推荐人 / 手动设级 / 自定义等级开关 / 退出实体。
- Token 模块缺高级配置、metadata、allowance、`transfer_from`、`force_transfer` 等。
- KYC 缺 provider 管理、到期处理、批量能力、风控国家治理等。
- Entity Market / NEX Market 缺大部分管理端能力。
- Commission 各插件只做了基础配置，缺调度/恢复/治理/运维能力。

### P3（性能 / 可维护性 / 可观测性问题）

- 首页实体列表全链扫描 + 串行附加查询。
- 店铺列表全链扫描 `shopEntity.entries()`。
- 评论、披露等模块存在全表扫描。
- 多个模块仍把链端强类型枚举当字符串或自由文本处理。
- 测试虽通过，但仍有无障碍 / 组件警告未清。

---

## 4. 工程级问题（构建、Lint、测试）

### 4.1 `tsc` / `build` 失败（P0）

**证据**

- `src/lib/wallet/desktop-keyring.ts:154`
- `tsconfig.json` 未设置 `target`
- `tsconfig.json` 还把 `.next/types/**/*.ts` 纳入 `include`

```ts
const input = new Uint8Array([...encoder.encode(password), ...salt]);
```

初始审计时 `tsc --noEmit` 输出：

```text
src/lib/wallet/desktop-keyring.ts(154,36): error TS2802
src/lib/wallet/desktop-keyring.ts(154,65): error TS2802
```

本轮复核时 `tsc --noEmit` 首批输出已变为：

```text
error TS6053: File '.next/types/app/[entityId]/layout.ts' not found.
...
```

**当前判断**

- 现在的 `tsc` 阻断不再只表现为 `desktop-keyring.ts:154`；
- 但 `desktop-keyring.ts` 的 `TS2802` 风险代码仍然存在，只是被更前面的 `.next/types` 缺失错误“挡住了”；
- 因此这一节的核心结论仍是：**当前构建/类型检查链路没有恢复**。

**根因**

- 当前 `tsconfig.json` 没有显式 `target`；
- `include` 依赖 `.next/types/**/*.ts`，而 `.next` 内容并不稳定；
- 这里对 `Uint8Array` 使用了 spread iteration；
- Next build 在类型检查阶段直接退出。

**影响**

- 生产构建被阻断；
- CI 无法基于 `next build` 作为可靠门禁。

**建议**

- 先修 `tsconfig.compilerOptions.target`（至少 `es2015` / `es2017`）；
- 调整 `tsconfig.include`，避免本地缺失 `.next/types` 时 `tsc` 直接失败；
- 或把该处改为 `Array.from(encoder.encode(password))` / `Array.from(salt)`。

### 4.2 `npm run lint` 无法自动化（P0）

**证据**

- `package.json`：`"lint": "next lint"`
- 仓库根目录无 `.eslintrc*`

运行结果：

```text
? How would you like to configure ESLint?
❯ Strict (recommended)
  Base
  Cancel
```

**影响**

- lint 不能用于 CI / pre-commit；
- 当前仓库没有真正落地 ESLint 配置。

### 4.3 测试通过但仍有警告（P3）

#### 4.3.1 `TxConfirmDialog` 缺少 `DialogDescription`

**证据**

- `src/components/tx-confirm-dialog.tsx`
- 组件已 import `DialogDescription`，但未实际渲染，只把描述放在普通 `<div>` 里。
- `npm test` stderr：`Missing Description or aria-describedby`

**结论**

- 这是一个真实的可访问性问题；
- 严重度不高，但建议尽快修。

#### 4.3.2 `EntitySidebar` 的 ref warning 主要来自测试 mock（低优先级）

- 这个 warning 指向 `entity-sidebar.test.tsx` 中对 `next/link` 的 mock，偏测试噪音；
- 不建议当作当前生产阻断问题处理。

---

## 5. 模块级分析

## 5.1 首页 / 实体列表 / Registry

### 现状判断

- `createEntity` 已比旧版本对齐得多；这一块**不是当前最严重问题**。
- 但首页实体聚合查询仍然很重。

### 明确问题

#### 1）首页实体列表是高成本全链扫描（P3）

**证据**

- `src/app/home-client.tsx:273-345`
- 先扫 `entityRegistry.entities.entries()`
- 再扫 `entityShop.shopEntity.entries()`
- 再对每个实体串行查 token config / token metadata / treasury balance

**影响**

- 实体数变大后首页会明显变慢；
- 查询成本与实体总数线性增长；
- 还夹杂 per-entity 串行 RPC 查询。

### Registry 前端缺失功能（P2）

前端设置页已覆盖：

- `updateEntity`
- `addAdmin/removeAdmin/updateAdminPermissions`
- `topUpFund`
- `requestCloseEntity`
- `reopenEntity`
- `transferOwnership`
- `bindEntityReferrer`
- `upgradeEntityType`

链端仍有但前端未覆盖：

- `suspendEntity / resumeEntity`
- `banEntity / unbanEntity`
- `verifyEntity / unverifyEntity`
- `cancelCloseRequest`
- `rejectCloseRequest`
- `executeCloseTimeout`
- `resignAdmin`
- `selfPauseEntity / selfResumeEntity`
- `setPaymentConfig`
- `donateToEntity`
- `forceTransferOwnership`

**证据**

- 前端：`src/app/[entityId]/settings/settings-client.tsx:80-491`
- 链端：`../pallets/entity/registry/src/lib.rs:786-1048`

---

## 5.2 店铺 / Loyalty（积分）

### 店铺主模块缺失功能（P2）

前端只覆盖：

- `createShop`
- `closeShop`
- `pauseShop`
- `resumeShop`
- `fundOperating`

链端已有但前端缺失：

- `updateShop`
- `addManager/removeManager/resignManager`
- `withdrawOperatingFund`
- `setLocation`
- `requestTransferShop/acceptTransferShop/cancelTransferShop`
- `setPrimaryShop`
- `setShopType`
- `cancelCloseShop/finalizeCloseShop`
- `allocateFromTreasury`
- `banShop/unbanShop`

**证据**

- 前端：`src/hooks/use-shops.ts:114-145`
- 链端：`../pallets/entity/shop/src/lib.rs:478-1284`

### 明确 BUG

#### 1）启用积分表单缺少 `pointsName / pointsSymbol` 输入（P1）

**证据**

- 状态存在：`src/app/[entityId]/shops/[shopId]/shop-detail-client.tsx:95-109`
- 提交前硬校验：`if (!pointsName.trim() || !pointsSymbol.trim()) return;`
- 但表单渲染区 `114-145` 只有 reward/exchange rate，没有名称/符号输入框。
- 链端 `enable_points(shop_id, name, symbol, reward_rate, exchange_rate, transferable)`：`../pallets/entity/loyalty/src/lib.rs:391-398`

**影响**

- 用户无法从 UI 成功启用积分；
- 按钮可点，但提交逻辑会直接 return。

#### 2）积分配置 UI 只能做“全量更新式输入”，没有体现链端 `Option` 语义（P2）

**说明**

- 链端 `update_points_config(shop_id, Option<u16>, Option<u16>, Option<bool>)` 支持部分更新；
- 前端始终传 reward/exchange/transferable 三项，无法表达“只改其中一项”。

**证据**

- 前端：`src/app/[entityId]/shops/[shopId]/shop-detail-client.tsx:181-194`
- 链端：`../pallets/entity/loyalty/src/lib.rs:478-484`

> 这里更准确地说是“UI 能力不足”，不一定是 SCALE 编码错误；polkadot-js 对 `Option<T>` 通常可接收裸值并编码为 `Some(...)`。

### Loyalty 前端缺失功能（P2）

- `transferPoints`
- `managerIssuePoints`
- `managerBurnPoints`
- `redeemPoints`
- `setPointsTtl`
- `expirePoints`
- `setPointsMaxSupply`
- `continueCleanup`

**证据**

- 链端：`../pallets/entity/loyalty/src/lib.rs:523-829`

### 性能问题（P3）

- `useShops()` 通过 `entityShop.shopEntity.entries()` 全量扫链后再按 `entityId` 过滤。  
- 证据：`src/hooks/use-shops.ts:46-61`

---

## 5.3 商品（Product）

### 明确问题

#### 1）前端商品模型仍残留链端不存在的 `levelGate`（P2）

**证据**

- 前端仍保留 `levelGate`：
  - `src/hooks/use-products.ts:29-37`
  - `src/app/[entityId]/shops/[shopId]/products/products-client.tsx:47, 280, 540-551`
- 链端 `Product` 结构没有 `level_gate`：
  - `../pallets/entity/product/src/lib.rs:70-104`

**影响**

- UI 展示模型与链端真实模型不一致；
- `LevelGated` 看起来被前端“脑补”了一层业务语义。

#### 2）商品创建页面仍展示 NEX 价格/自动换算概念，但链端实际只收 `usdt_price`（P2）

**证据**

- 前端创建时实际发送的是 `usdtVal`，不发送 `priceNex`：`src/app/[entityId]/shops/[shopId]/products/products-client.tsx:393-410`
- 但 UI 仍保留 NEX price / auto-calc 展示：`446-495`
- 链端 `create_product(...)` 只收 `usdt_price`：`../pallets/entity/product/src/lib.rs:405-419`

**结论**

- 这不是最严重的 runtime bug，但会严重误导用户和后续维护者。

### 缺失功能（P2）

- 虽然 hook 里有 `updateProduct`，但前端没有完整编辑页面/表单。
- 缺少 `deleteProduct`
- 缺少 `batchPublishProducts / batchUnpublishProducts / batchDeleteProducts`

**证据**

- 前端 hook：`src/hooks/use-products.ts:81-105`
- 链端：`../pallets/entity/product/src/lib.rs:564-1069`

---

## 5.4 订单（Order）

这是当前前端最危险的模块之一。

### 明确 BUG

#### 1）卖家取消订单用错 extrinsic（P0）

**证据**

- 前端 seller hook：`src/hooks/use-orders.ts:82-91`
- 卖家页调用：`src/app/[entityId]/shops/[shopId]/orders/shop-orders-client.tsx:145-154`
- 当前调用的是：`entityTransaction.cancelOrder`
- 链端卖家取消是：`seller_cancel_order(order_id, reason_cid)`
  - `../pallets/entity/order/src/lib.rs:751-757`

**影响**

- 卖家取消订单会走错路径；
- 即使链端有 buyer cancel path，这里也不应复用。

#### 2）卖家发货传空 tracking CID（P0）

**证据**

- 前端：`src/app/[entityId]/shops/[shopId]/orders/shop-orders-client.tsx:121-124`
- 链端签名：`ship_order(order_id, tracking_cid: Vec<u8>)`  
  `../pallets/entity/order/src/lib.rs:523-527`
- 链端内部会校验 tracking CID 非空（同 pallet 里 `EmptyTrackingCid`）

**影响**

- 物理商品发货按钮直接失败。

#### 3）买家申请退款传空 reason CID（P0）

**证据**

- 前端：`src/app/[entityId]/orders/orders-client.tsx:358-365`
- 链端：`request_refund(order_id, reason_cid)`  
  `../pallets/entity/order/src/lib.rs:585-589`
- 链端理由 CID 校验：`validate_reason_cid()` / `EmptyReasonCid`  
  `../pallets/entity/order/src/lib.rs:1422-1424`

**影响**

- 买家退款流程在 UI 上看似存在，但默认实际上不可用。

### 缺失功能（P2）

- `rejectRefund`
- `sellerCancelOrder`
- `updateShippingAddress`
- `extendConfirmTimeout`
- `cleanupShopOrders`
- `updateTracking`
- `sellerRefundOrder`
- `withdrawDispute`
- `placeOrderFor`
- `cleanupPayerOrders`
- root/admin 强制处理能力

**证据**

- 前端 hook：`src/hooks/use-orders.ts`
- 链端：`../pallets/entity/order/src/lib.rs:739-1036`

---

## 5.5 评论（Review）

### 缺失功能（P2）

当前只覆盖：

- `submitReview`
- `setReviewEnabled`

链端已有但前端未覆盖：

- `removeReview`
- `replyToReview`
- `editReview`

**证据**

- 前端：`src/hooks/use-review.ts:87-99`
- 链端：`../pallets/entity/review/src/lib.rs:437-575`

### 性能问题（P3）

- 评论查询是 `reviews.entries()` 全表扫描后再按 `entityId` 过滤。  
- 证据：`src/hooks/use-review.ts:55-67`

---

## 5.6 Governance

这是当前最严重的结构性错配模块之一。

### 明确 BUG

#### 1）创建提案参数模型与链端 `ProposalType<Balance>` 严重不兼容（P0）

**证据**

- 前端创建提案直接传字符串：
  - `src/app/[entityId]/governance/governance-client.tsx:153-158`
- 前端候选类型常量仍是旧幻想模型：
  - `src/app/[entityId]/governance/governance-client.tsx:39-75`
  - 例如：`UpdateEntityName`, `CreateShop`, `SetTradingFee` 等
- 链端真实签名：
  - `create_proposal(entity_id, proposal_type: ProposalType<Balance>, title, description_cid)`
  - `../pallets/entity/governance/src/lib.rs:1469-1474`
- 链端真实 `ProposalType` 是**复杂带 payload 的枚举**：
  - `../pallets/entity/governance/src/lib.rs:170-173, 2363-2366`
  - 例如 `PriceChange { product_id, new_usdt_price }` 等

**结论**

- 当前治理提案创建 UI 基本不可用；
- 不是“小参数偏差”，而是**整个类型系统不对**。

#### 2）提案列表的 `proposalType` 展示也错（P0）

**证据**

- 前端解析：`src/hooks/use-governance.ts:16-21`
- 这里直接：`proposalType: String(obj.proposalType ?? obj.proposal_type ?? '')`

**影响**

- 对复杂枚举，极可能被渲染成 `[object Object]` 或失真字符串；
- 即使链上已有真实提案，前端也无法准确展示内容。

### 缺失功能（P2）

- `cancelProposal`
- `configureGovernance`
- `lockGovernance`
- `cleanupProposal`
- `delegateVote / undelegateVote`
- `vetoProposal`
- `changeVote`
- `pauseGovernance / resumeGovernance`
- `batchCancelProposals`
- `forceUnlockGovernance`

**证据**

- 前端 hook 只有：`createProposal / vote / finalizeVoting / executeProposal`  
  `src/hooks/use-governance.ts:136-150`
- 链端：`../pallets/entity/governance/src/lib.rs:1827-2337`

---

## 5.7 会员 / 等级 / 推荐

这一块的基础对齐度**高于治理/披露/TokenSale**，但仍不完整。

### 缺失功能（P2）

前端已覆盖：

- 注册/审批/冻结/封禁/移除
- 自定义等级系统
- 升级规则系统
- 注册策略 / 统计策略

仍缺：

- `bindReferrer`
- `manualSetMemberLevel`
- `setUseCustomLevels`
- `leaveEntity`

**证据**

- 前端 mutation 列表：`src/hooks/use-members.ts:325-368`
- 链端：
  - `bind_referrer`：`../pallets/entity/member/src/lib.rs:1050`
  - `manual_set_member_level`：`1326`
  - `set_use_custom_levels`：`1391`
  - `leave_entity`：`2171`

### 明确 BUG

#### 1）推荐页 token 佣金永远显示 0（P1）

**证据**

- `useCommission().useMemberCommission()`：
  - `src/hooks/use-commission.ts:282-290`
  - 明确写死：`tokenEarned: BigInt(0)`
- 推荐页仍把它当真值展示：
  - `src/app/[entityId]/members/referrals/referrals-client.tsx:120-130`

**影响**

- 推荐网络页面的 token 佣金数据是错误的；
- 如果链上 token commission 已开启，前端会系统性低估收益。

---

## 5.8 TokenSale

这是当前前端第二个最严重的结构错配模块。

### 明确 BUG

#### 1）轮次列表解析沿用旧字段，和链端 `SaleRound` 结构不一致（P0）

**证据**

- 前端解析：`src/hooks/use-tokensale.ts:12-43`
- 前端读取了这些字段：
  - `name`
  - `price`
  - `minPurchase`
  - `maxPurchase`
  - `hardCap`
  - `participantCount`
- 链端真实 `SaleRound` 字段：
  - `mode`
  - `status`
  - `total_supply`
  - `sold_amount`
  - `remaining_amount`
  - `participants_count`
  - `payment_options_count`
  - `vesting_config`
  - `dutch_start_price / dutch_end_price`
  - `soft_cap`
  - 等
  - 证据：`../pallets/entity/tokensale/src/lib.rs:164-211`

**影响**

- SaleRound 列表展示大概率是错的 / 空的 / 混乱的。

#### 2）轮次查询 storage 用错了（P0）

**证据**

- 前端：`src/hooks/use-tokensale.ts:75-93`
- 代码对 `saleRounds` 调用了 `entries(entityId)`。
- 但链端：
  - `SaleRounds` 是 `StorageMap<round_id, SaleRound>`：`../pallets/entity/tokensale/src/lib.rs:325-332`
  - 实体索引应使用 `EntityRounds`：`334-342`

**结论**

- 当前查询写法与 storage key 形状不匹配；
- 语义上就是错的，不能视为“按 entity_id 查询轮次”。

#### 3）认购查询参数错误（已解决）

**当前状态**

- 前端：`src/hooks/use-tokensale.ts:97-116`
- 当前调用：`fn(roundId, account)`
- 链端 `Subscriptions` 是 `StorageDoubleMap<round_id, account>`：`../pallets/entity/tokensale/src/lib.rs:346-355`

**结论**

- 这一条在当前代码中已不再成立；
- TokenSale 模块的其它 P0 问题仍在，因此不能视为模块已修复。

#### 4）UI 列表直接消费了错误字段（P0）

**证据**

- `src/app/[entityId]/tokensale/tokensale-client.tsx:572-589`
- 页面直接展示：`round.name / round.price / round.totalRaised / round.participantCount / round.minPurchase / round.hardCap`
- 这些字段并不是链端 `SaleRound` 的真实结构。

#### 5）前端缺支付选项 UI，导致 `startSale/subscribe` 很容易不可用（P0）

**证据**

- 链端 `start_sale` 前要求至少有支付选项：`payment_options_count > 0`  
  `../pallets/entity/tokensale/src/lib.rs:995-999`
- 链端支付选项 extrinsic：`add_payment_option(...)`  
  `826-833`
- 前端 hook 没暴露 `addPaymentOption/removePaymentOption`：`src/hooks/use-tokensale.ts:143-154`
- 但页面已经提供：
  - `startSale`：`src/app/[entityId]/tokensale/tokensale-client.tsx:490-513`
  - `subscribe(..., null)`：`356-359`

**影响**

- 用户可以看到“开始轮次 / 认购”按钮，但缺少必要前置配置。

### 高风险 UI 问题（P1/P2）

#### 6）`mode` 和 `vestingType` 都是自由文本输入，不是枚举选择

**证据**

- `CreateSaleRoundForm`：`src/app/[entityId]/tokensale/tokensale-client.tsx:135-143`
- `VestingSection`：`264-301`
- 链端：
  - `SaleMode`：`../pallets/entity/tokensale/src/lib.rs:86-98`
  - `VestingType`：`119-130`

**结论**

- 这不是严格意义上的“必然编码失败”（polkadot-js 对简单枚举字符串通常可编码），但 UI 非常易错；
- 普通用户几乎不可能知道必须输入 `FixedPrice / DutchAuction / FCFS / Linear / Cliff ...` 这样的精确变体名。

### 缺失功能（P2）

- `addPaymentOption / removePaymentOption`
- `withdrawFunds`
- `cancelSale`
- `reclaimUnclaimedTokens`
- `updateSaleRound`
- `extendSale`
- `pauseSale / resumeSale`
- `cleanupRound`
- 以及 force 系列

**证据**

- 链端：`../pallets/entity/tokensale/src/lib.rs:826-2000`

---

## 5.9 KYC

### 明确 BUG

#### 1）前端暴露的是 `revokeKyc`，但它要求全局管理员权限（P1）

**证据**

- 前端 hook：`src/hooks/use-kyc.ts:112-115`
- 页面直接让实体侧操作：`src/app/[entityId]/kyc/kyc-client.tsx:566-573`
- 链端 `revoke_kyc`：
  - `../pallets/entity/kyc/src/lib.rs:803-810`
  - 明确 `T::AdminOrigin::ensure_origin(origin)?`

**更关键的是**

- 链端其实另有 `entity_revoke_kyc`，专门给 Entity Owner/Admin：
  - `../pallets/entity/kyc/src/lib.rs:1583-1601`
- 前端没有接这个真正合适的 extrinsic。

#### 2）驳回 / 撤销理由 UI 使用自由文本，但链端要求 `RejectionReason` 枚举（P1）

**证据**

- 链端枚举：`../pallets/entity/kyc/src/lib.rs:80-89`
  - `UnclearDocument`
  - `ExpiredDocument`
  - `InformationMismatch`
  - `SuspiciousActivity`
  - ...
- 前端使用普通 `<Input>`：
  - 驳回：`src/app/[entityId]/kyc/kyc-client.tsx:518-552`
  - 撤销：`559-577`
- 当前前端把用户输入的任意字符串直接传链：
  - 驳回：`546-551`
  - 撤销：`569-573`

**影响**

- 若用户输入的不是精确枚举变体名，交易会失败；
- 这对普通用户几乎不可用。

### 缺失功能（P2）

- `registerProvider / removeProvider / updateProvider`
- `authorizeProvider / deauthorizeProvider`
- `suspendProvider / resumeProvider`
- `expireKyc`
- `renewKyc`
- `cancelKyc`
- `updateHighRiskCountries`
- `batchRevokeByProvider`
- `timeoutPendingKyc`
- `removeEntityRequirement`
- `forceApproveKyc / forceSetEntityRequirement`

**证据**

- 链端：`../pallets/entity/kyc/src/lib.rs:844-1555`

---

## 5.10 信息披露（Disclosure）

这是当前**第三个严重错配模块**。

### 明确 BUG

#### 1）`disclosureLevelQuery` 直接把整个 `DisclosureConfig` struct 当字符串读（P0）

**证据**

- 前端：`src/hooks/use-disclosure.ts:121-129`
- 链端 `DisclosureConfig` 是完整 struct，不是 level 字符串：
  - `../pallets/entity/disclosure/src/lib.rs:141-154`

**影响**

- 当前“披露级别”读取是错的；
- 选中态 / 当前配置展示可能全部失真。

#### 2）切换披露级别会把其它配置强制重置（P1）

**证据**

- 前端：`src/app/[entityId]/disclosure/disclosure-client.tsx:98-103`
- 每次都固定调用：`configureDisclosure.mutate([entityId, level, false, 0])`

**影响**

- 用户只想改 level，却会把：
  - `insider_trading_control` 改成 `false`
  - `blackout_period_after` 改成 `0`
- 这是典型的配置覆盖 BUG。

#### 3）披露记录解析仍是旧模型（P0）

**证据**

- 前端解析：`src/hooks/use-disclosure.ts:39-55`
- 前端假设 `DisclosureData` 有：
  - `title`
  - `level`
  - `createdAt`
- 但链端真实 `DisclosureRecord` 是：
  - `disclosure_type`
  - `content_cid`
  - `summary_cid`
  - `discloser`
  - `disclosed_at`
  - `status`
  - `previous_id`
  - 证据：`../pallets/entity/disclosure/src/lib.rs:112-129`

**影响**

- 披露列表标题大概率为空；
- level / 时间字段展示错误；
- 当前页面对披露数据的理解仍是旧 schema。

#### 4）创建草稿的 `disclosureType` 是自由文本，默认值还是非法的 `General`（P1）

**证据**

- 前端默认值：`src/app/[entityId]/disclosure/disclosure-client.tsx:215`
- 输入框：`268-270`
- 提交：`225-233`
- 链端 `DisclosureType` 实际枚举：
  - `AnnualReport`
  - `QuarterlyReport`
  - `MonthlyReport`
  - `MaterialEvent`
  - `RelatedPartyTransaction`
  - `OwnershipChange`
  - `ManagementChange`
  - `BusinessChange`
  - `RiskWarning`
  - `DividendAnnouncement`
  - `TokenIssuance`
  - `Buyback`
  - `Other`
  - 证据：`../pallets/entity/disclosure/src/lib.rs:64-90`

**结论**

- 默认 `General` 本身就不是合法 `DisclosureType`。

#### 5）公告分类常量与链端 `AnnouncementCategory` 不一致（P1）

**证据**

- 前端常量：`src/app/[entityId]/disclosure/disclosure-client.tsx:47`
  - `General / Governance / Risk / Compliance`
- 链端枚举：`../pallets/entity/disclosure/src/lib.rs:185-202`
  - `General / Promotion / SystemUpdate / Event / Policy / Partnership / Product / Other`

**影响**

- 除 `General` 外，其它默认选项都很可能无法编码成功。

#### 6）公告查询 storage 取错了（P1）

**证据**

- 前端：`src/hooks/use-disclosure.ts:167-185`
- 当前对 `announcements` 调用 `entries(entityId)`
- 但链端：
  - `Announcements` 是 `StorageMap<announcement_id, AnnouncementRecord>`：`584-592`
  - 真正的实体索引是 `EntityAnnouncements`：`594-600`

**影响**

- 当前公告查询在 storage key 形状上就是错的；
- 可能只拿到 `announcement_id == entityId` 的单条，或 fallback 后逻辑失真。

#### 7）公告解析字段也滞后（P1）

**证据**

- 前端解析：`src/hooks/use-disclosure.ts:69-83`
- 使用了 `pinned / createdAt`
- 链端真实字段是 `is_pinned / published_at / status`：
  - `../pallets/entity/disclosure/src/lib.rs:220-241`

**影响**

- 置顶状态、发布时间等信息可能显示错误。

### 缺失功能（P2）

- `publishDisclosure`
- `setTradingWindow`
- `recordTrade`
- `reportViolation`
- `batchUpdateInsiders`
- `setGlobalDisclosurePause`
- `setInsiderStatus`
- `setBlackoutPeriod / clearBlackoutPeriod`
- 以及 force / emergency 系列

---

## 5.11 Token（实体代币 / 分红 / 锁定）

### 当前状态

这一块已经比旧版本健康很多，但仍明显不完整。

### 已覆盖

- `createShopToken`
- `mintTokens / burnTokens`
- `setTransferRestriction`
- 白名单 / 黑名单
- `configureDividend / distributeDividend / claimDividend`
- `lockTokens / unlockTokens`

### 缺失功能（P2）

- `updateTokenConfig`
- `changeTokenType`
- `setMaxSupply`
- `updateTokenMetadata`
- `approveTokens`
- `transferFrom`
- `forceTransfer`
- 以及 global/admin force 系列
- 前端也没有真正的 token transfer UI（虽然 hook 有 `transferTokens`）

**证据**

- 前端 hook：`src/hooks/use-entity-token.ts:237-300`
- 链端：`../pallets/entity/token/src/lib.rs:741-1747`

### 现有明确不足

#### 1）持有人列表仍未实现（P2）

**证据**

- `src/hooks/use-entity-token.ts:285-287`
- 明确返回：
  - `holderListAvailable: false`
  - `holders: []`

**影响**

- 只能显示持有人数，无法查看 holder 明细。

---

## 5.12 Commission（核心 + 插件）

Commission 是当前**覆盖度相对较高**的模块，但还没有真正完整。

### 明确 BUG

#### 1）提现暂停/恢复按钮参数错误（P1）

**证据**

- 前端按钮：`src/app/[entityId]/commission/commission-client.tsx:971-980`
  - `pauseWithdrawal.mutate([entityId])`
- 前端 mutation：`src/hooks/use-commission.ts:601`
- 链端签名：`pause_withdrawals(origin, entity_id, paused: bool)`  
  `../pallets/entity/commission/core/src/lib.rs:2015-2019`

**影响**

- 当前暂停/恢复提现按钮无法正确表达目标状态。

#### 2）会员推荐详情中的 token commission 永远显示 0（P1）

**证据**

- `src/hooks/use-commission.ts:282-290`
- `src/app/[entityId]/members/referrals/referrals-client.tsx:120-130`

### 缺失功能（P2）

#### Core

前端未覆盖或未充分覆盖：

- 更完整的 entity overview / dashboard 视图
- 某些治理/恢复路径仍未做独立 UI
- `init_commission_plan` / `use_shopping_balance` 在链端已标注为禁用，不计为前端缺失

#### Referral

缺：

- `setConfigEffectiveAfter`
- force 系列

#### Multi-level

缺：

- `scheduleConfigChange / applyPendingConfig / cancelPendingConfig`
- force pause/resume/cleanup
- preview / activation progress 等高级管理视图

#### Single-line

缺：

- `scheduleConfigChange / applyPendingConfig / cancelPendingConfig`
- `forceResetSingleLine`
- `forceRemoveFromSingleLine / forceRestoreToSingleLine`
- preview / 用户位置信息等高级视图

#### Team

缺：

- `updateTier`
- 更完整的 matched tier / status 视图
- force 系列

#### Pool Reward

缺：

- `setTokenPoolEnabled`
- `schedulePoolRewardConfigChange / applyPendingPoolRewardConfig / cancelPendingPoolRewardConfig`
- `correctTokenPoolDeficit`
- member/admin 视图查询
- force 系列

**证据**

- 前端 hooks：
  - `src/hooks/use-commission.ts`
  - `src/hooks/use-referral-commission.ts`
  - `src/hooks/use-multi-level-commission.ts`
  - `src/hooks/use-single-line-commission.ts`
  - `src/hooks/use-team-commission.ts`
  - `src/hooks/use-pool-reward-commission.ts`
- 链端：`../pallets/entity/commission/*/src/lib.rs`

---

## 5.13 Entity Market

### 当前状态

基础交易动作已经存在：

- `placeSellOrder / placeBuyOrder`
- `marketBuy / marketSell`
- `takeOrder / cancelOrder`

### 明显不足 / 解析问题

#### 1）`volume24h` 命名与链端数据不一致（P3）

**证据**

- 前端把 `statsObj.totalVolumeNex` 映射为 `volume24h`：
  - `src/hooks/use-entity-market.ts:139-148`
- 页面直接显示为 `volume24h`：
  - `src/app/[entityId]/market/market-client.tsx:89-91`
- 链端 `MarketStats` 是累计统计结构，不是 24h 窗口：
  - `../pallets/entity/market/src/lib.rs:143-145`

#### 2）价格保护配置只解析了一部分字段（P3）

**证据**

- 前端只保留：`maxDeviationBps / circuitBreakerThreshold / circuitBreakerDuration`  
  `src/hooks/use-entity-market.ts:57-65`
- 链端实际还有：
  - `enabled`
  - `max_slippage`
  - `min_trades_for_twap`
  - `initial_price`
  - 等
  - 证据：`../pallets/entity/market/src/lib.rs:250-267`

### 缺失功能（P2）

- `configureMarket`
- `configurePriceProtection`
- `setInitialPrice`
- `liftCircuitBreaker`
- `pauseMarket / resumeMarket / closeMarket`
- `setTradingFee`
- `cleanupInactiveOrders`
- 各类治理/force 能力

---

## 5.14 NEX Market

### 当前状态

相比旧版本，这一块已经明显走在“真实运行时”轨道上。

### 仍存在的问题

#### 1）`lastTradePrice` fallback 到 `depositExchangeRate` 是错误语义（P2/P3）

**证据**

- 前端 fallback：`src/hooks/use-nex-market.ts:208-216`
  - `const fn = pallet.lastTradePrice ?? pallet.depositExchangeRate;`
- 链端 `deposit_exchange_rate` 含义是**买家保证金动态汇率**，不是市场成交价：
  - `../pallets/trading/nex-market/src/lib.rs:908-912`

**影响**

- 当前页面可能把“保证金汇率”误显示成“最后成交价 / 初始价格”。

### 缺失功能（P2）

- `disputeTrade`
- `submitCounterEvidence`
- `resolveDispute`
- `updateOrderPrice / updateOrderAmount`
- `setTradingFee`
- `banUser / unbanUser`
- `configurePriceProtection / setInitialPrice / liftCircuitBreaker`
- 订单深度 / 活跃交易 / runtime API 级市场摘要
- root/admin 应急能力

**证据**

- 链端：`../pallets/trading/nex-market/src/lib.rs:1724-2969, 4668-4686`
- 前端 hook 只暴露 7 个主要交易动作：`src/hooks/use-nex-market.ts:225-242`

---

## 5.15 事件系统 / 基础层

### 明确 BUG

#### 1）`useEntityEvents` 统一把 `event.data[0]` 当 entityId（P1）

**证据**

- `src/hooks/use-entity-events.ts:21-37`

```ts
function extractEntityIdFromEvent(event: EventRecord): number | null {
  return extractNumericArg(event, 0);
}
```

**问题本质**

- 并不是所有 pallet event 的第一个参数都是 entityId；
- 很多事件第一个参数可能是 `shop_id / order_id / proposal_id / account / trade_id`；
- 当前过滤逻辑会把很多本不属于该 entity 的事件误判为命中，或者漏掉真正应该刷新的事件。

**影响**

- 通知中心可能错乱；
- query invalidation 会不准确；
- 问题会随着 pallet/event 数量增长越来越隐蔽。

---

## 6. 重点模块修复建议（建议顺序）

### 第一阶段：先恢复可发布、可交易、可治理的最低能力

1. **修工程构建链路**
   - 修 `tsconfig.target`
   - 补 ESLint 配置，确保 `npm run lint` 非交互
2. **修订单模块**
   - 卖家取消改成 `sellerCancelOrder`
   - 卖家发货必须收集 `trackingCid`
   - 买家退款必须收集 `reasonCid`
3. **重做 Governance 提案模型**
   - 前端提案 UI 必须按链端 `ProposalType<Balance>` 分变体建表单
   - 提案展示也要解析复杂枚举，不要 `String(object)`
4. **重做 TokenSale 数据层**
   - 使用 `EntityRounds` → `SaleRounds(round_id)` 的正确查询路径
   - 补 `addPaymentOption` / `removePaymentOption`
   - 列表展示改成真实字段：`mode/status/sold_amount/remaining_amount/payment_options_count/...`
5. **重做 Disclosure 数据层**
   - `DisclosureConfig.level` 正确解构
   - `DisclosureRecord`/`AnnouncementRecord` 按真实结构解析
   - 公告查询改用 `entityAnnouncements`
   - 披露类型/公告分类都改成链端枚举选择器

### 第二阶段：修高风险错配

6. **KYC**
   - 实体侧撤销改用 `entityRevokeKyc`
   - 驳回/撤销原因改成固定枚举选择器
7. **Loyalty / Shop Detail**
   - 补 `pointsName / pointsSymbol` 输入
   - 补 manager issue/burn/redeem/ttl/max supply 等能力
8. **Commission**
   - 修 `pauseWithdrawals(entityId, paused)`
   - 推荐页 token commission 改读 `memberTokenCommissionStats`

### 第三阶段：补功能覆盖和性能

9. **补 Registry / Shop / Product / Token / Members / Review 的缺口**
10. **逐步移除全表扫描，优先补索引式查询**
11. **事件系统按 pallet-event 逐个定义 entityId 提取规则**

---

## 7. 最终结论

`nexus-entity-dapp` 当前并不是“整体不可用”，但也绝不是“只差一点点”。

更准确的判断是：

- **基础框架、页面骨架、权限守卫、部分真实链路已经搭起来了；**
- **但多个关键业务模块仍混杂着旧 runtime 假设、错误 storage 模型、自由文本枚举输入、以及真实 extrinsic 参数错误。**

如果以“能否安全上线核心业务流”为标准：

- **订单、治理、TokenSale、Disclosure 现在都不够上线。**
- **KYC、Commission、Loyalty 也需要至少一轮校准后才能放心对外。**
- **Registry / Shop / Product / Token / Members / Review / Market 则属于“能跑一部分，但远未覆盖完整 runtime 能力”。**

---

## 8. 主要证据文件索引

### 前端

- `src/lib/wallet/desktop-keyring.ts`
- `tsconfig.json`
- `src/app/home-client.tsx`
- `src/app/[entityId]/settings/settings-client.tsx`
- `src/hooks/use-shops.ts`
- `src/app/[entityId]/shops/[shopId]/shop-detail-client.tsx`
- `src/hooks/use-products.ts`
- `src/app/[entityId]/shops/[shopId]/products/products-client.tsx`
- `src/hooks/use-orders.ts`
- `src/app/[entityId]/shops/[shopId]/orders/shop-orders-client.tsx`
- `src/app/[entityId]/orders/orders-client.tsx`
- `src/hooks/use-review.ts`
- `src/hooks/use-governance.ts`
- `src/app/[entityId]/governance/governance-client.tsx`
- `src/hooks/use-members.ts`
- `src/app/[entityId]/members/referrals/referrals-client.tsx`
- `src/hooks/use-tokensale.ts`
- `src/app/[entityId]/tokensale/tokensale-client.tsx`
- `src/hooks/use-kyc.ts`
- `src/app/[entityId]/kyc/kyc-client.tsx`
- `src/hooks/use-disclosure.ts`
- `src/app/[entityId]/disclosure/disclosure-client.tsx`
- `src/hooks/use-entity-token.ts`
- `src/hooks/use-commission.ts`
- `src/app/[entityId]/commission/commission-client.tsx`
- `src/hooks/use-entity-market.ts`
- `src/hooks/use-nex-market.ts`
- `src/hooks/use-entity-events.ts`
- `src/components/tx-confirm-dialog.tsx`

### 链端

- `../pallets/entity/registry/src/lib.rs`
- `../pallets/entity/shop/src/lib.rs`
- `../pallets/entity/loyalty/src/lib.rs`
- `../pallets/entity/product/src/lib.rs`
- `../pallets/entity/order/src/lib.rs`
- `../pallets/entity/review/src/lib.rs`
- `../pallets/entity/governance/src/lib.rs`
- `../pallets/entity/member/src/lib.rs`
- `../pallets/entity/tokensale/src/lib.rs`
- `../pallets/entity/kyc/src/lib.rs`
- `../pallets/entity/disclosure/src/lib.rs`
- `../pallets/entity/market/src/lib.rs`
- `../pallets/entity/token/src/lib.rs`
- `../pallets/entity/commission/*/src/lib.rs`
- `../pallets/trading/nex-market/src/lib.rs`
