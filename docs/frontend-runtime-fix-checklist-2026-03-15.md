# 前端链端接口修复执行清单（按文件）

> 生成时间：2026-03-15  
> 目标仓库：`nexus-entity-dapp`  
> 对照链端：`ws://202.140.140.202:9944` 当前运行时元数据  
> 目的：把当前前端从“接口幻想层”修到“与链端运行时一致”

---

## 0. 先看结论：必须先修的全局漂移

### 0.1 pallet / storage / extrinsic 全局替换矩阵

| 前端当前写法 | 链上实际 | 说明 |
|---|---|---|
| `entityOrder` | `entityTransaction` | 订单 pallet 已换名且接口模型已变化 |
| `disputeEscrow` | `escrow` | 托管 pallet 已换名 |
| `entityTokensale` | `entityTokenSale` | TokenSale pallet 名大小写不同 |
| `entityShop.enablePoints` | `entityLoyalty.enablePoints` | 积分系统已独立到 loyalty pallet |
| `entityShop.updatePointsConfig` | `entityLoyalty.updatePointsConfig` | 同上 |
| `entityShop.disablePoints` | `entityLoyalty.disablePoints` | 同上 |
| `entityRegistry.entityAdmins` | `entityRegistry.entities(...).admins` | 管理员权限不再单独存 storage |
| `entityToken.transfer` | `entityToken.transferTokens` | 代币转账 extrinsic 名不同 |
| `entityToken.tokenConfigs/tokenMetadata` | `entityToken.entityTokenConfigs/entityTokenMetadata` | token storage 名不同 |
| `entityMarket.marketStats` | `entityMarket.marketStatsStorage` | storage 名不同 |
| `entityMarket.priceProtectionConfig` | `entityMarket.priceProtection` | storage 名不同 |
| `nexMarket.marketStats` | `nexMarket.marketStatsStore` | storage 名不同 |
| `nexMarket.priceProtectionConfig` | `nexMarket.priceProtectionStore` | storage 名不同 |
| `entityReview.reviewEnabled` | `entityReview.entityReviewDisabled` | 评论开关语义相反 |

### 0.2 执行顺序建议

**第一批（阻断级）**
1. 订单 / 托管
2. TokenSale
3. 积分系统
4. 首页创建实体
5. 治理
6. KYC / 披露
7. Token / 分红 / Vesting
8. 市场（entityMarket / nexMarket）

**第二批（高风险）**
9. 会员模块
10. 佣金模块
11. 事件订阅
12. 测试基线与兼容校验脚本

---

## 1. 共享基础层：先改这些底座文件

### `src/hooks/use-entity-mutation.ts`

- [ ] `signAndSend` 后保存 `unsub`，在 `finalized` / `error` / `catch` 路径主动 `unsub()`。
- [ ] 不要只在 `status.isFinalized` 时才处理 `dispatchError`；`isInBlock` 阶段也要保留错误上下文。
- [ ] 统一接入 `parseDispatchError(api, dispatchError)`，不要再手写 `${section}.${name}`。
- [ ] `txState.blockNumber` 当前始终没写，补齐。
- [ ] `options.invalidateKeys` 执行前后打印 debug 日志，便于对账。
- [ ] 对“方法不存在 / pallet 不存在”错误，保留当前 available 列表日志，这个机制继续保留。

**验收**
- 任一失败交易能看到规范化错误信息。
- 任一成功交易完成后无重复回调、无悬挂订阅。

---

### `src/lib/types/models.ts`

- [ ] 重新按链端真实结构修正以下模型，不要继续沿用想象字段：
  - `ShopData`
  - `ProductData`
  - `OrderData`
  - `TokenConfig`
  - `ProposalData`
  - `KycRecord`
  - `SaleRound`
  - `DisclosureData` 相关类型
  - 佣金相关类型
- [ ] `OrderData` 至少补齐：
  - `entityId`
  - `seller`
  - `payer`
  - `unitPrice`
  - `platformFee`
  - `productCategory`
  - `shippingCid`
  - `trackingCid`
  - `disputeDeadline`
  - `noteCid`
  - `refundReasonCid`
- [ ] `TokenConfig` 不要再把 `holderCount` 当作 config 字段；链上 `entityTokenConfigs` 里没有这个字段。
- [ ] 新增 `ShopPointsConfig`，不要再复用 `PointsConfig` 假设它在 `ShopData` 内嵌。

---

### `src/hooks/use-entity-events.ts`

- [ ] 删除不存在的 pallet：`entityOrder`、`entityCommission`。
- [ ] 订单事件改为 `entityTransaction`。
- [ ] 佣金事件改为 `commissionCore` / `commissionReferral` / `commissionPoolReward` 等实际 pallet，按实际 metadata 重新列事件名。
- [ ] 不要继续手写过期事件白名单；建议改为：
  - 只维护 pallet 白名单
  - 事件名从 metadata 或 runtime 常量映射生成
- [ ] 对订单相关 cache invalidation 改为：
  - `['entity', eid, 'orders']`
  - `['entity', eid, 'shop', shopId, 'orders']`

**注意**
当前文件里的事件名大概率也已过期，修复时必须重新核对 metadata，不能继续沿用旧事件名。

---

### `src/lib/utils/order-flow.ts`

- [ ] 重新按 `entityTransaction` 的真实状态机梳理数字商品 / 实物商品 / 服务商品流程。
- [ ] 删除不存在的“卖家完成订单 completeOrder”假设。
- [ ] 对 `shipOrder / startService / completeService / confirmReceipt / confirmService / requestRefund / approveRefund` 建立角色-状态映射。

---

## 2. 首页与实体上下文

### `src/app/home-client.tsx`

#### 创建实体
- [ ] `createEntity` 参数从当前：
  - `[name, entityType, initialFund, referrer]`
  改为链上实际：
  - `createEntity(name, logoCid, descriptionCid, referrer)`
- [ ] 当前 UI 上的 `entityType` 与 `initialFund` 不能直接传给 `createEntity`。
- [ ] 创建流程改为二选一：
  - **短期方案**：创建页移除 `entityType`、`initialFund`
  - **中期方案**：创建成功后串行调用 `upgradeEntityType` 和 `topUpFund`
- [ ] 若保留“创建时选择类型”，需在 UI 上明确提示：这是创建后第二步操作。

#### 首页实体列表
- [ ] token 读取从 `tokenConfigs/tokenMetadata` 改为 `entityTokenConfigs/entityTokenMetadata`。
- [ ] 全量实体扫描时，避免逐实体串行 query token metadata；改为：
  - 先批量读取 entity ids
  - 再并发读取 metadata（可限流）
- [ ] `allEntities` 查询建议拆成：
  - entity 基本信息
  - shopCount 索引
  - token metadata 索引
  - treasury balance

**链上对账样本**
- 实体 ID：`100001`、`100004`、`100008` 当前均存在。

---

### `src/app/[entityId]/entity-provider.tsx`

- [ ] 删除对 `entityRegistry.entityAdmins(entityId, walletAddress)` 的查询；链上不存在该 storage。
- [ ] 改为从 `entityRegistry.entities(entityId)` 返回的 `admins: Vec<(AccountId32, u32)>` 中解码当前钱包权限。
- [ ] `parseEntityData` 中把 `admins` 解出来，至少形成：
  - `adminPermissionsByAccount: Map<string, number>` 或临时中间结果
- [ ] `permissions` 计算逻辑改为：
  - owner => 可视作 `ALL`
  - admin => 从 `admins` 元组中取权限位
  - others => `0`
- [ ] 保留 treasury balance 查询逻辑。

**链上类型实证**
- `entityRegistry.entities` value type 中 `admins` 为 `Vec<(AccountId32,u32)>`

---

## 3. 店铺与积分

### `src/hooks/use-shops.ts`

- [ ] `parseShopData` 改按真实 shop 结构解析：
  - `status` 替代当前假设的 `operatingStatus`
  - 保留 `name / shopType / createdAt / productCount / totalSales / totalOrders / rating`
- [ ] `pointsConfig` 不要再从 `shop` struct 里取；改为单独查 `entityLoyalty.shopPointsConfigs(shopId)`。
- [ ] 若要在 shop list 上展示积分状态，新增二次查询或派生 hook。
- [ ] `effectiveStatus` 计算逻辑需核对 `entityShop.status` 与 UI 枚举映射。

---

### `src/app/[entityId]/shops/[shopId]/shop-detail-client.tsx`

#### 积分启用表单
- [ ] mutation pallet 从 `entityShop` 改为 `entityLoyalty`。
- [ ] `enablePoints` 参数从当前：
  - `[shopId, rewardRateBps, exchangeRateBps, transferable]`
  改为链上实际：
  - `enablePoints(shopId, name, symbol, rewardRate, exchangeRate, transferable)`
- [ ] UI 新增两个必填字段：
  - `pointsName`
  - `pointsSymbol`

#### 积分更新 / 关闭
- [ ] `updatePointsConfig` 改为 `entityLoyalty.updatePointsConfig`。
- [ ] `disablePoints` 改为 `entityLoyalty.disablePoints`。
- [ ] 读取当前积分配置时，改查 `entityLoyalty.shopPointsConfigs(shopId)`。

**链上对账样本**
- `shopId=11` 当前已有积分配置。
- `shopId=9` 当前已有积分配置。

---

## 4. 商品

### `src/hooks/use-products.ts`

- [ ] `parseProductData` 按真实字段改造：
  - `imagesCid` 替代 `imageCid`
  - `price` 替代 `priceNex`
  - `usdtPrice` 替代 `priceUsdt`
  - `minOrderQuantity` / `maxOrderQuantity`
  - `visibility` 可能为 enum codec，需规范化成前端枚举字符串
- [ ] mutation 名改为：
  - `listProduct -> publishProduct`
  - `delistProduct -> unpublishProduct`
- [ ] query key 保持不变即可。

---

### `src/app/[entityId]/shops/[shopId]/products/products-client.tsx`

- [ ] `createProduct` 入参顺序重写为链上真实签名：
  - `createProduct(shopId, nameCid, imagesCid, detailCid, price, usdtPrice, stock, category, sortWeight, tagsCid, skuCid, minOrderQuantity, maxOrderQuantity, visibility)`
- [ ] 当前把 `visibility/levelGate` 直接塞进 createProduct 是错误的。
- [ ] 如果链上没有 `levelGate` 独立参数，则：
  - 要么通过 `visibility` 编码
  - 要么暂时移除该 UI 字段
- [ ] 上架/下架按钮对应改为：
  - `publishProduct(productId)`
  - `unpublishProduct(productId)`
- [ ] 更新商品表单也按链上 `updateProduct` 全量 optional 参数顺序改写。

**链上对账样本**
- `shopId=5` 当前商品列表为 `[3,4,5,6]`

---

## 5. 订单与托管（最高优先级）

### `src/hooks/use-orders.ts`

#### pallet 替换
- [ ] 全文件 `entityOrder` 改为 `entityTransaction`。

#### 查询改造
- [ ] seller 订单列表：查 `entityTransaction.shopOrders(shopId)`。
- [ ] buyer 订单列表：查 `entityTransaction.buyerOrders(address)`。
- [ ] 订单详情：查 `entityTransaction.orders(orderId)`。
- [ ] `parseOrderData` 按真实 order struct 重写。

#### seller mutations 改造
- [ ] `confirmShipment` 改为 `shipOrder(orderId, trackingCid)`。
- [ ] 删除不存在的 `completeOrder`。
- [ ] `approveRefund(orderId)` 保留，但按新 pallet。
- [ ] `cancelOrder` 区分卖家侧：优先核对是否应改为 `sellerCancelOrder(orderId)` 或 `sellerRefundOrder(orderId)`。
- [ ] `startService(orderId)` 保留。
- [ ] `completeService(orderId)` 保留。

#### buyer mutations 改造
- [ ] `placeOrder` 改为：
  - `placeOrder(productId, quantity, shippingCid, useTokens, useShoppingBalance, paymentAsset, noteCid, referrer)`
- [ ] `confirmReceipt(orderId)` 保留。
- [ ] `requestRefund(orderId)` 改为 `requestRefund(orderId, reasonCid)`。
- [ ] `confirmServiceCompletion` 改为 `confirmService(orderId)`。
- [ ] buyer 取消订单的条件与链上 `cancelOrder(orderId)` 能力重新确认。

#### UI 动作映射
- [ ] 将“可执行动作”从硬编码改为基于：
  - `productCategory`
  - `status`
  - `buyer/seller 角色`
- [ ] 数字商品 / 实物 / 服务商品分别生成动作集合。

**链上对账样本**
- `shopId=5` 当前订单列表为 `[8,9,10,11,12,13,14,15,16]`

---

### `src/app/[entityId]/orders/orders-client.tsx`

- [ ] 下单表单不要再传 `shopId` 作为 extrinsic 首参；链上 `placeOrder` 首参是 `productId`。
- [ ] 表单字段补齐：
  - `shippingCid`（实物）
  - `noteCid`
  - `useTokens`
  - `paymentAsset`
  - `referrer`
- [ ] `requestRefund` 调用时新增 `reasonCid` 输入。
- [ ] 服务类订单“确认完成”改调 `confirmService(orderId)`。
- [ ] 按真实状态机显示按钮，删除不存在的“幻想动作”。

---

### `src/app/[entityId]/shops/[shopId]/orders/shop-orders-client.tsx`

- [ ] 发货按钮改为 `shipOrder(orderId, trackingCid)`，UI 增加 tracking CID 输入。
- [ ] 删除 `completeOrder(orderId)` 按钮。
- [ ] 若需要卖家侧取消，核对并切换到 `sellerCancelOrder` 或 `sellerRefundOrder`。
- [ ] 对 `approveRefund/startService/completeService` 保留，但全部切到 `entityTransaction`。
- [ ] 按商品类别隐藏无效按钮。

---

### `src/hooks/use-escrow-status.ts`

- [ ] pallet 从 `disputeEscrow` 改为 `escrow`。
- [ ] 重新确认可用 storage：当前不是 `escrows`，而是 `locked / payerOf / lockStateOf / expiryOf ...`。
- [ ] 该 hook 需要重做：
  - 若页面只想知道“是否锁定/释放/退款”，可基于 `lockStateOf` 和相关索引组合派生
  - 若链上没有单一 escrow struct，前端不要再假设存在 `EscrowData`
- [ ] 如果暂无页面真实依赖，可先标记为 deprecated。

---

### `src/hooks/use-external-queries.ts`

- [ ] `useEscrowStatus` 同上，切换到 `escrow` pallet 或先下线。
- [ ] `useStoragePinStatus` 当前查 `storageService.pins(cid)`，链上不存在 `pins` storage；需要重做为：
  - `cidRegistry`
  - `pinStateOf`
  - `pinMeta`
  - `pendingPins`
  中的组合查询。
- [ ] `parseStoragePinData` 需重写，不要再假设链上返回 `{cid,pinned,size,fee,expiry}`。

---

## 6. Token、分红、Vesting

### `src/hooks/use-entity-token.ts`

- [ ] `transferTokens` mutation 从 `transfer` 改为 `transferTokens`。
- [ ] `burnTokens` 参数改为链上真实签名：`burnTokens(entityId, amount)`；不要再传目标账户。
- [ ] holder 相关查询重做：
  - 当前 `tokenHolders / holders / tokenHolderCount` 都不存在
  - 改查可用 storage（需基于 metadata 重新设计；可先用 `totalEntityTokens(entityId)` 仅展示总量）
- [ ] `holderCount` 若链上无直接统计，则前端去掉该展示或通过扫描派生。
- [ ] `myTokenBalance` 不要假设 `(entityId, account)` 二维 map 一定存在，需按真实 storage 结构改。
- [ ] `parseTokenConfig` 按真实 config 补齐字段：
  - `enabled`
  - `rewardRate`
  - `exchangeRate`
  - `minRedeem`
  - `maxRedeemPerOrder`
  - `transferable`
  - `createdAt`
  - `dividendConfig`
  - `minReceiverKyc`

**链上对账样本**
- `entityId=100012` 当前存在 token config 与 metadata。

---

### `src/app/[entityId]/token/token-client.tsx`

- [ ] 烧毁表单不要再收 `burnAccount`，链上 `burnTokens` 不支持指定他人账户。
- [ ] 转账相关 UI 若存在，切换到 `transferTokens(entityId, to, amount)`。
- [ ] “持有人数量 / 持有人列表”在 hook 修复前先降级显示。
- [ ] 白名单 / 黑名单管理继续保留，但要用修复后的 query 结果。

---

### `src/app/[entityId]/token/dividend/dividend-client.tsx`

> 当前页面整体模型与链端不一致，建议按“重做”处理，而不是小修。

- [ ] 删除对不存在 storage 的依赖：
  - `dividendConfigs`
  - `dividendClaims`
- [ ] `configureDividend` 改为链上真实签名：
  - `configureDividend(entityId, enabled, minPeriod)`
- [ ] `distributeDividend` 改为：
  - `distributeDividend(entityId, totalAmount, recipients)`
- [ ] `claimDividend` 改为：
  - `claimDividend(entityId)`
- [ ] 页面交互改为：
  - Step 1：配置分红开关和最小周期
  - Step 2：展示待分配金额 / 分配按钮
  - Step 3：成员自行 claim
- [ ] 若 recipients 需要前端传入，需新增批量计算/选择器；否则确认链上是否已有自动计算路径。

---

### `src/app/[entityId]/token/vesting/vesting-client.tsx`

> 当前页面与链端 `lockTokens/unlockTokens` 模型完全不符，建议重做。

- [ ] 删除对不存在 storage 的依赖：
  - `vestingSchedules`
  - `releaseVestedTokens`
- [ ] `lockTokens` 当前 UI 传了 `account, amount, cliffBlocks, vestingBlocks`，链上实际仅为：
  - `lockTokens(entityId, amount, lockDuration)`
- [ ] `unlockTokens` 当前链上仅有：
  - `unlockTokens(entityId)`
- [ ] 如果业务确实需要“按账户锁仓”，必须先确认链端是否另有资产/锁仓 pallet；否则当前页面应下线或改名。

---

## 7. 治理

### `src/hooks/use-governance.ts`

- [ ] `proposalCount` 查询删除；链上无此 storage。
- [ ] 提案列表改为：
  - 先读 `entityProposals(entityId)` 拿 proposal id 列表
  - 再按 id 批量读 `proposals(proposalId)`
- [ ] 当前 `votes(entityId, proposalId, account)` 改为 `voteRecords(proposalId, account)` 或按真实 key 结构读取。
- [ ] mutation 参数改造：
  - `vote(proposalId, voteType)`
  - `finalizeVoting(proposalId)`
  - `executeProposal(proposalId)`
- [ ] `createProposal` 的 `description` 改为 `descriptionCid`，不要直接传长文本。

---

### `src/app/[entityId]/governance/governance-client.tsx`

- [ ] 创建提案表单改为：
  - 先上传 description 到 IPFS
  - 拿到 `descriptionCid`
  - 再调用 `createProposal(entityId, proposalType, title, descriptionCid)`
- [ ] `proposalType` 不要再当普通字符串；需映射到链端 `ProposalType` 枚举。
- [ ] `category` 仅保留 UI 侧分组，不直接上链。

---

### `src/app/[entityId]/governance/[proposalId]/proposal-detail-client.tsx`

- [ ] `vote.mutate([entityId, proposalId, option])` 改为 `vote.mutate([proposalId, option])`。
- [ ] `finalizeVoting`、`executeProposal` 同样删除多余 `entityId` 参数。
- [ ] 投票结果读取逻辑按新 `voteRecords` / proposal struct 重写。

---

## 8. TokenSale

### `src/hooks/use-tokensale.ts`

- [ ] pallet 名从 `entityTokensale` 改为 `entityTokenSale`。
- [ ] 所有 storage / mutation 名按真实 runtime 重写：
  - `startSaleRound -> startSale`
  - `endSaleRound -> endSale`
  - `configureVesting -> setVestingConfig`
- [ ] `saleRounds` parser 按链上真实 round struct 重写：
  - `mode`
  - `totalSupply`
  - `startBlock/endBlock`
  - `kycRequired`
  - `minKycLevel`
  - `softCap`
  - 以及实际存在的资金 / whitelist / payment options
- [ ] `useSubscription` 改到 `entityTokenSale.subscriptions`。
- [ ] `useWhitelist` 改到 `entityTokenSale.roundWhitelist` 或真实 whitelist storage。

---

### `src/app/[entityId]/tokensale/tokensale-client.tsx`

- [ ] 创建轮次表单重做，去掉链上不存在的字段：
  - `name`
  - `price`
  - `maxPurchase`
  - `hardCap`
  （若链上确实无此字段）
- [ ] 新增必须字段：
  - `mode`
  - `kycRequired`
  - `minKycLevel`
- [ ] `startSaleRound/endSaleRound` 改为 `startSale/endSale`。
- [ ] `configureVesting` 改为 `setVestingConfig(roundId, vestingType, initialUnlockBps, cliffDuration, totalDuration, unlockInterval)`。
- [ ] `subscribe/increaseSubscription` 增加 `paymentAsset` 处理。
- [ ] 荷兰拍配置改为链上真实签名：
  - `configureDutchAuction(roundId, startPrice, endPrice)`
  或核对是否还有其他字段，不能继续传 `entityId`。
- [ ] 轮次操作按钮统一改为只传 `roundId`。

---

## 9. KYC

### `src/hooks/use-kyc.ts`

- [ ] `entityRequirement` 改为 `entityRequirements`。
- [ ] `setEntityRequirement` 参数按链上真实签名改：
  - `setEntityRequirement(entityId, minLevel, mandatory, gracePeriod, allowHighRiskCountries, maxRiskScore)`
- [ ] `updateKycData` 改为 `(entityId, newDataCid)`。
- [ ] `approveKyc` 改为 `(entityId, account, riskScore)`。
- [ ] `rejectKyc` 改为 `(entityId, account, reason, detailsCid)`。
- [ ] `revokeKyc` 改为 `(entityId, account, reason)`。
- [ ] `purgeKycData` 改为 `(entityId)`；不要再带 account。

---

### `src/app/[entityId]/kyc/kyc-client.tsx`

- [ ] Requirement 配置表单新增字段：
  - `mandatory`
  - `gracePeriod`
  - `allowHighRiskCountries`
- [ ] KYC 提交时 `countryCode` 必须转成 `[u8;2]` 语义；空值处理要与链端兼容。
- [ ] 审批表格新增：
  - `riskScore` 输入
  - `reject reason`
  - `reject detailsCid`
  - `revoke reason`
- [ ] `purgeKycData` 若链上仅按 `entityId` 清理全局，当前“按单个账户删除”的按钮逻辑必须下线或改文案。
- [ ] `updateKycData` 对话框不要再传 account。

---

## 10. 披露

### `src/hooks/use-disclosure.ts`

- [ ] `disclosureLevel` 改查 `disclosureConfigs`。
- [ ] `blackoutPeriod` 改查 `blackoutPeriods`。
- [ ] `announcements` / `disclosures` / `insiders` 全部按真实 key 结构重写。
- [ ] mutation 参数全部重排：
  - `createDraftDisclosure(entityId, disclosureType, contentCid, summaryCid)`
  - `updateDraft(disclosureId, contentCid, summaryCid)`
  - `publishDraft(disclosureId)`
  - `withdrawDisclosure(disclosureId)`
  - `correctDisclosure(oldDisclosureId, contentCid, summaryCid)`
  - `publishAnnouncement(entityId, category, title, contentCid, expiresAt)`
  - `updateAnnouncement(announcementId, title?, contentCid?, category?, expiresAt?)`
  - `withdrawAnnouncement(announcementId)`
  - `pinAnnouncement(entityId, announcementId)`
- [ ] 删除不存在的 `setDisclosureLevel` extrinsic；改为通过 `configureDisclosure` 或其他真实接口配置。

---

### `src/app/[entityId]/disclosure/disclosure-client.tsx`

- [ ] “创建披露草稿”表单改成：
  - `disclosureType`
  - `contentCid`
  - `summaryCid`
  不要再传 `title + level` 给 `createDraftDisclosure`。
- [ ] `updateDraft` / `publishDraft` / `withdrawDisclosure` 全部删除多余 `entityId` 参数。
- [ ] `publishAnnouncement` 的 `category` 不要自由文本，改为链端枚举 select。
- [ ] `updateAnnouncement` 需要支持 optional 字段，不要再强制 title/cid 全量必填。
- [ ] “置顶/取消置顶”当前都调用 `pinAnnouncement`，应补充 `unpinAnnouncement` 或按真实接口分开。
- [ ] `setDisclosureLevel` 对应 UI 暂时下线，直到接上真实接口。

---

## 11. 评论

### `src/hooks/use-review.ts`

- [ ] `reviewEnabled` 查询改为 `entityReviewDisabled(entityId)`，并在前端取反得到 `reviewEnabled`。
- [ ] `submitReview` mutation 参数改为：
  - `submitReview(orderId, rating, contentCid)`
  不要再传 `entityId`。
- [ ] 评论列表若需按 entity 过滤，要确认 `reviews` value 中是否带 `entityId`；若没有，需通过 `orderId -> order -> entityId` 级联过滤。

---

### `src/app/[entityId]/reviews/reviews-client.tsx`

- [ ] `submitReview.mutate([entityId, orderId, rating, contentCid])` 改为 `submitReview.mutate([orderId, rating, contentCid])`。
- [ ] 审查“仅已完成订单可评论”的校验是否仅在文案层，必要时接 buyer orders 做前置校验。

---

## 12. 会员

### `src/hooks/use-members.ts`

- [ ] 查询 storage 统一切到真实字段：
  - `entityMembers`
  - `entityMemberPolicy`
  - `entityMemberStatsPolicy`
  - `pendingMembers`
  - `entityLevelSystems`
  - `entityUpgradeRules`
  - `directReferrals`
- [ ] `parseMemberEntries` 不能再假设 `status/level/orderCount` 在链上 member struct 中直接存在；按真实 struct 重建前端派生字段。
- [ ] 将“shopId 还是 entityId”规则明确写进 hook 类型定义：
  - `registerMember/approve/reject/deactivate/activate/ban/unban/remove` => `shopId`
  - `cleanupExpiredPending` => `entityId`
- [ ] `banMember` 追加 `reason: Option<Bytes>`。
- [ ] `initLevelSystem` / `setUpgradeMode` 参数改为链端真实枚举，不要直接传当前前端自定义值。

---

### `src/app/[entityId]/members/members-client.tsx`

- [ ] `MemberActions` 中以下调用目前仍错误传 `entityId`，必须改成 `shopId`：
  - `freezeMember`
  - `unfreezeMember`
  - `banMember`
  - `unbanMember`
  - `removeMember`
- [ ] 把 `shopId` 继续向下透传给 `MemberActions`。
- [ ] 封禁操作补充 `reasonCid` 或最少文本原因输入。
- [ ] `useReferralTree` 不再依赖不存在的 `referralTree` storage，需改读 `directReferrals` 派生。
- [ ] 会员状态 `Active/Frozen/Banned/Pending` 多半要由多个字段派生，不要直接信任旧 parser 结果。

---

### `src/app/[entityId]/members/levels/levels-client.tsx`

- [ ] `initializeLevels` 按链端真实签名改为：
  - `initLevelSystem(shopId, useCustom, upgradeMode)`
- [ ] `addCustomLevel/updateCustomLevel` 当前传参方向基本接近，但要确保首参是 `shopId`。
- [ ] `setUpgradeTrigger` 目前错误理解为“trigger/value”；链上 `setUpgradeMode` 实际是设置升级模式，不是写单条 trigger。
- [ ] 若升级规则需要细粒度配置，应改接：
  - `addUpgradeRule`
  - `updateUpgradeRule`
  - `removeUpgradeRule`
  等真实 extrinsic。

---

## 13. 佣金

> 佣金模块建议按“pallet 一个 hook + 一个页面”逐块重构，不建议继续在旧抽象上修补。

### `src/hooks/use-commission.ts`

- [ ] `memberCommissions` 查询删除；链上不存在。
- [ ] `CommissionConfig` 重构到真实 core config + withdrawal config。
- [ ] `setWithdrawalConfig` 按链上真实签名改为复杂结构体：
  - `mode`
  - `defaultTier`
  - `levelOverrides`
  - `voluntaryBonusRate`
  - `enabled`
- [ ] `pauseWithdrawals` 重新核对是否只需要 `entityId`。
- [ ] 会员收益统计改读：
  - `memberCommissionStats`
  - `memberTokenCommissionStats`
  - `memberWithdrawalHistory`
  等真实 storage。

---

### `src/app/[entityId]/commission/commission-client.tsx`

- [ ] 提现配置表单改成真实结构化输入，不要再把 `defaultTier` 当单个数字。
- [ ] `pauseWithdrawal.mutate([entityId, !config?.withdrawalPaused])` 核对 extrinsic 签名；若链上仅接 `entityId`，删除第二个参数。
- [ ] `withdrawCommission` 当前参数需按链端：
  - `amount?: Option<u128>`
  - `requestedRepurchaseRate?: Option<u16>`
  - `repurchaseTarget?: Option<AccountId32>`

---

### `src/hooks/use-referral-commission.ts`

- [ ] 删除不存在的 `referralStats` 查询。
- [ ] 删除不存在的 `pauseReferral/resumeReferral` extrinsic；若链上没有 pause 机制，则 UI 去掉开关。
- [ ] referrer 数据改接真实 storage：
  - `referrerTotalEarned`
  - `referrerGuardConfigs`
  - `commissionCapConfigs`
  - `referralValidityConfigs`

---

### `src/app/[entityId]/commission/referral/referral-client.tsx`

- [ ] “启用/暂停”开关逻辑删除或改成真实配置存在性判断。
- [ ] 保存逻辑保留 `setDirectRewardConfig(entityId, rate)`。
- [ ] 若需要更多策略，补 UI：
  - `setFixedAmountConfig`
  - `setFirstOrderConfig`
  - `setRepeatPurchaseConfig`

---

### `src/hooks/use-level-diff-commission.ts`

- [ ] 删除不存在的 `levelDiffStats` 查询。
- [ ] 仅保留 `customLevelDiffConfigs` 读取，或确认链上是否有其他 stats 来源。

### `src/app/[entityId]/commission/leveldiff/leveldiff-client.tsx`

- [ ] 页面去掉对“stats”强依赖。
- [ ] 只保留真实存在的配置展示与修改。

---

### `src/hooks/use-single-line-commission.ts`

- [ ] 删除不存在的 `singleLineStats`、`linePositions` 查询。
- [ ] 仅保留 `singleLineConfigs` 读取，或接真实 index/segment storage 派生需要的数据。

### `src/app/[entityId]/commission/singleline/singleline-client.tsx`

- [ ] 去掉依赖不存在统计项的位置展示。
- [ ] 配置表单保留，按链端签名继续使用 `setSingleLineConfig/updateSingleLineParams`。

---

### `src/hooks/use-team-commission.ts`

- [ ] 删除不存在的 `teamStats`、`teamInfos` 查询。
- [ ] 仅保留 `teamPerformanceConfigs` 读取。

### `src/app/[entityId]/commission/team/team-client.tsx`

- [ ] 页面里“团队统计 / 团队详情”区域先降级或重做为派生统计。
- [ ] 配置相关 mutation 保留。

---

### `src/hooks/use-pool-reward-commission.ts`

- [ ] 删除不存在的 `poolRewardStats`、`participants` 查询。
- [ ] 改读真实 storage：
  - `distributionStatistics`
  - `currentRound`
  - `roundHistory`
  - `claimRecords`

### `src/app/[entityId]/commission/poolreward/poolreward-client.tsx`

- [ ] 页面统计与参与者展示改为基于真实 storage。
- [ ] `setPoolRewardConfig/startNewRound/pause/resume` 保留。

---

## 14. 市场

### `src/hooks/use-entity-market.ts`

- [ ] `marketStats` 改为 `marketStatsStorage(entityId)`。
- [ ] `priceProtectionConfig` 改为 `priceProtection(entityId)`。
- [ ] 订单簿不要全表扫描 `orders.entries()` 再过滤；优先使用：
  - `entityBuyOrders(entityId)`
  - `entitySellOrders(entityId)`
  再回查 `orders(orderId)`。
- [ ] `takeOrder` 参数改为真实签名：
  - `takeOrder(orderId, amount?)`
  不要再传 `entityId`。
- [ ] `placeBuyOrder/placeSellOrder` 参数顺序修正为：
  - `(entityId, tokenAmount, price)`
  当前 UI 传的是 `(entityId, price, amount)`，顺序错了。

---

### `src/app/[entityId]/market/market-client.tsx`

#### entityMarket 侧
- [ ] 所有限价单表单把参数顺序从 `[entityId, price, amount]` 改为 `[entityId, amount, price]`。
- [ ] `takeOrder` 从 `[entityId, orderId, amount]` 改为 `[orderId, amount?]`。
- [ ] `cancelOrder` 核对签名；若仅 `orderId`，删除多余 `entityId`。

#### nexMarket 侧
- [ ] 当前整块 UI 需要重做，不可继续复用 entityMarket 交互。
- [ ] 删除 `marketBuy/marketSell/takeOrder` 这些不存在的 mutation。
- [ ] 按链上真实流程重做为：
  - 买单：`placeBuyOrder(nexAmount, usdtPrice, buyerTronAddress)`
  - 卖单：`placeSellOrder(nexAmount, usdtPrice, tronAddress, minFillAmount)`
  - 接单：`acceptBuyOrder` / `reserveSellOrder`
  - USDT 支付确认：`confirmPayment`
  - 卖家确认收款：`sellerConfirmReceived`
- [ ] UI 中必须新增 Tron 地址字段，不能再传 `entityId`。

---

### `src/hooks/use-nex-market.ts`

- [ ] 删除不存在的：
  - `marketBuy`
  - `marketSell`
  - `takeOrder`
- [ ] `marketStats` 改为 `marketStatsStore()` 或真实全局 storage；不要再按 `entityId` 查询。
- [ ] `priceProtectionConfig` 改为 `priceProtectionStore()`。
- [ ] `orders` / `buyOrders` / `sellOrders` 按全局 market 结构重做，不要再按 entity 过滤。
- [ ] `initialPrice` 改为 `lastTradePrice` / `depositExchangeRate` / `setInitialPrice` 对应 storage 语义确认后重写。

---

### `src/hooks/use-nex-price.ts`

- [ ] 从“entity 维度价格”改成“全局 NEX/USDT 市场价格”。
- [ ] 不再传 `entityId` 查询 `nexMarket.marketStats(entityId)`。
- [ ] 数据源改为：
  - `marketStatsStore`
  - `lastTradePrice`
  - `depositExchangeRate`
  - `twapAccumulatorStore`
  视真实语义择一。

---

## 15. 披露 / KYC / 治理 / TokenSale / 订单 的 shared UI 建议

### 新增文件建议：`src/lib/chain/runtime-adapters/`

建议新增以下 adapter 文件，把所有 runtime 对接收口统一起来：

- [ ] `src/lib/chain/runtime-adapters/entity-transaction.ts`
- [ ] `src/lib/chain/runtime-adapters/entity-token-sale.ts`
- [ ] `src/lib/chain/runtime-adapters/entity-loyalty.ts`
- [ ] `src/lib/chain/runtime-adapters/entity-governance.ts`
- [ ] `src/lib/chain/runtime-adapters/entity-kyc.ts`
- [ ] `src/lib/chain/runtime-adapters/entity-disclosure.ts`
- [ ] `src/lib/chain/runtime-adapters/nex-market.ts`

**要求**
- 页面组件不再直接写 `(api.query as any).xxx.yyy`
- hooks 也尽量只消费 adapter 返回的 typed 数据

---

## 16. 测试与防回归

### `src/test-setup.ts`

- [ ] 新增统一 render helper，默认包裹：
  - `NextIntlClientProvider`
  - `QueryClientProvider`
- [ ] 对依赖 `useTranslations` 的组件测试全部走 helper。

### 受影响测试文件
- [ ] `src/components/data-unavailable.test.tsx`
- [ ] `src/components/tx-confirm-dialog.test.tsx`
- [ ] `src/components/notification-center.test.tsx`
- [ ] `src/components/sidebar/entity-sidebar.test.tsx`

### 新增校验脚本（建议）

新增：`scripts/check-runtime-compat.mjs`

- [ ] 扫描项目内 `useEntityMutation('pallet','call')`
- [ ] 扫描项目内 `(api.query as any).pallet.storage`
- [ ] 连接运行时 metadata
- [ ] 输出：
  - 不存在的 pallet
  - 不存在的 call
  - 不存在的 storage
- [ ] 作为 CI 必跑项

---

## 17. 建议的修复批次（可直接照这个顺序开工）

### 批次 A：先恢复主业务闭环
- [ ] `src/hooks/use-orders.ts`
- [ ] `src/app/[entityId]/orders/orders-client.tsx`
- [ ] `src/app/[entityId]/shops/[shopId]/orders/shop-orders-client.tsx`
- [ ] `src/hooks/use-escrow-status.ts`
- [ ] `src/hooks/use-external-queries.ts`
- [ ] `src/lib/utils/order-flow.ts`

### 批次 B：恢复创建 / 积分 / TokenSale
- [ ] `src/app/home-client.tsx`
- [ ] `src/app/[entityId]/entity-provider.tsx`
- [ ] `src/hooks/use-shops.ts`
- [ ] `src/app/[entityId]/shops/[shopId]/shop-detail-client.tsx`
- [ ] `src/hooks/use-tokensale.ts`
- [ ] `src/app/[entityId]/tokensale/tokensale-client.tsx`

### 批次 C：恢复治理 / KYC / 披露
- [x] `src/hooks/use-governance.ts`
- [x] `src/app/[entityId]/governance/governance-client.tsx`
- [x] `src/app/[entityId]/governance/[proposalId]/proposal-detail-client.tsx`
- [x] `src/hooks/use-kyc.ts`
- [x] `src/app/[entityId]/kyc/kyc-client.tsx`
- [x] `src/hooks/use-disclosure.ts`
- [x] `src/app/[entityId]/disclosure/disclosure-client.tsx`

### 批次 D：恢复 Token / 市场
- [x] `src/hooks/use-entity-token.ts`
- [x] `src/app/[entityId]/token/token-client.tsx`
- [x] `src/app/[entityId]/token/dividend/dividend-client.tsx`
- [x] `src/app/[entityId]/token/vesting/vesting-client.tsx`
- [x] `src/hooks/use-entity-market.ts`
- [x] `src/hooks/use-nex-market.ts`
- [x] `src/hooks/use-nex-price.ts`
- [x] `src/app/[entityId]/market/market-client.tsx`

### 批次 E：恢复会员 / 佣金 / 事件 / 测试
- [x] `src/hooks/use-members.ts`
- [x] `src/app/[entityId]/members/members-client.tsx`
- [x] `src/app/[entityId]/members/levels/levels-client.tsx`
- [x] `src/hooks/use-commission.ts`
- [x] `src/hooks/use-referral-commission.ts`
- [x] `src/hooks/use-level-diff-commission.ts`
- [x] `src/hooks/use-single-line-commission.ts`
- [x] `src/hooks/use-team-commission.ts`
- [x] `src/hooks/use-pool-reward-commission.ts`
- [x] 对应 `src/app/[entityId]/commission/**` 页面
- [x] `src/hooks/use-entity-events.ts`
- [x] `src/test-setup.ts`
- [x] 上述 4 个失败测试文件

---

## 18. 每批次完成后的最小验收清单

### A 批次验收
- [ ] 实体 `100004` 进入订单页可看到订单
- [ ] `shopId=5` 店铺订单能加载出当前链上订单
- [ ] 下单按钮参数符合链端签名
- [ ] 实物 / 数字 / 服务订单按钮不再串位

### B 批次验收
- [ ] 创建实体可成功提交
- [ ] 店铺 `11` 能正确显示积分已开启
- [ ] TokenSale 页面不再出现 pallet not found / method not found

### C 批次验收
- [ ] 提案创建、投票、执行参数正确
- [ ] KYC 审批表单具备 riskScore / reason
- [ ] 披露草稿与公告都按真实接口成功提交

### D 批次验收
- [x] 代币转账改为 `transferTokens` 后可正常签名
- [x] entity token 页面不再依赖不存在的 holders storage
- [x] entityMarket 下单参数顺序正确
- [x] nexMarket UI 已更换为 Tron 地址驱动流程

补充验证（2026-03-15，远程链 `ws://202.140.140.202:9944`）：
- 使用 `signAndSend(address, { signer })` 方式，以 dev signer `//Alice` 在实体 `100006` 上完成真实提交：
  - `createShopToken(100006, "ALICE-VERIFY-100006", "AV6", 12, 200, 500)`：区块 `27661`
  - `mintTokens(100006, Alice, 1000)`：区块 `27664`
  - `transferTokens(100006, Bob, 1)`：区块 `27667`
- 结果：`entityToken.TokensTransferred` 事件成功落链，资产 `1100006` 余额从 `Alice=1000/Bob=0` 变为 `Alice=999/Bob=1`。

### E 批次验收
- [x] 会员操作全部按 `shopId` 生效
- [x] 佣金页面不再调用不存在 storage
- [x] 通知中心仅监听真实 pallet
- [x] `npm test` 基线恢复
- [x] 新增 runtime 兼容脚本能阻止旧接口再次混入

补充验证（2026-03-15）：
- `src/hooks/use-members.ts` 已按真实 `entityMembers + memberOrderCount + entityLevelSystems` 重建解析，会员写操作继续统一传 `shopId`。
- `src/hooks/use-referral-commission.ts` / `src/hooks/use-multi-level-commission.ts` / `src/hooks/use-level-diff-commission.ts` / `src/hooks/use-team-commission.ts` 已移除批次 E 范围内不存在的 storage 引用，改为真实 storage 或前端派生。
- `src/hooks/use-entity-events.ts` 已仅保留链上真实 pallet，并补齐 `commissionMultiLevel / commissionLevelDiff / commissionSingleLine / commissionTeam` 监听。
- 新增：
  - `scripts/check-runtime-compat.mjs`
  - `scripts/runtime-compat-allowlist.json`
- 本地执行：
  - `npx tsc --noEmit` ✅
  - `npm test` ✅
  - `node --input-type=module -e "import('./scripts/check-runtime-compat.mjs')"` ✅（已清空剩余 allowlist，当前为 0 条遗留项）

---

## 19. 最后提醒

这次不是“零散 bug 修复”，而是一次**前端 runtime 适配层重建**。  
修复过程中必须坚持两条原则：

1. **先以链端 metadata 为真，再谈 UI 设计**  
2. **页面组件不再直接碰 `api.query/api.tx`，统一收口到 adapter/hook**

否则即使这轮修完，下一次 runtime 变更还会再次整体漂移。
