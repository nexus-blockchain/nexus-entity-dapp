# 升级规则系统重构方案

## 问题概述

前端 `UpgradeTriggersSection` 组件存在**概念混淆**，将两个完全不同的链上功能混为一谈：

| 维度 | 链上实际 | 前端当前实现 |
|------|---------|-------------|
| **升级模式** (`set_upgrade_mode`) | 切换 `AutoUpgrade` / `ManualUpgrade` 两种模式 | 未实现 |
| **升级规则系统** (`*_upgrade_rule*`) | 完整的规则 CRUD + 系统开关 + 冲突策略 | 错误地用 `set_upgrade_mode` 代替，传入不匹配的枚举值 |

具体错误：
1. `setUpgradeTrigger` 调用的是 `setUpgradeMode`（切换升级模式），但传入了 `UpgradeTrigger`（如 `'PurchaseProduct'`）作为参数
2. 链上 `setUpgradeMode` 期望的是 `LevelUpgradeMode` 枚举（`AutoUpgrade` / `ManualUpgrade`），类型完全不匹配
3. 前端 `UpgradeTrigger` 枚举定义了 9 种触发类型（含链上不存在的 `TotalSpentUsdt`、`SingleOrderUsdt`、`ReferralLevelCount`），与链上 6 种 `UpgradeTrigger` 不一致
4. 查询函数 `parseUpgradeTriggers` 按 `StorageDoubleMap` 模式解析，但链上 `EntityUpgradeRules` 是 `StorageMap<entity_id -> EntityUpgradeRuleSystem>`，结构完全不同

---

## 链上数据结构参考

### 枚举定义

```rust
// 升级模式（等级系统级别）
pub enum LevelUpgradeMode {
    AutoUpgrade,      // 自动升级（消费达标即升）
    ManualUpgrade,    // 手动升级（需店主审批）
}

// 升级触发条件（规则级别，每种带关联数据）
pub enum UpgradeTrigger {
    PurchaseProduct { product_id: u64 },
    TotalSpent { threshold: u64 },        // USDT 精度 10^6
    SingleOrder { threshold: u64 },       // USDT 精度 10^6
    ReferralCount { count: u32 },
    TeamSize { size: u32 },
    OrderCount { count: u32 },
}

// 规则冲突策略
pub enum ConflictStrategy {
    HighestLevel,      // 取最高等级
    HighestPriority,   // 取最高优先级规则
    LongestDuration,   // 取最长有效期
    FirstMatch,        // 第一个匹配的规则
}
```

### 存储结构

```rust
// StorageMap: entity_id -> EntityUpgradeRuleSystem
pub struct EntityUpgradeRuleSystem {
    pub rules: BoundedVec<UpgradeRule>,    // 规则列表
    pub next_rule_id: u32,                  // 下一个规则 ID
    pub enabled: bool,                      // 系统开关
    pub conflict_strategy: ConflictStrategy, // 冲突策略
}

pub struct UpgradeRule {
    pub id: u32,
    pub name: BoundedVec<u8, 64>,           // 规则名称
    pub trigger: UpgradeTrigger,            // 触发条件（带关联数据）
    pub target_level_id: u8,                // 目标等级 ID
    pub duration: Option<BlockNumber>,       // 有效期（None = 永久）
    pub enabled: bool,                       // 单条规则开关
    pub priority: u8,                        // 优先级
    pub stackable: bool,                     // 是否可叠加
    pub max_triggers: Option<u32>,           // 最大触发次数（None = 无限）
    pub trigger_count: u32,                  // 已触发次数
}
```

### Extrinsic 清单

| call_index | 方法名 | 参数 | 说明 |
|------------|--------|------|------|
| 10 | `set_upgrade_mode` | `(shop_id, upgrade_mode: LevelUpgradeMode)` | 切换升级模式 |
| 11 | `init_upgrade_rule_system` | `(shop_id, conflict_strategy: ConflictStrategy)` | 初始化规则系统 |
| 12 | `add_upgrade_rule` | `(shop_id, name, trigger, target_level_id, duration, priority, stackable, max_triggers)` | 添加规则 |
| 13 | `update_upgrade_rule` | `(shop_id, rule_id, enabled?, priority?)` | 更新规则（仅可改 enabled 和 priority） |
| 14 | `remove_upgrade_rule` | `(shop_id, rule_id)` | 删除规则 |
| 15 | `set_upgrade_rule_system_enabled` | `(shop_id, enabled)` | 启用/禁用规则系统 |
| 16 | `set_conflict_strategy` | `(shop_id, conflict_strategy)` | 设置冲突策略 |
| 29 | `reset_upgrade_rule_system` | `(shop_id)` | 清除规则系统（允许重新 init） |

---

## 重构方案

### 第 1 步：修正前端枚举定义

**文件**：`src/lib/types/enums.ts`

删除现有的 `UpgradeTrigger` 枚举（9 种纯字符串），替换为与链上一致的定义：

```ts
// 升级模式（等级系统级别）
export enum LevelUpgradeMode {
  AutoUpgrade = 'AutoUpgrade',
  ManualUpgrade = 'ManualUpgrade',
}

// 升级触发条件类型（用于前端 UI 选择）
export enum UpgradeTriggerType {
  PurchaseProduct = 'PurchaseProduct',
  TotalSpent = 'TotalSpent',
  SingleOrder = 'SingleOrder',
  ReferralCount = 'ReferralCount',
  TeamSize = 'TeamSize',
  OrderCount = 'OrderCount',
}

// 规则冲突策略
export enum ConflictStrategy {
  HighestLevel = 'HighestLevel',
  HighestPriority = 'HighestPriority',
  LongestDuration = 'LongestDuration',
  FirstMatch = 'FirstMatch',
}
```

> 注意：链上 `UpgradeTrigger` 是带关联数据的枚举（如 `PurchaseProduct { product_id }`），前端提交时需构造为 `{ PurchaseProduct: { product_id: 123 } }` 格式。`UpgradeTriggerType` 仅用于 UI 选择触发类型。

### 第 2 步：定义前端类型

**文件**：`src/lib/types/models.ts`

```ts
export interface UpgradeRule {
  id: number;
  name: string;
  trigger: { type: string; data: Record<string, number> };  // e.g. { type: 'TotalSpent', data: { threshold: 1000000 } }
  targetLevelId: number;
  duration: number | null;     // 区块数，null = 永久
  enabled: boolean;
  priority: number;
  stackable: boolean;
  maxTriggers: number | null;  // null = 无限
  triggerCount: number;
}

export interface UpgradeRuleSystem {
  rules: UpgradeRule[];
  nextRuleId: number;
  enabled: boolean;
  conflictStrategy: string;
}
```

### 第 3 步：重写 hook 查询和 mutations

**文件**：`src/hooks/use-members.ts`

#### 3a. 替换查询逻辑

将 `upgradeTriggersQuery` 替换为 `upgradeRuleSystemQuery`：

```ts
// 升级规则系统查询（StorageMap: entity_id -> EntityUpgradeRuleSystem）
const upgradeRuleSystemQuery = useEntityQuery<UpgradeRuleSystem | null>(
  ['entity', entityId, 'members', 'upgradeRules'],
  async (api) => {
    if (!hasPallet(api, 'entityMember')) return null;
    const pallet = (api.query as any).entityMember;
    const storageFn = pallet.entityUpgradeRules;
    if (!storageFn) return null;
    const raw = await storageFn(entityId);
    if (raw.isNone) return null;
    return parseUpgradeRuleSystem(raw.unwrap());
  },
  { staleTime: STALE_TIMES.members },
);
```

#### 3b. 新增解析函数

删除旧的 `parseUpgradeTriggers`，替换为：

```ts
function parseUpgradeRuleSystem(raw: any): UpgradeRuleSystem {
  const obj = raw?.toJSON?.() ?? raw;
  return {
    rules: (obj.rules ?? []).map((r: any) => parseUpgradeRule(r)),
    nextRuleId: Number(obj.nextRuleId ?? obj.next_rule_id ?? 0),
    enabled: Boolean(obj.enabled),
    conflictStrategy: String(obj.conflictStrategy ?? obj.conflict_strategy ?? 'HighestLevel'),
  };
}

function parseUpgradeRule(obj: any): UpgradeRule {
  const trigger = parseTrigger(obj.trigger);
  return {
    id: Number(obj.id ?? 0),
    name: decodeChainString(obj.name),
    trigger,
    targetLevelId: Number(obj.targetLevelId ?? obj.target_level_id ?? 0),
    duration: obj.duration != null ? Number(obj.duration) : null,
    enabled: Boolean(obj.enabled),
    priority: Number(obj.priority ?? 0),
    stackable: Boolean(obj.stackable),
    maxTriggers: obj.maxTriggers != null || obj.max_triggers != null
      ? Number(obj.maxTriggers ?? obj.max_triggers)
      : null,
    triggerCount: Number(obj.triggerCount ?? obj.trigger_count ?? 0),
  };
}

function parseTrigger(raw: any): { type: string; data: Record<string, number> } {
  // Polkadot.js 对带关联数据的枚举解码为 { VariantName: { field: value } }
  if (typeof raw === 'string') return { type: raw, data: {} };
  const type = Object.keys(raw)[0];
  const data: Record<string, number> = {};
  const inner = raw[type];
  if (inner && typeof inner === 'object') {
    for (const [k, v] of Object.entries(inner)) {
      data[camelToSnake(k)] = Number(v);
    }
  }
  return { type, data };
}
```

#### 3c. 替换 mutations

```ts
// 升级模式
const setUpgradeMode = useEntityMutation('entityMember', 'setUpgradeMode', { invalidateKeys });

// 升级规则系统
const initUpgradeRuleSystem = useEntityMutation('entityMember', 'initUpgradeRuleSystem', { invalidateKeys });
const addUpgradeRule = useEntityMutation('entityMember', 'addUpgradeRule', { invalidateKeys });
const updateUpgradeRule = useEntityMutation('entityMember', 'updateUpgradeRule', { invalidateKeys });
const removeUpgradeRule = useEntityMutation('entityMember', 'removeUpgradeRule', { invalidateKeys });
const setUpgradeRuleSystemEnabled = useEntityMutation('entityMember', 'setUpgradeRuleSystemEnabled', { invalidateKeys });
const setConflictStrategy = useEntityMutation('entityMember', 'setConflictStrategy', { invalidateKeys });
const resetUpgradeRuleSystem = useEntityMutation('entityMember', 'resetUpgradeRuleSystem', {
  invalidateKeys,
  confirmDialog: { title: '确认重置', description: '将清除所有升级规则，此操作不可撤销', severity: 'danger' },
});
```

#### 3d. 更新 hook 返回值

```ts
return {
  // ... 现有字段 ...
  upgradeRuleSystem: upgradeRuleSystemQuery.data ?? null,  // 替换 upgradeTriggers
  // 升级模式
  setUpgradeMode,        // 替换 setUpgradeTrigger
  // 升级规则系统
  initUpgradeRuleSystem,
  addUpgradeRule,
  updateUpgradeRule,
  removeUpgradeRule,
  setUpgradeRuleSystemEnabled,
  setConflictStrategy,
  resetUpgradeRuleSystem,
};
```

### 第 4 步：重写 UI 组件

**文件**：`src/app/[entityId]/members/levels/levels-client.tsx`

将现有的 `UpgradeTriggersSection` 拆分为 3 个部分：

#### 4a. 升级模式切换（新增）

在 `CustomLevelsSection` 中增加升级模式切换（`AutoUpgrade` / `ManualUpgrade`），用 `Select` 组件实现，调用 `setUpgradeMode.mutate([shopId, 'AutoUpgrade'])` 或 `setUpgradeMode.mutate([shopId, 'ManualUpgrade'])`。

#### 4b. 升级规则系统区块（替换现有 `UpgradeTriggersSection`）

```
┌─────────────────────────────────────────────────┐
│ 升级规则系统                                      │
│ 系统状态: [启用/禁用 Switch]                       │
│ 冲突策略: [HighestLevel ▼]                        │
│                                                   │
│ ┌─── 规则列表 ──────────────────────────────────┐ │
│ │ #0 「累计消费升金卡」                           │ │
│ │   触发: TotalSpent ≥ 1,000,000                │ │
│ │   目标: 等级 2 | 优先级: 10 | 已触发: 5 次     │ │
│ │   [启用] [编辑优先级] [删除]                    │ │
│ ├───────────────────────────────────────────────┤ │
│ │ #1 「推荐10人升银卡」                           │ │
│ │   触发: ReferralCount ≥ 10                    │ │
│ │   目标: 等级 1 | 优先级: 5 | 已触发: 0 次      │ │
│ │   [启用] [编辑优先级] [删除]                    │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ ┌─── 添加新规则 ────────────────────────────────┐ │
│ │ 规则名称:  [____________]                      │ │
│ │ 触发类型:  [TotalSpent ▼]                      │ │
│ │ 阈值/数据: [____________]                      │ │
│ │ 目标等级:  [等级 2 ▼]                          │ │
│ │ 有效期:    [永久 / 自定义区块数]                │ │
│ │ 优先级:    [10]                                │ │
│ │ 可叠加:    [是/否]                             │ │
│ │ 最大触发:  [无限制 / 自定义次数]                │ │
│ │                         [添加规则]             │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ [重置规则系统]                                     │
└─────────────────────────────────────────────────┘
```

调用映射：
- 「系统启用/禁用」→ `setUpgradeRuleSystemEnabled.mutate([shopId, enabled])`
- 「冲突策略」→ `setConflictStrategy.mutate([shopId, 'HighestLevel'])`
- 「添加规则」→ `addUpgradeRule.mutate([shopId, nameBytes, { TotalSpent: { threshold: value } }, targetLevelId, duration, priority, stackable, maxTriggers])`
- 「启用/禁用单条规则」→ `updateUpgradeRule.mutate([shopId, ruleId, enabled, null])`
- 「编辑优先级」→ `updateUpgradeRule.mutate([shopId, ruleId, null, priority])`
- 「删除规则」→ `removeUpgradeRule.mutate([shopId, ruleId])`
- 「重置系统」→ `resetUpgradeRuleSystem.mutate([shopId])`

#### 4c. 触发条件参数输入

根据不同的 `UpgradeTriggerType` 动态渲染对应的输入字段：

| 触发类型 | 关联字段 | 输入组件 |
|---------|---------|---------|
| `PurchaseProduct` | `product_id: u64` | 产品 ID 输入 / 产品选择器 |
| `TotalSpent` | `threshold: u64` | 金额输入（USDT，除以 10^6） |
| `SingleOrder` | `threshold: u64` | 金额输入（USDT，除以 10^6） |
| `ReferralCount` | `count: u32` | 数字输入 |
| `TeamSize` | `size: u32` | 数字输入 |
| `OrderCount` | `count: u32` | 数字输入 |

### 第 5 步：更新 i18n

**文件**：`messages/en.json`、`messages/zh.json`

#### 删除过时的键

```
enums.upgradeTrigger.TotalSpentUsdt
enums.upgradeTrigger.SingleOrderUsdt
enums.upgradeTrigger.ReferralLevelCount
```

#### 新增键

```jsonc
{
  "enums": {
    "levelUpgradeMode": {
      "AutoUpgrade": "Auto Upgrade",
      "ManualUpgrade": "Manual Upgrade"
    },
    "conflictStrategy": {
      "HighestLevel": "Highest Level",
      "HighestPriority": "Highest Priority",
      "LongestDuration": "Longest Duration",
      "FirstMatch": "First Match"
    }
  },
  "members": {
    "levels": {
      "upgradeMode": "Upgrade Mode",
      "upgradeModeDesc": "Choose how members are upgraded between levels",
      "upgradeRuleSystem": "Upgrade Rule System",
      "upgradeRuleSystemDesc": "Configure automatic upgrade rules for member levels",
      "ruleSystemEnabled": "Rule System Enabled",
      "conflictStrategy": "Conflict Strategy",
      "addRule": "Add Rule",
      "ruleName": "Rule Name",
      "triggerType": "Trigger Type",
      "targetLevel": "Target Level",
      "duration": "Duration",
      "durationPermanent": "Permanent",
      "durationCustom": "Custom (blocks)",
      "priority": "Priority",
      "stackable": "Stackable",
      "maxTriggers": "Max Triggers",
      "maxTriggersUnlimited": "Unlimited",
      "triggerCount": "Trigger Count",
      "resetRuleSystem": "Reset Rule System",
      "resetRuleSystemDesc": "This will delete all upgrade rules and cannot be undone",
      "noRules": "No upgrade rules configured",
      "initRuleSystem": "Initialize Rule System"
    }
  }
}
```

### 第 6 步：初始化规则系统的流程补全

当前 `CustomLevelsSection` 中只初始化了**等级系统** (`initLevelSystem`)，但**升级规则系统**需要单独初始化 (`initUpgradeRuleSystem`)。

在 UI 中增加判断：
- 若 `upgradeRuleSystem === null` → 显示「初始化规则系统」按钮，调用 `initUpgradeRuleSystem.mutate([shopId, 'HighestLevel'])`
- 若 `upgradeRuleSystem !== null` → 显示完整的规则管理界面

---

## 涉及文件清单

| 文件 | 改动类型 |
|------|---------|
| `src/lib/types/enums.ts` | 修改：删除旧 `UpgradeTrigger`，新增 `LevelUpgradeMode`、`UpgradeTriggerType`、`ConflictStrategy` |
| `src/lib/types/models.ts` | 修改：新增 `UpgradeRule`、`UpgradeRuleSystem` 接口 |
| `src/hooks/use-members.ts` | 修改：重写查询 + 解析 + mutations，更新返回值 |
| `src/app/[entityId]/members/levels/levels-client.tsx` | 修改：重写 `UpgradeTriggersSection`，新增升级模式切换 |
| `messages/en.json` | 修改：删除过时键，新增规则系统相关键 |
| `messages/zh.json` | 修改：同上（中文） |

## 注意事项

1. **`UpgradeTrigger` 提交格式**：链上枚举是带关联数据的 tagged union，Polkadot.js 要求以 `{ VariantName: { field: value } }` 格式提交，如 `{ TotalSpent: { threshold: 1000000 } }`
2. **`name` 字段编码**：链上 `name` 是 `BoundedVec<u8, 64>`，前端需将字符串编码为字节数组再提交
3. **等级系统 vs 规则系统**：两者是独立的，需先初始化等级系统 (`initLevelSystem`) 才能添加规则（因为规则引用 `target_level_id` 需校验等级存在）
4. **`duration` 字段**：单位是区块数，前端可考虑提供天/小时换算（按出块时间 6 秒计算）
