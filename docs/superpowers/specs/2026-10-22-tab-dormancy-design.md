# Tab Dormancy 设计文档

- 日期：2026-10-22
- 状态：待评审
- 目标浏览器：Chrome / Edge（Chromium，Manifest V3，最低 Chrome 121）
- 项目：`tab-dormancy`

## 1. 概述

Tab Dormancy 是一个只做一件事的标签页管理扩展：在电脑长时间不使用时，按用户定义的策略自动关闭不重要的标签页；关闭前留下可搜索、可批量恢复的历史记录。

核心是一个可自由编排的规则引擎。规则由 Chrome 原生标签页事实组成，支持 `AND / OR / NOT` 任意嵌套；策略可以命名、保存、切换，并内置“温和 / 标准 / 激进”三档预设。

本扩展**不做**浏览器使用统计、使用时长采集、数据导出或分析看板。这些能力属于未来独立的“浏览器使用分析”扩展，不在本项目范围内。

## 2. 目标与非目标

### 2.1 目标

- 用一套可解释的表达式规则决定“关闭哪些标签页”，而不是黑盒评分
- 自动清理真正发生在“长时间不使用”之后，而不是定时骚扰
- 清理行为安全、可预览、可撤销、可恢复
- 性能开销接近零：无内容脚本、无网络请求、无轮询、无遥测
- 界面简洁优雅，仅中文，支持浅色/深色
- 核心逻辑纯函数化，测试覆盖规则、清理、历史、恢复的关键分支

### 2.2 非目标

- 不采集使用时长、激活次数、导航次数
- 不申请 `history` 权限
- 不做标签页休眠/丢弃（`tabs.discard`）
- 不做统计分析、图表、使用数据导出
- 不跨浏览器（Firefox/Safari 不支持）
- 不做云同步
- 不做按时间段自动切换策略、不同分支不同动作
- 不做多语言
- 不处理无痕窗口

## 3. 关键决策

| 决策 | 结论 |
|---|---|
| 浏览器 | Chrome / Edge，Manifest V3，最低 Chrome 121 |
| 清理动作 | 关闭标签页（不做休眠） |
| 数据来源 | 纯 Chrome 原生状态，无自建采集 |
| 规则模型 | 表达式树，支持 `AND / OR / NOT` 任意嵌套 |
| 策略 | 多套命名策略，同时只有一个启用 |
| 预设 | 温和 / 标准 / 激进，只读，可复制编辑 |
| 自动触发 | `chrome.idle` 的 `idle` 立即触发；`locked` 延迟一次性 alarm |
| 数据保留 | 关闭历史 30 天，最多 5000 条 |
| 界面 | 弹窗 + 独立仪表盘；仅简体中文 |
| 技术栈 | TypeScript + Preact + Vite；纯 CSS；无 UI/图表库 |
| 测试 | Vitest 单元/集成 + Playwright E2E |

## 4. 用户流程

### 4.1 首次安装

1. 创建三套内置预设，默认启用“标准”
2. 不自动打开页面、不弹引导层
3. 用户点击扩展图标看到弹窗；可进入仪表盘调整策略

### 4.2 自动清理

1. 系统空闲达到阈值（默认 15 分钟），Chrome 触发 `idle`
2. 扩展读取启用策略，计算命中标签页
3. 写入关闭历史快照
4. 关闭命中标签页，记录结果
5. 用户回来后可打开弹窗“撤销上次清理”，或在历史页恢复

锁屏时不会立即清理：默认延迟 15 分钟创建一次性 alarm；期间解锁则取消。锁屏触发可在设置中关闭。

### 4.3 手动清理

1. 弹窗显示“预计可清理 N 个”
2. 点击“预览并清理”，就地展开确认面板
3. 确认后执行；结果可撤销

### 4.4 编辑策略

1. 在仪表盘“策略”页复制预设或新建策略
2. 用可视化编辑器组合条件与子组
3. 实时预览命中数量和前几个示例
4. 预览通过后才能启用
5. 启用后立即用于下一次自动/手动清理

### 4.5 恢复

1. 在弹窗点击“撤销上次清理”，或在仪表盘“历史”页搜索/筛选
2. 单选或多选记录
3. 默认恢复到当前窗口；可选按原窗口分组新建窗口
4. 恢复后记录保留并标记 `restoredAt`

## 5. 架构

### 5.1 目录结构

```text
src/
  core/                     # 纯逻辑，禁止 import chrome.*
    facts.ts                # chrome.tabs.Tab → TabFacts
    rules/
      types.ts              # 表达式 AST、事实与操作符类型
      registry.ts           # 事实元数据、可用性、操作符约束
      validate.ts           # 表达式校验
      evaluate.ts           # 求值 + 命中轨迹
      presets.ts            # 内置预设
    strategies.ts           # 策略模型、启用/切换、复制
    capabilities.ts         # 运行时能力检测结果类型与降级判断
    cleaner.ts              # 清理计划、安全守卫
    history.ts              # 关闭记录、恢复计划
    retention.ts            # 历史淘汰
  platform/
    browser.ts              # tabs/windows/idle/alarms/tabGroups/sessions/storage 的最小封装
    storage.ts              # schema 版本、仓库、写入批处理
  background/
    index.ts                # service worker 组合根
    triggers.ts             # idle/locked/alarm 事件
    messages.ts             # 类型化消息路由
  ui/
    popup/
    dashboard/
    components/
    styles/
  shared/
    types.ts                # 跨层类型
    messages.ts             # 消息协议
    url.ts                  # domain/URL 工具
    time.ts                 # 相对时间格式化
    constants.ts
tests/
  unit/
  integration/
  e2e/
```

### 5.2 边界

- `core` 不依赖浏览器 API。输入是标签快照、窗口/分组快照、策略、`now`；输出是事实、命中结果、清理计划、恢复计划。
- `platform` 封装 Chrome API，提供可替换接口；测试用 `FakeBrowser` 实现同一接口。
- `background` 是唯一组合根：监听事件、读取状态、调用 core、持久化结果。
- UI 不直接修改标签页；清理、恢复、策略、设置等写操作全部通过类型化消息交给 service worker。
- UI 可以只读订阅 `tabs` 事件来触发列表刷新，但标签数据仍通过消息获取。
- 所有时间判断由调用方传入 `now`，core 内不调用 `Date.now()`。

### 5.3 消息协议

请求/响应使用可辨识联合：

```ts
type Request =
  | { type: 'state.get' }
  | { type: 'cleanup.preview'; source: 'popup' | 'dashboard' }
  | { type: 'cleanup.run'; source: 'popup' | 'dashboard' }
  | { type: 'tabs.list'; query?: string; windowId?: number }
  | { type: 'history.query'; query?: string; trigger?: Trigger; restored?: boolean; page: number; pageSize: number }
  | { type: 'history.restore'; ids: string[]; mode: 'current-window' | 'original-window-groups'; complete: boolean }
  | { type: 'history.delete'; ids: string[] }
  | { type: 'history.clear' }
  | { type: 'strategy.list' }
  | { type: 'strategy.preview'; strategy: Strategy }
  | { type: 'strategy.save'; strategy: Strategy; previewSignature?: string }
  | { type: 'strategy.activate'; id: string }
  | { type: 'strategy.delete'; id: string }
  | { type: 'settings.update'; patch: SettingsPatch }
  | { type: 'debug.simulate-idle' }; // 仅开发构建

type Response<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; message: string };
```

错误码：`INVALID_EXPRESSION`、`UNSUPPORTED_FACT`、`BUSY`、`STORAGE_FAILED`、`NOT_FOUND`、`TAB_CHANGED`、`PREVIEW_REQUIRED`、`INTERNAL`。

## 6. 数据模型

### 6.1 设置

```ts
type Settings = {
  idleThresholdMinutes: number;   // 默认 15，范围 1–1440
  lockCleanupEnabled: boolean;    // 默认 true
  lockDelayMinutes: number;       // 默认 15，范围 0–1440；0 表示锁屏立即
  historyRetentionDays: number;   // 默认 30，范围 1–365
  activeStrategyId: string;
};

type Trigger = 'idle' | 'locked' | 'manual';
type FactValue = string | number | boolean | string[];
type SettingsPatch = Partial<Omit<Settings, 'activeStrategyId'>>;
```

### 6.2 策略与表达式

```ts
type Strategy = {
  id: string;
  name: string;
  builtin: boolean;
  expression: Expr;
  createdAt: number;
  updatedAt: number;
  lastPreviewHash: string | null; // 用于“启用前必须预览”的门禁
  lastPreviewAt: number | null;
};

type Expr =
  | { type: 'all'; id: string; children: Expr[] }
  | { type: 'any'; id: string; children: Expr[] }
  | { type: 'not'; id: string; child: Expr }
  | { type: 'condition'; id: string; fact: FactKey; op: Operator; value?: FactValue };
```

- 每个节点有稳定 `id`，用于 UI 和命中轨迹
- `all` / `any` 至少 1 个子节点，最多 20 个直接子节点；表达式总节点 ≤ 200
- `not` 恰好 1 个子节点
- 表达式深度 ≤ 8

### 6.3 事实

事实定义在 `core/rules/registry.ts`，包含标签、类型、可选值、依赖能力。

| 事实 | 类型 | 含义 | 依赖 |
|---|---|---|---|
| `lastActiveMinutes` | number \| null | 距最后访问的分钟数 | `lastAccessed` |
| `totalTabCount` | number | 所有受管标签总数 | — |
| `windowTabCount` | number | 所在窗口受管标签数 | — |
| `pinned` | boolean | 已固定 | — |
| `audible` | boolean | 正在发声 | — |
| `active` | boolean | 所在窗口当前标签 | — |
| `muted` | boolean | 已静音 | — |
| `discarded` | boolean | 已被浏览器卸载 | — |
| `frozen` | boolean | 已冻结 | Chrome 132+ |
| `grouped` | boolean | 属于标签组 | `tabGroups` |
| `groupCollapsed` | boolean | 所在组已折叠 | `tabGroups` |
| `windowFocused` | boolean | 所在窗口聚焦 | — |
| `onlyTabInWindow` | boolean | 所在窗口受管标签数为 1 | — |
| `domain` | string | 主机名，小写 | — |
| `url` | string | 完整 URL | — |
| `title` | string | 页面标题 | — |
| `groupTitle` | string | 标签组名称，未分组为空 | `tabGroups` |

**受管标签**：普通非无痕窗口中、scheme 为 `http/https/file` 的标签。`totalTabCount`、`windowTabCount`、`onlyTabInWindow` 均按此口径计算。

`lastActiveMinutes` 由 `now - lastAccessed` 计算并向下取整；结果小于 0（时钟回拨）时按 0 处理；`lastAccessed` 缺失或为 0 时记为 `null`。

**不存在的事实**：使用频率、累计前台时长、导航次数。Chrome 原生不提供 per-tab 数据；本扩展不采集。

### 6.4 操作符

| 类型 | 操作符 |
|---|---|
| 数字 | `gt`、`gte`、`lt`、`lte`、`eq`、`neq` |
| 布尔 | `is`（true/false） |
| 文本 | `equals`、`contains`、`startsWith`、`endsWith` |
| 域名 | `matchesDomain`、`inDomainList` |
| 通配符 | `matchesGlob`（`*`、`?`，不支持正则） |
| 逻辑 | `all`、`any`、`not` |

文本比较大小写不敏感。`matchesDomain` 中 `google.com` 同时匹配 `google.com` 与 `*.google.com`，按主机名标签边界匹配（`evilgoogle.com` 不匹配）；`inDomainList` 对列表每项使用同样语义。

### 6.5 关闭历史

历史分为“索引摘要”和“完整记录”，避免每次更新重写整个历史数组。

```ts
type ClosedTabSummary = {
  id: string;
  url: string;
  title: string;
  domain: string;
  closedAt: number;
  trigger: 'idle' | 'locked' | 'manual';
  status: 'pending' | 'closed';
  restoredAt: number | null;
};

type ClosedTabRecord = ClosedTabSummary & {
  strategyId: string;
  strategyName: string;
  browserSessionId: string;
  windowId: number;
  groupId: number;
  groupTitle: string;
  groupColor: string;
  groupCollapsed: boolean;
  pinned: boolean;
  index: number;
  sessionId: string | null;
  recovered: boolean;
};

type LastCleanup = {
  at: number;
  trigger: Trigger;
  closed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  recordIds: string[];
};
```

- 默认保留 30 天，最多 5000 条
- 索引按 `closedAt` 倒序
- 搜索只查索引中的 `title / url / domain`
- 恢复时按需读取完整记录
- `browserSessionId` 在每次浏览器会话启动时生成，存入 `chrome.storage.session`；恢复时用 `browserSessionId + windowId` 分组，避免浏览器重启后 windowId 复用导致错误合并
- `LastCleanup.recordIds` 用于弹窗“撤销上次清理”

### 6.6 存储键

`chrome.storage.local`：

| 键 | 内容 |
|---|---|
| `meta` | `{ schemaVersion: 1 }` |
| `settings` | 设置 |
| `strategies` | 策略数组 |
| `history:index` | 摘要数组 |
| `history:item:<id>` | 单条完整记录 |
| `cleanup:lock` | `{ runId, startedAt }` |
| `cleanup:run` | 进行中的清理快照 |
| `lastCleanup` | 最近一次清理摘要（含 `recordIds`，用于撤销） |

`chrome.storage.session`：

| 键 | 内容 |
|---|---|
| `browserSessionId` | 每次浏览器会话随机生成的 ID，浏览器关闭后清除 |

不使用 `chrome.storage.sync`，不做跨设备同步。

## 7. 规则引擎

### 7.1 求值语义

- `all`：所有子节点为真
- `any`：任一子节点为真
- `not`：子节点取反
- 条件：按事实类型和操作符比较
- `lastActiveMinutes` 为 `null`（未知）时，所有数字比较返回 `false`，轨迹标记原因 `unknown`
- 能力不支持的事实不会被静默当作 `false`；包含不可用事实的策略被标记为“不可用”，自动清理暂停

求值返回：

```ts
type Evaluation = {
  matched: boolean;
  trace: TraceNode[];
};

type TraceNode = {
  nodeId: string;
  type: 'all' | 'any' | 'not' | 'condition';
  result: boolean;
  fact?: FactKey;
  actual?: unknown;
  expected?: unknown;
  reason?: 'unknown' | 'unsupported' | 'matched' | 'not-matched';
  children?: TraceNode[];
};
```

预览与实际清理共用同一个求值器。

### 7.2 校验

保存前必须通过：

- 节点 ID 唯一、非空
- `all` / `any` 子节点数 1–20
- `not` 恰好 1 个子节点
- 深度 ≤ 8，总节点 ≤ 200
- 数字为有限值；分钟值范围 0–525600
- 字符串长度 ≤ 512；域名列表 ≤ 50 项
- 通配符只允许 `*` 和 `?`
- 操作符与事实类型匹配
- 事实可用性检查
- 不允许空组（空 `all` 会匹配一切，是危险配置）

### 7.3 命中轨迹

UI 用轨迹回答“为什么关/不关”：

- 标签页列表展开后显示每个条件的事实实际值
- 未知值显示“未知，不命中”
- 不可用事实显示“当前浏览器不支持”
- 轨迹不持久化，按需计算

### 7.4 预设

```text
温和（7 天）
all:
  lastActiveMinutes > 10080
  not pinned
  not audible
  not active
  not grouped

标准（3 天）
all:
  lastActiveMinutes > 4320
  not pinned
  not audible
  not active
  not grouped

激进（1 天）
all:
  lastActiveMinutes > 1440
  not pinned
  not audible
  not active
```

- 预设只读；复制后生成自定义策略
- 预设不使用可选事实，保证在最低支持版本可用
- 默认启用“标准”

常用编排示例：

- 保护工作站点：`not (domain inDomainList ["github.com", "company.com"])`
- 只在大扫除时清理：`totalTabCount > 30 and lastActiveMinutes > 1440`
- 只清非当前窗口：`windowFocused is false and lastActiveMinutes > 1440`
- 按标签组保护：`not (grouped and groupTitle contains "工作")`

### 7.5 启用门禁

- 内置预设可直接启用；内置预设不可修改、不可删除，只能复制
- `id`、`builtin`、`createdAt` 由 service worker 维护；客户端不能伪造内置策略
- 自定义策略必须先用当前表达式成功预览一次，才允许启用
- `strategy.preview` 校验并求值草稿，返回 `{ signature, matched, sample, trace }`；不写入存储
- `signature` 是表达式规范化 JSON 的 SHA-256
- `strategy.save` 接收可选的 `previewSignature`：与保存后的表达式签名一致时写入 `lastPreviewHash`，否则置空
- 保存修改且未提供匹配签名时会清空旧的 `lastPreviewHash`，必须重新预览
- `strategy.activate` 由 service worker 校验 `lastPreviewHash`，不能只依赖 UI 禁用按钮
- 包含不可用事实或校验失败的策略不能启用
- 活动策略不能直接删除；必须先启用另一套
- 至少保留一套策略
- 若已启用策略在运行时变得不可用（例如浏览器版本降级），自动清理暂停，弹窗和仪表盘显示原因

## 8. 能力检测与降级

运行时计算：

```ts
type Capabilities = {
  chromeMajor: number | null;
  lastAccessed: boolean;  // Tab 对象存在该字段
  frozen: boolean;        // Chrome 132+
  tabGroups: boolean;
  sessions: boolean;
};
```

检测方式：

- 解析 `navigator.userAgent` 获取 Chrome 主版本
- 查询一个真实标签页，检查 `'lastAccessed' in tab`、`'frozen' in tab`
- 若当前没有标签页，退回 `chromeMajor >= 121` / `chromeMajor >= 132` 判断
- 检查 `chrome.tabGroups`、`chrome.sessions` 是否存在
- 结果缓存在 service worker 内存中，启动时重算

降级规则：

- Manifest 设置 `minimum_chrome_version: "121"`，从安装层挡掉不支持 `lastAccessed` 的浏览器
- 编辑器里禁用不可用事实，并显示“需要 Chrome 132+ / 当前版本不支持”等原因
- 校验器拒绝包含不可用事实的表达式
- 已保存策略若含不可用事实，保留内容但标记不可用，不参与自动清理
- 单个标签页 `lastAccessed` 缺失：时间条件为未知，永不命中
- `frozen` 在低版本不展示，避免用户写出永假的规则

## 9. 清理流程

### 9.1 触发

**空闲**
- 启动、安装、设置变更时调用 `chrome.idle.setDetectionInterval(idleThresholdMinutes * 60)`
- `idle` 状态变化时执行一次清理

**锁屏**
- `lockCleanupEnabled = false` 时忽略 `locked`，只保留空闲触发；设置关闭时清除已存在的 alarm
- 启用时，`locked` 创建一次性 alarm `tab-dormancy:locked`，延迟 `lockDelayMinutes`
- `active` 时清除该 alarm
- alarm 触发前再次 `chrome.idle.queryState` 确认仍处于 `locked`/`idle`
- `lockDelayMinutes = 0` 时直接执行，不创建 alarm

**手动**
- 弹窗或仪表盘发起，先预览再确认

**启动**
- 不在浏览器启动时自动清理，避免唤醒后突然关标签
- 启动时只做状态校验、历史淘汰、未完成清理的收敛

### 9.2 清理锁

- 内存 mutex + `cleanup:lock` 双重保护
- 锁内容：`{ runId, startedAt }`
- 超过 2 分钟视为失效
- 已有有效锁时返回 `BUSY`
- 无论成功、失败还是异常，`finally` 中释放锁

### 9.3 计划生成

1. `windows.getAll()`，只保留 `type === 'normal'` 且非无痕的窗口
2. `tabs.query({})`，过滤出这些窗口中的标签
3. `tabGroups.query({})` 获取分组元数据
4. 构建标签事实和全局事实
5. 求值启用策略
6. 应用硬性守卫
7. 返回 `matched`、`kept`、每个节点的轨迹

### 9.4 硬性技术守卫

这些不是策略，不能被表达式绕过：

- 只处理 `http:`、`https:`、`file:` 页面
- 跳过无痕窗口、`devtools://`、`chrome-extension://`、`chrome://`、`edge://`、`about:`
- 若计划会关闭某窗口内所有可关闭标签，且该窗口没有不可关闭标签（内部页面等），保留一个；保留策略：
  1. 当前激活标签
  2. 否则保留 `lastActiveMinutes` 最小（最近使用）的
  3. 否则保留第一个
- 关闭前重新读取标签，确认 `id`、`windowId`、`url` 与计划一致；不一致则跳过并计入失败/跳过
- 写历史失败则中止本次清理
- 清理任务互斥

`pinned / audible / active / grouped` 属于策略保护，写在预设中，用户可修改，不是硬性守卫。

### 9.5 写前快照

1. 生成 `ClosedTabRecord` 草稿，`status: 'pending'`
2. 一次性写入 `history:index` 摘要、所有 `history:item:<id>`、`cleanup:run`
3. 写入失败：中止，不关闭任何标签
4. 执行关闭
5. 成功的记录更新为 `status: 'closed'`
6. 失败的记录从索引和存储中删除，并汇报
7. 更新 `lastCleanup`，删除 `cleanup:run`

### 9.6 执行

- 并发上限 4
- 每个标签独立 `try/catch`
- 标签已被用户或其他扩展关闭：视为成功
- 其他错误：记录失败原因，不影响其他标签
- 结果：`{ closed, failed, skipped, durationMs }`

### 9.7 启动收敛

启动时若存在 `cleanup:run`：

- `cleanup:run` 记录发起时的 `browserSessionId`
- 若与当前 `browserSessionId` 不同：windowId 可能已被复用，无法可靠核对，直接删除所有 `pending` 记录
- 若相同：对每条 `pending` 记录，检查当前标签中是否存在相同 `url + windowId` 的标签
  - 存在：视为未真正关闭，删除该记录
  - 不存在：标记为 `closed`
- 删除 `cleanup:run`

该策略宁可少一条历史，也不伪造“已经关闭”。

## 10. 历史与恢复

### 10.1 保留

- 每次清理后、启动时执行淘汰
- 删除超过 `historyRetentionDays` 的索引与完整记录
- 超过 5000 条时按 `closedAt` 从旧到新删除
- 用户可手动清空全部历史

### 10.2 查询

- 只展示 `status === 'closed'` 的记录；`pending` 仅用于启动收敛
- 按 `title / url / domain` 做大小写不敏感包含搜索
- 按触发方式（idle/locked/manual）筛选
- 按已恢复/未恢复筛选
- 按时间倒序
- 每页 50 条

### 10.3 恢复模式

**快速恢复（默认）**
- `chrome.tabs.create({ url, active: false, windowId: 当前窗口 })`
- 支持批量
- 可通过“按原窗口分组新建窗口”把同一 `browserSessionId + windowId` 的记录放进一个新窗口
- 标签组尽力恢复：按原 `browserSessionId + groupId` 分组，写回标题、颜色、折叠状态
- `groupId` 不能跨会话复用，因此总是创建新组

**完整恢复（可选）**
- 仅当记录有 `sessionId` 且 `sessions` 能力可用
- 先尝试 `chrome.sessions.restore(sessionId)`
- 成功则可能恢复前进/后退栈等原生状态；失败自动退回 `tabs.create`
- 可能与“恢复到当前窗口”不完全一致；UI 说明这是尽力而为
- 批量恢复时逐条尝试，失败的条目单独汇报
- 完整恢复成功后，仍按快速恢复的分组规则尽力重建标签组

### 10.4 恢复后

- 设置 `restoredAt`
- 记录继续保留，可筛选“已恢复”
- 恢复不保证表单内容、滚动位置、页面内临时状态
- 不做自动去重；同一 URL 可以再次打开

### 10.5 清空与删除

- 删除选中记录：同时删除索引项和完整记录
- 清空历史：读取并删除所有 `history:item:` 前缀键，再删除索引
- 删除不影响当前已打开的标签页

## 11. 界面与视觉

### 11.1 弹窗（360px）

从上到下：

1. 标题与设置入口
2. 状态：当前策略、空闲阈值、`预计可清理 N 个`
3. 主操作：`预览并清理`（N=0 禁用）、`打开仪表盘`
4. 上次清理：`12 个 · 2 小时前` + `撤销`
5. 确认态：就地展开 `将关闭 N 个标签页，可在历史中恢复` + `取消 / 确认清理`
6. 异常态：策略不可用、清理进行中、存储失败

打开弹窗时先取状态，再调用 `cleanup.preview` 计算 N；预览不获取清理锁。

不做图表、统计、追踪开关。

### 11.2 仪表盘

左侧导航 + 右侧内容，窄屏改为顶部标签。

**标签页**
- 实时列表：标题、域名、最后活跃、状态徽标（固定/发声/分组/休眠/冻结）
- 显示是否命中当前策略
- 展开看命中轨迹和事实实际值
- 搜索、按窗口筛选、刷新
- 订阅 `tabs` 事件自动刷新，不做轮询

**历史**
- 搜索、触发方式筛选、恢复状态筛选
- 列表多选、批量恢复、删除、清空
- 恢复模式选择：当前窗口 / 按原窗口分组新建窗口
- 完整恢复开关（仅对可用记录）

**策略**
- 策略卡片：名称、启用状态、预设/自定义、当前命中数
- 操作：启用、复制、重命名、删除
- 表达式编辑器
- 内置预设显示“只读，复制后可编辑”

**设置**
- 空闲阈值
- 锁屏触发开关
- 锁屏延迟（0–1440 分钟，0 为立即）
- 历史保留天数
- 清空历史
- 版本与权限说明

### 11.3 规则编辑器

- 组卡片：顶部 `AND / OR` 切换；子项逐行排列
- 条件行：事实 → 操作符 → 值；每行可加 `NOT`、可删除
- 组可嵌套；缩进 + 左侧细线表达层级
- 按钮：`+ 条件`、`+ 子组`
- 值输入随事实类型变化：数字、是/否、文本、域名列表（一行一个）
- 数字时间值提供单位选择（分钟/小时/天），存储统一为分钟
- 编辑后 200ms 防抖调用 `strategy.preview`：`当前命中 N 个标签页` + 前 5 个示例
- 校验失败就地标红，保存禁用
- 自定义策略未预览时，启用按钮禁用并提示“请先预览”
- 不可用事实在下拉框中禁用并注明原因

### 11.4 视觉系统

- 近白背景、近黑文字、1px 细边框、单一低饱和蓝强调色
- 无渐变、无重阴影、无大圆角；圆角 6px
- 系统字体栈：SF Pro / Segoe UI / PingFang SC
- 正文 13–14px，标题 15–16px，行高 1.5
- 间距基准 4/8/12/16/24/32
- 深色模式跟随 `prefers-color-scheme`，全部颜色走 CSS 变量
- 图标为内联 SVG，1.5px 描边，不引图标库
- 动效 120–160ms，尊重 `prefers-reduced-motion`
- 焦点环可见，键盘可达，ARIA 标签完整，对比度达 WCAG AA，点击目标 ≥ 28px
- 文案短句、动词明确；破坏性操作写清数量

颜色令牌示例：

```css
:root {
  --bg: #fafafa;
  --surface: #ffffff;
  --text: #18181b;
  --muted: #71717a;
  --border: #e4e4e7;
  --accent: #3d63dd;
  --danger: #b42318;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111113;
    --surface: #18181b;
    --text: #f4f4f5;
    --muted: #a1a1aa;
    --border: #27272a;
    --accent: #7aa2f7;
    --danger: #f97066;
  }
}
```

### 11.5 状态设计

- 空态：`没有可清理的标签页` / `还没有关闭记录` / `还没有自定义策略`
- 错误：内联条，不用 `alert`
- 加载：历史列表使用骨架；弹窗直接同步渲染
- 首次安装：不自动弹窗、不做引导层
- 清理中：按钮禁用，显示进度文案
- 策略不可用：顶部常驻警告条，链接到策略页

## 12. 权限

| 权限 | 用途 | 说明 |
|---|---|---|
| `tabs` | 读取 URL/标题/状态，关闭标签页 | 商店会提示浏览历史警告；数据只在本地使用 |
| `storage` | 保存设置、策略、历史 | 本地，不同步 |
| `idle` | 检测系统空闲/锁屏 | 不读取输入内容 |
| `alarms` | 锁屏延迟清理的一次性定时 | 不做周期轮询 |
| `tabGroups` | 读取分组信息、恢复分组 | 仅在标签组相关功能使用 |
| `sessions` | 可选的完整恢复 | 仅在用户触发恢复时使用 |

不申请：

- `history`
- host permissions
- `webRequest` / `webNavigation`
- `unlimitedStorage`
- content script 注入权限

Manifest：

- `manifest_version: 3`
- `minimum_chrome_version: "121"`
- `background.service_worker`，ES module
- `action.default_popup`
- `options_ui.page = dashboard.html`，`open_in_tab: true`

## 13. 错误处理与可靠性

- 所有消息处理返回结构化错误，不抛未捕获异常
- 存储读写失败：本次清理中止；UI 显示内联错误
- 存储数据损坏：将原始值备份到 `corrupt:<timestamp>`，初始化默认设置与预设；历史若可解析则保留
- 清理锁过期：2 分钟后可被下一次清理接管
- 标签在计划与执行之间变化：跳过，不关闭
- 部分关闭失败：成功项保留历史，失败项不写入，结果中汇报
- 启动时收敛未完成的清理，避免伪造历史
- 策略不可用：暂停自动清理，不静默跳过
- 所有错误只记录在内存环形日志（最近 50 条），不做遥测、不上传
- 设置页可查看最近错误摘要

## 14. 性能预算

- 无 content script、无网络请求、无遥测、无轮询
- service worker 无事可做时休眠
- 自动清理只由 idle/locked 事件触发；锁屏仅创建一个一次性 alarm
- 清理复杂度 O(标签数 × 表达式节点数)；实际上限由标签数和 200 节点约束
- 存储只在设置/策略/清理/恢复时写入；历史按索引 + 单条记录拆分，避免重写全量
- 历史查询在内存索引上过滤，每页 50 条，不做全量 DOM 渲染
- 弹窗 + 仪表盘初始 JS 合计 < 60KB gzip，CSS < 10KB gzip
- 运行时依赖只有 Preact

## 15. 测试策略

### 15.1 单元测试（Vitest）

- 规则求值：真值表、嵌套 `AND/OR/NOT`、未知 `lastActiveMinutes`、域名匹配、通配符、大小写
- 表达式校验：空组、深度、节点数、类型不匹配、超长字符串、非法通配符
- 事实构建：URL → domain、分组信息、窗口计数、缺失字段、`frozen` 能力
- 预设：行为断言（命中/不命中），不做脆弱的表达式快照
- 能力检测：不同字段组合下的可用事实与降级
- 清理计划：内部页面跳过、无痕跳过、每窗口保留一个、URL 变化跳过
- 历史：保留期、5000 条上限、索引与完整记录同步、恢复计划
- 恢复：当前窗口、按原窗口分组、完整恢复失败回退
- 存储：默认值、schema 校验、损坏备份与初始化
- 消息协议：非法请求拒绝、错误码正确

### 15.2 集成测试（Vitest + FakeBrowser）

- `idle` 事件 → 清理 → 历史写入 → 结果
- `locked` 事件 → 创建 alarm → 解锁取消 → alarm 触发时仍锁屏
- 手动清理、并发锁、锁过期
- 历史写入失败 → 不关闭任何标签
- `tabs.remove` 部分失败 → 成功项入库、失败项汇报
- 启动收敛：`cleanup:run` 中 pending 记录正确处理
- service worker 重启后从存储恢复策略、设置、历史
- 时间全部注入，无真实等待

### 15.3 E2E（Playwright）

- 加载 unpacked 扩展的持久化 Chromium
- 本地 HTTP 测试页；用域名匹配策略绕开 `lastAccessed` 不可伪造的问题
- 流程 A：弹窗预览 → 确认清理 → 标签关闭 → 历史出现 → 批量恢复
- 流程 B：新建策略 → 编辑嵌套表达式 → 实时预览 → 启用 → 再次预览
- 流程 C：历史搜索/筛选/删除/清空
- 空闲触发无法稳定模拟，由集成测试覆盖
- 开发构建提供 `debug.simulate-idle`，生产构建通过 `import.meta.env.DEV` 剔除

### 15.4 质量门禁

```text
npm run typecheck   # tsc --noEmit，strict
npm run lint        # Biome
npm run test        # unit + integration
npm run test:e2e    # Playwright
npm run build       # 产物 + manifest 检查
npm run verify      # typecheck + lint + test + build
```

- 不设覆盖率数字目标；核心模块的关键分支必须有测试
- 实现计划中列出每条验收用例对应的测试文件

## 16. 构建与工程

- TypeScript strict
- Vite 多入口：`popup.html`、`dashboard.html`、`background`（ES module service worker）
- Manifest 静态放在 `public/manifest.json`；构建时复制
- 图标：16/32/48/128 PNG，一次性生成并提交，不引入运行时图像依赖
- 运行时依赖：`preact`
- 开发依赖：`vite`、`typescript`、`vitest`、`@playwright/test`、`@types/chrome`、`@biomejs/biome`
- `npm run dev`：Vite watch 构建；扩展页手动刷新
- 不使用 CRXJS 或其他扩展打包魔法，保持构建透明
- 产物检查：manifest 权限与声明一致、无 source map（生产）、无调试入口

## 17. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 浏览器缺少 `lastAccessed` / `frozen` | Manifest 最低 121；运行时能力检测；编辑器禁用不可用事实；策略含不可用事实时暂停自动清理；单标签未知值不命中 |
| 锁屏立即清理过于激进 | 锁屏触发可关闭；启用时默认延迟 15 分钟；解锁取消；可配置为立即 |
| 恢复不完整 | 优先 `sessions.restore`（可选完整恢复）；URL 级快速恢复兜底；UI 明确限制 |
| 与其他扩展/用户操作竞态 | 关闭前校验 id/windowId/url；逐条 try/catch；清理锁 |
| 规则误配置关闭过多标签 | 空组禁止；校验器；启用前必须预览；轨迹解释；历史撤销 |
| 商店权限警告 | 最小权限；无 host/history/content script/网络；商店说明用途 |
| 睡眠/唤醒错过 idle 事件 | 不在启动时自动清理；依赖下一次状态变化；锁屏 alarm 唤醒后仍执行 |
| 历史写入后进程崩溃 | 写前快照 + 启动收敛；pending 记录按当前标签核对 |
| 存储损坏 | schema 校验；原始数据备份；初始化默认策略；错误提示 |

## 18. 验收标准

- [ ] 可在 Chrome 121+ 以 unpacked 方式加载，默认启用“标准”
- [ ] 权限恰好为 `tabs`、`storage`、`idle`、`alarms`、`tabGroups`、`sessions`，无 host permissions
- [ ] 空闲达到阈值时自动关闭命中标签页，并写入历史
- [ ] 锁屏触发可关闭；启用后延迟清理；解锁取消；延迟为 0 时立即清理
- [ ] 弹窗显示预计清理数量，可就地确认并撤销上次清理
- [ ] 仪表盘可查看实时标签、命中轨迹、历史、策略、设置
- [ ] 规则编辑器支持嵌套 `AND/OR/NOT`、域名列表、通配符、实时预览
- [ ] 自定义策略未预览不能启用；不可用事实不能选择；非法表达式不能保存
- [ ] 每个窗口至少保留一个标签；内部页面/无痕窗口不被处理
- [ ] 历史可搜索、筛选、单选/批量恢复、按原窗口分组新建窗口
- [ ] 支持可选的 `sessions` 完整恢复，失败自动回退
- [ ] 30 天保留与 5000 条上限生效
- [ ] 单元、集成、E2E 测试通过；typecheck、lint、build 通过
- [ ] 弹窗 + 仪表盘 JS < 60KB gzip，CSS < 10KB gzip
- [ ] 无统计、无导出、无使用时长采集、无网络请求

## 19. 未来工作（不在本次范围）

- 独立的浏览器使用分析扩展：采集使用时长/频率、导出 JSON
- 按时间段自动切换策略
- 不同规则分支执行不同动作（关闭/休眠/收纳）
- 策略 JSON 导入导出
- 重复标签检测
- 多语言
- Firefox 适配
