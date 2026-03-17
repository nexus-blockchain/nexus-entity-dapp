# nexus-entity-dapp 前端深度链端审计报告（2026-03-16）

> 审计日期：2026-03-16  
> 审计对象：`/home/xiaodong/桌面/nexus/nexus-entity-dapp`  
> 对照链端：同级本地源码 `../pallets/entity/*`、`../pallets/dispute/*`、`../pallets/trading/*`  
> 统计口径：功能覆盖率按前端 `useEntityMutation()` 已接入的 extrinsic 计算；不把纯展示页面、只读 query、注释中的“计划功能”算作已覆盖。

---

## 1. 先看结论

当前前端**已经不是“完全不可用”**：

- `npm test`：**通过**（15 files / 151 tests）
- `npm run lint`：**可运行**，但仍有多处 warning
- `npm run build`：**可通过**，但仍有 hook 依赖和图片优化 warning
- `./node_modules/.bin/tsc --noEmit`：**冷启动会失败**，先执行一次 `next build` 后才会通过

但从“整个链端能力”对比看，前端仍处于：

1. **主干模块有页面，但很多只覆盖基础流**；
2. **争议/证据/仲裁、KYC Provider、Loyalty 高阶能力、治理高级操作、TokenSale 运维操作** 等还明显缺失；
3. **存在多处已经确认的链端错配 BUG**，其中几处会直接导致按钮点了必失败或数据展示错误。

---

## 2. 页面路由覆盖 vs 链端 pallet 覆盖

当前实体页实际路由只有这些：

- `commission/*`
- `disclosure`
- `governance`
- `kyc`
- `market`
- `members/*`
- `orders`
- `reviews`
- `settings`
- `shops/*`
- `token/*`
- `tokensale`

**没有独立路由/工作台** 的链端能力包括：

- `entityLoyalty` 全量能力（当前只嵌在店铺详情里做了 enable/update/disable）
- `dispute/escrow`
- `dispute/evidence`
- `dispute/arbitration`
- `trading/trc20-verifier`
- `ads`（前端甚至有 `ADS_MANAGE` 权限位，但没有模块）
- `entityKyc` 的 Provider 管理域
- `entityGovernance` 的治理配置 / 委托 / 否决 / 暂停 / 批量取消等高级治理流

---

## 3. Extrinsic 覆盖率总表

> 说明：这是“当前代码真实接线数”，不是旧文档估算值。

| 模块 | 链端 extrinsic | 前端已接线 | 覆盖率 | 典型缺口 |
|---|---:|---:|---:|---|
| `entityRegistry` | 27 | 11 | 40.7% | 暂停/恢复、封禁、支付配置、关闭审批流、捐赠 |
| `entityShop` | 23 | 5 | 21.7% | 店长管理、转移门店、封禁、强制关闭、从 Treasury 拨款 |
| `entityProduct` | 10 | 4 | 40.0% | 删除、批量发布/下架、强制删除 |
| `entityTransaction` | 25 | 12 | 48.0% | 拒绝退款、卖家退款、超时处理、代付下单、延长确认 |
| `entityReview` | 5 | 2 | 40.0% | 编辑评价、删除评价、商家回复 |
| `entityGovernance` | 16 | 4 | 25.0% | 配置治理、取消/批量取消、委托投票、改票、暂停/恢复 |
| `entityKyc` | 25 | 7 | 28.0% | Provider 授权、取消/过期/续期、Entity 侧撤销、批量撤销 |
| `entityDisclosure` | 42 | 14 | 33.3% | 审批流、审计、财政年度、应急披露、内幕交易上报 |
| `entityMarket` | 27 | 6 | 22.2% | 市场配置、价格保护、批量撤单、暂停/恢复/关闭 |
| `entityMember` | 31 | 27 | 87.1% | 绑定推荐人、手动设级、启用/关闭 custom levels、主动退出 |
| `entityToken` | 28 | 14 | 50.0% | 审批、改 token type、冻结/解冻、强制转账、强制启停 |
| `entityTokenSale` | 27 | 13 | 48.1% | 取消发售、提现资金、暂停/恢复、延长、清理轮次、强制退款 |
| `entityLoyalty` | 11 | 3 | 27.3% | 发积分、烧积分、转积分、兑换、TTL、最大供应、清理 |
| `nexMarket` | 35 | 7 | 20.0% | 争议交易、提交反证、封禁、强制结算/取消、价格保护、OCW 配置 |
| `commissionCore` | 28 | 26 | 92.9% | 初始化计划、购物金使用 |
| `commissionReferral` | 14 | 8 | 57.1% | 生效延迟、force 系列管理能力 |
| `commissionMultiLevel` | 15 | 7 | 46.7% | schedule/apply/cancel pending config、force 系列 |
| `commissionLevelDiff` | 5 | 3 | 60.0% | force 系列 |
| `commissionSingleLine` | 15 | 7 | 46.7% | pending config、force reset/remove/restore |
| `commissionTeam` | 10 | 7 | 70.0% | update tier、force 系列 |
| `commissionPoolReward` | 18 | 6 | 33.3% | pending config、deficit 修正、force 系列 |
| `dispute/escrow` | 14 | 0 | 0% | 整体缺失，仅有错误的只读状态展示 |
| `dispute/evidence` | 24 | 0 | 0% | 整体缺失 |
| `dispute/arbitration` | 25 | 0 | 0% | 整体缺失 |

---

## 4. 还缺少什么功能

### 4.1 P0-P1：目前链端已有、前端几乎没做或做得太浅的功能

#### A. 争议处理三件套完全没做

链端已有：

- `pallets/dispute/escrow`
- `pallets/dispute/evidence`
- `pallets/dispute/arbitration`

前端现状：

- 没有 dispute 页面
- 没有 evidence 上传/授权/撤权/密钥管理页面
- 没有 arbitration 投诉、响应、调解、上诉页面
- 订单页里只有一个只读 `EscrowStatusSection`，而且这个只读状态本身还写错了（见 BUG-11）

**影响**：订单一旦进入纠纷态，前端无法闭环处理。

#### B. KYC 只做了“申请/审批最小流”，缺少 Provider 运营域

缺失能力包括：

- `registerProvider`
- `authorizeProvider` / `deauthorizeProvider`
- `updateProvider` / `suspendProvider` / `resumeProvider`
- `renewKyc` / `cancelKyc` / `expireKyc`
- `entityRevokeKyc`
- `batchRevokeByProvider`

**影响**：链端 KYC 已有 Provider 授权体系，前端仍停留在“手工审批表单”层。

#### C. Governance 只有发提案/投票/执行，没有治理运营能力

缺失能力包括：

- `configureGovernance`
- `cancelProposal` / `batchCancelProposals`
- `delegateVote` / `undelegateVote`
- `changeVote`
- `pauseGovernance` / `resumeGovernance`
- `vetoProposal`
- `lockGovernance` / `forceUnlockGovernance`

**影响**：治理模块只覆盖最基础 Happy Path，实际治理运维做不了。

#### D. TokenSale 只覆盖“建轮次 + 认购 + 领取”，缺少运营动作

缺失能力包括：

- `cancelSale`
- `withdrawFunds`
- `pauseSale` / `resumeSale`
- `extendSale`
- `removePaymentOption`
- `cleanupRound`
- `reclaimUnclaimedTokens`
- 各类 force / batch refund 管理动作

**影响**：发售项目一旦上线后，前端缺少必要的运维手段。

#### E. Loyalty 只是店铺详情里的 3 个开关动作

现有只有：

- `enablePoints`
- `updatePointsConfig`
- `disablePoints`

缺失：

- 发积分 / 烧积分
- 用户转积分
- 兑换积分
- TTL / 过期清理
- 最大供应管理
- 清理续跑

**影响**：链端积分系统已经是独立 pallet，但前端没有独立运营界面。

#### F. NEX Market 只覆盖基础撮合流，没有争议和风控面板

缺失：

- `disputeTrade`
- `submitCounterEvidence`
- `resolveDispute`
- `banUser` / `unbanUser`
- `setTradingFee`
- `configurePriceProtection`
- `forcePauseMarket` / `forceResumeMarket`
- `forceSettleTrade` / `forceCancelTrade`

**影响**：法币/USDT 交易的风控与客服后台不完整。

#### G. Registry / Shop / Product 仍缺少很多后台动作

- Registry 缺：支付配置、暂停/恢复、封禁、关闭审批流、捐赠、强制转让
- Shop 缺：manager 管理、关闭/转让流程、封禁、强制操作
- Product 缺：删除、批量上/下架、强制删除

**影响**：实体后台管理能力离链端上限还差一大段。

---

## 5. 已确认 BUG（按严重度排序）

### BUG-1：订单状态枚举仍然沿用旧模型，和链端不一致

**前端**：`src/lib/types/enums.ts:104-118`

前端仍定义：

- `ServiceStarted`
- `ServiceCompleted`
- `Confirmed`
- `RefundRequested`

**链端**：`../pallets/entity/common/src/types/mod.rs:652-676`

链端真实状态是：

- `Created`
- `Paid`
- `Shipped`
- `Completed`
- `Cancelled`
- `Disputed`
- `Refunded`
- `Expired`
- `Processing`
- `AwaitingConfirmation`
- `PartiallyRefunded`

**影响**：

- 服务类订单 UI 流程判断会错
- 枚举展示、颜色、状态跳转会偏离链端真实状态
- 任何依赖 `OrderStatus.ServiceStarted` / `ServiceCompleted` / `Confirmed` 的逻辑都不可信

---

### BUG-2：下单页“使用积分 / 使用购物余额”开关完全不生效

**前端**：`src/app/[entityId]/orders/orders-client.tsx:159-175`

```ts
const useTokens = form.useTokens ? null : null;
const useShoppingBalance = form.useShoppingBalance ? null : null;
```

无论开关开还是关，传给链端的都是 `null`。

**链端**：`../pallets/entity/order/src/lib.rs:479-490`、`1219-1233`

链端明确使用：

- `use_tokens: Option<Balance>`
- `use_shopping_balance: Option<Balance>`

并且只有 `Some(...)` 才会真正走抵扣逻辑。

**影响**：

- UI 显示了两个支付增强选项
- 实际链上永远不会执行积分/购物余额抵扣

---

### BUG-3：Governance 结果计算读取了错误字段，并且用的是“当前总供应”而不是“提案快照”

**前端解析**：`src/hooks/use-governance.ts:37-72`

前端读取的是：

- `votesApprove`
- `votesReject`
- `votesAbstain`
- `quorumPct`
- `passThreshold`

**链端真实字段**：`../pallets/entity/governance/src/lib.rs:568-608`

链端实际存的是：

- `yes_votes`
- `no_votes`
- `abstain_votes`
- `snapshot_quorum`
- `snapshot_pass`
- `snapshot_total_supply`

**前端计算逻辑**：`src/hooks/use-governance.ts:93-123`、`197-208`

前端用 `assets.asset(...).supply` 查询**当前**总供应来算 quorum。

**影响**：

- 提案通过/未通过展示可能错误
- quorum 显示可能错误
- 增发/销毁代币后，历史提案结果展示会漂移

---

### BUG-4：KYC 申请允许空国家码，但链端强制要求 `[u8; 2]`

**前端**：`src/app/[entityId]/kyc/kyc-client.tsx:353-365`

- 校验允许空字符串：`!countryCode.trim() || len===2`
- 提交时直接把 `encodeCountryCode(countryCode)` 传给链端

**链端**：`../pallets/entity/kyc/src/lib.rs:534-548`

链端签名是：

- `country_code: [u8; 2]`

并且要求两个字符都为大写 ASCII。

**影响**：

- 用户不填国家码时，前端允许提交
- 实际交易会在链端失败

---

### BUG-5：KYC 管理页把“自助更新 / 自助清除”误做成了管理员功能

**前端**：

- `src/app/[entityId]/kyc/kyc-client.tsx:448-456`：管理员“更新用户资料”实际调用 `updateKycData([entityId, newCid])`
- `src/app/[entityId]/kyc/kyc-client.tsx:632-639`：管理员“清空实体数据”实际调用 `purgeKycData([entityId])`

**链端**：`../pallets/entity/kyc/src/lib.rs:1306-1368`

这两个 extrinsic 都只会作用于 **当前签名者自己的 KYC 记录**，不是任意账号。

**影响**：

- 管理界面误导用户，以为在操作目标会员
- 实际只会改当前管理员自己的记录，或者直接失败
- `updateAccount` 这个 UI 状态变量根本没被传到链上

---

### BUG-6：KYC 管理页撤销用错了 extrinsic，普通实体管理员会被链端拒绝

**前端**：`src/app/[entityId]/kyc/kyc-client.tsx:569-573`

调用的是：

- `revokeKyc([entityId, account, reason])`

**链端**：

- `revoke_kyc` 需要 `AdminOrigin`：`../pallets/entity/kyc/src/lib.rs:801-820`
- `entity_revoke_kyc` 才是 Entity owner/admin 用的：`../pallets/entity/kyc/src/lib.rs:1584-1602`

**影响**：

- 拥有 `KYC_MANAGE` 的实体管理员在前端看得到按钮
- 点了大概率报权限错误

---

### BUG-7：Review 提交参数顺序错误，实际提交几乎必失败

**前端**：`src/app/[entityId]/reviews/reviews-client.tsx:142-151`

```ts
submitReview.mutate([entityId, Number(orderId), rating, contentCid.trim()]);
```

**链端**：`../pallets/entity/review/src/lib.rs:299-305`

真实签名是：

- `submit_review(order_id, rating, content_cid)`

没有 `entity_id` 参数。

**影响**：

- 前端第一个参数错位成 `order_id`
- 第二个参数会被链端当成 `rating`
- `orderId > 5` 时基本直接炸；即使小于等于 5，也是在错订单上操作

---

### BUG-8：Review 列表查询把 `entityId` 当成 `productId` 用，实体级评论列表不可信

**前端**：`src/hooks/use-review.ts:61-66`

```ts
const idsFn = pallet.entityReviews ?? pallet.productReviews;
const idsRaw = await idsFn(entityId);
```

**链端**：`../pallets/entity/review/src/lib.rs:148-184`

链端只有：

- `Reviews(review_id)`
- `UserReviews(account)`
- `ProductReviews(product_id)`

没有 `entityReviews(entity_id)`。

并且 review 结构本身也**没有 `entity_id` 字段**。

**影响**：

- 当前实体页 reviews 列表很可能查错数据或为空
- fallback 全表扫描按 `entityId` 过滤也不成立

---

### BUG-9：Disclosure 的 insider 列表查询方式错了，显示结果不可信

**前端**：`src/hooks/use-disclosure.ts:182-200`

前端把 `insiders` 当成可按前缀 `entries(entityId)` 扫描的“多键表”。

**链端**：`../pallets/entity/disclosure/src/lib.rs:558-567`

真实存储是：

- `Insiders(entity_id) -> BoundedVec<InsiderRecord>`

即：**一个 entity 对应一个 Vec**，不是 double map。

**影响**：

- insider 展示容易为空或解析错
- blackout 期间受限人员名单不可靠

---

### BUG-10：Disclosure 改等级时会顺手把其它配置清零

**前端**：`src/app/[entityId]/disclosure/disclosure-client.tsx:99-103`

```ts
configureDisclosure.mutate([entityId, level, false, 0]);
```

这意味着每次只想切换 `DisclosureLevel` 时，都会把：

- `insider_trading_control` 重置为 `false`
- `blackout_after` 重置为 `0`

**影响**：

- 典型配置覆盖 BUG
- 前端没有暴露完整 disclosure config 表单，但却在“切等级”时覆写整套配置

---

### BUG-11：Escrow 状态 hook 仍按旧模型解析，几乎肯定读错

**前端**：`src/hooks/use-escrow-status.ts:5-67`

错误假设：

- `lockStateOf` 存在状态 `2 = Released`
- `locked(id)` 返回 `EscrowInfo { depositor, beneficiary, amount }`

**链端**：

- `STATE_LOCKED = 0`、`STATE_DISPUTED = 1`、`STATE_CLOSED = 3`：`../pallets/dispute/escrow/src/lib.rs:38-40`
- `Locked(id)` 只是 `BalanceOf<T>`：`../pallets/dispute/escrow/src/lib.rs:150-163`

**影响**：

- escrow 状态文本可能错
- `depositor` / `beneficiary` 永远解析不出来
- `EscrowStatusSection` 只是“看起来有状态”，但数据模型已过期

---

### BUG-12：单独运行 `tsc --noEmit` 依赖 `.next` 构建产物，冷启动 CI/本地会先失败

**前端**：`tsconfig.json:25`

```json
"include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]
```

**实测**：

- 在未先执行 `next build` 时，`./node_modules/.bin/tsc --noEmit` 先报 `.next/types/... not found`
- 执行一次 `npm run build` 后，再跑 `tsc --noEmit` 才通过

**影响**：

- 类型检查不能独立作为稳定 CI 步骤
- 新机器 / 冷缓存环境容易误报失败

---

## 6. 代码质量 / 维护性问题（非阻断，但建议尽快收口）

### 6.1 仍有 React Hook 依赖 warning

`npm run lint` / `npm run build` 仍给出这些 warning：

- `src/app/[entityId]/commission/singleline/singleline-client.tsx`
- `src/app/[entityId]/governance/governance-client.tsx`
- `src/app/[entityId]/orders/orders-client.tsx`
- `src/app/[entityId]/reviews/reviews-client.tsx`
- `src/components/wallet/desktop-wallet-dialog.tsx`

这类 warning 不是纯样式问题，可能导致：

- 使用旧翻译函数 `t`
- 使用旧 form 值或旧 helper
- 钱包弹窗打开后读取到过期账户列表

### 6.2 `TxConfirmDialog` 有可访问性问题

`src/components/tx-confirm-dialog.tsx:5-12` 明明引入了 `DialogDescription`，但在 `DialogContent` 中没有真正渲染 description 节点；测试输出也已提示缺失 `aria-describedby`。

### 6.3 `useEntityMutation` 存在状态回写竞态窗口

`src/hooks/use-entity-mutation.ts:98-138`

当前 `isInBlock` 与 `isFinalized` 都异步去 `getHeader(blockHash)` 后再 `setTxState()`。理论上存在：

- `finalized` 先写入
- 较晚返回的 `inBlock` header 再把状态覆盖回 `inBlock`

虽然不是每次触发，但这是典型竞态点。

---

## 7. 建议优先级

### P0：先修“点了就错/数据明显错”的 BUG

1. **Review 提交参数错位**（BUG-7）
2. **Review 列表查询错误索引**（BUG-8）
3. **KYC 管理页误用自助接口**（BUG-5）
4. **KYC 撤销用错 extrinsic**（BUG-6）
5. **订单状态枚举过期**（BUG-1）
6. **下单页积分/购物余额开关无效**（BUG-2）
7. **Disclosure insider 查询错 / 配置覆盖**（BUG-9 / BUG-10）
8. **Escrow 状态 hook 过期**（BUG-11）

### P1：补齐核心业务闭环

1. 订单争议闭环：`escrow + evidence + arbitration`
2. Governance 高级操作
3. TokenSale 运维操作
4. KYC Provider 授权与实体侧撤销
5. Loyalty 独立管理面板
6. NEX Market 争议/风控后台

### P2：收口工程质量

1. `tsc --noEmit` 冷启动可用
2. Hook dependency warning 清零
3. `TxConfirmDialog` a11y 修正
4. build/lint/test 变成稳定 CI 基线

---

## 8. 本次实际验证记录

本次在本地执行了以下命令：

- `npm test` ✅ 通过
- `npm run lint` ✅ 通过，但有 warning
- `npm run build` ✅ 通过，但有 warning
- `./node_modules/.bin/tsc --noEmit` ⚠️ 冷启动失败；先 build 后可通过

---

## 9. 最终判断

**这版前端已经能跑，但还不能称为“链端能力基本齐活”。**

更准确地说，它现在是：

- **页面骨架已经较完整**；
- **核心主模块有较多接线**；
- **但链端完整能力覆盖仍明显不足**；
- **并且仍残留若干已经确认的“链端签名/存储模型错配 BUG”**。

如果目标是“可上线给真实用户跑完整实体商业流程”，建议至少先完成：

- P0 BUG 修复
- dispute 三件套最小闭环
- KYC Provider / entity revoke
- Governance 高级运维
- TokenSale 运维动作

